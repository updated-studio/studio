import { useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../../shared/auth";
import { Avatar } from "../../shared/Avatar";
import { sb } from "../../shared/supabase";
import { useToast } from "../../shared/toast";
import { useVeri } from "../../shared/veri";
import { degerlendir, EK, GRUP_PUANI, KONU_ODAKLI, ONCELIK_SURUMU, OY_SINIRI, SEVIYELER, type Degerlendirme } from "./oncelik";
import { useMasa, type Haber } from "./veri";

export const KONUMLAR_ETIKET: Record<string, string> = { aday: "Havuz", belirsiz: "Belirsiz", elendi: "Elendi", alindi: "Alındı", pas: "Pas", yayinda: "Yayında" };

export function zamanOnce(t: string | null): string {
  if (!t) return "";
  const dk = Math.round((Date.now() - Date.parse(t)) / 60000);
  if (dk < 1) return "şimdi";
  if (dk < 60) return dk + " dk";
  const s = Math.round(dk / 60);
  if (s < 24) return s + " sa";
  return Math.round(s / 24) + " gün";
}
export const tarihSaat = (t: string | null) => (t ? new Date(t).toLocaleString("sv-SE", { timeZone: "Europe/Istanbul" }).slice(0, 16) : "");

export function useKisi() {
  const { veri } = useVeri();
  return (id: string | null) => veri.profiles.find((p) => p.id === id);
}

/** Haberin öncelik değerlendirmesi (oncelik.ts) */
export function useDegerlendir() {
  const { v } = useMasa();
  return (h: Haber) => degerlendir(h, v.markalar, v.oylar);
}

/** Önerilen editörler: ilgi alanı haberin konu/ürün/marka metninde geçenler (eski "Önerilen Editör") */
export function useOnerilen() {
  const { veri } = useVeri();
  return (h: Haber) => {
    const metin = `${h.topic} ${h.product} ${h.brand}`.toLowerCase();
    return veri.profiles.filter((p) => (p.interests ?? "").split(/[,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean).some((x) => metin.includes(x)));
  };
}

export function Seviye({ d }: { d: Degerlendirme }) {
  return <span className={"pill " + d.seviye.sinif} title={"Öncelik puanı " + d.puan}>{d.seviye.ad} ({d.puan})</span>;
}

/** "Öncelik nasıl hesaplanır?" — oncelik.ts'teki kurallardan üretilir, kural değişince kendiliğinden güncellenir. */
export function OncelikBilgisi() {
  const odak = Object.entries(KONU_ODAKLI).map(([m, k]) => `${m[0].toUpperCase() + m.slice(1)} sadece ${k.join(" ve ")} haberlerinde`).join("; ");
  return (
    <details className="puanbilgi">
      <summary>Öncelik nasıl hesaplanır?</summary>
      <div className="liste">
        <div className="satir"><div className="ana"><b>Marka grubu</b> (Ayarlar &gt; Türkiye pazarı markaları)<div className="muted">{Object.entries(GRUP_PUANI).map(([g, p]) => `${g} ${p}`).join(" · ")}. {odak} öncelikli sayılır, diğer konularda Normal.</div></div></div>
        <div className="satir"><div className="ana"><b>Resmi, sızıntı ya da söylenti</b><div className="muted">+{EK.tur}</div></div></div>
        <div className="satir"><div className="ana"><b>En az {EK.kaynakEnAz} farklı kaynak yazdıysa</b><div className="muted">+{EK.kaynak}</div></div></div>
        <div className="satir"><div className="ana"><b>Kamera haberi</b><div className="muted">+{EK.kamera}, Sony kamera +{EK.sonyKamera}</div></div></div>
        <div className="satir"><div className="ana"><b>Öncelikli marka ama Türkiye'de yok</b><div className="muted">Elenmez, -{EK.turkiyeYokCeza}</div></div></div>
        <div className="satir"><div className="ana"><b>Editör oyu (▲ Önemli / ▼ Önemsiz)</b><div className="muted">Aynı markadaki (marka yoksa aynı konudaki) oyların toplamı, en fazla ±{OY_SINIRI}. Oydan sonra gelen haberlere uygulanır.</div></div></div>
        <div className="satir"><div className="ana"><b>Seviye</b><div className="muted">{SEVIYELER.map((s) => (Number.isFinite(s.enAz) ? `${s.ad}: ${s.enAz}+` : `${s.ad}: altı`)).join(" · ")}</div></div></div>
        <div className="satir"><div className="ana"><b>Toplama sırasında elenenler</b><div className="muted">Hariç marka · kampanya ve rehber yazıları · Türkiye'de yok (Öncelikli marka değilse) · gürültü kelimeleri. Türkiye bilgisi belirsiz olanlar Belirsiz'e düşer.</div></div></div>
      </div>
      <div className="muted">Kurallar son güncelleme: {ONCELIK_SURUMU}.</div>
    </details>
  );
}

/** Eski panelin filtreleri: öncelik çipleri + marka / kategori / kaynak seçimi */
export function useFiltre(liste: Haber[], degerle: (h: Haber) => Degerlendirme) {
  const [oncelik, setOncelik] = useState("hepsi");
  const [marka, setMarka] = useState("hepsi");
  const [konu, setKonu] = useState("hepsi");
  const [kaynak, setKaynak] = useState("hepsi");
  const secenek = (f: (h: Haber) => string) => {
    const o = new Map<string, number>();
    liste.forEach((h) => { const k = f(h).trim(); if (k) o.set(k, (o.get(k) ?? 0) + 1); });
    return [...o.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "tr")).map(([k]) => k);
  };
  const sonuc = liste.filter((h) => (oncelik === "hepsi" || degerle(h).seviye.ad === oncelik)
    && (marka === "hepsi" || h.brand.trim() === marka) && (konu === "hepsi" || h.topic.trim() === konu) && (kaynak === "hepsi" || h.source_name.trim() === kaynak));
  const sec = (ad: string, deger: string, set: (s: string) => void, f: (h: Haber) => string) => (
    <select value={deger} onChange={(e) => set(e.target.value)} style={{ width: "auto" }} aria-label={ad}>
      <option value="hepsi">{ad}: tümü</option>
      {secenek(f).map((k) => <option key={k} value={k}>{k}</option>)}
    </select>
  );
  const ui = (
    <>
      <div className="filtre">
        {["hepsi", ...SEVIYELER.map((s) => s.ad)].map((o) => (
          <button key={o} className="chip" aria-pressed={oncelik === o} onClick={() => setOncelik(o)}>{o === "hepsi" ? "Tüm öncelikler" : o}</button>
        ))}
      </div>
      <div className="filtre">
        {sec("Marka", marka, setMarka, (h) => h.brand)}
        {sec("Kategori", konu, setKonu, (h) => h.topic)}
        {sec("Kaynak", kaynak, setKaynak, (h) => h.source_name)}
      </div>
    </>
  );
  return { ui, sonuc };
}

/** Kaynağın ham Türkçe çevirisi (açınca çevrilir; sadece fikir için) */
export function Ceviri({ h }: { h: Haber }) {
  const toast = useToast();
  const [istendi, setIstendi] = useState(false);
  async function ac(acik: boolean) {
    if (!acik || h.translation || istendi || h.work_state === "ceviri") return;
    setIstendi(true);
    const { error } = await sb.functions.invoke("triyaj-taslak", { body: { item_id: h.id, tur: "ceviri" } });
    if (error) {
      let m = error.message;
      try { const j = await (error as { context?: Response }).context?.json(); if (j?.hata) m = j.hata; } catch { /* yok */ }
      toast("Çeviri başlatılamadı: " + m); setIstendi(false);
    }
  }
  return (
    <details className="ceviri" onToggle={(e) => ac((e.target as HTMLDetailsElement).open)}>
      <summary>Kaynağın ham Türkçe çevirisi</summary>
      <div className="muted">Sadece fikir için. Yayına kopyalanmaz, haber taslaktan kendi cümlelerinle yazılır.</div>
      {h.translation
        ? <div className="onizleme" style={{ whiteSpace: "pre-wrap" }}>{h.translation}</div>
        : h.work_state === "hata" && istendi ? <div className="msg err">Çeviri alınamadı: {h.work_error}</div>
        : <div className="muted">{h.work_state === "ceviri" || istendi ? "Çevriliyor… (yaklaşık 20 sn)" : "Açınca çevrilir."}</div>}
    </details>
  );
}

/** Arka plan işi başlatır: taslak ya da çeviri */
export function useIs() {
  const toast = useToast();
  return async (h: Haber, tur: "ceviri" | "taslak") => {
    const { data, error } = await sb.functions.invoke("triyaj-taslak", { body: { item_id: h.id, tur } });
    if (error) {
      let m = error.message;
      try { const j = await (error as { context?: Response }).context?.json(); if (j?.hata) m = j.hata; } catch { /* yok */ }
      toast("Başlatılamadı: " + m); return false;
    }
    if (data?.basladi) toast(tur === "ceviri" ? "Çeviri hazırlanıyor (yaklaşık 20 sn)." : "Taslak yazılıyor (yaklaşık 30 sn). Hazır olunca haber sende, taslak Taslaklar'da.");
    return true;
  };
}

/** Editör oyu: haber başına tek oy, notlu (eski "▲ Önemli / ▼ Önemsiz") */
export function OyAlani({ h }: { h: Haber }) {
  const { v, yenile } = useMasa();
  const { profile } = useAuth();
  const kisi = useKisi();
  const toast = useToast();
  const [secim, setSecim] = useState<1 | -1 | 0>(0);
  const [not, setNot] = useState("");
  const oy = v.oylar.find((o) => o.item_id === h.id || (!!o.link && o.link === h.link));
  if (oy) {
    const ben = oy.user_id === profile!.id;
    return (
      <span className={"pill " + (oy.value > 0 ? "ok" : "off")} title={oy.note}>
        {oy.value > 0 ? "▲ Önemli" : "▼ Önemsiz"} · {kisi(oy.user_id)?.name ?? "?"}{oy.note ? " — " + oy.note : ""}
        {ben && <button className="linkbtn" style={{ marginLeft: 6 }} onClick={async () => {
          const r = await sb.from("tr_votes").delete().eq("id", oy.id);
          if (r.error) toast(r.error.message); else { toast("Oy geri alındı."); yenile(); }
        }}>geri al</button>}
      </span>
    );
  }
  async function ver() {
    const r = await sb.from("tr_votes").insert({ item_id: h.id, user_id: profile!.id, value: secim, note: not.trim().slice(0, 300) });
    setSecim(0); setNot("");
    if (r.error) return toast(/duplicate|unique/i.test(r.error.message) ? "Bu habere başkası az önce oy verdi." : r.error.message);
    toast(secim > 0 ? "Kaydedildi: bu tür haberler daha önemli sayılacak." : "Kaydedildi: bu tür haberler daha az önemli sayılacak.");
    yenile();
  }
  if (secim) return (
    <form className="row" style={{ width: "100%" }} onSubmit={(e) => { e.preventDefault(); ver(); }}>
      <span className="muted">{secim > 0 ? "▲ Önemli" : "▼ Önemsiz"} olarak işaretlenecek.</span>
      <input type="text" value={not} onChange={(e) => setNot(e.target.value)} maxLength={300} placeholder="İstersen kısa not (boş bırakabilirsin)" autoFocus style={{ flex: "1 1 180px", width: "auto" }} />
      <button className="btn sm">Oy ver</button>
      <button type="button" className="btn ghost sm" onClick={() => setSecim(0)}>Vazgeç</button>
    </form>
  );
  return (
    <>
      <button className="btn ghost sm" title="Bu markadan/konudan haberler daha önemli sayılsın" onClick={() => setSecim(1)}>▲ Önemli</button>
      <button className="btn ghost sm" title="Bu markadan/konudan haberler daha az önemli sayılsın" onClick={() => setSecim(-1)}>▼ Önemsiz</button>
    </>
  );
}

/** Tek haber kartı (eski kart düzeni). Eylemler dışarıdan verilir. */
export function HaberKart({ h, children, ust, d, oyGoster = true }: { h: Haber; children?: ReactNode; ust?: ReactNode; d?: Degerlendirme; oyGoster?: boolean }) {
  const kisi = useKisi();
  const degerle = useDegerlendir();
  const onerilen = useOnerilen()(h);
  const deg = useMemo(() => d ?? degerle(h), [d, h]); // eslint-disable-line react-hooks/exhaustive-deps
  const alan = kisi(h.taken_by);
  const birakan = kisi(h.last_dropped_by);
  const aktaran = kisi(h.transfer_from);
  const digerleri = h.other_sources.filter((o, i, a) => o.link !== h.link && a.findIndex((x) => x.link === o.link) === i);
  const islemde = h.status === "aday" || h.status === "alindi" || h.status === "yayinda" || h.status === "pas";
  return (
    <div className="kart haber">
      <div className="row" style={{ gap: 6 }}>
        {islemde && <Seviye d={deg} />}
        {h.brand && <span className="pill blue">{h.brand}</span>}
        {h.kind && <span className={"pill " + (h.kind === "Sızıntı" || h.kind === "Söylenti" ? "purple" : "off")}>{h.kind}</span>}
        {h.topic && <span className="muted">{h.topic}</span>}
        <span className="muted" style={{ marginLeft: "auto" }}>{zamanOnce(h.published_at || h.created_at)}</span>
      </div>
      <div className="row muted" style={{ gap: 6, fontSize: 12 }}>
        {islemde && <span>{deg.gerekce.join(" · ")}</span>}
        {onerilen.length > 0 && <span>· Önerilen: <b>{onerilen.map((p) => p.name).join(", ")}</b></span>}
        {h.status === "aday" && birakan && <span>· ↩ {birakan.name} bıraktı</span>}
        {h.status === "alindi" && aktaran && <span>· ↪ {aktaran.name} → {alan?.name ?? "?"}</span>}
      </div>
      {ust}
      <div className="baslik">{h.event || h.title}</div>
      <div className="muted">{h.title}</div>
      <div className="row" style={{ gap: 10 }}>
        <a href={h.link} target="_blank" rel="noreferrer">{h.source_name || "Haber"} ↗</a>
        {digerleri.map((o) => <a key={o.link} href={o.link} target="_blank" rel="noreferrer">{o.name} ↗</a>)}
      </div>
      <div className="muted" style={{ fontSize: 12 }}>Asıl kaynak: {h.origin || h.source_name} · İlk yazan: {h.source_name} · {tarihSaat(h.published_at || h.created_at)}</div>
      {h.reason && (h.status === "elendi" || h.status === "belirsiz") && <div className="muted">{h.status === "elendi" ? "Neden" : "Model notu"}: {h.reason}</div>}
      {h.status === "alindi" && h.transfer_note && <div className="muted">Aktarma notu: “{h.transfer_note}”</div>}
      {islemde && <Ceviri h={h} />}
      {(children || oyGoster) && (
        <div className="alt">
          {children}
          {oyGoster && islemde && <span className="row" style={{ marginLeft: "auto", gap: 6 }}><OyAlani h={h} /></span>}
        </div>
      )}
      {h.last_action && <div className="muted" style={{ fontSize: 12 }}>{h.last_action}</div>}
      {!h.last_action && alan && <div className="row muted" style={{ gap: 6 }}><Avatar kisi={alan} boyut={20} /> {alan.name} aldı</div>}
    </div>
  );
}
