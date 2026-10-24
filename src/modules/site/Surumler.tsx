import { useEffect, useMemo, useState } from "react";
import { istekYap } from "./api";
import { veriAlanlari, type Alan } from "./sema";

// Sürüm geçmişi: panelin kaydettiği önceki hâller (her kayıt/yayın bir sürüm; otomatik kayıt son otomatik sürümün üzerine yazar).
// Bir sürüm seçilince şimdiki hâlle farkı alan alan gösterilir; "Bu sürüme dön" onu taslak olarak geri yükler (site, yayınlanana kadar değişmez).
type Kayit = Record<string, unknown>;
type Surum = { id: number | string; updatedAt: string; autosave?: boolean; latest?: boolean; version: Kayit };

const tarih = (s: string) => new Date(s).toLocaleString("tr-TR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Zengin metin (Lexical) ya da herhangi bir değer → karşılaştırılabilir düz metin */
function metin(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  const o = v as { root?: unknown };
  if (o && typeof o === "object" && "root" in o) {
    const paragraflar: string[] = [];
    const gez = (n: { type?: string; text?: string; children?: unknown[]; fields?: { url?: string }; value?: unknown }, satir: string[]) => {
      if (typeof n.text === "string") satir.push(n.text);
      if (n.type === "upload") satir.push("[görsel]");
      if (n.type === "horizontalrule") satir.push("———");
      (n.children as typeof n[] | undefined)?.forEach((c) => gez(c, satir));
    };
    for (const p of ((o.root as { children?: unknown[] })?.children ?? []) as Parameters<typeof gez>[0][]) { const s: string[] = []; gez(p, s); paragraflar.push(s.join("")); }
    return paragraflar.join("\n");
  }
  // boş ile hiç girilmemiş aynı sayılır; satır kimlikleri (id) karşılaştırmaya girmez
  const s = JSON.stringify(v, (k, x) => (k === "id" || x === null || x === "" ? undefined : x), 1);
  return s === "{}" || s === "[]" ? "" : s;
}

/** Paragraf düzeyinde fark: çıkan (eski) ve gelen (yeni) satırlar */
function fark(eski: string, yeni: string) {
  const a = eski.split("\n"), b = yeni.split("\n");
  // en uzun ortak alt dizi (metinler kısa: haber başına birkaç düzine paragraf)
  const L = a.map(() => new Array<number>(b.length + 1).fill(0));
  L.push(new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const satirlar: { t: "=" | "-" | "+"; s: string }[] = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { satirlar.push({ t: "=", s: a[i] }); i++; j++; }
    else if (i < a.length && (j >= b.length || L[i + 1][j] >= L[i][j + 1])) satirlar.push({ t: "-", s: a[i++] });
    else satirlar.push({ t: "+", s: b[j++] });
  }
  return satirlar;
}

function Fark({ eski, yeni }: { eski: string; yeni: string }) {
  const s = fark(eski, yeni);
  return (
    <div className="site-fark">
      {s.map((x, i) => x.t === "=" ? (s.length > 6 && s[i - 1]?.t === "=" && s[i + 1]?.t === "=" ? null : <p key={i} className="muted">{x.s || " "}</p>)
        : <p key={i} className={x.t === "+" ? "site-fark-yeni" : "site-fark-eski"}>{x.t === "+" ? "+ " : "− "}{x.s || " "}</p>)}
    </div>
  );
}

export default function Surumler({ yol, alanlar, simdiki, kapat, geriYuklendi }: {
  yol: string;             // "/news/12" ya da "/globals/site-settings"
  alanlar: Alan[];
  simdiki: Kayit;          // ekrandaki (kaydedilmiş) hâl
  kapat: () => void;
  geriYuklendi: () => void;
}) {
  const [liste, setListe] = useState<Surum[] | null>(null);
  const [secili, setSecili] = useState<Surum | null>(null);
  const [hata, setHata] = useState("");
  const [mesgul, setMesgul] = useState(false);
  const genel = yol.startsWith("/globals/");
  const surumYolu = genel ? `${yol}/versions` : `${yol.replace(/\/\d+$/, "")}/versions`;

  useEffect(() => {
    const kim = genel ? "" : `where[parent][equals]=${yol.split("/").pop()}&`;
    istekYap<{ docs: Surum[] }>(`${surumYolu}?${kim}sort=-updatedAt&limit=50&depth=0`).then((r) => setListe(r.docs)).catch((e) => setHata((e as Error).message));
  }, [yol, genel, surumYolu]);

  const veri = useMemo(() => veriAlanlari(alanlar), [alanlar]);
  const degisenler = secili ? veri.filter((a) => metin(secili.version[a.name!]) !== metin(simdiki[a.name!])) : [];

  async function geriYukle() {
    if (!secili || !confirm(`${tarih(secili.updatedAt)} tarihli sürüme dönülsün mü? Şimdiki hâl de geçmişte kalır; site, yayınlayana kadar değişmez.`)) return;
    setMesgul(true); setHata("");
    try { await istekYap(`${surumYolu}/${secili.id}?draft=true&depth=0`, { method: "POST" }); geriYuklendi(); }
    catch (e) { setHata((e as Error).message); setMesgul(false); }
  }

  return (
    <div className="perde" onClick={kapat}>
      <div className="pencere site-surumler" role="dialog" aria-label="Sürüm geçmişi" onClick={(e) => e.stopPropagation()}>
        <div className="row"><b>Sürüm geçmişi</b><span style={{ flex: 1 }} /><button className="btn ghost sm" onClick={kapat}>Kapat</button></div>
        {hata && <div className="msg err">{hata}</div>}
        {!liste && !hata && <div className="muted">Yükleniyor…</div>}
        {liste && !liste.length && <div className="empty">Henüz önceki sürüm yok.</div>}
        {liste && liste.length > 0 && (
          <div className="site-surum-izgara">
            <div className="liste">
              {liste.map((s) => (
                <button key={s.id} className={`satir site-surum${secili?.id === s.id ? " secili" : ""}`} onClick={() => setSecili(s)}>
                  <span>{tarih(s.updatedAt)}</span>
                  <span className="muted">{s.version._status === "published" ? "Yayınlanan" : s.autosave ? "Otomatik kayıt" : "Taslak"}{s.latest ? " · son" : ""}</span>
                </button>
              ))}
            </div>
            <div>
              {!secili && <div className="muted">Karşılaştırmak için soldan bir sürüm seç.</div>}
              {secili && <>
                <div className="row">
                  <span className="muted">{degisenler.length ? `Şimdiki hâlden farklı ${degisenler.length} alan` : "Şimdiki hâlle aynı"}</span>
                  <span style={{ flex: 1 }} />
                  {degisenler.length > 0 && <button className="btn sm" disabled={mesgul} onClick={geriYukle}>Bu sürüme dön</button>}
                </div>
                {degisenler.map((a) => (
                  <div key={a.name} className="site-fark-alan">
                    <span className="site-etiket">{a.label ?? a.name}</span>
                    <Fark eski={metin(secili.version[a.name!])} yeni={metin(simdiki[a.name!])} />
                  </div>
                ))}
                {degisenler.length > 0 && <div className="muted">− o sürümde olan, + şimdi olan.</div>}
              </>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
