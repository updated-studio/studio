import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../shared/auth";
import { Avatar } from "../../shared/Avatar";
import { useCanli, useCanliNesne } from "../../shared/canli";
import { sb, SUPABASE_URL } from "../../shared/supabase";
import { useToast } from "../../shared/toast";
import { useVeri } from "../../shared/veri";
import { araSira, gecmisCumle, KISAYOL, TUR_AD, type Blok, type BlokTur, type Gecmis, type Klasor, type Sayfa, type Yorum } from "./notVeri";
import { Kilit, KilitAyari, yeniSayfa } from "./Notlar";

// Not sayfası: Craft gibi blok blok yazılır. Her blok ayrı kaydedilir (kim ekledi, kim son değiştirdi blokta durur); başkasının yazdığı
// anında gelir. Boş yeni satır yazılana kadar kaydedilmez (geçmiş "boş satır" kalabalığıyla dolmasın). Yorumlar blokta, cevaplar yorumda.
type Yerel = Blok & { kayitli: boolean };
const METINSIZ: BlokTur[] = ["ayrac", "gorsel"];
const LISTE: BlokTur[] = ["madde", "numara", "yapilacak"];
const once = (t: string) => {
  const d = (Date.now() - Date.parse(t)) / 1000;
  if (d < 60) return "az önce"; if (d < 3600) return `${Math.floor(d / 60)} dk önce`; if (d < 86400) return `${Math.floor(d / 3600)} sa önce`;
  return new Date(t).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
};

