// Künye: "Kaynaktan doldur" (25 Ekim 2026; fonksiyon kunye-doldur). Editör üreticinin sayfasını verir, öneriler tablo olarak gelir;
// seçilenler ürünün özellik satırlarına yazılır (kaynak: üretici, bağlantı, bugünün tarihi). Kaydetmek yine editörde.
import { useState } from "react";
import { sb, SUPABASE_URL } from "../../shared/supabase";

type Ozellik = { key: string; value?: string | null; num?: number | null; unit?: string | null; source?: string; sourceUrl?: string | null; at?: string | null; [k: string]: unknown };
type Oneri = { key: string; value: string; num: number | null; kanit: string };

export default function KunyeDoldur({ kayit, uygula }: { kayit: Record<string, unknown>; uygula: (specs: Ozellik[]) => void }) {
  const specs = (kayit.specs as Ozellik[] | undefined) ?? [];
  const [url, setUrl] = useState("");
  const [metin, setMetin] = useState("");
  const [mesgul, setMesgul] = useState(false);
  const [hata, setHata] = useState("");
  const [oneri, setOneri] = useState<{ liste: Oneri[]; kaynak: string } | null>(null);
  const [secili, setSecili] = useState<Set<string>>(new Set());
  const bos = specs.filter((s) => !s.value).length;

  async function oku() {
    setMesgul(true); setHata(""); setOneri(null);
    try {
      const { data: o } = await sb.auth.getSession();
      const r = await fetch(`${SUPABASE_URL}/functions/v1/kunye-doldur`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${o.session?.access_token ?? ""}` },
        body: JSON.stringify({ url: url.trim(), urun: `${kayit.brand ?? ""} ${kayit.name ?? ""}`.trim(), ozellikler: specs.map((s) => ({ key: s.key, unit: s.unit })), metin }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Hata ${r.status}`);
      setOneri({ liste: j.ozellikler, kaynak: j.kaynak });
      // Boş olanlar varsayılan seçili; dolu olanın üstüne yazmak editörün seçimi
      setSecili(new Set((j.ozellikler as Oneri[]).filter((x) => !specs.find((s) => s.key === x.key)?.value).map((x) => x.key)));
      if (!j.ozellikler.length) setHata("Sayfada bu özelliklerden hiçbiri açıkça bulunamadı. Üreticinin teknik özellikler sayfasını dene.");
    } catch (e) { setHata((e as Error).message); } finally { setMesgul(false); }
  }
  function yaz() {
    if (!oneri) return;
    const bugun = new Date().toISOString().slice(0, 10);
    const yeni = specs.map((s) => {
      const x = oneri.liste.find((o) => o.key === s.key);
      return x && secili.has(s.key) ? { ...s, value: x.value, num: x.num, source: "uretici", sourceUrl: oneri.kaynak, at: bugun } : s;
    });
    uygula(yeni);
    setOneri(null); setUrl(""); setMetin("");
  }

  return (
    <section className="panel kunye-doldur">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <b>Kaynaktan doldur</b>
        <span className="muted">{specs.length ? `${specs.length - bos}/${specs.length} özellik dolu` : "Önce türü seçip kaydet: özellik şablonu dolsun."}</span>
      </div>
      <div className="muted" style={{ fontSize: 14 }}>Üreticinin ürün ya da teknik özellik sayfasının bağlantısını yapıştır. Yapay zekâ yalnız sayfada açıkça yazanı önerir; her öneriyi kontrol edip seç, sonra Kaydet'e bas.</div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <input type="url" placeholder="https://… (ör. üreticinin teknik özellikler sayfası)" value={url} onChange={(e) => setUrl(e.target.value)} style={{ flex: 1, minWidth: 220 }} aria-label="Kaynak bağlantısı" />
        <button className="btn" disabled={mesgul || !url.trim() || !specs.length} onClick={oku}>{mesgul ? "Okunuyor… (≈30 sn)" : "Oku ve öner"}</button>
      </div>
      <details><summary className="muted" style={{ cursor: "pointer", fontSize: 14 }}>Site otomatik okunmuyorsa: özellik tablosunu kopyalayıp yapıştır</summary>
        <textarea rows={6} value={metin} onChange={(e) => setMetin(e.target.value)} placeholder="Üreticinin sayfasındaki teknik özellik tablosunu seçip buraya yapıştır (kaynak bağlantısını yukarıya yine yaz)." style={{ width: "100%", marginTop: 8 }} aria-label="Yapıştırılan özellik metni" />
      </details>
      {hata && <div className="msg err">{hata}</div>}
      {oneri && oneri.liste.length > 0 && (
        <>
          <div className="kd-tablo">
            <table>
              <thead><tr><th></th><th>Özellik</th><th>Şu an</th><th>Öneri</th><th>Sayfadaki kanıt</th></tr></thead>
              <tbody>{oneri.liste.map((x) => {
                const simdi = specs.find((s) => s.key === x.key)?.value;
                return (
                  <tr key={x.key}>
                    <td><input type="checkbox" aria-label={`${x.key} önerisini al`} checked={secili.has(x.key)} onChange={(e) => { const s = new Set(secili); if (e.target.checked) s.add(x.key); else s.delete(x.key); setSecili(s); }} /></td>
                    <th scope="row">{x.key}</th><td className="muted">{simdi || "—"}</td><td><b>{x.value}</b>{x.num !== null ? <span className="muted"> · {x.num}</span> : null}</td><td className="muted kd-kanit">“{x.kanit}”</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" disabled={!secili.size} onClick={yaz}>Seçilen {secili.size} özelliği yaz</button>
            <button className="btn ghost" onClick={() => setOneri(null)}>Vazgeç</button>
          </div>
        </>
      )}
    </section>
  );
}
