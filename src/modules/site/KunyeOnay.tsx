// Künye otomasyonu ekranı (25 Ekim 2026): "Eksik künyeleri doldur" fonksiyon kunye-otomatik'i sırayla çağırır (her seferde 2 ürün);
// öneriler (public.kunye_oneriler) burada listelenir, editör kaynaklarına bakıp ürün başına tek tıkla onaylar ya da reddeder.
// Onay: değerler panelde ürünün özellik satırlarına yazılır (kaynak üreticinin sitesiyse "Üretici beyanı", değilse "Diğer yayın").
// Görsel (27 Ekim 2026): kunye-otomatik ürün görselini bulur, sunucudaki işçi arka planı silip standart tuvale koyar (gorsel_durum "hazir").
// Onaylarken "Görseli de künyeye koy" işaretliyse görsel panele yüklenir ve ürünün görseli olur (künye: "Görsel: Marka" ya da CC yazarı).
// 5 Kasım 2026: ikinci gözün (Claude) düzelttiği, eklediği ve sildiği değerler ile görsel seçiminin gerekçesi editöre gösterilir.
import { useCallback, useEffect, useRef, useState } from "react";
import { sb, SUPABASE_URL } from "../../shared/supabase";
import { useAuth } from "../../shared/auth";
import { useToast } from "../../shared/toast";
import { istekYap, medyaYukle } from "./api";
import { kenarTemizle } from "./kenarTemizle";

type Oz = { key: string; value: string; num: number | null; kaynak: string | null; kanit: string; islem?: "duzeltildi" | "eklendi"; not?: string; alinti?: boolean };
type GorselAday = { url: string; sayfa: string; kaynak: string; yazar: string; lisans: string; neden?: string; secenekler?: { gorsel: string; url: string; sayfa: string }[] };
type Oneri = { id: number; urun_id: number; urun_adi: string; resmi_ad?: string | null; tur: string; ozellikler: Oz[]; kaynaklar: { baslik: string; url: string; silinen?: { key: string; neden: string }[] }[]; durum: string; hata: string | null; created_at: string;
  gorsel?: string | null; gorsel_durum?: string; gorsel_aday?: GorselAday | null; gorsel_hata?: string | null };
/** Görsel künyesi: üretici görseli "Görsel: Sony"; serbest lisanslıysa yazar ve lisans */
const gorselKunye = (g: GorselAday | null | undefined, marka: string) => !g || g.kaynak.startsWith("Üretici") ? `Görsel: ${marka}` : `Fotoğraf: ${g.yazar} / ${g.kaynak} (${g.lisans})`;
const alan = (u: string | null) => { try { return u ? new URL(u).hostname.replace(/^www\./, "") : ""; } catch { return ""; } };
const kucuk = (s: string) => s.toLocaleLowerCase("tr-TR").replace(/[^a-z0-9]/g, "");

