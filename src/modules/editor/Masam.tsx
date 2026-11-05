import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../shared/auth";
import { Ikon } from "../../shared/Ikon";
import { sb } from "../../shared/supabase";
import * as api from "../site/api";
import { sirala } from "../haber-masasi/oncelik";
import { isDurumu, useIs } from "../haber-masasi/ortak";
import { MasaProvider, useMasa } from "../haber-masasi/veri";
import { yonetirMi, editorGibi } from "./gorev";
import { SiraTablo, TAZE_SAAT, useSira } from "./sira";
import { usePanelKullanici } from "./Taslaklarim";

// Masam (6 Kasım 2026, onaylı tasarım claude.ai/artifact/AHBvDdvU7gVcXunmXsZet2): ana ekran. Soru: "Okunmayı bekleyen ne var, sıradaki adım ne?"
// Sıradakiler herkeste aynıdır (sahiplik yok): sistemin ve ekibin yazdırdığı taslaklar öncelik sırasıyla; satırdaki düğme sıradaki adımı yapar.
// Sağda en yüksek öncelikli gelen haberler (taslak doğrudan istenir, haber "alınmaz"), günün sayıları, yöneticide onay bekleyen künyeler.
// Eski ana ekran (Bugün) /bugun adresinde duruyor; yeni düzen tamamen oturunca kaldırılacak.
const MASADA = 6;
const sureYazi = (ms: number) => { const dk = Math.max(1, Math.round((Date.now() - ms) / 6e4)); return dk < 60 ? `${dk} dakikadır` : dk < 1440 ? `${Math.round(dk / 60)} saattir` : `${Math.round(dk / 1440)} gündür`; };
const once = (s: string) => { const dk = Math.max(1, Math.round((Date.now() - Date.parse(s)) / 6e4)); return dk < 60 ? `${dk} dk` : dk < 1440 ? `${Math.round(dk / 60)} sa` : `${Math.round(dk / 1440)} gün`; };

