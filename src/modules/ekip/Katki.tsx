import { useEffect, useMemo, useState } from "react";
import { Avatar } from "../../shared/Avatar";
import { sb, type Profile } from "../../shared/supabase";
import { useVeri } from "../../shared/veri";
import * as api from "../site/api";

// Ekip katkısı: kim ne yaptı. Teşvik için sıralama + kişi profili.
// Puan yayına giden işi ödüllendirir; sadece "almak" az puan getirir (sayı şişirmeyi önlemek için).
export type Donem = "hafta" | "ay" | "hepsi";

// PUANLAMA KURALLARI: tek kaynak burası. Ekrandaki "Puan nasıl hesaplanır?" açıklaması bu listeden üretilir.
// Kural değişince: listeyi güncelle, PUAN_SURUMU tarihini değiştir, ARCHITECTURE.md karar günlüğüne yaz.
export const PUAN_SURUMU = "4 Kasım 2026";
export const PUAN_KURALLARI = [
  { k: "yayin", etiket: "Yayına giden içerik", puan: 3, neden: "Asıl hedef bu: yazarı sen olan haber, inceleme ya da kıyas sitede yayınlanınca (Haber yaz'la yazılanlar dahil)." },
  { k: "is", etiket: "Biten ekip işi", puan: 3, neden: "Ekip > İşler'de sana atanan iş tamamlandı olarak işaretlenince." },
  { k: "alinan", etiket: "Alınan haber", puan: 1, neden: "Havuzdan haber aldığında. Az puan: almak tek başına iş değil." },
  { k: "taslak", etiket: "Taslak", puan: 1, neden: "Haber Masası'nda taslak hazırladığında." },
  { k: "oy", etiket: "Oy", puan: 0.2, neden: "Havuzdaki haberlere ▲▼ verdiğinde; yapay zekânın öğrenmesine katkı." },
] as const;
export const PUAN = Object.fromEntries(PUAN_KURALLARI.map((r) => [r.k, r.puan])) as Record<(typeof PUAN_KURALLARI)[number]["k"], number>;

// Yayınlar (4 Kasım 2026, kullanıcı: "haber yayınladım ama skorlarda görünmüyor"): sitede yayınlanan içerik yazarına göre sayılır; panelin
// yazar ↔ hesap e-postası eşleşmesi /api/studyo/yazar-esle'den. Panele erişim yoksa eski yol: Haber Masası'nda "yayında" işaretli haberler.
type Yayin = { email: string; tarih: string; baslik: string; adres: string | null };
type Ham = {
  yayin: Yayin[] | null;
  haber: { taken_by: string | null; status: string; taken_at: string | null; updated_at: string; event: string; title: string; link: string }[];
  taslak: { author: string | null; created_at: string; title: string }[];
  oy: { user_id: string; created_at: string }[];
};

function baslangic(d: Donem): number {
  if (d === "hepsi") return 0;
  const n = new Date();
  if (d === "ay") return new Date(n.getFullYear(), n.getMonth(), 1).getTime();
  const gun = (n.getDay() + 6) % 7; // pazartesi
  return new Date(n.getFullYear(), n.getMonth(), n.getDate() - gun).getTime();
}

export function useKatki() {
  const [ham, setHam] = useState<Ham | null>(null);
  useEffect(() => {
    (async () => {
      const [h, t, o] = await Promise.all([
        sb.from("tr_items").select("taken_by,status,taken_at,updated_at,event,title,link").eq("deneme", false).not("taken_by", "is", null),
        sb.from("tr_drafts").select("author,created_at,title").eq("deneme", false),
        sb.from("tr_votes").select("user_id,created_at"),
      ]);
      const yayin = await yayinlar().catch(() => null);
      setHam({ yayin, haber: (h.data ?? []) as Ham["haber"], taslak: (t.data ?? []) as Ham["taslak"], oy: (o.data ?? []) as Ham["oy"] });
    })();
  }, []);
  return ham;
}

