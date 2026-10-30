// Hareket geçmişi (28 Ekim 2026, kullanıcı: "kim ne yaptı, her şeyin bir kaydı tutulsun, yalnız yöneticiler görsün").
// Kaynak: public.hareketler (göç 0045). Panel tarafını site deposundaki Payload kancası yazar (apps/cms/src/hooks/hareket.ts),
// Stüdyo tarafını tetikleyiciler (anahtarlar, ekip/yetki, davet, Haber Masası, künye kararı). Kayıt yalnız eklenir; kimse silemez.
// Silinen içerik "Geri getir" ile panele taslak olarak yeniden yazılır (silinen kaydın saklanan tam hâlinden).
import { useCallback, useEffect, useMemo, useState } from "react";
import { sb } from "../../shared/supabase";
import { useToast } from "../../shared/toast";
import { Ikon } from "../../shared/Ikon";
import { istekYap } from "../site/api";

type Hareket = { id: number; zaman: string; kaynak: string; kim_eposta: string; kim_ad: string; islem: string; tur: string; nesne_id: string; baslik: string; ayrinti: Record<string, unknown> };

const ISLEM: Record<string, [string, string]> = {
  olustur: ["oluşturdu", "blue"], degistir: ["değiştirdi", ""], yayinla: ["yayınladı", "ok"], yayindan_kaldir: ["yayından kaldırdı", "wait"], sil: ["sildi", "off"],
  giris: ["giriş yaptı", ""], anahtar: ["bağlantı anahtarı", "purple"], yetki: ["yetki değiştirdi", "purple"], davet: ["davet", "purple"], ekip: ["ekip", "purple"],
  haber_masasi: ["Haber Masası", "wait"], kunye: ["künye kararı", "blue"],
};
const TUR: Record<string, string> = {
  news: "Haber", reviews: "İnceleme", comparisons: "Kıyas yazısı", products: "Künye", categories: "Kategori", authors: "Yazar", media: "Görsel", videos: "Video", reels: "Reels", ads: "Reklam",
  "kulup-tracks": "Kulüp dersi", "kulup-quizzes": "Kulüp alıştırması", pages: "Sayfa", uyeler: "Uper üyesi", yorumlar: "Yorum", yarismalar: "Yarışma", gorevler: "Haftalık görev", "gorev-fotolari": "Görev fotoğrafı", "gorev-gorselleri": "Görev görseli",
  users: "Kullanıcı hesabı", site: "Site ayarları", home: "Ana sayfa ayarları", "uye-giris": "Üyelik ayarları", baglanti_anahtarlari: "Bağlantı anahtarı", gemini_anahtari: "Gemini anahtarı", profiles: "Ekip", invites: "Davet", tr_items: "Haber Masası", kunye_oneriler: "Künye önerisi",
};
// Geri getirilebilen türler: dosyası olanlar (görseller) ve hesaplar hariç
const GERI = new Set(["news", "reviews", "comparisons", "products", "categories", "authors", "videos", "reels", "ads", "kulup-tracks", "kulup-quizzes", "pages", "yarismalar", "gorevler"]);
const TASLAKLI = new Set(["news", "reviews", "comparisons", "pages"]);
const KAYNAK: Record<string, string> = { panel: "panel", studyo: "Stüdyo", sistem: "sistem" };
const DONEM: [string, string, number][] = [["24s", "Son 24 saat", 1], ["7g", "Son 7 gün", 7], ["30g", "Son 30 gün", 30], ["tum", "Tümü", 0]];

