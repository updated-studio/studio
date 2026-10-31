// Künye otomasyonu ekranı (25 Ekim 2026): "Eksik künyeleri doldur" fonksiyon kunye-otomatik'i sırayla çağırır (her seferde 2 ürün);
// öneriler (public.kunye_oneriler) burada listelenir, editör kaynaklarına bakıp ürün başına tek tıkla onaylar ya da reddeder.
// Onay: değerler panelde ürünün özellik satırlarına yazılır (kaynak üreticinin sitesiyse "Üretici beyanı", değilse "Diğer yayın").
// Görsel (27 Ekim 2026): kunye-otomatik ürün görselini bulur, sunucudaki işçi arka planı silip standart tuvale koyar (gorsel_durum "hazir").
// Onaylarken "Görseli de künyeye koy" işaretliyse görsel panele yüklenir ve ürünün görseli olur (künye: "Görsel: Marka" ya da CC yazarı).
import { useCallback, useEffect, useRef, useState } from "react";
import { sb, SUPABASE_URL } from "../../shared/supabase";
import { useAuth } from "../../shared/auth";
import { useToast } from "../../shared/toast";
import { istekYap, medyaYukle } from "./api";

type Oz = { key: string; value: string; num: number | null; kaynak: string | null; kanit: string };
type GorselAday = { url: string; sayfa: string; kaynak: string; yazar: string; lisans: string };
type Oneri = { id: number; urun_id: number; urun_adi: string; tur: string; ozellikler: Oz[]; kaynaklar: { baslik: string; url: string }[]; durum: string; hata: string | null; created_at: string;
  gorsel?: string | null; gorsel_durum?: string; gorsel_aday?: GorselAday | null; gorsel_hata?: string | null };
/** Görsel künyesi: üretici görseli "Görsel: Sony"; serbest lisanslıysa yazar ve lisans */
const gorselKunye = (g: GorselAday | null | undefined, marka: string) => !g || g.kaynak === "Üretici" ? `Görsel: ${marka}` : `Fotoğraf: ${g.yazar} / ${g.kaynak} (${g.lisans})`;
const alan = (u: string | null) => { try { return u ? new URL(u).hostname.replace(/^www\./, "") : ""; } catch { return ""; } };
const kucuk = (s: string) => s.toLocaleLowerCase("tr-TR").replace(/[^a-z0-9]/g, "");

