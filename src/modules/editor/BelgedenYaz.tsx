import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Ikon } from "../../shared/Ikon";
import { belgedenHazirla, type Adim, type Hazir } from "./belge/hazirla";
import { usePanelKullanici, SiteYetkisiYok } from "./Taslaklarim";

// Belgeden yaz (6 Kasım 2026, kullanıcı: "belgemiz var, yeni yazı olarak girilsin; studioda editörlere böyle veriden otomatik bizim
// kurallarımızda bizim tarzımızda hazırlasın"). Editör Word ya da PDF belgesini bırakır; gerisi kendiliğinden: okuma, yapay zekâ
// (supabase/functions/belge-yaz), fotoğrafların yüklenmesi, panelde taslak. Sonunda taslak ve yapılanların listesi; seçim yok.
const ADIMLAR: [Adim, string][] = [["okunuyor", "Belge okunuyor"], ["sira", "Sıra bekleniyor"], ["yz", "Sitenin kuralları uygulanıyor"], ["fotolar", "Fotoğraflar yükleniyor"], ["taslak", "Taslak açılıyor"]];
const TUR_AD = { inceleme: "İnceleme", rehber: "Rehber", haber: "Haber" } as const;

export default function BelgedenYaz() {
  const { kullanici, hata: panelHata } = usePanelKullanici();
  const git = useNavigate();
  const [adim, setAdim] = useState<{ a: Adim; ek?: string } | null>(null);
  const [dosya, setDosya] = useState("");
  const [hata, setHata] = useState("");
  const [sonuc, setSonuc] = useState<Hazir | null>(null);
  const [ustunde, setUstunde] = useState(false);
  const [siraGordu, setSiraGordu] = useState(false);
  const calisiyor = !!adim && !sonuc && !hata;

  const basla = async (f: File | undefined) => {
    if (!f || calisiyor) return;
    setDosya(f.name); setHata(""); setSonuc(null); setSiraGordu(false); setAdim({ a: "okunuyor" });
    try { setSonuc(await belgedenHazirla(f, (a, ek) => { if (a === "sira") setSiraGordu(true); setAdim({ a, ek }); })); }
    catch (e) { setHata((e as Error).message); }
  };

  if (panelHata) return <div className="empty">Site paneline bağlanılamadı: {panelHata}</div>;
  if (kullanici === null) return <SiteYetkisiYok />;
  // "Sıra bekleniyor" yalnız sıra gerçekten beklendiyse görünür
  const adimlar = ADIMLAR.filter(([a]) => a !== "sira" || siraGordu);
  const sira = adim ? adimlar.findIndex(([a]) => a === adim.a) : -1;
  const s = sonuc?.sonuc;

  return (
    <div className="ed-sayfa ed-belge">
      <div className="ed-bas"><div><span className="ed-ust">YAZ</span><h1>Belgeden yaz</h1></div></div>
      <p className="ed-belge-acik">Word ya da PDF belgesini bırak. Yazarın imzalı metni korunur, yalnız yazım ve sitenin kuralları uygulanır. Basın bülteni gibi ham malzeme sitenin üslubuyla yeniden yazılır. Başlık, spot, kısa cevap, fotoğraf altları ve incelemede puan kutusu hazırlanır; taslak yayına girmez.</p>

      {!calisiyor && (
        <label className={"ed-belge-birak" + (ustunde ? " ustunde" : "")}
          onDragOver={(e) => { e.preventDefault(); setUstunde(true); }} onDragLeave={() => setUstunde(false)}
          onDrop={(e) => { e.preventDefault(); setUstunde(false); basla(e.dataTransfer.files[0]); }}>
          <input type="file" accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => { basla(e.target.files?.[0]); e.target.value = ""; }} />
          <Ikon ad="taslak" />
          <b>{sonuc || hata ? "Başka bir belge seç" : "Belgeyi buraya bırak ya da seç"}</b>
          <span>.docx ya da .pdf · fotoğraflar Word belgesinden alınır</span>
        </label>
      )}

      {adim && (
        <section className="ed-belge-adim" aria-live="polite">
          <div className="ed-belge-dosya"><span className="ed-ust">BELGE</span><b>{dosya}</b></div>
          <ol>
            {adimlar.map(([a, ad], i) => {
              const durum = hata && i === sira ? "hata" : sonuc || i < sira ? "bitti" : i === sira ? "suruyor" : "bekliyor";
              return <li key={a} data-durum={durum}><i aria-hidden="true">{durum === "bitti" ? <Ikon ad="check" /> : i + 1}</i><span>{ad}{i === sira && adim.ek && !sonuc ? <em> · {adim.ek}</em> : null}</span></li>;
            })}
          </ol>
          {calisiyor && adim?.a === "yz" && <p className="muted">Uzun belgede bu adım bir iki dakika sürebilir. Sayfayı kapatma.</p>}
          {hata && <div className="msg err">{hata}</div>}
        </section>
      )}

      {sonuc && s && (
        <section className="ed-belge-sonuc">
          <div className="ed-belge-ust">
            <span className="ed-ust">{`${TUR_AD[s.tur]} taslağı · ${s.mod === "koru" ? "yazarın metni korundu" : "sitenin üslubuyla yazıldı"}`.toLocaleUpperCase("tr")}</span>
            <h2>{s.baslik}</h2>
            <p>{s.spot}</p>
          </div>
          <dl className="ed-belge-alan">
            <dt>Künye</dt><dd>{sonuc.urun ? `${sonuc.urun.ad}${sonuc.urun.yeni ? " · yeni açıldı" : ""}` : "Bağlanmadı"}</dd>
            <dt>Yazar</dt><dd>{sonuc.yazar ? sonuc.yazar.ad : "Senin imzan"}{s.katki ? ` · ${s.katki}` : ""}</dd>
            <dt>Fotoğraf</dt><dd>{sonuc.fotoSayisi ? `${sonuc.fotoSayisi} fotoğraf yüklendi, altyazı ve alt metinleriyle` : "Yok"}</dd>
            {sonuc.k === "reviews" && <><dt>Puan kutusu</dt><dd>{s.puanKutusu.arti.length} artı, {s.puanKutusu.eksi.length} eksi{s.puanKutusu.puan != null ? `, UPscore ${s.puanKutusu.puan.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}/10` : ", UPscore senin"}</dd></>}
          </dl>
          <div className="ed-belge-iki">
            <div><span className="ed-ust">YAPILANLAR</span><ul>{s.degisiklikler.map((d) => <li key={d}>{d}</li>)}</ul></div>
            <div><span className="ed-ust">SENİN TAMAMLAYACAKLARIN</span><ul>{[...sonuc.uyarilar, ...s.eksikler].map((d) => <li key={d}>{d}</li>)}</ul></div>
          </div>
          <div className="ed-belge-eylem">
            <button className="btn" onClick={() => git(`/yaz/${sonuc.id}?k=${sonuc.k}`)}><Ikon ad="yaz" />Taslağı aç</button>
            {sonuc.onizleme && <a className="btn ghost" href={sonuc.onizleme} target="_blank" rel="noreferrer">Sitedeki görünüşü</a>}
          </div>
        </section>
      )}
    </div>
  );
}
