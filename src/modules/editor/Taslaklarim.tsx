import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Ikon } from "../../shared/Ikon";
import { useCanli } from "../../shared/canli";
import { AcikTutan } from "../../shared/CanliKisiler";
import { useToast } from "../../shared/toast";
import * as api from "../site/api";
import type { Icerik, PanelKullanici } from "../site/api";
import Duzenle from "../site/Duzenle";
import Rehber, { HABER_ADIMLARI } from "./Rehber";
import "../site/site.css";

// Taslaklar (1 Kasım 2026): sitedeki taslak ve incelemedeki haberler, herkesinki (kullanıcı: "sahiplikleri kaldır"). Haber yazma ekranı
// Site modülünün haber editörüdür (Duzenle), üstünde ilk giriş rehberi açılır.

let benOnbellek: Promise<PanelKullanici | null> | null = null;
export function usePanelKullanici() {
  const [k, setK] = useState<PanelKullanici | null | undefined>(undefined);
  const [hata, setHata] = useState("");
  useEffect(() => { (benOnbellek ??= api.ben()).then(setK).catch((e) => { benOnbellek = null; setHata((e as Error).message); }); }, []);
  return { kullanici: k, hata };
}

export const kontrolSayisi = (x: Icerik) => Object.values(((x.workflow?.checklist ?? {}) as Record<string, boolean>)).filter(Boolean).length;
const zaman = (s?: string) => { if (!s) return ""; const f = (Date.now() - +new Date(s)) / 6e4; return f < 60 ? `${Math.max(1, Math.round(f))} dk önce` : f < 1440 ? `${Math.round(f / 60)} sa önce` : new Date(s).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }); };
export async function taslaklar() {
  const [t, i] = await Promise.all([api.liste("news", "taslak", ""), api.liste("news", "incelemede", "")]);
  const tek = new Map([...t.docs, ...i.docs].map((x) => [x.id, x]))
  return [...tek.values()].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
}

export const yeniHaber = () => api.yeniTaslak("news").then((d) => d.id);

/** Haber yazma ekranı: id verilirse o taslak, "yeni" ise yeni taslak açılır */
export function HaberYaz({ id }: { id: number | "yeni" }) {
  const { kullanici, hata } = usePanelKullanici();
  const [acik, setAcik] = useState<number | null>(id === "yeni" ? null : id);
  const toast = useToast(), git = useNavigate();
  useEffect(() => {
    if (id !== "yeni" || !kullanici || acik) return;
    yeniHaber().then((x) => { setAcik(x); git(`/yaz/${x}`, { replace: true }); }).catch((e) => toast((e as Error).message));
  }, [id, kullanici, acik, git, toast]);
  if (hata) return <div className="empty">Site paneline bağlanılamadı: {hata}</div>;
  if (kullanici === null) return <SiteYetkisiYok />;
  if (!kullanici || !acik) return <div className="muted">Hazırlanıyor…</div>;
  return <>
    <Duzenle key={acik} k="news" id={acik} kullanici={kullanici} kapat={() => git("/taslaklar")} ac={(x) => git(`/yaz/${x}`)} />
    <Rehber ad="haber-yaz" adimlar={HABER_ADIMLARI} />
  </>;
}

export const SiteYetkisiYok = () => <div className="empty">Haber yazmak için site yetkin yok. Yöneticiden Stüdyo'da <b>Ekip → Yönetim</b> bölümünde sana bir site rolü vermesini iste.</div>;

