// Bağlantı anahtarları (27 Ekim 2026, yalnız yöneticiler): dış servis anahtarları burada girilir, sunucuda saklanır.
// Girilen değer bir daha ekrana gelmez (veritabanında okuma izni yok; yalnız sunucu fonksiyonları okur). Göç 0040.
// - Yedek Google (Gemini) anahtarı: yarışma tarama ve künye bulma, ana anahtarın kotası dolunca bunu kullanır.
// - Instagram erişim anahtarı: instagram-reels fonksiyonu son Reels'leri çeker, anahtarı 60 günü dolmadan kendisi yeniler.
import { useCallback, useEffect, useState } from "react";
import { sb } from "../../shared/supabase";
import { useToast } from "../../shared/toast";
import { Ikon } from "../../shared/Ikon";

type Durum = { ad: string; son4: string; ek: Record<string, string>; updated_at: string };
const tarih = (s?: string) => (s ? new Date(s).toLocaleString("tr-TR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

const ANAHTARLAR: { ad: string; baslik: string; ikon: string; aciklama: string; adimlar: { metin: string; link?: string }[] }[] = [
  {
    ad: "gemini_yedek", baslik: "Yedek Google (Gemini) anahtarı", ikon: "triyaj",
    aciklama: "Yarışma tarama ve künye bulma internette arama yapabilen tek model olan Gemini'yi kullanır. Ana anahtarın günlük kotası dolunca bu anahtarla devam eder. Kota proje başına sayılır: anahtar başka bir Google hesabından alınmalı.",
    adimlar: [
      { metin: "Google AI Studio'yu aç (yedek anahtarın sahibi olacak Google hesabıyla gir)", link: "https://aistudio.google.com/apikey" },
      { metin: "\"Create API key\" (API anahtarı oluştur) düğmesine bas, yeni bir proje seçilmesini iste" },
      { metin: "Çıkan anahtarı kopyala, aşağıya yapıştır, Kaydet" },
    ],
  },
  {
    ad: "instagram", baslik: "Instagram erişim anahtarı (@updated.tr)", ikon: "kamera",
    aciklama: "Sitedeki \"Son videolar\" sütunu bu anahtarla Instagram'daki son Reels'leri çeker. Anahtar yalnız okuma izni taşır, hesaptan paylaşım yapamaz. Süresi 60 gün; sistem dolmadan kendisi yeniler.",
    adimlar: [
      { metin: "Instagram'da @updated.tr profesyonel hesap olmalı (Ayarlar → Hesap türü ve araçlar → Profesyonel hesaba geç)" },
      { metin: "Meta geliştirici sayfasında yeni uygulama oluştur (tür: İşletme)", link: "https://developers.facebook.com/apps" },
      { metin: "Uygulamaya \"Instagram\" ürününü ekle → \"Instagram girişiyle API kurulumu\" → \"Hesap ekle\" ile @updated.tr'ye gir" },
      { metin: "\"Erişim anahtarı oluştur\" (Generate token) → IG ile başlayan uzun anahtarı kopyala, aşağıya yapıştır, Kaydet. Uygulama gizli anahtarı (App Secret) değil." },
    ],
  },
];

// Sık karışan değerler kaydetmeden yakalanır: Meta'nın "Uygulama gizli anahtarı" (App Secret) 32 karakterlik 0-9/a-f metnidir,
// Uygulama Kimliği yalnız rakamdır; Instagram erişim anahtarı "IG" ile başlar ve çok daha uzundur. Gemini anahtarı "AIza" ile başlar.
function bicimHatasi(ad: string, v: string): string {
  if (ad === "instagram") {
    if (/^[0-9a-f]{32}$/i.test(v)) return "Bu, uygulamanın gizli anahtarı (App Secret) gibi görünüyor; o gerekmiyor. \"Generate token\" ile çıkan, IG ile başlayan uzun anahtarı yapıştır.";
    if (/^\d+$/.test(v)) return "Bu, uygulama ya da hesap kimliği (ID) gibi görünüyor. \"Generate token\" ile çıkan, IG ile başlayan uzun anahtarı yapıştır.";
    if (!/^(IG|EAA)/.test(v) || v.length < 100) return "Bu Instagram erişim anahtarına benzemiyor: anahtar IG ile başlar ve çok uzundur. \"Generate token\" ile çıkanı eksiksiz kopyala.";
  }
  if (ad === "gemini_yedek" && !/^AIza/.test(v)) return "Bu Google (Gemini) anahtarına benzemiyor: anahtar AIza ile başlar.";
  return "";
}

export default function Baglantilar() {
  const toast = useToast();
  const [durum, setDurum] = useState<Record<string, Durum>>({});
  const [deger, setDeger] = useState<Record<string, string>>({});
  const [mesgul, setMesgul] = useState("");
  const [hata, setHata] = useState("");

  const yukle = useCallback(async () => {
    const { data, error } = await sb.rpc("anahtar_durum");
    if (error) { setHata(error.message); return; }
    setHata(""); setDurum(Object.fromEntries(((data ?? []) as Durum[]).map((d) => [d.ad, d])));
  }, []);
  useEffect(() => { yukle(); }, [yukle]);

  async function kaydet(ad: string, sil = false) {
    if (sil && !confirm("Anahtar silinsin mi? Bu bağlantıyı kullanan iş çalışmaz olur.")) return;
    const yanlis = !sil && bicimHatasi(ad, (deger[ad] ?? "").trim());
    if (yanlis) { toast(yanlis); return; }
    setMesgul(ad);
    const { error } = await sb.rpc("anahtar_kaydet", { p_ad: ad, p_deger: sil ? "" : (deger[ad] ?? "") });
    setMesgul("");
    if (error) { toast(error.message); return; }
    setDeger((d) => ({ ...d, [ad]: "" }));
    toast(sil ? "Anahtar silindi." : "Anahtar kaydedildi.");
    await yukle();
    if (!sil && ad === "instagram") await instagramCek();
  }

  async function instagramCek() {
    setMesgul("instagram");
    const { data, error } = await sb.functions.invoke("instagram-reels", { body: {} });
    setMesgul("");
    if (error || (data as { hata?: string })?.hata) { toast("Instagram'a bağlanılamadı: " + ((data as { hata?: string })?.hata ?? error?.message)); await yukle(); return; }
    toast(`Instagram bağlandı: ${(data as { reels?: number }).reels ?? 0} Reels alındı. Sitede bir sonraki yayında görünür.`);
    await yukle();
  }

  return (
    <section className="panel">
      <h2>Bağlantı anahtarları</h2>
      <div className="muted">Dış servislerin anahtarları burada girilir ve yalnız sunucuda saklanır. Kaydettikten sonra anahtarın kendisi bir daha görünmez; yalnız son 4 karakteri ve tarihi görünür.</div>
      {hata && <div className="msg err">{hata}</div>}
      {ANAHTARLAR.map((a) => {
        const d = durum[a.ad];
        return (
          <div key={a.ad} className="panel" style={{ marginTop: 4, gap: 10 }}>
            <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}><Ikon ad={a.ikon} /> {a.baslik}</h3>
              <span className={"pill " + (d ? (d.ek?.hata ? "rose" : "ok") : "wait")}>{d ? (d.ek?.hata ? "Sorun var" : "Bağlı") : "Girilmedi"}</span>
            </div>
            <div className="muted">{a.aciklama}</div>
            {d && <div className="muted">Son 4 karakter: <b>…{d.son4}</b> · kaydedildi {tarih(d.updated_at)}
              {d.ek?.hesap ? ` · hesap @${d.ek.hesap}` : ""}{d.ek?.bitis ? ` · geçerli: ${tarih(d.ek.bitis)}` : ""}{d.ek?.son_cekim ? ` · son çekim ${tarih(d.ek.son_cekim)}` : ""}
              {d.ek?.hata ? <div className="msg err" style={{ marginTop: 6 }}>{d.ek.hata}</div> : null}</div>}
            {!d && <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 4 }}>
              {a.adimlar.map((s) => <li key={s.metin}>{s.metin}{s.link && <> · <a href={s.link} target="_blank" rel="noopener noreferrer">aç</a></>}</li>)}
            </ol>}
            <label>{d ? "Yeni anahtar (eskisinin yerine geçer)" : "Anahtar"}
              <input type="password" autoComplete="off" spellCheck={false} value={deger[a.ad] ?? ""} onChange={(e) => setDeger((x) => ({ ...x, [a.ad]: e.target.value }))} placeholder="Buraya yapıştır" />
            </label>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <button className="btn sm" disabled={!!mesgul || !(deger[a.ad] ?? "").trim()} onClick={() => kaydet(a.ad)}>{mesgul === a.ad ? "Kaydediliyor…" : "Kaydet"}</button>
              {d && a.ad === "instagram" && <button className="btn ghost sm" disabled={!!mesgul} onClick={instagramCek}>Reels'leri şimdi çek</button>}
              {d && <button className="btn ghost sm" disabled={!!mesgul} onClick={() => kaydet(a.ad, true)}>Sil</button>}
            </div>
          </div>
        );
      })}
    </section>
  );
}
