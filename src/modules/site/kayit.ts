import { useCallback, useEffect, useRef, useState } from "react";
import { istekYap, PANEL, PanelHatasi, type PanelKullanici } from "./api";
import { sb } from "../../shared/supabase";

// Düzenleme ekranlarının ortak araçları: düzenleme kilidi ve otomatik kayıt. İkisi de panelin (Payload) kendi düzeniyle aynı
// çalışır, böylece Stüdyo'da ve Payload panelinde aynı anda açılan kayıt birbirini görür.

/** Kaydın adresi: koleksiyon kaydı ya da ayar sayfası */
export type KayitYeri = { koleksiyon: string; id: number } | { genel: string };

// ── Düzenleme kilidi ────────────────────────────────────────────────────────
// Panel kilitleri "payload-locked-documents" koleksiyonunda tutar; 5 dk işlem olmayan kilit geçersizdir (Payload varsayılanı).
// Kaydetme isteği başkasının taze kilidi varken panel tarafından reddedilir (423); her kayıt kilidi siler, biz yeniden alırız.
const KILIT = "/payload-locked-documents";
const KILIT_SURE = 300_000;
const YENILE = 60_000;
type KilitKaydi = { id: number; updatedAt: string; user?: { value?: number | { id: number; name?: string; email?: string } } };
export type KilitDurumu = { tur: "bekliyor" | "bende" | "yok" } | { tur: "baskasi"; kim: string; ne: string };

const kilitSorgu = (y: KayitYeri) => "genel" in y
  ? `where[globalSlug][equals]=${encodeURIComponent(y.genel)}`
  : `where[and][0][document.relationTo][equals]=${y.koleksiyon}&where[and][1][document.value][equals]=${y.id}`;
const kullaniciId = (k: KilitKaydi) => (typeof k.user?.value === "object" ? k.user.value.id : k.user?.value);
const zaman = (s: string) => new Date(s).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