export default function KunyeOnay() {
  const { session } = useAuth();
  const toast = useToast();
  const [liste, setListe] = useState<Oneri[] | null>(null);
  const [calisiyor, setCalisiyor] = useState(false);
  const [durum, setDurum] = useState("");
  const [acik, setAcik] = useState<number | null>(null);
  const [gorselsiz, setGorselsiz] = useState<Record<number, boolean>>({});
  const dur = useRef(false);
  // Zamanlayıcının son turu (kunye-otomatik → tr_settings.son_kunye): öneri gelmiyorsa nedeni burada görünür
  const [sonTur, setSonTur] = useState<{ zaman: string; bitti: boolean; aday: number; islenen: { urun: string; durum: string; sayi?: number; hata?: string }[] } | null>(null)

  const yukle = useCallback(async () => {
    const { data } = await sb.from("kunye_oneriler").select("*").eq("durum", "bekliyor").order("created_at", { ascending: true }).limit(100);
    setListe((data as Oneri[]) ?? []);
    const { data: t } = await sb.from("tr_settings").select("value").eq("key", "son_kunye").maybeSingle();
    setSonTur((t?.value as typeof sonTur) ?? null);
  }, []);
  useEffect(() => { yukle(); }, [yukle]);

  async function otomatik() {
    setCalisiyor(true); dur.current = false; let toplam = 0;
    try {
      for (let tur = 0; tur < 60 && !dur.current; tur++) {
        setDurum(`Kaynaklar aranıyor… (${toplam} ürün işlendi)`);
        const { data: o } = await sb.auth.getSession();
        const r = await fetch(`${SUPABASE_URL}/functions/v1/kunye-otomatik`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${o.session?.access_token ?? ""}` }, body: JSON.stringify({ adet: 2 }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || `Hata ${r.status}`);
        // Kota dolunca fonksiyon ürünü işaretlemeden döner; döngü 60 tur boşa dönüp "işlendi" demesin (31 Ekim 2026)
        const kota = (j.islenen as { durum: string }[]).some((x) => x.durum === "kota dolu");
        toplam += (j.islenen as { durum: string }[]).filter((x) => x.durum !== "kota dolu").length; await yukle();
        if (kota) { setDurum(`Gemini kotası dolu${toplam ? ` (${toplam} ürün işlendi)` : ""}. Kota her gün Türkiye saatiyle 10.00-11.00 arası yenilenir; Sistem → Gemini anahtarlarından yeni anahtar da eklenebilir.`); return; }
        if (!j.islenen.length || j.kalan === 0) break;
      }
      setDurum(toplam ? `${toplam} ürün işlendi; öneriler aşağıda.` : "Doldurulacak künye kalmadı (son 7 günde denenenler tekrar denenmez).");
    } catch (e) { setDurum(""); toast((e as Error).message); } finally { setCalisiyor(false); }
  }

  async function onayla(o: Oneri) {
    try {
      const u = await istekYap<{ brand: string; name: string; image?: unknown; specs: Record<string, unknown>[] }>(`/products/${o.urun_id}?depth=0`);
      const marka = kucuk(u.brand || "");
      const bugun = new Date().toISOString().slice(0, 10);
      const specs = (u.specs ?? []).map((s) => {
        const x = o.ozellikler.find((z) => z.key === s.key);
        if (!x) return s;
        const resmi = !!marka && kucuk(alan(x.kaynak)).includes(marka.slice(0, 5));
        return { ...s, value: x.value, num: x.num, source: resmi ? "uretici" : "diger", sourceUrl: x.kaynak, at: bugun };
      });
      // Üründe satırı olmayan öneriler (ör. şablona sonradan eklenen "Boyutlar") sona eklenir
      for (const x of o.ozellikler) if (!specs.some((s) => s.key === x.key)) {
        const resmi = !!marka && kucuk(alan(x.kaynak)).includes(marka.slice(0, 5));
        specs.push({ key: x.key, value: x.value, num: x.num, group: "Gövde", unit: x.key === "Boyutlar" ? "mm" : undefined, source: resmi ? "uretici" : "diger", sourceUrl: x.kaynak, at: bugun, higherIsBetter: false, searchWeight: 2 });
      }
      const govde: Record<string, unknown> = { specs };
      if (o.gorsel_durum === "hazir" && o.gorsel && !gorselsiz[o.id]) {
        const b = await fetch(o.gorsel).then((r) => { if (!r.ok) throw new Error("Görsel indirilemedi"); return r.blob(); });
        const m = await medyaYukle(new File([b], `${kucuk(o.urun_adi) || "urun"}.webp`, { type: "image/webp" }), `${o.urun_adi} ürün görseli`, gorselKunye(o.gorsel_aday, u.brand), false);
        govde.image = m.id;
      }
      await istekYap(`/products/${o.urun_id}?depth=0`, { method: "PATCH", body: JSON.stringify(govde) });
      await sb.from("kunye_oneriler").update({ durum: "onaylandi", karar_veren: session?.user.id, karar_at: new Date().toISOString() }).eq("id", o.id);
      toast(`${o.urun_adi}: ${o.ozellikler.length} özellik${govde.image ? " ve görsel" : ""} künyeye yazıldı.`); yukle();
    } catch (e) { toast((e as Error).message); }
  }
  async function reddet(o: Oneri) {
    await sb.from("kunye_oneriler").update({ durum: "reddedildi", karar_veren: session?.user.id, karar_at: new Date().toISOString() }).eq("id", o.id);
    yukle();
  }

  return (
    <section className="panel kunye-onay">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div><b>Künye otomasyonu</b><div className="muted" style={{ fontSize: 14 }}>Sistem her ürünün resmî özellik sayfasını internette bulur, değerleri kaynağıyla önerir. Sen kontrol edip onaylarsın.</div></div>
        {calisiyor ? <button className="btn ghost" onClick={() => { dur.current = true; }}>Durdur</button> : <button className="btn" onClick={otomatik}>Eksik künyeleri doldur</button>}
      </div>
      {durum && <div className="muted">{durum}</div>}
      {sonTur && <div className="muted" style={{ fontSize: 13 }}>
        Son tur {new Date(sonTur.zaman).toLocaleString("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}: {sonTur.islenen.length
          ? sonTur.islenen.map((x) => `${x.urun} · ${x.durum}${x.sayi ? ` (${x.sayi})` : ""}`).join(", ")
          : sonTur.bitti ? "doldurulacak ürün yok" : "başladı, sonuç gelmeden yarıda kaldı"}
        {sonTur.islenen.some((x) => x.durum === "kota dolu") && " · Gemini kotası dolu, kota Türkiye saatiyle 10.00-11.00 arası yenilenir."}
      </div>}
      {liste === null ? <div className="muted">Yükleniyor…</div> : !liste.length ? <div className="muted">Onay bekleyen öneri yok.</div> : (
        <ul className="ko-l">
          {liste.map((o) => (
            <li key={o.id}>
              <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <button className="linkbtn" onClick={() => setAcik(acik === o.id ? null : o.id)}><b>{o.urun_adi}</b> · {o.ozellikler.length} özellik önerisi</button>
                <div className="row" style={{ gap: 6 }}><button className="btn sm" onClick={() => onayla(o)}>Onayla</button><button className="btn ghost sm" onClick={() => reddet(o)}>Reddet</button></div>
              </div>
              {o.gorsel_durum === "hazir" && o.gorsel ? (
                <div className="ko-gorsel">
                  <img src={o.gorsel} alt={`${o.urun_adi} (arka planı silinmiş)`} loading="lazy" />
                  <div className="muted" style={{ fontSize: 13 }}>
                    {gorselKunye(o.gorsel_aday, o.urun_adi.split(" ")[0])}{o.gorsel_aday?.sayfa && <> · <a href={o.gorsel_aday.sayfa} target="_blank" rel="noreferrer">kaynak</a></>}
                    <label style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}><input type="checkbox" checked={!gorselsiz[o.id]} onChange={(e) => setGorselsiz((x) => ({ ...x, [o.id]: !e.target.checked }))} /> Görseli de künyeye koy</label>
                  </div>
                </div>
              ) : o.gorsel_durum === "isleniyor" ? <div className="muted" style={{ fontSize: 13 }}>Görsel hazırlanıyor (arka plan siliniyor)…</div>
                : o.gorsel_durum === "hata" ? <div className="muted" style={{ fontSize: 13 }}>Görsel işlenemedi: {o.gorsel_hata}</div>
                : <div className="muted" style={{ fontSize: 13 }}>Kaynaklarda kullanılabilir ürün görseli bulunamadı.</div>}
              {acik === o.id && (
                <div className="kd-tablo">
                  <table><thead><tr><th>Özellik</th><th>Değer</th><th>Kaynak</th></tr></thead>
                    <tbody>{o.ozellikler.map((x) => <tr key={x.key}><th scope="row">{x.key}</th><td><b>{x.value}</b>{x.kanit && <div className="muted kd-kanit">“{x.kanit}”</div>}</td><td>{x.kaynak ? <a href={x.kaynak} target="_blank" rel="noreferrer">{alan(x.kaynak)}</a> : <span className="muted">—</span>}</td></tr>)}</tbody>
                  </table>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
