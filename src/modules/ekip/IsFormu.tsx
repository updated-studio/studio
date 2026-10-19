// Yeni iş / işi düzenle (yönetici). Zorunlu: marka, başlık, son gün. Gerisi isteğe bağlı.
import { useState, type FormEvent } from "react";
import { Ikon } from "../../shared/Ikon";
import { sb } from "../../shared/supabase";
import { ekle, iso } from "../../shared/tarih";
import { hataMetni, useToast } from "../../shared/toast";
import { useVeri, type Is } from "../../shared/veri";
import { KATEGORILER, ONCELIKLER, TURLER } from "./ortak";

export default function IsFormu({ is, kapat }: { is?: Is; kapat: () => void }) {
  const { veri, yenile } = useVeri();
  const toast = useToast();
  const [mesgul, setMesgul] = useState(false);
  const [ayrinti, setAyrinti] = useState(!!is);
  const al = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

  async function kaydet(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const row: Record<string, unknown> = {
      brand: al(f, "marka"), category: al(f, "kat"), type: al(f, "tur"), title: al(f, "baslik"), due: al(f, "son"),
      embargo: al(f, "ambargo") || null, priority: al(f, "oncelik") || "normal", brief: al(f, "brief"),
      backup: al(f, "yedek") || null, link: al(f, "link") || null,
    };
    const sorumlu = al(f, "sorumlu");
    setMesgul(true);
    const r = is ? await sb.from("jobs").update(row).eq("id", is.id).select("id").single() : await sb.from("jobs").insert(row).select("id").single();
    if (r.error) { setMesgul(false); toast(/column|priority|stage|brief|backup/i.test(r.error.message) ? "İş ayrıntıları için veritabanı güncellemesi henüz yapılmadı. Yöneticiye haber ver." : hataMetni(r.error)); return; }
    // Sorumlu seçildiyse iş bekleyenlere düşmeden doğrudan ona atanır (atama bildirimi gider).
    if (!is && sorumlu) {
      const a = await sb.rpc("assign_job", { p_job: r.data.id, p_user: sorumlu });
      if (a.error) toast(hataMetni(a.error));
    }
    setMesgul(false); yenile();
    toast(is ? "İş güncellendi." : sorumlu ? "İş açıldı ve atandı." : "İş açıldı, bekleyenlere eklendi.");
    kapat();
  }

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3>{is ? "İşi düzenle" : "Yeni iş"}</h3>
        <button className="linkbtn" onClick={kapat}>Vazgeç</button>
      </div>
      <form className="grid" onSubmit={kaydet} key={is?.id ?? "yeni"}>
        <label>Marka<input name="marka" type="text" required placeholder="Sony" defaultValue={is?.brand} /></label>
        <label style={{ gridColumn: "span 2" }}>Başlık<input name="baslik" type="text" required placeholder="A7 V ilk bakış videosu" defaultValue={is?.title} /></label>
        <label>Son gün<input name="son" type="date" required defaultValue={is?.due ?? iso(ekle(7))} /></label>
        <label>Tür<select name="tur" defaultValue={is?.type ?? TURLER[0]}>{TURLER.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label>Öncelik<select name="oncelik" defaultValue={is?.priority ?? "normal"}>{ONCELIKLER.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        {!is && (
          <label>Sorumlu<select name="sorumlu" defaultValue=""><option value="">Bekleyenlere koy</option>{veri.profiles.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
        )}
        {ayrinti ? <>
          <label>Kategori<select name="kat" defaultValue={is?.category ?? "kamera"}>{KATEGORILER.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label>Yedek kişi<select name="yedek" defaultValue={is?.backup ?? ""}><option value="">Yok</option>{veri.profiles.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
          <label>Ambargo<input name="ambargo" type="date" defaultValue={is?.embargo ?? ""} /></label>
          <label style={{ gridColumn: "1 / -1" }}>Brief (ne isteniyor, nereye çekilecek, dikkat edilecekler)
            <textarea name="brief" rows={3} className="is-textarea" defaultValue={is?.brief ?? ""} placeholder="Örnek: 60 sn dikey, ürün masada + elde kullanım, fiyat ekranda yazmasın." /></label>
          {is && <label style={{ gridColumn: "1 / -1" }}>Teslim linki<input name="link" type="url" defaultValue={is?.link ?? ""} placeholder="Drive / WeTransfer bağlantısı" /></label>}
        </> : <>
          <input type="hidden" name="kat" value="kamera" />
          <button type="button" className="linkbtn" onClick={() => setAyrinti(true)} style={{ alignSelf: "center" }}>+ Brief, yedek kişi, ambargo, kategori</button>
        </>}
        <button className="btn" disabled={mesgul}>{is ? "Kaydet" : <><Ikon ad="plus" />İşi aç</>}</button>
      </form>
    </div>
  );
}