export default function Taslaklarim() {
  const { kullanici, hata } = usePanelKullanici();
  const canli = useCanli();
  const [liste, setListe] = useState<Icerik[] | null>(null);
  const git = useNavigate();
  // Sıralama ve süzgeç (3 Kasım 2026, kullanıcı: "son hazırlattığım en üste gelmiyor; detaylı filtreleme ve sıralama")
  const [sira, setSira] = useState<"yeni" | "guncel" | "kontrol">("yeni");
  const [kim, setKim] = useState<"hepsi" | "benim">("hepsi");
  const durum: "hepsi" | "taslak" = "hepsi";
  const [ara, setAra] = useState("");
  const yukle = useCallback(() => { if (kullanici) taslaklar().then(setListe).catch(() => setListe([])); }, [kullanici]);
  useEffect(yukle, [yukle]);
  const benimYazar = kullanici ? (typeof kullanici.author === "object" ? kullanici.author?.id : kullanici.author) ?? null : null;
  const yazarId = (x: Icerik) => { const a = (x as { author?: number | { id: number } | null }).author; return typeof a === "object" ? a?.id ?? null : a ?? null; };
  const suz = (l: Icerik[]) => l
    // Onaya gönderilenler kendi bölümünde (Onay bekleyenler, 4 Kasım 2026); burada yalnız taslaklar
    .filter((x) => (kim === "hepsi" || yazarId(x) === benimYazar) && (x.workflow?.state ?? "taslak") !== "incelemede" && (durum === "hepsi" || (x.workflow?.state ?? "taslak") === durum)
      && (!ara.trim() || (x.title ?? "").toLocaleLowerCase("tr").includes(ara.trim().toLocaleLowerCase("tr"))))
    .sort((a, b) => sira === "kontrol" ? kontrolSayisi(b) - kontrolSayisi(a)
      : sira === "guncel" ? +new Date(b.updatedAt) - +new Date(a.updatedAt)
      : +new Date((b as { createdAt?: string }).createdAt ?? b.updatedAt) - +new Date((a as { createdAt?: string }).createdAt ?? a.updatedAt));
  if (hata) return <div className="empty">Site paneline bağlanılamadı: {hata}</div>;
  if (kullanici === null) return <SiteYetkisiYok />;
  return (
    <div className="ed-sayfa">
      <div className="ed-bas">
        <div><span className="ed-ust">ONAYA GÖNDERİLMEMİŞ</span><h1>Taslaklar</h1></div>
        <button className="btn ed-ana" onClick={() => git("/yaz/yeni")}><Ikon ad="plus" />Yeni haber yaz</button>
      </div>
      {!liste ? <div className="muted">Yükleniyor…</div> : !liste.length ? (
        <div className="ed-bos"><Ikon ad="taslak" /><b>Bekleyen taslak yok</b><span>Yeni bir haber yazmaya başla; rehber adım adım gösterecek.</span><button className="btn" onClick={() => git("/yaz/yeni")}><Ikon ad="yaz" />Haber yaz</button></div>
      ) : (
        <>
        <div className="taslak-suzgec">
          <div className="segment" role="group" aria-label="Kimin taslakları">
            {([["hepsi", "Hepsi"], ["benim", "Benim"]] as const).map(([k, ad]) => <button key={k} aria-pressed={kim === k} onClick={() => setKim(k)}>{ad}</button>)}
          </div>
          <input type="search" placeholder="Başlıkta ara" aria-label="Başlıkta ara" value={ara} onChange={(e) => setAra(e.target.value)} />
          <label>Sırala<select value={sira} onChange={(e) => setSira(e.target.value as typeof sira)}><option value="yeni">En yeni hazırlanan</option><option value="guncel">Son güncellenen</option><option value="kontrol">Kontrolü en çok biten</option></select></label>

        </div>
        <div className="ed-liste">
          {suz(liste).map((x) => (
            <button key={x.id} className="ed-satir" onClick={() => git(`/yaz/${x.id}`)}>
              <span className="ed-satir-m"><b>{x.title || "Başlıksız taslak"}</b><span className="muted">{api.ad(x.category as never) || "Kategori yok"} · {zaman(x.updatedAt)}</span></span>
              <AcikTutan kisiler={canli.kisiler.filter((k) => k.id !== canli.ben && k.nesne?.tur === "haber" && k.nesne.id === x.id)} />
              <span className={`site-durum site-durum--${x.workflow?.state ?? "taslak"}`}>{api.DURUMLAR[x.workflow?.state ?? "taslak"]}</span>
              <span className={kontrolSayisi(x) >= 10 ? "ed-sayi tamam" : "ed-sayi"} title="Yayın öncesi kontrol">{kontrolSayisi(x)}/10</span>
              <Ikon ad="ileri" />
            </button>
          ))}
        </div>
        </>
      )}
    </div>
  );
}

/** Yayındakiler (4 Kasım 2026, kullanıcı: "yayındaki haberler taslaktan düzenlenmesin, onlara özel alan olsun"): sitede yayında olan haberler;
 *  açıp düzeltince değişiklik taslak olarak kaydedilir, sitedeki hâli yayın yönetmeni yeniden yayınlayana kadar aynı kalır. */
export function Yayindakiler() {
  const { kullanici, hata } = usePanelKullanici();
  const canli = useCanli();
  const [liste, setListe] = useState<Icerik[] | null>(null);
  const [ara, setAra] = useState("");
  const [sayfa, setSayfa] = useState(1);
  const [sonraki, setSonraki] = useState(false);
  const git = useNavigate();
  useEffect(() => {
    if (!kullanici) return;
    const t = setTimeout(() => api.liste("news", "yayinda", ara, sayfa, { sirala: "-publishedAt" })
      .then((r) => { setListe((x) => (sayfa === 1 ? r.docs : [...(x ?? []), ...r.docs])); setSonraki(!!(r as { hasNextPage?: boolean }).hasNextPage); })
      .catch(() => setListe([])), ara ? 300 : 0);
    return () => clearTimeout(t);
  }, [kullanici, ara, sayfa]);
  if (hata) return <div className="empty">Site paneline bağlanılamadı: {hata}</div>;
  if (kullanici === null) return <SiteYetkisiYok />;
  return (
    <div className="ed-sayfa">
      <div className="ed-bas"><div><span className="ed-ust">SİTEDE YAYINDA</span><h1>Yayındakiler</h1></div></div>
      <div className="muted">Yayındaki bir haberi açıp düzeltebilirsin. Kaydettiğin değişiklik taslak olarak bekler; sitedeki hâli yayın yönetmeni yeniden yayınlayınca değişir.</div>
      <div className="taslak-suzgec"><input type="search" placeholder="Başlıkta ara" aria-label="Başlıkta ara" value={ara} onChange={(e) => { setAra(e.target.value); setSayfa(1); }} /></div>
      {!liste ? <div className="muted">Yükleniyor…</div> : !liste.length ? <div className="muted">Sonuç yok.</div> : (
        <div className="ed-liste">
          {liste.map((x) => (
            <button key={x.id} className="ed-satir" onClick={() => git(`/yaz/${x.id}`)}>
              <span className="ed-satir-m"><b>{x.title || "Başlıksız"}</b><span className="muted">{api.ad(x.category as never) || "Kategori yok"} · {zaman((x as { publishedAt?: string }).publishedAt ?? x.updatedAt)}</span></span>
              <AcikTutan kisiler={canli.kisiler.filter((k) => k.id !== canli.ben && k.nesne?.tur === "haber" && k.nesne.id === x.id)} />
              <span className="site-durum site-durum--yayinda">{api.DURUMLAR.yayinda}</span>
              <Ikon ad="ileri" />
            </button>
          ))}
        </div>
      )}
      {sonraki && <button className="btn ghost sm" onClick={() => setSayfa((x) => x + 1)}>Daha fazla</button>}
    </div>
  );
}