/** yer null ise (henüz kaydedilmemiş yeni kayıt) kilit alınmaz */
export function useKilit(yer: KayitYeri | null, ben: PanelKullanici, etkin = true) {
  const [durum, setDurum] = useState<KilitDurumu>({ tur: "bekliyor" });
  const benim = useRef<number | null>(null);
  const anahtar = yer ? JSON.stringify(yer) : "";

  const al = useCallback(async (devral = false): Promise<KilitDurumu> => {
    if (!yer || !etkin) return { tur: "yok" };
    const r = await istekYap<{ docs: KilitKaydi[] }>(`${KILIT}?${kilitSorgu(yer)}&depth=1&sort=-updatedAt&limit=5`);
    const taze = r.docs.filter((k) => Date.now() - new Date(k.updatedAt).getTime() < KILIT_SURE);
    const baskasi = taze.find((k) => kullaniciId(k) !== ben.id);
    if (baskasi && !devral) {
      const u = typeof baskasi.user?.value === "object" ? baskasi.user.value : null;
      return { tur: "baskasi", kim: u?.name || u?.email || "Başka biri", ne: zaman(baskasi.updatedAt) };
    }
    // eski, başkasının (devralınca) ve fazla kilitler temizlenir; bizimki tazelenir ya da yeniden alınır
    const kendi = taze.find((k) => kullaniciId(k) === ben.id);
    await Promise.all(r.docs.filter((k) => k !== kendi).map((k) => istekYap(`${KILIT}/${k.id}`, { method: "DELETE" }).catch(() => {})));
    if (kendi) { await istekYap(`${KILIT}/${kendi.id}`, { method: "PATCH", body: JSON.stringify({}) }); benim.current = kendi.id; }
    else {
      const govde = { ...("genel" in yer ? { globalSlug: yer.genel } : { document: { relationTo: yer.koleksiyon, value: yer.id } }), user: { relationTo: "users", value: ben.id } };
      benim.current = (await istekYap<{ doc: { id: number } }>(KILIT, { method: "POST", body: JSON.stringify(govde) })).doc.id;
    }
    return { tur: "bende" };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anahtar, ben.id, etkin]);

  /** Kayıttan sonra (panel kilidi siler) ve dakikada bir: kilit bizdeyse tazelenir, biri devraldıysa haber verir */
  const tazele = useCallback(async () => {
    try { setDurum(await al()); } catch { /* ağ hatası: bir sonraki turda */ }
  }, [al]);
  const devral = useCallback(async () => { try { setDurum(await al(true)); } catch (e) { alert((e as Error).message); } }, [al]);

  useEffect(() => {
    if (!yer || !etkin) { setDurum({ tur: "yok" }); return; }
    tazele();
    const t = setInterval(tazele, YENILE);
    const birak = () => {
      if (!benim.current) return;
      // sayfa kapanırken de gitsin (keepalive); oturum anahtarı bellekte değilse kilit 5 dk sonra kendiliğinden düşer
      const id = benim.current; benim.current = null;
      sb.auth.getSession().then(({ data }) => {
        const k = data.session?.access_token;
        if (k) fetch(`${PANEL}/api${KILIT}/${id}`, { method: "DELETE", keepalive: true, headers: { Authorization: `Studyo ${k}` } }).catch(() => {});
      });
    };
    window.addEventListener("pagehide", birak);
    return () => { clearInterval(t); window.removeEventListener("pagehide", birak); birak(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anahtar, etkin]);

  return { durum, tazele, devral };
}

/** Kilit yüzünden reddedilen kayıt (423) için anlaşılır mesaj */
export const kilitHatasi = (e: unknown) =>
  e instanceof PanelHatasi && e.kod === 423 ? "Bu kaydı şu an başka biri düzenliyor; değişikliğin kaydedilmedi." : (e as Error).message;

// ── Otomatik kayıt ──────────────────────────────────────────────────────────
// Panelde otomatik kaydı açık bölümlerde (haber, inceleme) yazmayı bıraktıktan kısa süre sonra taslak olarak kaydedilir.
// Panelin "autosave" kaydı: sürüm geçmişini şişirmez (son otomatik sürümün üzerine yazar), sitedeki yayın değişmez.
export type OtoDurum = { tur: "" | "bekliyor" | "kaydediliyor" | "kaydedildi" | "hata"; zaman?: string; hata?: string };

/** no: her değişiklikte artan sayaç (0 = değişiklik yok). kaydet: o anki veriyi otomatik kayıt olarak gönderir. */
export function useOtoKayit(aralik: number, no: number, kaydet: () => Promise<void>) {
  const [durum, setDurum] = useState<OtoDurum>({ tur: "" });
  const son = useRef(kaydet);
  son.current = kaydet;
  const sira = useRef<Promise<void>>(Promise.resolve()); // kayıtlar üst üste binmez
  useEffect(() => {
    if (!aralik || !no) return;
    setDurum((d) => ({ ...d, tur: "bekliyor" }));
    const t = setTimeout(() => {
      sira.current = sira.current.then(async () => {
        setDurum((d) => ({ ...d, tur: "kaydediliyor" }));
        try { await son.current(); setDurum({ tur: "kaydedildi", zaman: zaman(new Date().toISOString()) }); }
        catch (e) { setDurum({ tur: "hata", hata: kilitHatasi(e) }); }
      });
    }, Math.max(aralik, 1500));
    return () => clearTimeout(t);
  }, [aralik, no]);
  return durum;
}

export const otoMetni = (d: OtoDurum) =>
  d.tur === "bekliyor" ? "Değişiklik var…" : d.tur === "kaydediliyor" ? "Kaydediliyor…" : d.tur === "kaydedildi" ? `Otomatik kaydedildi ${d.zaman}` : d.tur === "hata" ? `Otomatik kayıt olmadı: ${d.hata}` : "";
