import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Ikon } from "../../shared/Ikon";
import { useToast } from "../../shared/toast";
import * as api from "../site/api";
import type { Icerik, PanelKullanici } from "../site/api";
import Duzenle from "../site/Duzenle";
import Rehber, { HABER_ADIMLARI } from "./Rehber";
import "../site/site.css";

// Editörün kendi haberleri (1 Kasım 2026): yalnız onun açtığı taslaklar (workflow.ownerUser). Haber yazma ekranı Site modülünün haber
// editörüdür (Duzenle), üstünde ilk giriş rehberi açılır. Yeni haber editör görünümünden açılınca sahibi kendiliğinden o olur.

let benOnbellek: Promise<PanelKullanici | null> | null = null;
export function usePanelKullanici() {
  const [k, setK] = useState<PanelKullanici | null | undefined>(undefined);
  const [hata, setHata] = useState("");
  useEffect(() => { (benOnbellek ??= api.ben()).then(setK).catch((e) => { benOnbellek = null; setHata((e as Error).message); }); }, []);
  return { kullanici: k, hata };
}

export const kontrolSayisi = (x: Icerik) => Object.values(((x.workflow?.checklist ?? {}) as Record<string, boolean>)).filter(Boolean).length;
const zaman = (s?: string) => { if (!s) return ""; const f = (Date.now() - +new Date(s)) / 6e4; return f < 60 ? `${Math.max(1, Math.round(f))} dk önce` : f < 1440 ? `${Math.round(f / 60)} sa önce` : new Date(s).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }); };
const sahibim = (id: number) => ({ ekle: (p: URLSearchParams, o: string) => p.set(`${o}[workflow.ownerUser][equals]`, String(id)) });

export async function benimTaslaklarim(k: PanelKullanici) {
  const [t, i] = await Promise.all([api.liste("news", "taslak", "", 1, sahibim(k.id)), api.liste("news", "incelemede", "", 1, sahibim(k.id))]);
  const tek = new Map([...t.docs, ...i.docs].map((x) => [x.id, x]))
  return [...tek.values()].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
}

export async function yeniHaber(k: PanelKullanici) {
  const r = await api.istekYap<{ doc: { id: number } }>("/news?draft=true&depth=0", { method: "POST", body: JSON.stringify({ title: "", _status: "draft", workflow: { state: "taslak", ownerUser: k.id } }) });
  return r.doc.id;
}

/** Haber yazma ekranı: id verilirse o taslak, "yeni" ise yeni taslak açılır */
export function HaberYaz({ id }: { id: number | "yeni" }) {
  const { kullanici, hata } = usePanelKullanici();
  const [acik, setAcik] = useState<number | null>(id === "yeni" ? null : id);
  const toast = useToast(), git = useNavigate();
  useEffect(() => {
    if (id !== "yeni" || !kullanici || acik) return;
    yeniHaber(kullanici).then((x) => { setAcik(x); git(`/yaz/${x}`, { replace: true }); }).catch((e) => toast((e as Error).message));
  }, [id, kullanici, acik, git, toast]);
  if (hata) return <div className="empty">Site paneline bağlanılamadı: {hata}</div>;
  if (kullanici === null) return <SiteYetkisiYok />;
  if (!kullanici || !acik) return <div className="muted">Hazırlanıyor…</div>;
  return <>
    <Duzenle key={acik} k="news" id={acik} kullanici={kullanici} kapat={() => git("/taslaklarim")} ac={(x) => git(`/yaz/${x}`)} />
    <Rehber ad="haber-yaz" adimlar={HABER_ADIMLARI} />
  </>;
}

export const SiteYetkisiYok = () => <div className="empty">Haber yazmak için site yetkin yok. Yöneticiden Stüdyo'da <b>Ekip → Yönetim</b> bölümünde sana bir site rolü vermesini iste.</div>;

export default function Taslaklarim() {
  const { kullanici, hata } = usePanelKullanici();
  const [liste, setListe] = useState<Icerik[] | null>(null);
  const git = useNavigate();
  const yukle = useCallback(() => { if (kullanici) benimTaslaklarim(kullanici).then(setListe).catch(() => setListe([])); }, [kullanici]);
  useEffect(yukle, [yukle]);
  if (hata) return <div className="empty">Site paneline bağlanılamadı: {hata}</div>;
  if (kullanici === null) return <SiteYetkisiYok />;
  return (
    <div className="ed-sayfa">
      <div className="ed-bas">
        <div><span className="ed-ust">KENDİ HABERLERİN</span><h1>Taslaklarım</h1></div>
        <button className="btn ed-ana" onClick={() => git("/yaz/yeni")}><Ikon ad="plus" />Yeni haber yaz</button>
      </div>
      {!liste ? <div className="muted">Yükleniyor…</div> : !liste.length ? (
        <div className="ed-bos"><Ikon ad="taslak" /><b>Henüz taslağın yok</b><span>İlk haberini yazmaya başla; rehber adım adım gösterecek.</span><button className="btn" onClick={() => git("/yaz/yeni")}><Ikon ad="yaz" />Haber yaz</button></div>
      ) : (
        <div className="ed-liste">
          {liste.map((x) => (
            <button key={x.id} className="ed-satir" onClick={() => git(`/yaz/${x.id}`)}>
              <span className="ed-satir-m"><b>{x.title || "Başlıksız taslak"}</b><span className="muted">{api.ad(x.category as never) || "Kategori yok"} · {zaman(x.updatedAt)}</span></span>
              <span className={`site-durum site-durum--${x.workflow?.state ?? "taslak"}`}>{api.DURUMLAR[x.workflow?.state ?? "taslak"]}</span>
              <span className={kontrolSayisi(x) >= 10 ? "ed-sayi tamam" : "ed-sayi"} title="Yayın öncesi kontrol">{kontrolSayisi(x)}/10</span>
              <Ikon ad="ileri" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