async function yayinlar(): Promise<Yayin[]> {
  const { esle } = await api.istekYap<{ esle: { author: number; email: string }[] }>("/studyo/yazar-esle");
  const eposta = new Map(esle.map((x) => [x.author, x.email]));
  const l: Yayin[] = [];
  for (const k of ["news", "reviews", "comparisons"] as const) {
    const p = new URLSearchParams({ depth: "0", limit: "1000", sort: "-publishedAt", "where[_status][equals]": "published", "select[author]": "true", "select[publishedAt]": "true", "select[title]": "true", "select[slug]": "true" });
    const r = await api.istekYap<{ docs: { author?: number | { id: number } | null; publishedAt?: string; title?: string; slug?: string }[] }>(`/${k}?${p}`).catch(() => ({ docs: [] }));
    for (const d of r.docs) {
      const a = typeof d.author === "object" ? d.author?.id : d.author;
      const e = a ? eposta.get(a) : undefined;
      if (e && d.publishedAt) l.push({ email: e, tarih: d.publishedAt, baslik: d.title ?? "", adres: api.siteAdresi(k, d as api.Icerik) });
    }
  }
  return l;
}

export function hesapla(ham: Ham | null, jobs: { assignee: string | null; status: string; done_at?: string | null }[], kisi: string, donem: Donem, eposta?: string) {
  const b = baslangic(donem);
  const icinde = (t: string | null | undefined) => !!t && Date.parse(t) >= b;
  const benim = ham?.haber.filter((x) => x.taken_by === kisi) ?? [];
  const s = {
    alinan: benim.filter((x) => icinde(x.taken_at)).length,
    yayin: ham?.yayin && eposta ? ham.yayin.filter((x) => x.email === eposta.toLowerCase() && icinde(x.tarih)).length : benim.filter((x) => x.status === "yayinda" && icinde(x.updated_at)).length,
    taslak: ham?.taslak.filter((x) => x.author === kisi && icinde(x.created_at)).length ?? 0,
    oy: ham?.oy.filter((x) => x.user_id === kisi && icinde(x.created_at)).length ?? 0,
    is: jobs.filter((j) => j.assignee === kisi && j.status === "bitti" && (donem === "hepsi" || icinde(j.done_at))).length,
  };
  const puan = Math.round(s.yayin * PUAN.yayin + s.alinan * PUAN.alinan + s.taslak * PUAN.taslak + s.is * PUAN.is + s.oy * PUAN.oy);
  return { ...s, puan };
}