export default function KunyeOnay() {
  const { session, profile } = useAuth();
  const toast = useToast();
  const [liste, setListe] = useState<Oneri[] | null>(null);
  const [calisiyor, setCalisiyor] = useState(false);
  const [durum, setDurum] = useState("");
  const [acik, setAcik] = useState<number | null>(null);
  const [gorselsiz, setGorselsiz] = useState<Record<number, boolean>>({});
  const [adsiz, setAdsiz] = useState<Record<number, boolean>>({});
  // Görsel seçenekleri (5 Kasım 2026): kunye-otomatik denetimden geçen en çok 3 görsel hazırlar; editör birini seçer (varsayılan ilki)
  const [secim, setSecim] = useState<Record<number, number>>({});
  const secenekler = (o: Oneri) => o.gorsel_aday?.secenekler?.length ? o.gorsel_aday.secenekler : o.gorsel ? [{ gorsel: o.gorsel, url: o.gorsel_aday?.url ?? "", sayfa: o.gorsel_aday?.sayfa ?? "" }] : [];
  const secili = (o: Oneri) => secenekler(o)[secim[o.id] ?? 0] ?? secenekler(o)[0];
  const dur = useRef(false);
  // Onay sürerken satırda adım yazar (5 Kasım 2026, kullanıcı: "onayla'ya basıyorum tepki göstermiyor, uzun süre sonra ekliyor")
  const [isliyor, setIsliyor] = useState<Record<number, string>>({});
  // Yöntem değişince eski bekleyenler yenisi gelene kadar ayrı ve kapalı durur (kunye-otomatik YONTEM_SURUMU → tr_settings.kunye_surum)
  const [surum, setSurum] = useState<string | null>(null);
  // Zamanlayıcının son turu (kunye-otomatik → tr_settings.son_kunye): öneri gelmiyorsa nedeni burada görünür
  const [sonTur, setSonTur] = useState<{ zaman: string; bitti: boolean; aday: number; islenen: { urun: string; durum: string; sayi?: number; hata?: string }[] } | null>(null)

  const yukle = useCallback(async () => {
    const { data } = await sb.from("kunye_oneriler").select("*").eq("durum", "bekliyor").order("created_at", { ascending: true }).limit(100);
    setListe((data as Oneri[]) ?? []);
    const { data: t } = await sb.from("tr_settings").select("key,value").in("key", ["son_kunye", "kunye_surum"]);
    const ayar = Object.fromEntries(((t ?? []) as { key: string; value: unknown }[]).map((x) => [x.key, x.value]));
    setSonTur((ayar.son_kunye as typeof sonTur) ?? null);
    setSurum((ayar.kunye_surum as { zaman?: string } | undefined)?.zaman ?? null);
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
        if (j.suruyor) { setDurum("Sistem şu an künyeleri kendisi dolduruyor; öneriler geldikçe aşağıda görünür."); return; }
        // Kota dolunca fonksiyon ürünü işaretlemeden döner; döngü 60 tur boşa dönüp "işlendi" demesin (31 Ekim 2026)
        const kota = (j.islenen as { durum: string }[]).some((x) => x.durum === "kota dolu");
        toplam += (j.islenen as { durum: string }[]).filter((x) => x.durum !== "kota dolu").length; await yukle();
        if (kota) { setDurum(`Gemini kotası dolu${toplam ? ` (${toplam} ürün işlendi)` : ""}. Kota her gün Türkiye saatiyle 10.00-11.00 arası yenilenir; Sistem → Gemini anahtarlarından yeni anahtar da eklenebilir.`); return; }
        if (!j.islenen.length || j.kalan === 0) break;
      }
      setDurum(toplam ? `${toplam} ürün işlendi; öneriler aşağıda.` : "Doldurulacak künye kalmadı (son 7 günde denenenler tekrar denenmez).");
    } catch (e) { setDurum(""); toast((e as Error).message); } finally { setCalisiyor(false); }
  }

  // Önceden onaylanmış künye görsellerinin kenar temizliği (5 Kasım 2026, bir kerelik, yönetici): onayda yüklenen görsel hâlâ ürünün
  // görseliyse (alt metni "<ürün> ürün görseli") indirilir, kenarı temizlenir, yeni medya olarak yüklenip ürüne konur. Temizlenmiş dosya "-k" ile biter.
  const [temizlik, setTemizlik] = useState("");
  async function eskileriTemizle() {
    const { data } = await sb.from("kunye_oneriler").select("urun_id,urun_adi").eq("durum", "onaylandi").eq("gorsel_durum", "hazir").order("id", { ascending: false }).limit(300);
    const urunler = [...new Map(((data ?? []) as { urun_id: number; urun_adi: string }[]).map((x) => [x.urun_id, x])).values()];
    let yapilan = 0, atlanan = 0;
    for (const [i, x] of urunler.entries()) {
      setTemizlik(`Kenarlar temizleniyor: ${i + 1}/${urunler.length}`);
      try {
        const u = await istekYap<{ name: string; brand: string; image?: { id: number; url?: string; filename?: string; alt?: string; credit?: string } | null }>(`/products/${x.urun_id}?depth=1`);
        const g = u.image;
        if (!g?.url || !g.alt?.endsWith("ürün görseli") || /-k\.(webp|png)$/.test(g.filename ?? "")) { atlanan++; continue; }
        const ham = await fetch(g.url + (g.url.includes("?") ? "&" : "?") + "indir=" + Date.now(), { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error("indirilemedi"); return r.blob(); });
        const b = await kenarTemizle(ham);
        const m = await medyaYukle(new File([b], `${kucuk(x.urun_adi) || "urun"}-k.${b.type === "image/png" ? "png" : "webp"}`, { type: b.type || "image/webp" }), g.alt, g.credit ?? `Görsel: ${u.brand}`, false);
        await istekYap(`/products/${x.urun_id}?depth=0`, { method: "PATCH", body: JSON.stringify({ image: m.id }) });
        yapilan++;
      } catch { atlanan++; }
    }
    setTemizlik(""); toast(`${yapilan} künye görselinin kenarı temizlendi${atlanan ? `, ${atlanan} atlandı (görseli sonradan değişmiş ya da zaten temiz)` : ""}.`);
  }

  async function onayla(o: Oneri) {
    if (isliyor[o.id]) return;
    const adim = (m: string) => setIsliyor((x) => ({ ...x, [o.id]: m }));
    adim("Künye okunuyor…");
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
      // Önerilen resmî ad (göç 0060) onayla birlikte künyenin adı olur
      if (o.resmi_ad && !adsiz[o.id]) govde.name = o.resmi_ad;
      if (o.gorsel_durum === "hazir" && o.gorsel && !gorselsiz[o.id]) {
        // Önbelleği atla (5 Kasım 2026): liste görseli önce <img> ile gösterdiği için tarayıcı izin başlığı olmayan kopyayı saklıyor
        // (depolama "Vary: Origin" göndermiyor); aynı adresi fetch ile istemek "Load failed / Failed to fetch" veriyordu
        adim("Görsel panele yükleniyor…");
        const sec = secili(o);
        const adres = sec?.gorsel ?? o.gorsel;
        const ham = await fetch(adres + (adres.includes("?") ? "&" : "?") + "indir=" + Date.now(), { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error("Görsel indirilemedi"); return r.blob(); });
        // Koyu temada beyaz kenar kalmasın (kenarTemizle.ts); temizlenemezse görsel olduğu gibi gider
        const b = await kenarTemizle(ham).catch(() => ham);
        const gorselBilgi = sec && o.gorsel_aday ? { ...o.gorsel_aday, url: sec.url, sayfa: sec.sayfa } : o.gorsel_aday;
        const m = await medyaYukle(new File([b], `${kucuk(o.urun_adi) || "urun"}.${b.type === "image/png" ? "png" : "webp"}`, { type: b.type || "image/webp" }), `${o.urun_adi} ürün görseli`, gorselKunye(gorselBilgi, u.brand), false);
        govde.image = m.id;
      }
      adim("Künyeye yazılıyor…");
      await istekYap(`/products/${o.urun_id}?depth=0`, { method: "PATCH", body: JSON.stringify(govde) });
      await sb.from("kunye_oneriler").update({ durum: "onaylandi", karar_veren: session?.user.id, karar_at: new Date().toISOString() }).eq("id", o.id);
      setListe((l) => l?.filter((x) => x.id !== o.id) ?? l);
      toast(`${o.urun_adi}: ${o.ozellikler.length} özellik${govde.image ? " ve görsel" : ""} künyeye yazıldı.`); yukle();
    } catch (e) { toast((e as Error).message); }
    finally { setIsliyor((x) => { const y = { ...x }; delete y[o.id]; return y; }); }
  }
  async function reddet(o: Oneri) {
    setListe((l) => l?.filter((x) => x.id !== o.id) ?? l);
    await sb.from("kunye_oneriler").update({ durum: "reddedildi", karar_veren: session?.user.id, karar_at: new Date().toISOString() }).eq("id", o.id);
    yukle();
  }

  return (
    <section className="panel kunye-onay">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div><b>Künye otomasyonu</b><div className="muted" style={{ fontSize: 14 }}>Sistem her ürünün resmî özellik sayfasını internette bulur, değerleri kaynağıyla önerir. Sen kontrol edip onaylarsın.</div></div>
        <div className="row" style={{ gap: 6 }}>
          {profile?.is_admin && <button className="btn ghost sm" disabled={!!temizlik} onClick={eskileriTemizle} title="Onaylanmış künye görsellerinde koyu temadaki beyaz kenarı temizler">{temizlik || "Eski görsellerin kenarını temizle"}</button>}
          {calisiyor ? <button className="btn ghost" onClick={() => { dur.current = true; }}>Durdur</button> : <button className="btn" onClick={otomatik}>Eksik künyeleri doldur</button>}
        </div>
      </div>
      {durum && <div className="muted">{durum}</div>}
      {sonTur && <div className="muted" style={{ fontSize: 13 }}>
        Son tur {new Date(sonTur.zaman).toLocaleString("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}: {sonTur.islenen.length
          ? sonTur.islenen.map((x) => `${x.urun} · ${x.durum}${x.sayi ? ` (${x.sayi})` : ""}`).join(", ")
          : sonTur.bitti ? "doldurulacak ürün yok" : "başladı, sonuç gelmeden yarıda kaldı"}
        {sonTur.islenen.some((x) => x.durum === "kota dolu") && " · Gemini kotası dolu, kota Türkiye saatiyle 10.00-11.00 arası yenilenir."}
      </div>}
      {liste === null ? <div className="muted">Yükleniyor…</div> : !liste.length ? <div className="muted">Onay bekleyen öneri yok.</div> : (() => {
        const eski = surum ? liste.filter((o) => o.created_at < surum) : [];
        const yeni = liste.filter((o) => !eski.includes(o));
        const satir = (o: Oneri) => (
        <li key={o.id}>
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <button className="linkbtn" onClick={() => setAcik(acik === o.id ? null : o.id)}><b>{o.urun_adi}</b> · {o.ozellikler.length} özellik önerisi{(() => { const d = o.ozellikler.filter((x) => x.islem).length; return d ? ` · ikinci göz ${d} değeri düzeltti/ekledi` : ""; })()}</button>
            <div className="row" style={{ gap: 6 }}>{isliyor[o.id] && <span className="muted" role="status" style={{ fontSize: 13 }}>{isliyor[o.id]}</span>}<button className="btn sm" disabled={!!isliyor[o.id]} onClick={() => onayla(o)}>{isliyor[o.id] ? "Onaylanıyor…" : "Onayla"}</button><button className="btn ghost sm" disabled={!!isliyor[o.id]} onClick={() => reddet(o)}>Reddet</button></div>
          </div>
          {o.resmi_ad && <label className="muted" style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 14 }}><input type="checkbox" checked={!adsiz[o.id]} onChange={(e) => setAdsiz((x) => ({ ...x, [o.id]: !e.target.checked }))} /> Adı da düzelt: <b>{o.resmi_ad}</b></label>}
          {o.gorsel_durum === "hazir" && o.gorsel ? (
            <div className="ko-gorsel">
              <a href={secili(o)?.gorsel ?? o.gorsel} target="_blank" rel="noreferrer" title="Tam boyutta aç"><img src={secili(o)?.gorsel ?? o.gorsel} alt={`${o.urun_adi} (arka planı silinmiş)`} loading="lazy" /></a>
              <div className="muted" style={{ fontSize: 13 }}>
                {secenekler(o).length > 1 && (
                  <div className="ko-secenek" role="radiogroup" aria-label="Görsel seçenekleri">
                    {secenekler(o).map((x, i) => (
                      <button key={x.gorsel} role="radio" aria-checked={(secim[o.id] ?? 0) === i} onClick={() => setSecim((y) => ({ ...y, [o.id]: i }))} title={`Seçenek ${i + 1}`}>
                        <img src={x.gorsel} alt={`Seçenek ${i + 1}`} loading="lazy" />
                      </button>
                    ))}
                  </div>
                )}
                {gorselKunye(o.gorsel_aday, o.urun_adi.split(" ")[0])}{(secili(o)?.sayfa || o.gorsel_aday?.sayfa) && <> · <a href={secili(o)?.sayfa || o.gorsel_aday?.sayfa} target="_blank" rel="noreferrer">kaynak</a></>}
                {o.gorsel_aday?.neden && <div>Seçim: {o.gorsel_aday.neden}</div>}
                <label style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}><input type="checkbox" checked={!gorselsiz[o.id]} onChange={(e) => setGorselsiz((x) => ({ ...x, [o.id]: !e.target.checked }))} /> Görseli de künyeye koy</label>
              </div>
            </div>
          ) : o.gorsel_durum === "isleniyor" ? <div className="muted" style={{ fontSize: 13 }}>Görsel hazırlanıyor (arka plan siliniyor)…</div>
            : o.gorsel_durum === "hata" ? <div className="muted" style={{ fontSize: 13 }}>Görsel işlenemedi: {o.gorsel_hata}</div>
            : <div className="muted" style={{ fontSize: 13 }}>Kaynaklarda kullanılabilir ürün görseli bulunamadı.</div>}
          {acik === o.id && (
            <div className="kd-tablo">
              <table><thead><tr><th>Özellik</th><th>Değer</th><th>Kaynak</th></tr></thead>
                <tbody>{o.ozellikler.map((x) => <tr key={x.key}><th scope="row">{x.key}</th><td><b>{x.value}</b>{x.kanit && <div className="muted kd-kanit">“{x.kanit}”</div>}
                  {x.islem && <div className="muted kd-kanit">İkinci göz {x.islem === "eklendi" ? "ekledi" : "düzeltti"}{x.not ? `: ${x.not}` : ""}</div>}
                  {x.alinti === false && <div className="muted kd-kanit">Alıntı kaynak sayfada birebir bulunamadı; değeri sayfadan kontrol et.</div>}</td><td>{x.kaynak ? <a href={x.kaynak} target="_blank" rel="noreferrer">{alan(x.kaynak)}</a> : <span className="muted">—</span>}</td></tr>)}</tbody>
              </table>
              {(() => { const sil = o.kaynaklar.flatMap((k) => k.silinen ?? []); return sil.length ? <p className="muted kd-kanit">İkinci göz sildi: {sil.map((x) => `${x.key} (${x.neden})`).join(" · ")}</p> : null; })()}
            </div>
          )}
        </li>
        );
        return <>
          {yeni.length ? <ul className="ko-l">{yeni.map(satir)}</ul> : <div className="muted">Yeni yöntemle çıkan öneri henüz yok.</div>}
          {eski.length > 0 && <details className="ko-eski">
            <summary className="muted">Eski yöntemle çıkanlar ({eski.length}): yeni yöntemle yeniden çıkarılıyor, yenisi gelince buradan kalkar</summary>
            <ul className="ko-l">{eski.map(satir)}</ul>
          </details>}
        </>;
      })()}
    </section>
  );
}