/** Onay bekleyenler (4 Kasım 2026, kullanıcı: "onay bekleyenler taslaklardan ayrı görünmeli, öncelikli ve başlıkları olmalı"): incelemedeki
 *  haberler iki başlıkta (editörlerden, Haber Masası'ndan), her biri önem ve bekleme süresine göre sıralı. */
export function OnayBekleyenler() {
  const { kullanici, hata } = usePanelKullanici();
  const canli = useCanli();
  const [liste, setListe] = useState<Icerik[] | null>(null);
  const git = useNavigate();
  useEffect(() => {
    if (!kullanici) return;
    Promise.all([1, 2, 3, 4].map((sf) => api.liste("news", "incelemede", "", sf, { sirala: "updatedAt" }).catch(() => ({ docs: [] as Icerik[] }))))
      .then((r) => { const tek = new Map(r.flatMap((x) => x.docs).map((x) => [x.id, x])); setListe([...tek.values()]); });
  }, [kullanici]);
  if (hata) return <div className="empty">Site paneline bağlanılamadı: {hata}</div>;
  if (kullanici === null) return <SiteYetkisiYok />;
  const onem = (x: Icerik) => Number((x as { triyaj?: { priority?: number } }).triyaj?.priority ?? 0);
  const otomatik = (x: Icerik) => !!(x as { triyaj?: { importedAt?: string } }).triyaj?.importedAt;
  const hazirlayan = (x: Icerik) => { const o = (x.workflow as { ownerUser?: { name?: string } | number } | undefined)?.ownerUser; return o && typeof o === "object" ? o.name ?? "" : ""; };
  const sirala = (l: Icerik[]) => [...l].sort((a, b) => onem(b) - onem(a) || +new Date(a.updatedAt) - +new Date(b.updatedAt));
  const gruplar: [string, string, Icerik[]][] = liste ? [
    ["Editörlerden", "Editörün yazıp onaya gönderdiği haberler.", sirala(liste.filter((x) => !otomatik(x)))],
    ["Haber Masası'ndan", "Otomatik hazırlanan taslaklar; bildirim gitmez, burada bekler.", sirala(liste.filter(otomatik))],
  ] : [];
  return (
    <div className="ed-sayfa">
      <div className="ed-bas"><div><span className="ed-ust">YAYIN ONAYI</span><h1>Onay bekleyenler</h1></div></div>
      <div className="muted">Haberi yalnız yayın yönetmeni ya da yönetici yayınlar; kimse kendi haberini onaylayamaz. Önemi yüksek olan ve en uzun bekleyen üstte.</div>
      {!liste ? <div className="muted">Yükleniyor…</div> : gruplar.map(([ad, aciklama, l]) => (
        <section key={ad} aria-label={ad} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h2 className="ed-baslik">{ad.toLocaleUpperCase("tr-TR")} · {l.length}</h2>
          <div className="muted" style={{ fontSize: 13 }}>{aciklama}</div>
          {!l.length ? <div className="muted ed-ic">Bekleyen yok.</div> : (
            <div className="ed-liste">
              {l.map((x) => (
                <button key={x.id} className="ed-satir" onClick={() => git(`/yaz/${x.id}`)}>
                  <span className="ed-satir-m"><b>{x.title || "Başlıksız"}</b><span className="muted">{[hazirlayan(x), api.ad(x.category as never), `${zaman(x.updatedAt)} gönderildi`].filter(Boolean).join(" · ")}</span></span>
                  <AcikTutan kisiler={canli.kisiler.filter((k) => k.id !== canli.ben && k.nesne?.tur === "haber" && k.nesne.id === x.id)} />
                  {onem(x) > 0 && <span className={onem(x) >= 8 ? "ed-sayi tamam" : "ed-sayi"} title="Haber Masası önemi (10 üzerinden)">{onem(x).toLocaleString("tr", { maximumFractionDigits: 1 })}</span>}
                  <Ikon ad="ileri" />
                </button>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