export function Siralama({ ac }: { ac: (id: string) => void }) {
  const { veri } = useVeri();
  const ham = useKatki();
  const [donem, setDonem] = useState<Donem>("hafta");
  const satirlar = useMemo(() => veri.profiles.map((p) => ({ p, s: hesapla(ham, veri.jobs, p.id, donem, p.email) }))
    .sort((a, b) => b.s.puan - a.s.puan || b.s.yayin - a.s.yayin), [ham, veri, donem]);
  if (!ham) return <div className="muted">Yükleniyor…</div>;
  return (
    <div className="panel">
      <div className="row">
        <h3 style={{ marginRight: "auto" }}>Katkı sıralaması</h3>
        <div className="segment" role="group">
          {([["hafta", "Bu hafta"], ["ay", "Bu ay"], ["hepsi", "Tümü"]] as [Donem, string][]).map(([k, l]) =>
            <button key={k} aria-pressed={donem === k} onClick={() => setDonem(k)}>{l}</button>)}
        </div>
      </div>
      <div className="tablo-kutu">
        <table>
          <thead><tr><th>Kişi</th><th>Puan</th><th>Yayında</th><th>Aldığı haber</th><th>Taslak</th><th>Biten iş</th><th>Oy</th></tr></thead>
          <tbody>
            {satirlar.map(({ p, s }, i) => (
              <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => ac(p.id)}>
                <td><span className="row" style={{ gap: 8, flexWrap: "nowrap" }}><span className="mono">{i + 1}.</span><Avatar kisi={p} boyut={26} /><b>{p.name}</b></span></td>
                <td className="mono"><b>{s.puan}</b></td><td className="mono">{s.yayin}</td><td className="mono">{s.alinan}</td>
                <td className="mono">{s.taslak}</td><td className="mono">{s.is}</td><td className="mono">{s.oy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PuanBilgisi />
    </div>
  );
}

export function KisiProfil({ p, kapat }: { p: Profile; kapat: () => void }) {
  const { veri } = useVeri();
  const ham = useKatki();
  const ay = hesapla(ham, veri.jobs, p.id, "ay", p.email);
  const tum = hesapla(ham, veri.jobs, p.id, "hepsi", p.email);
  const son: { link: string | null; baslik: string }[] = ham?.yayin && p.email
    ? ham.yayin.filter((x) => x.email === p.email.toLowerCase()).sort((a, b) => Date.parse(b.tarih) - Date.parse(a.tarih)).slice(0, 8).map((x) => ({ link: x.adres, baslik: x.baslik }))
    : (ham?.haber ?? []).filter((x) => x.taken_by === p.id && x.status === "yayinda").sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)).slice(0, 8).map((x) => ({ link: x.link, baslik: x.event || x.title }));
  const kutu = (etiket: string, a: number, t: number) => (
    <div className="kart" style={{ gap: 2 }}><div className="muted">{etiket}</div><div className="bname" style={{ fontSize: 26 }}>{a}</div><div className="muted">toplam {t}</div></div>
  );
  return (
    <>
      <button className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={kapat}>← Ekip</button>
      <div className="panel">
        <div className="row" style={{ gap: 16 }}>
          <Avatar kisi={p} boyut={80} />
          <div>
            <div className="bname" style={{ fontSize: 24 }}>{p.name}</div>
            <div className="muted">{[p.role, p.org].filter(Boolean).join(" · ") || "Rol girilmedi"}</div>
            {p.interests && <div className="muted">İlgi alanları: {p.interests}</div>}
          </div>
        </div>
      </div>
      {!ham ? <div className="muted">Yükleniyor…</div> : <>
        <h3>Bu ay</h3>
        <div className="cards" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
          {kutu("Puan", ay.puan, tum.puan)}{kutu("Yayına giden", ay.yayin, tum.yayin)}{kutu("Aldığı haber", ay.alinan, tum.alinan)}
          {kutu("Taslak", ay.taslak, tum.taslak)}{kutu("Biten ekip işi", ay.is, tum.is)}
        </div>
        <h3>Son yayına giden haberleri</h3>
        <div className="panel liste">
          {son.length ? son.map((x, i) => (
            <div key={(x.link ?? "") + i} className="satir"><div className="ana">{x.link ? <a href={x.link} target="_blank" rel="noreferrer">{x.baslik}</a> : x.baslik}</div></div>
          )) : <div className="muted">Henüz yok.</div>}
        </div>
      </>}
    </>
  );
}

/** Puanlama açıklaması: PUAN_KURALLARI'ndan üretilir, kural değişince kendiliğinden güncellenir. */
export function PuanBilgisi() {
  return (
    <details className="puanbilgi">
      <summary>Puan nasıl hesaplanır?</summary>
      <div className="liste">
        {PUAN_KURALLARI.map((r) => (
          <div key={r.k} className="satir">
            <div className="ana"><b>{r.etiket}</b><div className="muted">{r.neden}</div></div>
            <span className="pill blue mono">+{String(r.puan).replace(".", ",")}</span>
          </div>
        ))}
      </div>
      <div className="muted">Dönem: "Bu hafta" pazartesiden, "Bu ay" ayın 1'inden başlar. Eşit puanda yayına giden haberi fazla olan öne geçer. Kurallar son güncelleme: {PUAN_SURUMU}.</div>
    </details>
  );
}