const tam = (s: string) => new Date(s).toLocaleString("tr-TR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
function once(s: string) {
  const dk = (Date.now() - new Date(s).getTime()) / 6e4;
  if (dk < 1) return "az önce";
  if (dk < 60) return `${Math.round(dk)} dk önce`;
  if (dk < 60 * 48) return `${Math.round(dk / 60)} sa önce`;
  return new Date(s).toLocaleDateString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
const ALAN: Record<string, string> = { title: "başlık", spot: "spot", body: "metin", cover: "kapak", category: "kategori", label: "etiket", author: "yazar", publishedAt: "yayın tarihi", products: "ürünler", seo: "SEO", slug: "adres", workflow: "iş akışı", name: "ad", specs: "özellikler", image: "görsel", score: "puan", pros: "artılar", cons: "eksiler", status: "durum", brand: "marka", type: "tür", blurb: "açıklama", hero: "manşet", modules: "bölümler", mostRead: "en çok okunanlar", role: "rol", email: "e-posta", avatar: "fotoğraf", bio: "biyografi", path: "yol", upscore: "UPscore", amazon: "Amazon kodu", parts: "söküm", rivals: "rakipler", sources: "kaynaklar", corrections: "düzeltmeler", durum: "durum", baslik: "başlık", aciklama: "açıklama" };

export default function Hareketler() {
  const toast = useToast();
  const [liste, setListe] = useState<Hareket[]>([]);
  const [donem, setDonem] = useState("7g");
  const [kisi, setKisi] = useState("");
  const [islem, setIslem] = useState("");
  const [tur, setTur] = useState("");
  const [ara, setAra] = useState("");
  const [acik, setAcik] = useState<number | null>(null);
  const [hata, setHata] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);
  const [bitti, setBitti] = useState(false);
  const [mesgul, setMesgul] = useState(0);
  const SAYFA = 200;

  const yukle = useCallback(async (devam = false) => {
    setYukleniyor(true);
    const gun = DONEM.find((d) => d[0] === donem)?.[2] ?? 7;
    let q = sb.from("hareketler").select("*").order("zaman", { ascending: false }).limit(SAYFA);
    if (gun) q = q.gte("zaman", new Date(Date.now() - gun * 864e5).toISOString());
    if (devam && liste.length) q = q.lt("zaman", liste[liste.length - 1].zaman);
    const { data, error } = await q;
    setYukleniyor(false);
    if (error) { setHata(error.message); return; }
    setHata("");
    const yeni = (data ?? []) as Hareket[];
    setListe((l) => (devam ? [...l, ...yeni] : yeni));
    setBitti(yeni.length < SAYFA);
  }, [donem, liste]);
  useEffect(() => { yukle(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [donem]);

  const kisiler = useMemo(() => [...new Map(liste.map((h) => [h.kim_eposta || h.kim_ad, h.kim_ad || h.kim_eposta])).entries()].sort((a, b) => a[1].localeCompare(b[1], "tr")), [liste]);
  const turler = useMemo(() => [...new Set(liste.map((h) => h.tur))].sort((a, b) => (TUR[a] ?? a).localeCompare(TUR[b] ?? b, "tr")), [liste]);
  const kucuk = (s: string) => s.toLocaleLowerCase("tr-TR");
  const gorunen = liste.filter((h) => (!kisi || (h.kim_eposta || h.kim_ad) === kisi) && (!islem || h.islem === islem) && (!tur || h.tur === tur) && (!ara || kucuk(h.baslik + " " + h.kim_ad + " " + h.nesne_id).includes(kucuk(ara))));

  async function geriGetir(h: Hareket) {
    const kayit = h.ayrinti?.kayit as Record<string, unknown> | undefined;
    if (!kayit) return;
    if (!confirm(`"${h.baslik}" panele ${TASLAKLI.has(h.tur) ? "taslak olarak " : ""}yeniden eklensin mi?`)) return;
    setMesgul(h.id);
    try {
      const veri: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(kayit)) if (!["id", "createdAt", "updatedAt", "_status", "sizes", "url", "thumbnailURL"].includes(k)) veri[k] = v;
      if (TASLAKLI.has(h.tur)) veri._status = "draft";
      const r = await istekYap<{ doc?: { id?: number | string } }>(`/${h.tur}${TASLAKLI.has(h.tur) ? "?draft=true" : ""}`, { method: "POST", body: JSON.stringify(veri) });
      toast(`Geri getirildi${r.doc?.id ? ` (yeni kayıt no ${r.doc.id})` : ""}. Site → ilgili bölümde bulabilirsin.`);
      await yukle();
    } catch (e) { toast("Geri getirilemedi: " + (e as Error).message); }
    setMesgul(0);
  }

  return (
    <section className="panel">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0 }}>Hareket geçmişi</h2>
        <button className="btn ghost sm" disabled={yukleniyor} onClick={() => yukle()}>Yenile</button>
      </div>
      <div className="muted">Panelde ve Stüdyo'da kim ne yaptı: oluşturma, değişiklik, yayın, silme, giriş, anahtar ve yetki işlemleri. Kayıtlar yalnız eklenir, kimse silemez. Silinen içerik buradan geri getirilir. Kayıt 28 Ekim 2026'da başladı; öncesi için elimizdeki izler "geçmiş kayıt" etiketiyle eklendi (kişi tahmini; o dönemde silinenlerin izi yok).</div>
      <div className="segment" role="group" aria-label="Dönem">
        {DONEM.map(([k, ad]) => <button key={k} className="chip" aria-pressed={donem === k} onClick={() => setDonem(k)}>{ad}</button>)}
      </div>
      <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
        <select aria-label="Kişi" value={kisi} onChange={(e) => setKisi(e.target.value)}><option value="">Herkes</option>{kisiler.map(([k, ad]) => <option key={k} value={k}>{ad}</option>)}</select>
        <select aria-label="İşlem" value={islem} onChange={(e) => setIslem(e.target.value)}><option value="">Bütün işlemler</option>{Object.entries(ISLEM).map(([k, [ad]]) => <option key={k} value={k}>{ad}</option>)}</select>
        <select aria-label="Tür" value={tur} onChange={(e) => setTur(e.target.value)}><option value="">Bütün türler</option>{turler.map((t) => <option key={t} value={t}>{TUR[t] ?? t}</option>)}</select>
        <input aria-label="Ara" placeholder="Başlıkta ara" value={ara} onChange={(e) => setAra(e.target.value)} style={{ flex: "1 1 160px" }} />
      </div>
      {hata && <div className="msg err">{hata}</div>}
      {!hata && !gorunen.length && <div className="empty">{yukleniyor ? "Yükleniyor…" : "Bu süzgeçte kayıt yok."}</div>}
      <div className="liste">
        {gorunen.map((h) => {
          const [islemAd, renk] = ISLEM[h.islem] ?? [h.islem, ""];
          const alanlar = (h.ayrinti?.alanlar as string[] | undefined) ?? [];
          const kayit = h.ayrinti?.kayit as Record<string, unknown> | undefined;
          const ac = acik === h.id;
          return (
            <div key={h.id} className="satir" style={{ alignItems: "flex-start" }}>
              <span className="muted mono" title={tam(h.zaman)} style={{ flex: "0 0 92px", fontSize: 12, paddingTop: 3 }}>{once(h.zaman)}</span>
              <div className="ana">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                  <b>{h.kim_ad || h.kim_eposta || (h.ayrinti?.geriye_donuk ? "Bilinmiyor" : "Sistem")}</b>
                  <span className={"pill " + renk}>{islemAd}</span>
                  <span className="muted">{TUR[h.tur] ?? h.tur}{h.nesne_id && h.islem !== "giris" ? ` #${h.nesne_id}` : ""}</span>
                  <span className="muted" style={{ fontSize: 12 }}>· {KAYNAK[h.kaynak] ?? h.kaynak}</span>
                  {h.ayrinti?.geriye_donuk ? <span className="pill off" title="Kayıt tutulmaya başlamadan önceki iz; kişi bilgisi tahmini">geçmiş kayıt</span> : null}
                </div>
                {h.baslik && h.islem !== "giris" && <div style={{ marginTop: 2 }}>{h.baslik}</div>}
                {ac && <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                  <div>{tam(h.zaman)}{h.kim_eposta ? ` · ${h.kim_eposta}` : ""}</div>
                  {alanlar.length > 0 && <div>Değişen alanlar: {alanlar.map((a) => ALAN[a] ?? a).join(", ")}</div>}
                  {h.ayrinti?.taslak ? <div>Taslak olarak kaydedildi.</div> : null}
                  {h.islem === "haber_masasi" && h.ayrinti?.hedef ? <div>Hedef: {String(h.ayrinti.hedef)}</div> : null}
                  {h.islem === "haber_masasi" && h.ayrinti?.not ? <div>Not: {String(h.ayrinti.not)}</div> : null}
                  {h.ayrinti?.eski !== undefined && <div>Eski: {String(h.ayrinti.eski ?? "")} → Yeni: {String(h.ayrinti.yeni ?? "")}</div>}
                  {kayit && <div style={{ marginTop: 6 }}>
                    {GERI.has(h.tur) ? <button className="btn sm" disabled={mesgul === h.id} onClick={() => geriGetir(h)}>{mesgul === h.id ? "Geri getiriliyor…" : "Geri getir"}</button> : <span>Silinen kaydın bilgisi saklandı; bu tür ({TUR[h.tur] ?? h.tur}) kendiliğinden geri getirilemez.</span>}
                  </div>}
                </div>}
              </div>
              <button className="btn ghost sm" aria-label={ac ? "Ayrıntıyı kapat" : "Ayrıntı"} onClick={() => setAcik(ac ? null : h.id)}><Ikon ad={ac ? "check" : "plus"} /></button>
            </div>
          );
        })}
      </div>
      {!bitti && gorunen.length > 0 && <button className="btn ghost" disabled={yukleniyor} onClick={() => yukle(true)}>{yukleniyor ? "Yükleniyor…" : "Daha eski kayıtlar"}</button>}
    </section>
  );
}