function Icerik() {
  const { profile } = useAuth();
  const { kullanici } = usePanelKullanici();
  const { v, yukleniyor } = useMasa();
  const git = useNavigate();
  const is_ = useIs();
  const yonetici = yonetirMi(profile) && !editorGibi(profile);
  const { satirlar, taze, hata } = useSira(kullanici, profile!.id);
  const [yalnizBen, setYalnizBen] = useState(false);
  const [yayin, setYayin] = useState<number | null>(null);
  const [kunye, setKunye] = useState<{ sayi: number; ilk: { id: number; urun_adi: string; ozellikler: unknown[]; gorsel_durum: string | null }[] } | null>(null);

  // Bugün yayına girenler (İstanbul günü): panelin yayındaki haberlerinden
  useEffect(() => {
    if (!kullanici) return;
    const gun = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
    api.liste("news", "yayinda", "", 1, { sirala: "-publishedAt" })
      .then((r) => setYayin(r.docs.filter((x) => { const p = (x as { publishedAt?: string }).publishedAt; return !!p && new Date(p).toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" }) === gun; }).length))
      .catch(() => setYayin(null));
  }, [kullanici]);
  useEffect(() => {
    if (!yonetici) return;
    sb.from("kunye_oneriler").select("id,urun_adi,ozellikler,gorsel_durum", { count: "exact" }).eq("durum", "bekliyor").order("created_at", { ascending: false }).limit(3)
      .then(({ data, count }) => setKunye({ sayi: count ?? 0, ilk: (data ?? []) as never }));
  }, [yonetici]);

  // Gelenlerin en yüksek öncelikli üçü: son 24 saat, taslağı yazılmamış ve yazılmıyor
  const gelen = useMemo(() => {
    const taslakli = new Set(v.taslaklar.map((t) => t.item_id));
    const aday = v.haberler.filter((h) => h.status === "aday" && !taslakli.has(h.id) && !h.work_state && Date.now() - Date.parse(h.created_at) < 864e5);
    const r = sirala(aday, v.oylar, v.haberler);
    return r.liste.slice(0, 3).map((h) => ({ h, puan: Math.round(r.d.get(h.id)!.puan) }));
  }, [v.haberler, v.taslaklar, v.oylar]);

  const hazir = (taze ?? []).filter((s) => s.adim === 2);
  const yaziliyor = (taze ?? []).filter((s) => s.adim === 1 && !s.sorun).length;
  const eski = (satirlar?.length ?? 0) - (taze?.length ?? 0);
  const gosterilen = (yalnizBen ? (taze ?? []).filter((s) => s.benim) : taze ?? []);
  const benimSayi = (taze ?? []).filter((s) => s.benim).length;
  const ilk = hazir[0];
  const sistemYazdi = hazir.filter((s) => s.alt.startsWith("Sistem")).length;

  return (
    <div className="mas">
      <div className="mas-bas">
        <div>
          <h1>Masam</h1>
          {taze === null ? <p className="mas-bulgu">Yükleniyor…</p> : hazir.length ? (
            <p className="mas-bulgu"><b>{hazir.length} taslak okunmayı bekliyor.</b> {sistemYazdi > hazir.length / 2 ? "Çoğunu sistem yazdı; " : ""}{((x: string) => (sistemYazdi > hazir.length / 2 ? x : x[0].toLocaleUpperCase("tr") + x.slice(1)))(ilk.puan !== null ? "en yüksek öncelikli " : "en üstteki ")}“{ilk.baslik.length > 64 ? ilk.baslik.slice(0, 62).trimEnd() + "…" : ilk.baslik}” {sureYazi(ilk.zaman)} bekliyor.</p>
          ) : <p className="mas-bulgu"><b>Okunmayı bekleyen taslak yok.</b> Gelen haberlerden taslak hazırlatabilir ya da kendin yazabilirsin.</p>}
        </div>
        <div className="mas-eylem">
          <button className="btn ghost" onClick={() => git("/yaz/yeni")}><Ikon ad="yaz" />Yeni yaz</button>
          <button className="btn" disabled={!ilk} onClick={() => ilk && git(ilk.siteId ? `/yaz/${ilk.siteId}` : `/haber-masasi?b=taslak&t=${ilk.taslakId}`)}>Sıradakini aç</button>
        </div>
      </div>
      {hata && <div className="msg err">Sitedeki taslaklar alınamadı: {hata}</div>}

      <div className="mas-izgara">
        <section className="mas-kart" aria-labelledby="mas-sira">
          <div className="mas-kart-bas">
            <h2 id="mas-sira">Sıradakiler</h2>
            <div className="segment" role="group" aria-label="Süz">
              <button aria-pressed={!yalnizBen} onClick={() => setYalnizBen(false)}>Hepsi {taze?.length ?? ""}</button>
              <button aria-pressed={yalnizBen} onClick={() => setYalnizBen(true)}>Benim yazdırdıklarım {benimSayi}</button>
            </div>
          </div>
          {taze === null || yukleniyor ? <div className="mas-bos">Yükleniyor…</div> : !gosterilen.length ? (
            <div className="mas-bos">{yalnizBen ? "Senin yazdığın ya da istediğin bekleyen taslak yok." : "Sırada taslak yok."}</div>
          ) : <SiraTablo satirlar={gosterilen.slice(0, MASADA)} />}
          {gosterilen.length > MASADA && <div className="mas-tablo-alt"><span>{gosterilen.length} taslağın en öncelikli {MASADA}'sı</span><Link to="/taslaklar">Tümünü aç</Link></div>}
          <div className="mas-lejant">
            <span>Yol: Seçildi → Yazılıyor → Taslak hazır → Yayında</span>
            <span>Taslağın sahibi yok: ilk açan okur, açan kişi satırda görünür.</span>
            <span>{TAZE_SAAT} saatte yayınlanmayan taslak sıradan düşer{eski > 0 ? <>; <Link to="/taslaklar">{eski} eski taslak Taslaklar'da</Link></> : ""}.</span>
          </div>
        </section>

        <div className="mas-sutun">
          <section className="mas-kart" aria-labelledby="mas-gelen">
            <div className="mas-kart-bas"><h2 id="mas-gelen">Gelen, en yüksek öncelik</h2><Link to="/haber-masasi">Tümü</Link></div>
            {yukleniyor ? <div className="mas-bos">Yükleniyor…</div> : !gelen.length ? <div className="mas-bos">Son 24 saatte taslağı yazılmamış haber yok.</div> : (
              <ul className="mas-liste">
                {gelen.map(({ h, puan }) => {
                  const calisiyor = isDurumu(h) === "calisiyor";
                  return (
                    <li key={h.id}>
                      <b>{h.event || h.title}</b>
                      <span><span className="mas-puan-k">{puan}</span> · {h.source_name} · {once(h.published_at ?? h.created_at)}</span>
                      <button className="btn sm ghost" disabled={calisiyor} onClick={() => is_(h, "taslak")}>{calisiyor ? "Yazılıyor…" : "Taslak hazırla"}</button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <section className="mas-kart" aria-labelledby="mas-bugun">
            <div className="mas-kart-bas"><h2 id="mas-bugun">Bugün</h2><Link to="/yayinda">Yayında</Link></div>
            <div className="mas-sayilar">
              <div><b>{yayin ?? "–"}</b><span>yayına girdi</span></div>
              <div><b>{taze === null ? "–" : hazir.length}</b><span>taslak bekliyor</span></div>
              <div><b>{taze === null ? "–" : yaziliyor}</b><span>yazılıyor</span></div>
            </div>
          </section>
          {yonetici && kunye && kunye.sayi > 0 && (
            <section className="mas-kart" aria-labelledby="mas-kunye">
              <div className="mas-kart-bas"><h2 id="mas-kunye">Onay bekleyen künyeler <span className="mas-say">{kunye.sayi}</span></h2><Link to="/site?bolum=products">Aç</Link></div>
              <ul className="mas-liste">
                {kunye.ilk.map((k) => <li key={k.id}><b>{k.urun_adi}</b><span>{k.ozellikler?.length ?? 0} özellik · {k.gorsel_durum === "hazir" ? "görseli hazır" : k.gorsel_durum === "isleniyor" ? "görsel hazırlanıyor" : "görsel bulunamadı, sen ekle"}</span></li>)}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Masam() {
  return <MasaProvider><Icerik /></MasaProvider>;
}
