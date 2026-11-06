// Stüdyo araması (6 Kasım 2026, kullanıcı: "üste arama butonu koy, tüm Stüdyo'da arama yapalım bölümler arasında"): üst çubukta
// "Yalnız sen"in solunda. Tek kutudan arar: bölümler (menü), sitedeki taslak/yayınlar (panel), Gelen'deki yeni haberler (tr_items),
// notlar (not_sayfalar), işler (jobs), çekim listesinin türleri ve maddeleri (cekimListesi.ts, cihazda arar) ve yöneticide künyeler (panel /products).
// Ctrl/⌘+K ile de açılır; ok tuşlarıyla gezilir, Enter açar. Panel oturumu yoksa o grup sessizce boş kalır.
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Ikon } from "./Ikon";
import { sb } from "./supabase";
import { istekYap } from "../modules/site/api";
import { maddeSayisi, TURLER as CEKIM_TURLERI } from "../modules/editor/cekimListesi";

export type AramaBolumu = { ad: string; yol: string; ikon: string; grup?: string };
type Sonuc = { grup: string; ad: string; alt?: string; yol: string; ikon: string };
const kucuk = (s: string) => s.toLocaleLowerCase("tr");
const gun = (t?: string | null) => (t ? new Date(t).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }) : "");

export default function Arama({ bolumler, yonetici }: { bolumler: AramaBolumu[]; yonetici: boolean }) {
  const git = useNavigate();
  const [acik, setAcik] = useState(false);
  const [q, setQ] = useState("");
  const [uzak, setUzak] = useState<Sonuc[]>([]);
  const [araniyor, setAraniyor] = useState(false);
  const [sira, setSira] = useState(0);
  const liste = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tus = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setAcik((x) => !x); } };
    addEventListener("keydown", tus);
    return () => removeEventListener("keydown", tus);
  }, []);
  useEffect(() => { if (!acik) { setQ(""); setUzak([]); setSira(0); } }, [acik]);

  // Haberler ve taslaklar: yazmayı bırakınca sorulur; eski cevabı yeni sorgu ezmesin diye "güncel" bayrağı
  useEffect(() => {
    const s = q.trim();
    if (s.length < 2) { setUzak([]); setAraniyor(false); return; }
    let guncel = true; setAraniyor(true);
    const t = setTimeout(async () => {
      const kalip = `%${s.replace(/[%_\\]/g, "\\$&")}%`;
      const [gelen, site, notlar, isler, kunyeler] = await Promise.all([
        sb.from("tr_items").select("id,title,source_name,published_at").eq("deneme", false).eq("status", "aday").ilike("title", kalip).order("published_at", { ascending: false }).limit(6)
          .then(({ data }) => (data ?? []) as { id: number; title: string; source_name: string; published_at: string | null }[]),
        istekYap<{ docs: { id: number; title?: string; _status?: string; updatedAt?: string }[] }>(`/news?where[title][like]=${encodeURIComponent(s)}&draft=true&depth=0&limit=6&sort=-updatedAt&select[title]=true&select[_status]=true&select[updatedAt]=true`)
          .then((r) => r.docs).catch(() => []),
        sb.from("not_sayfalar").select("id,baslik,updated_at").ilike("baslik", kalip).order("updated_at", { ascending: false }).limit(5)
          .then(({ data }) => (data ?? []) as { id: number; baslik: string; updated_at: string }[]),
        sb.from("jobs").select("id,title,brand,status,due").ilike("title", kalip).order("due", { ascending: false }).limit(5)
          .then(({ data }) => (data ?? []) as { id: number; title: string; brand: string | null; status: string | null; due: string | null }[]),
        yonetici ? istekYap<{ docs: { id: number; name?: string; brand?: string }[] }>(`/products?where[name][like]=${encodeURIComponent(s)}&depth=0&limit=5&sort=name&select[name]=true&select[brand]=true`)
          .then((r) => r.docs).catch(() => []) : Promise.resolve([]),
      ]);
      if (!guncel) return;
      setUzak([
        ...site.map((d) => ({ grup: "Taslaklar ve yayınlar", ad: d.title || "Başlıksız", alt: `${d._status === "published" ? "Yayında" : "Taslak"} · ${gun(d.updatedAt)}`, yol: `/oku/${d.id}`, ikon: d._status === "published" ? "check" : "taslak" })),
        ...gelen.map((h) => ({ grup: "Gelen haberler", ad: h.title, alt: `${h.source_name} · ${gun(h.published_at)}`, yol: `/haber-masasi?ara=${encodeURIComponent(h.title)}`, ikon: "triyaj" })),
        ...kunyeler.map((k) => ({ grup: "Künyeler", ad: k.name || "Adsız", alt: k.brand, yol: `/site?bolum=products&ara=${encodeURIComponent(k.name || "")}`, ikon: "liste" })),
        ...notlar.map((n) => ({ grup: "Notlar", ad: n.baslik || "Başlıksız not", alt: gun(n.updated_at), yol: `/notlar?s=${n.id}`, ikon: "yaz" })),
        ...isler.map((i) => ({ grup: "İşler", ad: i.title, alt: [i.brand, gun(i.due)].filter(Boolean).join(" · "), yol: "/ekip", ikon: "ekip" })),
      ]);
      setAraniyor(false);
    }, 280);
    return () => { guncel = false; clearTimeout(t); };
  }, [q, yonetici]);

  const sonuclar = useMemo<Sonuc[]>(() => {
    const s = kucuk(q.trim());
    const b = bolumler.filter((x) => !s || kucuk(`${x.ad} ${x.grup ?? ""}`).includes(s)).map((x) => ({ grup: "Bölümler", ad: x.ad, alt: x.grup, yol: x.yol, ikon: x.ikon }));
    // Çekim listesi sabit veri: tür adı ya da madde başlığı/açıklaması eşleşirse o tür açılır, madde vurgulanır
    const c: Sonuc[] = s.length < 2 ? [] : CEKIM_TURLERI.flatMap((t) => [
      ...(kucuk(t.ad).includes(s) ? [{ grup: "Çekim listesi", ad: `${t.ad} listesi`, alt: `${maddeSayisi(t)} madde`, yol: `/cekim?tur=${t.id}`, ikon: "klaket" }] : []),
      ...t.gruplar.flatMap((g) => g.maddeler.filter((m) => kucuk(`${m.t} ${m.n}`).includes(s))
        .map((m) => ({ grup: "Çekim listesi", ad: m.t, alt: `${t.ad} · ${g.ad}`, yol: `/cekim?tur=${t.id}&madde=${encodeURIComponent(`${g.ad}/${m.k}`)}`, ikon: "klaket" }))),
    ]).slice(0, 6);
    return [...b, ...c, ...uzak];
  }, [q, uzak, bolumler]);
  useEffect(() => setSira(0), [q, uzak.length]);
  useEffect(() => { liste.current?.querySelector(".ara-sonuc.on")?.scrollIntoView({ block: "nearest" }); }, [sira]);

  const ac = (s?: Sonuc) => { if (!s) return; setAcik(false); git(s.yol); };
  const tus = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") setAcik(false);
    else if (e.key === "ArrowDown") { e.preventDefault(); setSira((x) => Math.min(sonuclar.length - 1, x + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSira((x) => Math.max(0, x - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); ac(sonuclar[sira]); }
  };

  return (
    <>
      <button type="button" className="btn ghost sm ara-dugme" aria-label="Stüdyo'da ara" aria-haspopup="dialog" onClick={() => setAcik(true)}><Ikon ad="ara" /><span>Ara</span></button>
      {acik && (
        <div className="perde ara-perde" onMouseDown={(e) => { if (e.target === e.currentTarget) setAcik(false); }}>
          <div className="pencere ara-pencere" role="dialog" aria-modal="true" aria-label="Stüdyo'da ara" onKeyDown={tus}>
            <div className="ara-kutu">
              <Ikon ad="ara" />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Bölüm, haber, taslak, not, iş ya da çekim ara…" aria-label="Aranacak sözcük" autoFocus autoComplete="off" spellCheck={false} />
              <button type="button" className="linkbtn" onClick={() => setAcik(false)}>Kapat</button>
            </div>
            <div className="ara-liste" ref={liste} role="listbox" aria-label="Sonuçlar">
              {sonuclar.map((s, i) => (
                <div key={s.grup + s.yol + i}>
                  {(i === 0 || sonuclar[i - 1].grup !== s.grup) && <h4>{s.grup}</h4>}
                  <button type="button" role="option" aria-selected={i === sira} className={"ara-sonuc" + (i === sira ? " on" : "")} onMouseEnter={() => setSira(i)} onClick={() => ac(s)}>
                    <Ikon ad={s.ikon} /><span className="ara-ad">{s.ad}</span>{s.alt && <span className="ara-alt">{s.alt}</span>}
                  </button>
                </div>
              ))}
              {!sonuclar.length && <div className="ara-bos">{araniyor ? "Aranıyor…" : "Bu sözcükle bir şey bulunamadı."}</div>}
              {araniyor && sonuclar.length > 0 && <div className="ara-bos">Haberler, taslaklar, notlar aranıyor…</div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