export default function NotSayfa({ sayfa, yol, altlar, ac, klasorler }: { sayfa: Sayfa; yol: string[]; altlar: Sayfa[]; ac: (id: number | null) => void; klasorler: Klasor[] }) {
  const { profile } = useAuth();
  const { veri } = useVeri();
  const toast = useToast();
  const kisi = useCallback((id: string | null) => veri.profiles.find((p) => p.id === id), [veri.profiles]);
  const [bloklar, setBloklar] = useState<Yerel[] | null>(null);
  const [yorumlar, setYorumlar] = useState<Yorum[]>([]);
  const [odak, setOdak] = useState<string | null>(null);
  const [kimYazdi, setKimYazdi] = useState(() => { try { return localStorage.getItem("notlar-kim-yazdi") === "1"; } catch { return false; } });
  const [panel, setPanel] = useState<{ tur: "yorum"; blok: string | null } | { tur: "gecmis" } | { tur: "kilit" } | { tur: "menu" } | { tur: "sil" } | null>(null);
  const [menu, setMenu] = useState<{ blok: string; secim: number } | null>(null);
  const alanlar = useRef(new Map<string, HTMLTextAreaElement>());
  const zamanlayici = useRef(new Map<string, number>());
  const kirli = useRef(new Set<string>());
  const imlec = useRef<{ id: string; konum: number } | null>(null);
  const dosya = useRef<HTMLInputElement>(null);
  const gorselBlok = useRef<string | null>(null);

  useCanliNesne({ tur: "not", id: sayfa.id, baslik: sayfa.baslik || "Başlıksız not", eylem: odak ? "düzenliyor" : "bakıyor" });
  const { kisiler, ben } = useCanli();
  const burada = kisiler.filter((k) => k.id !== ben && k.nesne?.tur === "not" && k.nesne.id === sayfa.id);

  // Yükle + canlı
  useEffect(() => {
    let iptal = false;
    (async () => {
      const [b, y] = await Promise.all([
        sb.from("not_bloklar").select("*").eq("sayfa_id", sayfa.id).order("sira"),
        sb.from("not_yorumlar").select("*").eq("sayfa_id", sayfa.id).order("created_at"),
      ]);
      if (iptal) return;
      const l = ((b.data ?? []) as Blok[]).map((x) => ({ ...x, kayitli: true }));
      setBloklar(l.length ? l : [bosBlok(sayfa.id, 1)]);
      setYorumlar((y.data ?? []) as Yorum[]);
    })();
    const k = sb.channel("not-sayfa-" + sayfa.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "not_bloklar", filter: `sayfa_id=eq.${sayfa.id}` }, (p) => {
        if (p.eventType === "DELETE") return;
        const yeni = p.new as Blok;
        setBloklar((l) => {
          if (!l) return l;
          const var_ = l.find((x) => x.id === yeni.id);
          // Kendi yazmakta olduğum bloğu başkasının sürümü ezmesin
          if (var_ && kirli.current.has(yeni.id)) return l.map((x) => (x.id === yeni.id ? { ...x, olusturan: yeni.olusturan, kayitli: true } : x));
          const sonra = var_ ? l.map((x) => (x.id === yeni.id ? { ...yeni, kayitli: true } : x)) : [...l, { ...yeni, kayitli: true }];
          return sonra.sort((a, b) => a.sira - b.sira);
        });
      })
      // Silme olayları süzgeçsiz gelir (yalnız kimlik); bu sayfada olmayan kimlik yok sayılır
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "not_bloklar" }, (p) => {
        const id = (p.old as { id?: string }).id;
        if (id && !kirli.current.has(id)) setBloklar((l) => l?.filter((x) => x.id !== id) ?? l);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "not_yorumlar", filter: `sayfa_id=eq.${sayfa.id}` }, (p) => {
        if (p.eventType === "DELETE") return;
        const y = p.new as Yorum;
        setYorumlar((l) => (l.some((x) => x.id === y.id) ? l.map((x) => (x.id === y.id ? y : x)) : [...l, y]));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "not_yorumlar" }, (p) => {
        const id = (p.old as { id?: number }).id; if (id) setYorumlar((l) => l.filter((x) => x.id !== id));
      })
      .subscribe();
    return () => { iptal = true; sb.removeChannel(k); zamanlayici.current.forEach((t) => window.clearTimeout(t)); };
  }, [sayfa.id]);

  // Sayfadan çıkarken bekleyen kayıtlar gönderilir
  const bloklarRef = useRef(bloklar); bloklarRef.current = bloklar;
  useEffect(() => () => { for (const id of kirli.current) { const b = bloklarRef.current?.find((x) => x.id === id); if (b) void kaydetSimdi(b); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function kaydetSimdi(b: Yerel) {
    zamanlayici.current.delete(b.id);
    if (!b.kayitli && !b.metin.trim() && !METINSIZ.includes(b.tur)) { kirli.current.delete(b.id); return; }
    const { error } = await sb.from("not_bloklar").upsert({ id: b.id, sayfa_id: b.sayfa_id, sira: b.sira, tur: b.tur, metin: b.metin, isaretli: b.isaretli, ek: b.ek });
    kirli.current.delete(b.id);
    if (error) { toast("Kaydedilemedi: " + error.message); return; }
    setBloklar((l) => l?.map((x) => (x.id === b.id ? { ...x, kayitli: true, guncelleyen: profile?.id ?? x.guncelleyen, olusturan: x.olusturan ?? profile?.id ?? null, updated_at: new Date().toISOString() } : x)) ?? l);
  }
  const kaydet = (b: Yerel, hemen = false) => {
    kirli.current.add(b.id);
    window.clearTimeout(zamanlayici.current.get(b.id));
    if (hemen) { void kaydetSimdi(b); return; }
    zamanlayici.current.set(b.id, window.setTimeout(() => { const g = bloklarRef.current?.find((x) => x.id === b.id); if (g) void kaydetSimdi(g); }, 700));
  };
  const guncelle = (id: string, d: Partial<Yerel>, hemen = false) => {
    const eski = bloklarRef.current?.find((x) => x.id === id);
    setBloklar((l) => l?.map((x) => (x.id === id ? { ...x, ...d } : x)) ?? l);
    if (eski) { const b = { ...eski, ...d }; bloklarRef.current = bloklarRef.current!.map((x) => (x.id === id ? b : x)); kaydet(b, hemen); }
  };
  async function sil(b: Yerel) {
    setBloklar((l) => l?.filter((x) => x.id !== b.id) ?? l);
    window.clearTimeout(zamanlayici.current.get(b.id)); kirli.current.delete(b.id);
    if (b.kayitli) { const { error } = await sb.from("not_bloklar").delete().eq("id", b.id); if (error) toast("Silinemedi: " + error.message); }
  }
  /** b'den sonra yeni blok; odak ona */
  function ekle(sonra: Yerel | null, tur: BlokTur, metin = "", odakla = true): Yerel {
    const l = bloklar ?? [];
    const i = sonra ? l.findIndex((x) => x.id === sonra.id) : l.length - 1;
    const y: Yerel = { ...bosBlok(sayfa.id, araSira(l[i]?.sira, l[i + 1]?.sira)), tur, metin, olusturan: profile?.id ?? null, guncelleyen: profile?.id ?? null };
    setBloklar((x) => (x ? [...x.slice(0, i + 1), y, ...x.slice(i + 1)] : [y]));
    if (metin || METINSIZ.includes(tur)) kaydet(y, true);
    if (odakla) imlec.current = { id: y.id, konum: 0 };
    return y;
  }
  // Odak ve imleç, blok listesi değişince uygulanır
  useLayoutEffect(() => {
    const i = imlec.current; if (!i) return;
    const t = alanlar.current.get(i.id); if (!t) return;
    imlec.current = null; t.focus(); const k = i.konum < 0 ? t.value.length : i.konum; t.setSelectionRange(k, k);
  });
  // Yükseklik içeriğe göre
  const boyutla = (t: HTMLTextAreaElement | null) => { if (t) { t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; } };
  useLayoutEffect(() => { alanlar.current.forEach(boyutla); }, [bloklar, kimYazdi]);

  function tusa(e: React.KeyboardEvent<HTMLTextAreaElement>, b: Yerel) {
    const t = e.currentTarget, l = bloklar ?? [], i = l.findIndex((x) => x.id === b.id);
    const metinli = (x?: Yerel) => !!x && !METINSIZ.includes(x.tur);
    if (menu) {
      const turler = Object.keys(TUR_AD) as BlokTur[];
      if (e.key === "ArrowDown") { e.preventDefault(); setMenu({ ...menu, secim: (menu.secim + 1) % turler.length }); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMenu({ ...menu, secim: (menu.secim + turler.length - 1) % turler.length }); return; }
      if (e.key === "Enter") { e.preventDefault(); turSec(b, turler[menu.secim]); return; }
      if (e.key === "Escape") { setMenu(null); return; }
    }
    if (e.key === "Enter" && !e.shiftKey && b.tur !== "kod") {
      e.preventDefault();
      if (LISTE.includes(b.tur) && !b.metin) { guncelle(b.id, { tur: "metin" }); return; }
      const bas = t.value.slice(0, t.selectionStart), son = t.value.slice(t.selectionEnd);
      if (son || bas !== b.metin) guncelle(b.id, { metin: bas });
      ekle(b, LISTE.includes(b.tur) ? b.tur : "metin", son);
      return;
    }
    if (e.key === "Backspace" && t.selectionStart === 0 && t.selectionEnd === 0) {
      if (b.tur !== "metin") { e.preventDefault(); guncelle(b.id, { tur: "metin" }); return; }
      const onceki = l[i - 1];
      if (!onceki) return;
      e.preventDefault();
      if (!metinli(onceki)) { void sil(onceki); return; }
      const birlesim = onceki.metin.length;
      guncelle(onceki.id, { metin: onceki.metin + b.metin });
      void sil(b); imlec.current = { id: onceki.id, konum: birlesim };
      return;
    }
    if (e.key === "ArrowUp" && !t.value.slice(0, t.selectionStart).includes("\n")) {
      const p = [...l.slice(0, i)].reverse().find(metinli); if (p) { e.preventDefault(); imlec.current = { id: p.id, konum: -1 }; setBloklar([...l]); }
    }
    if (e.key === "ArrowDown" && !t.value.slice(t.selectionEnd).includes("\n")) {
      const n = l.slice(i + 1).find(metinli); if (n) { e.preventDefault(); imlec.current = { id: n.id, konum: 0 }; setBloklar([...l]); }
    }
  }
  function yaz(b: Yerel, deger: string) {
    if (deger === "/" && !b.metin) { setMenu({ blok: b.id, secim: 0 }); }
    else if (menu?.blok === b.id && !deger.startsWith("/")) setMenu(null);
    if (b.tur === "metin" && deger === "---") { guncelle(b.id, { tur: "ayrac", metin: "" }, true); ekle(b, "metin"); return; }
    const k = b.tur === "metin" ? KISAYOL.find(([r]) => r.test(deger)) : undefined;
    if (k) { guncelle(b.id, { tur: k[1], metin: "" }); return; }
    guncelle(b.id, { metin: deger });
  }
  function turSec(b: Yerel, tur: BlokTur) {
    setMenu(null);
    const metin = b.metin.startsWith("/") ? "" : b.metin;
    if (tur === "gorsel") { gorselBlok.current = b.id; guncelle(b.id, { metin }); dosya.current?.click(); return; }
    if (tur === "ayrac") { guncelle(b.id, { tur, metin: "" }, true); ekle(b, "metin"); return; }
    guncelle(b.id, { tur, metin }); imlec.current = { id: b.id, konum: -1 };
  }
  function yapistir(e: React.ClipboardEvent<HTMLTextAreaElement>, b: Yerel) {
    const metin = e.clipboardData.getData("text/plain");
    if (b.tur === "kod" || !metin.includes("\n")) return;
    e.preventDefault();
    const t = e.currentTarget, satirlar = metin.replace(/\r/g, "").split("\n");
    const bas = t.value.slice(0, t.selectionStart) + satirlar[0], son = t.value.slice(t.selectionEnd);
    guncelle(b.id, { metin: bas });
    let onceki = b;
    satirlar.slice(1).forEach((s, j) => {
      const m = s.match(/^(#{1,2}|[-*•]|\d+[.)]|>|\[\s?\])\s+/);
      const tur: BlokTur = !m ? "metin" : m[1] === "#" ? "baslik" : m[1] === "##" ? "altbaslik" : m[1] === ">" ? "alinti" : m[1].startsWith("[") ? "yapilacak" : /\d/.test(m[1]) ? "numara" : "madde";
      onceki = ekle(onceki, tur, (m ? s.slice(m[0].length) : s) + (j === satirlar.length - 2 ? son : ""), j === satirlar.length - 2);
    });
  }
  async function gorselYukle(f: File) {
    const id = gorselBlok.current; gorselBlok.current = null;
    if (!id || !/^image\//.test(f.type)) return;
    if (f.size > 15e6) { toast("Görsel 15 MB'tan büyük."); return; }
    const yol = `${sayfa.id}/${crypto.randomUUID()}.${(f.name.split(".").pop() || "jpg").toLowerCase()}`;
    const { error } = await sb.storage.from("notlar").upload(yol, f, { contentType: f.type });
    if (error) { toast("Görsel yüklenemedi: " + error.message); return; }
    guncelle(id, { tur: "gorsel", ek: { url: `${SUPABASE_URL}/storage/v1/object/public/notlar/${yol}` } }, true);
    const b = bloklarRef.current?.find((x) => x.id === id);
    if (b) ekle(b, "metin");
  }

  // Başlık
  const [baslik, setBaslik] = useState(sayfa.baslik);
  const baslikZ = useRef(0);
  useEffect(() => { if (document.activeElement?.id !== "nt-baslik") setBaslik(sayfa.baslik); }, [sayfa.baslik]);
  const baslikYaz = (v: string) => {
    setBaslik(v); window.clearTimeout(baslikZ.current);
    baslikZ.current = window.setTimeout(async () => { const { error } = await sb.from("not_sayfalar").update({ baslik: v.trim() }).eq("id", sayfa.id); if (error) toast("Başlık kaydedilemedi: " + error.message); }, 600);
  };

  const yorumSay = useMemo(() => { const m = new Map<string, number>(); for (const y of yorumlar) if (y.blok_id && !y.cozuldu) m.set(y.blok_id, (m.get(y.blok_id) ?? 0) + 1); return m; }, [yorumlar]);
  const acikYorum = yorumlar.filter((y) => !y.cozuldu && !y.ust_id).length;
  const yetkili = sayfa.olusturan === profile?.id || !!profile?.is_admin;
  const klasor = klasorler.find((k) => k.id === sayfa.klasor_id);
  let numara = 0;

  async function sayfaSil() {
    const { error } = await sb.from("not_sayfalar").delete().eq("id", sayfa.id);
    if (error) toast("Silinemedi: " + error.message); else { toast("Sayfa silindi."); ac(sayfa.ust_id); }
  }

  return (
    <div className={"nt-sayfa" + (panel?.tur === "yorum" || panel?.tur === "gecmis" ? " panelli" : "")}>
      <article className={"nt-belge" + (kimYazdi ? " kim-yazdi" : "")}>
        <div className="nt-ust">
          <div className="nt-yol muted">{yol.length ? yol.join(" / ") : klasor?.ad ?? "Notlar"}{sayfa.kilitli && <> · <Kilit /> Kilitli</>}</div>
          <div className="nt-eylem">
            {burada.length > 0 && <span className="nt-burada" title={burada.map((k) => `${k.ad} ${k.nesne?.eylem}`).join(", ")}>{burada.slice(0, 3).map((k) => { const p = kisi(k.id); return p ? <Avatar key={k.id} kisi={p} boyut={22} /> : null; })}<span>{burada.length === 1 ? `${burada[0].ad.split(" ")[0]} burada` : `${burada.length} kişi burada`}</span></span>}
            <button className="btn ghost sm" aria-pressed={kimYazdi} onClick={() => { const y = !kimYazdi; setKimYazdi(y); try { localStorage.setItem("notlar-kim-yazdi", y ? "1" : "0"); } catch { /* */ } }}>Kim yazdı</button>
            <button className="btn ghost sm" aria-pressed={panel?.tur === "yorum"} onClick={() => setPanel(panel?.tur === "yorum" ? null : { tur: "yorum", blok: null })}>Yorumlar{acikYorum ? ` ${acikYorum}` : ""}</button>
            <button className="btn ghost sm" aria-pressed={panel?.tur === "gecmis"} onClick={() => setPanel(panel?.tur === "gecmis" ? null : { tur: "gecmis" })}>Katkılar</button>
            <span className="nt-menu-kap">
              <button className="btn ghost sm" aria-label="Sayfa işlemleri" aria-expanded={panel?.tur === "menu"} onClick={() => setPanel(panel?.tur === "menu" ? null : { tur: "menu" })}>⋯</button>
              {panel?.tur === "menu" && <div className="nt-acilir sag" role="menu">
                <button role="menuitem" onClick={async () => { setPanel(null); const id = await yeniSayfa(null, sayfa.id, []); if (id) ac(id); }}>Alt sayfa ekle</button>
                <button role="menuitem" onClick={() => setPanel({ tur: "kilit" })}>{sayfa.kilitli ? "Kilit ve izinler" : "Kilitle"}</button>
                {yetkili && <button role="menuitem" className="tehlike" onClick={() => setPanel({ tur: "sil" })}>Sayfayı sil</button>}
              </div>}
              {panel?.tur === "kilit" && <div className="nt-acilir sag genis"><KilitAyari tablo="not_sayfalar" nesne={sayfa} kapat={() => setPanel(null)} /></div>}
              {panel?.tur === "sil" && <div className="nt-acilir sag genis"><p>Sayfa{altlar.length ? ` ve ${altlar.length} alt sayfası` : ""} kalıcı olarak silinir.</p><div className="row" style={{ gap: 8 }}><button className="btn sm tehlike" onClick={sayfaSil}>Sil</button><button className="btn ghost sm" onClick={() => setPanel(null)}>Vazgeç</button></div></div>}
            </span>
          </div>
        </div>
        <textarea id="nt-baslik" className="nt-baslik-gir" rows={1} placeholder="Başlıksız" value={baslik} ref={boyutla}
          onChange={(e) => { baslikYaz(e.target.value); boyutla(e.target); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const ilk = (bloklar ?? []).find((x) => !METINSIZ.includes(x.tur)); if (ilk) { imlec.current = { id: ilk.id, konum: 0 }; setBloklar([...(bloklar ?? [])]); } } }} />
        <div className="nt-meta muted">{kisi(sayfa.olusturan)?.name ?? "Biri"} açtı, {once(sayfa.created_at)}{sayfa.guncelleyen && <> · son değişiklik {kisi(sayfa.guncelleyen)?.name ?? "biri"}, {once(sayfa.updated_at)}</>}</div>

        {bloklar === null ? <div className="nt-yuk" aria-hidden="true"><i /><i /><i /></div> : (
          <div className="nt-bloklar">
            {bloklar.map((b) => {
              numara = b.tur === "numara" ? numara + 1 : 0;
              const yazan = kisi(b.olusturan), degistiren = b.guncelleyen && b.guncelleyen !== b.olusturan ? kisi(b.guncelleyen) : undefined;
              const imza = `${yazan?.name ?? "Biri"} ekledi${degistiren ? ` · ${degistiren.name} değiştirdi` : ""} · ${once(b.updated_at)}`;
              const ys = yorumSay.get(b.id) ?? 0;
              return (
                <div key={b.id} className={`nb nb-${b.tur}${b.isaretli ? " isaretli" : ""}${odak === b.id ? " odak" : ""}${panel?.tur === "yorum" && panel.blok === b.id ? " yorumda" : ""}`}>
                  <span className="nb-yazar" title={imza}>{yazan && <Avatar kisi={yazan} boyut={18} />}{kimYazdi && <span className="nb-imza">{yazan?.name.split(" ")[0] ?? ""}{degistiren ? ` · ${degistiren.name.split(" ")[0]}` : ""}</span>}</span>
                  <div className="nb-ic">
                    {b.tur === "ayrac" ? <hr onClick={() => void sil(b)} title="Ayraç (silmek için tıkla)" />
                      : <>
                        {b.tur === "madde" && <span className="nb-isaret" aria-hidden="true">•</span>}
                        {b.tur === "numara" && <span className="nb-isaret" aria-hidden="true">{numara}.</span>}
                        {b.tur === "yapilacak" && <input type="checkbox" className="nb-kutu" checked={b.isaretli} aria-label="Yapıldı" onChange={(e) => guncelle(b.id, { isaretli: e.target.checked }, true)} />}
                        {b.tur === "gorsel" && b.ek.url && <figure><a href={b.ek.url} target="_blank" rel="noreferrer"><img src={b.ek.url} alt={b.metin || "Not görseli"} loading="lazy" /></a></figure>}
                        <textarea rows={1} value={b.metin} spellCheck
                          ref={(t) => { if (t) { alanlar.current.set(b.id, t); boyutla(t); } else alanlar.current.delete(b.id); }}
                          placeholder={b.tur === "gorsel" ? "Görsel açıklaması" : odak === b.id && !b.metin ? (b.tur === "metin" ? "Yaz ya da / ile blok türü seç" : TUR_AD[b.tur]) : ""}
                          aria-label={TUR_AD[b.tur]}
                          onFocus={() => setOdak(b.id)} onBlur={() => { setOdak((o) => (o === b.id ? null : o)); if (kirli.current.has(b.id)) kaydet(b, true); }}
                          onChange={(e) => { yaz(b, e.target.value); boyutla(e.target); }}
                          onKeyDown={(e) => tusa(e, b)} onPaste={(e) => yapistir(e, b)} />
                      </>}
                    {menu?.blok === b.id && <div className="nt-acilir tur-menu" role="listbox" aria-label="Blok türü">
                      {(Object.keys(TUR_AD) as BlokTur[]).map((t, j) => <button key={t} role="option" aria-selected={j === menu.secim} onMouseDown={(e) => { e.preventDefault(); turSec(b, t); }}>{TUR_AD[t]}</button>)}
                    </div>}
                  </div>
                  <button className={"nb-yorum" + (ys ? " var" : "")} aria-label={ys ? `${ys} yorum` : "Yorum yaz"} title={ys ? `${ys} yorum` : "Bu satıra yorum yaz"}
                    onClick={() => setPanel({ tur: "yorum", blok: b.id })}><YorumIkon />{ys > 0 && <span>{ys}</span>}</button>
                </div>
              );
            })}
            <button className="nt-sona" aria-label="Sona yeni satır" onClick={() => { const son = bloklar.at(-1); if (son && !METINSIZ.includes(son.tur) && !son.metin) { imlec.current = { id: son.id, konum: 0 }; setBloklar([...bloklar]); } else ekle(son ?? null, "metin"); }} />
          </div>
        )}
        {altlar.length > 0 && <div className="nt-altlar"><h3>Alt sayfalar</h3>{altlar.map((s) => <button key={s.id} className="linkbtn" onClick={() => ac(s.id)}>{s.baslik || "Başlıksız"}{s.kilitli && <Kilit />}</button>)}</div>}
        <input ref={dosya} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void gorselYukle(f); }} />
      </article>

      {panel?.tur === "yorum" && <YorumPaneli sayfa={sayfa.id} blok={panel.blok} bloklar={bloklar ?? []} yorumlar={yorumlar} setYorumlar={setYorumlar} kapat={() => setPanel(null)} sec={(b) => setPanel({ tur: "yorum", blok: b })} />}
      {panel?.tur === "gecmis" && <KatkiPaneli sayfa={sayfa.id} bloklar={bloklar ?? []} yorumlar={yorumlar} kapat={() => setPanel(null)} />}
    </div>
  );
}

function bosBlok(sayfa: number, sira: number): Yerel {
  const t = new Date().toISOString();
  return { id: crypto.randomUUID(), sayfa_id: sayfa, sira, tur: "metin", metin: "", isaretli: false, ek: {}, olusturan: null, guncelleyen: null, created_at: t, updated_at: t, kayitli: false };
}

function YorumPaneli({ sayfa, blok, bloklar, yorumlar, setYorumlar, kapat, sec }: {
  sayfa: number; blok: string | null; bloklar: Yerel[]; yorumlar: Yorum[]; setYorumlar: React.Dispatch<React.SetStateAction<Yorum[]>>; kapat: () => void; sec: (b: string | null) => void;
}) {
  const { profile } = useAuth();
  const { veri } = useVeri();
  const toast = useToast();
  const [cozulenler, setCozulenler] = useState(false);
  const kisi = (id: string | null) => veri.profiles.find((p) => p.id === id);
  const b = bloklar.find((x) => x.id === blok);
  const kokler = yorumlar.filter((y) => !y.ust_id && (blok ? y.blok_id === blok : true) && (cozulenler || !y.cozuldu));
  const cevaplar = (id: number) => { const out: Yorum[] = []; const yigin = yorumlar.filter((y) => y.ust_id === id); while (yigin.length) { const y = yigin.shift()!; out.push(y); yigin.unshift(...yorumlar.filter((z) => z.ust_id === y.id)); } return out; };

  async function gonder(metin: string, ust: Yorum | null) {
    const t = metin.trim(); if (!t) return false;
    const { data, error } = await sb.from("not_yorumlar").insert({ sayfa_id: sayfa, blok_id: ust?.blok_id ?? blok, ust_id: ust?.id ?? null, alinti: ust ? "" : (b?.metin ?? "").slice(0, 200), metin: t, yazar: profile?.id }).select("*").single();
    if (error) { toast("Yorum gönderilemedi: " + error.message); return false; }
    setYorumlar((l) => (l.some((x) => x.id === (data as Yorum).id) ? l : [...l, data as Yorum]));
    return true;
  }
  async function coz(y: Yorum) {
    setYorumlar((l) => l.map((x) => (x.id === y.id ? { ...x, cozuldu: !y.cozuldu } : x)));
    await sb.from("not_yorumlar").update({ cozuldu: !y.cozuldu }).eq("id", y.id);
  }
  async function sil(y: Yorum) {
    setYorumlar((l) => l.filter((x) => x.id !== y.id && x.ust_id !== y.id));
    const { error } = await sb.from("not_yorumlar").delete().eq("id", y.id);
    if (error) toast("Silinemedi: " + error.message);
  }
  const satir = (y: Yorum, cevap: boolean) => {
    const p = kisi(y.yazar), ust = y.ust_id ? yorumlar.find((x) => x.id === y.ust_id) : null;
    return (
      <div className={"ny" + (cevap ? " cevap" : "")} key={y.id}>
        <div className="ny-bas">{p && <Avatar kisi={p} boyut={22} />}<b>{p?.name ?? "Biri"}</b><span className="muted">{once(y.created_at)}</span></div>
        {cevap && ust?.ust_id && <div className="muted ny-kime">{kisi(ust.yazar)?.name ?? "Biri"} adlı kişiye</div>}
        <p>{y.metin}</p>
        <CevapYaz gonder={(m) => gonder(m, y)} sil={y.yazar === profile?.id || profile?.is_admin ? () => sil(y) : undefined} coz={cevap ? undefined : () => coz(y)} cozuldu={y.cozuldu} />
      </div>
    );
  };
  return (
    <aside className="nt-panel" aria-label="Yorumlar">
      <div className="nt-panel-bas"><h2>{blok ? "Satırın yorumları" : "Bütün yorumlar"}</h2><button className="btn ghost sm" onClick={kapat}>Kapat</button></div>
      {blok && <><blockquote className="ny-alinti">{b?.metin?.slice(0, 220) || (b?.tur === "gorsel" ? "Görsel" : "Boş satır")}</blockquote>
        <YeniYorum gonder={(m) => gonder(m, null)} />
        <button className="linkbtn" onClick={() => sec(null)}>Sayfanın bütün yorumları</button></>}
      <label className="muted ny-cozulen"><input type="checkbox" checked={cozulenler} onChange={(e) => setCozulenler(e.target.checked)} /> Çözülenleri de göster</label>
      {kokler.length === 0 ? <p className="muted">{blok ? "Bu satıra henüz yorum yok." : "Açık yorum yok. Bir satırın yanındaki yorum simgesine basarak yorum yazabilirsin."}</p> : kokler.map((y) => (
        <div className={"ny-konu" + (y.cozuldu ? " cozuldu" : "")} key={y.id}>
          {!blok && y.alinti && <button className="ny-alinti linkbtn" onClick={() => sec(y.blok_id)}>“{y.alinti.slice(0, 120)}”</button>}
          {satir(y, false)}
          {cevaplar(y.id).map((c) => satir(c, true))}
        </div>
      ))}
    </aside>
  );
}

function YeniYorum({ gonder }: { gonder: (m: string) => Promise<boolean> }) {
  const [m, setM] = useState("");
  return (
    <form className="ny-yeni" onSubmit={async (e) => { e.preventDefault(); if (await gonder(m)) setM(""); }}>
      <textarea rows={2} value={m} placeholder="Yorum yaz…" aria-label="Yorum" onChange={(e) => setM(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
      <button className="btn sm" disabled={!m.trim()}>Gönder</button>
    </form>
  );
}
function CevapYaz({ gonder, sil, coz, cozuldu }: { gonder: (m: string) => Promise<boolean>; sil?: () => void; coz?: () => void; cozuldu: boolean }) {
  const [acik, setAcik] = useState(false);
  const [silOnay, setSilOnay] = useState(false);
  return (
    <div className="ny-eylem">
      {!acik && <button className="linkbtn" onClick={() => setAcik(true)}>Cevap yaz</button>}
      {coz && <button className="linkbtn" onClick={coz}>{cozuldu ? "Yeniden aç" : "Çözüldü"}</button>}
      {sil && <button className="linkbtn muted" onClick={() => (silOnay ? sil() : setSilOnay(true))}>{silOnay ? "Emin misin?" : "Sil"}</button>}
      {acik && <YeniYorum gonder={async (m) => { const ok = await gonder(m); if (ok) setAcik(false); return ok; }} />}
    </div>
  );
}

/** Kim ne katkı sağladı: blok sahipliği + geçmiş (göç 0068 not_gecmis) */
function KatkiPaneli({ sayfa, bloklar, yorumlar, kapat }: { sayfa: number; bloklar: Yerel[]; yorumlar: Yorum[]; kapat: () => void }) {
  const { veri } = useVeri();
  const [gecmis, setGecmis] = useState<Gecmis[] | null>(null);
  useEffect(() => { sb.from("not_gecmis").select("*").eq("sayfa_id", sayfa).order("zaman", { ascending: false }).limit(200).then(({ data }) => setGecmis((data ?? []) as Gecmis[])); }, [sayfa, bloklar.length, yorumlar.length]);
  const kisi = (id: string | null) => veri.profiles.find((p) => p.id === id);
  const ozet = useMemo(() => {
    const m = new Map<string, { satir: number; karakter: number; duzenleme: number; yorum: number }>();
    const al = (id: string | null) => { if (!id) return null; if (!m.has(id)) m.set(id, { satir: 0, karakter: 0, duzenleme: 0, yorum: 0 }); return m.get(id)!; };
    for (const b of bloklar) { const o = al(b.olusturan); if (o && b.kayitli) { o.satir++; o.karakter += b.metin.length; } }
    for (const y of yorumlar) { const o = al(y.yazar); if (o) o.yorum++; }
    for (const g of gecmis ?? []) if (g.islem === "blok_degistir") { const o = al(g.kim); if (o) o.duzenleme++; }
    const top = [...m.values()].reduce((s, x) => s + x.karakter, 0) || 1;
    return [...m.entries()].map(([id, x]) => ({ id, ...x, pay: Math.round((x.karakter / top) * 100) })).sort((a, b) => b.karakter - a.karakter || b.yorum - a.yorum);
  }, [bloklar, yorumlar, gecmis]);
  return (
    <aside className="nt-panel" aria-label="Katkılar">
      <div className="nt-panel-bas"><h2>Katkılar</h2><button className="btn ghost sm" onClick={kapat}>Kapat</button></div>
      {ozet.length === 0 ? <p className="muted">Henüz yazılan bir şey yok.</p> : (
        <ul className="nk-ozet">{ozet.map((x) => { const p = kisi(x.id); return (
          <li key={x.id}>{p && <Avatar kisi={p} boyut={26} />}<span><b>{p?.name ?? "Biri"}</b><span className="muted">{x.satir} satır{x.duzenleme ? ` · ${x.duzenleme} düzenleme` : ""}{x.yorum ? ` · ${x.yorum} yorum` : ""}</span></span>
            <span className="nk-pay" title="Sayfadaki metnin payı"><i style={{ width: x.pay + "%" }} /></span><span className="mono">%{x.pay}</span></li>); })}</ul>
      )}
      <h3>Geçmiş</h3>
      {gecmis === null ? <p className="muted">Yükleniyor…</p> : !gecmis.length ? <p className="muted">Kayıt yok.</p> : (
        <ol className="nk-gecmis">{gecmis.map((g) => <li key={g.id}><b>{kisi(g.kim)?.name ?? "Biri"}</b> {gecmisCumle(g)}<span className="muted">{once(g.zaman)}</span></li>)}</ol>
      )}
    </aside>
  );
}

const YorumIkon = () => <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3.5h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H7l-3 2.5v-2.5H3a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>;
