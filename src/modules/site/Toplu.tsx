import { useState } from "react";
import { istekYap, type PanelKullanici } from "./api";
import { AlanGirdisi } from "./Form";
import { veriAlanlari, type KoleksiyonSema } from "./sema";

// Toplu işlemler: listede seçilen kayıtlar tek tek işlenir (her biri panelin kurallarından geçer; olmayanın nedeni gösterilir).
// Yayınla / yayından kaldır / incelemeye gönder / sil / bir alanı değiştir (taslak olarak kaydedilir, yayını değiştirmez).
type Kayit = Record<string, unknown>;
const YAYINCI = ["admin", "yayin-yonetmeni"];
const TOPLU_TURLER = new Set(["text", "textarea", "email", "number", "checkbox", "select", "radio", "date", "relationship", "upload"]);

export function Secim({ secili, id, degis }: { secili: Set<number>; id: number; degis: (s: Set<number>) => void }) {
  return <input type="checkbox" className="site-sec" aria-label="Seç" checked={secili.has(id)}
    onChange={(e) => { const s = new Set(secili); if (e.target.checked) s.add(id); else s.delete(id); degis(s); }} />;
}

export function TumunuSec({ secili, idler, degis }: { secili: Set<number>; idler: number[]; degis: (s: Set<number>) => void }) {
  const hepsi = idler.length > 0 && idler.every((x) => secili.has(x));
  return <label className="site-kutu muted"><input type="checkbox" checked={hepsi} onChange={() => degis(hepsi ? new Set() : new Set(idler))} /> Tümünü seç</label>;
}

export default function TopluCubuk({ k, secili, kullanici, bitti }: { k: KoleksiyonSema; secili: Set<number>; kullanici: PanelKullanici; bitti: (mesaj: string) => void }) {
  const [mesgul, setMesgul] = useState("");
  const [sonuc, setSonuc] = useState<string[]>([]);
  const [alanAcik, setAlanAcik] = useState(false);
  const [alan, setAlan] = useState("");
  const [deger, setDeger] = useState<unknown>(null);
  if (!secili.size) return null;
  const yayinci = YAYINCI.includes(kullanici.role);
  const akisli = !!k.fields.find((a) => a.name === "workflow");
  const alanlar = veriAlanlari(k.fields).filter((a) => TOPLU_TURLER.has(a.type) && !a.admin?.readOnly && !a.unique);
  const secilenAlan = alanlar.find((a) => a.name === alan);
  const taslak = k.taslak ? "?draft=true&depth=0" : "?depth=0";

  async function uygula(ad: string, is: (id: number) => Promise<unknown>, onay?: string) {
    if (onay && !confirm(onay)) return;
    const idler = [...secili];
    const hatalar: string[] = [];
    let tamam = 0;
    for (const [i, id] of idler.entries()) {
      setMesgul(`${ad}: ${i + 1} / ${idler.length}`);
      try { await is(id); tamam++; } catch (e) { hatalar.push(`#${id}: ${(e as Error).message}`); }
    }
    setMesgul(""); setSonuc(hatalar);
    bitti(`${ad}: ${tamam} kayıt${hatalar.length ? `, ${hatalar.length} kayıt olmadı` : ""}.`);
  }
  const getir = (id: number) => istekYap<Kayit>(`/${k.slug}/${id}${taslak}`);
  const yama = (id: number, veri: Kayit, q = taslak) => istekYap(`/${k.slug}/${id}${q}`, { method: "PATCH", body: JSON.stringify(veri) });

  const yayinla = () => uygula("Yayınlandı", (id) => yama(id, { _status: "published" }, "?depth=0"), `${secili.size} kayıt yayınlansın mı?`);
  const kaldir = () => uygula("Yayından kaldırıldı", async (id) => {
    const d = akisli ? await getir(id) : null;
    return yama(id, { _status: "draft", ...(d ? { workflow: { ...(d.workflow as object), state: "taslak" } } : {}) }, "?depth=0");
  }, `${secili.size} kayıt yayından kaldırılsın mı? İçerikler taslak olarak kalır.`);
  const incelemeye = () => uygula("İncelemeye gönderildi", async (id) => {
    const d = await getir(id);
    return yama(id, { workflow: { ...(d.workflow as object), state: "incelemede" } });
  });
  const sil = () => uygula("Silindi", (id) => istekYap(`/${k.slug}/${id}`, { method: "DELETE" }), `${secili.size} kayıt kalıcı olarak silinsin mi? Bu geri alınamaz.`);
  const alanYaz = () => secilenAlan && uygula(`${secilenAlan.label ?? secilenAlan.name} değişti`, (id) => yama(id, { [secilenAlan.name!]: deger }),
    `${secili.size} kaydın "${secilenAlan.label ?? secilenAlan.name}" alanı değişsin mi?${k.taslak ? " (Taslak olarak kaydedilir; yayındakiler, yayınlanana kadar sitede değişmez.)" : ""}`).then(() => setAlanAcik(false));

  return (
    <div className="site-toplu">
      <b>{secili.size} seçili</b>
      {mesgul ? <span className="muted">{mesgul}</span> : <>
        {k.taslak && yayinci && <button className="btn sm" onClick={yayinla}>Yayınla</button>}
        {k.taslak && yayinci && <button className="btn ghost sm" onClick={kaldir}>Yayından kaldır</button>}
        {akisli && <button className="btn ghost sm" onClick={incelemeye}>İncelemeye gönder</button>}
        {alanlar.length > 0 && <button className="btn ghost sm" onClick={() => setAlanAcik(true)}>Bir alanı değiştir</button>}
        {kullanici.role === "admin" && <button className="btn ghost sm" onClick={sil}>Sil</button>}
      </>}
      {sonuc.length > 0 && <div className="msg err" style={{ flexBasis: "100%" }}>{sonuc.slice(0, 6).map((x) => <div key={x}>{x}</div>)}{sonuc.length > 6 && <div>… ve {sonuc.length - 6} tane daha</div>}</div>}
      {alanAcik && (
        <div className="perde" onClick={() => setAlanAcik(false)}>
          <div className="pencere" role="dialog" aria-label="Bir alanı değiştir" onClick={(e) => e.stopPropagation()}>
            <h3>{secili.size} kayıtta bir alanı değiştir</h3>
            <label>Alan
              <select value={alan} onChange={(e) => { setAlan(e.target.value); setDeger(null); }}>
                <option value="">Seç…</option>
                {alanlar.map((a) => <option key={a.name} value={a.name}>{a.label ?? a.name}</option>)}
              </select>
            </label>
            {secilenAlan && <AlanGirdisi a={secilenAlan} deger={deger} set={setDeger} />}
            <div className="row"><span style={{ flex: 1 }} /><button className="btn ghost" onClick={() => setAlanAcik(false)}>Vazgeç</button><button className="btn" disabled={!secilenAlan || !!mesgul} onClick={alanYaz}>Uygula</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
