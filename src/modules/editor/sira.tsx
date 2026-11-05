import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCanli } from "../../shared/canli";
import { Avatar } from "../../shared/Avatar";
import * as api from "../site/api";
import type { Icerik, PanelKullanici } from "../site/api";
import { degerlendir } from "../haber-masasi/oncelik";
import { isDurumu, useIs, useSaat } from "../haber-masasi/ortak";
import { useMasa, type Haber, type Taslak } from "../haber-masasi/veri";

// Yayın sırası (6 Kasım 2026, onaylı tasarım claude.ai/artifact/AHBvDdvU7gVcXunmXsZet2; kullanıcı: "aldım falan işaretlemeye gerek yok,
// editöre pek bir şey bırakmıyoruz"): okunmayı bekleyen her taslak tek listede, sahipsiz. Kaynaklar birleşir:
//   1) sitedeki haber taslakları (sistemin yazıp gönderdikleri, istekle yazılanlar, "Yeni yaz"la elle açılanlar),
//   2) Haber Masası'nda yazılmış ama siteye henüz gitmemiş taslaklar,
//   3) şu an yazılmakta olan (ya da yazımı hata vermiş) haberler.
// Her satırda haberin yolu (Seçildi → Yazılıyor → Taslak hazır → Yayında) ve sıradaki adımın düğmesi durur. Masam'da son 48 saatin
// taslakları görünür (haber eskir); eskiler Taslaklar'da "eskiyenler" altında kalır.
export const ADIMLAR = ["Seçildi", "Yazılıyor", "Taslak hazır", "Yayında"] as const;
export const TAZE_SAAT = 48;

export type Satir = {
  anahtar: string;
  baslik: string;
  alt: string; // "Sistem yazdı · Android Authority · 3 kaynak"
  adim: 0 | 1 | 2 | 3;
  durum: string; // adımın adı ya da özel durum ("Yazılamadı")
  zaman: number; // bu duruma geldiği an (ms)
  puan: number | null;
  siteId?: number;
  taslakId?: number;
  haber?: Haber;
  sorun?: string;
  benim: boolean; // bu hesabın yazdığı ya da istediği
};

const sure = (ms: number) => {
  const dk = Math.max(1, Math.round((Date.now() - ms) / 6e4));
  return dk < 60 ? `${dk} dk` : dk < 1440 ? `${Math.round(dk / 60)} sa` : `${Math.round(dk / 1440)} gün`;
};
const kaynakSayisi = (h?: Haber) => (h ? 1 + (h.other_sources?.length ?? 0) : 0);

async function siteTaslaklari(): Promise<Icerik[]> {
  // Panel sayfa başına 25 kayıt verir; bekleyen taslak sayısı bunu aşar (5 Kasım: 65). En çok 6 sayfa (150 taslak).
  const hepsi: Icerik[] = [];
  for (let s = 1; s <= 6; s++) {
    const r = await api.liste("news", "taslak", "", s, { sirala: "-createdAt" });
    hepsi.push(...r.docs);
    if (!(r as { hasNextPage?: boolean }).hasNextPage) break;
  }
  return hepsi.filter((x) => (x.workflow?.state ?? "taslak") === "taslak");
}

/** Bekleyen her taslak ve yazılmakta olan haber, sıralı. `kullanici` yoksa (site yetkisi yok) yalnız Haber Masası kayıtları. */
export function useSira(kullanici: PanelKullanici | null | undefined, benId: string) {
  const { v, yukleniyor } = useMasa();
  const [site, setSite] = useState<Icerik[] | null>(null);
  const [hata, setHata] = useState("");
  useSaat(30_000);
  const yenile = useCallback(() => {
    if (kullanici === undefined) return;
    if (!kullanici) { setSite([]); return; }
    siteTaslaklari().then((l) => { setSite(l); setHata(""); }).catch((e) => { setSite([]); setHata((e as Error).message); });
  }, [kullanici]);
  useEffect(yenile, [yenile]);
  // Haber Masası'nda bir taslak siteye gidince (site_id dolunca) liste tazelenir
  const gonderilen = v.taslaklar.filter((t) => t.site_id).length;
  useEffect(() => { if (site !== null) yenile(); }, [gonderilen]); // eslint-disable-line react-hooks/exhaustive-deps

  const satirlar = useMemo(() => {
    if (site === null || yukleniyor) return null;
    const haberOf = new Map(v.haberler.map((h) => [h.id, h]));
    const taslakOf = new Map(v.taslaklar.filter((t) => t.site_id).map((t) => [t.site_id as number, t]));
    const benimYazar = kullanici ? (typeof kullanici.author === "object" ? kullanici.author?.id : kullanici.author) ?? null : null;
    const yazarId = (x: Icerik) => { const a = (x as { author?: number | { id: number } | null }).author; return typeof a === "object" ? a?.id ?? null : a ?? null; };
    const kim = (t?: Taslak) => (!t ? "Elle yazıldı" : t.auto ? "Sistem yazdı" : "İstekle yazıldı");
    const altYazi = (t: Taslak | undefined, h: Haber | undefined) => [kim(t), h?.source_name, h ? `${kaynakSayisi(h)} kaynak` : ""].filter(Boolean).join(" · ");
    const l: Satir[] = [];
    for (const x of site) {
      const t = taslakOf.get(x.id), h = t?.item_id ? haberOf.get(t.item_id) : undefined;
      l.push({ anahtar: "s" + x.id, baslik: x.title || "Başlıksız taslak", alt: altYazi(t, h), adim: 2, durum: ADIMLAR[2],
        zaman: Date.parse((x as { createdAt?: string }).createdAt ?? x.updatedAt), puan: h ? degerlendir(h).puan : null, siteId: x.id, taslakId: t?.id, haber: h,
        benim: (!!benimYazar && yazarId(x) === benimYazar) || (!!t && !t.auto && t.author === benId) });
    }
    // Yazılmış ama siteye gitmemiş taslaklar (panel reddetti, gönderim bekliyor ya da henüz gönderilmedi)
    for (const t of v.taslaklar) {
      if (t.site_id || t.deneme) continue;
      const h = t.item_id ? haberOf.get(t.item_id) : undefined;
      l.push({ anahtar: "t" + t.id, baslik: t.title || "Başlıksız taslak", alt: altYazi(t, h), adim: 2, durum: ADIMLAR[2], zaman: Date.parse(t.created_at),
        puan: h ? degerlendir(h).puan : null, taslakId: t.id, haber: h, sorun: t.site_hata ? "Siteye gönderilemedi" : "Siteye gönderilmedi", benim: !t.auto && t.author === benId });
    }
    // Yazılmakta olanlar ve yazımı hata verenler (son 6 saat)
    for (const h of v.haberler) {
      const d = isDurumu(h);
      if (h.work_state !== "taslak" && d !== "hata") continue;
      if (Date.now() - Date.parse(h.updated_at) > 6 * 3600e3) continue;
      const hataMi = d === "hata" || d === "takildi";
      l.push({ anahtar: "h" + h.id, baslik: h.event || h.title, alt: [h.auto_draft_at ? "Sistem seçti" : "İstekle yazılıyor", h.source_name, `${kaynakSayisi(h)} kaynak`].filter(Boolean).join(" · "),
        adim: 1, durum: hataMi ? "Yazılamadı" : ADIMLAR[1], zaman: Date.parse(h.updated_at), puan: degerlendir(h).puan, haber: h, sorun: hataMi ? (h.work_error || "Yazım yarıda kaldı").slice(0, 90) : undefined,
        benim: h.updated_by === benId });
    }
    // Sıra: hazır taslaklar önce (öncelik puanı yüksek olan üstte, puansız elle yazılanlar yeniden eskiye), sonra yazılmakta olanlar
    return l.sort((a, b) => b.adim - a.adim || (b.puan ?? -1) - (a.puan ?? -1) || b.zaman - a.zaman);
  }, [site, yukleniyor, v.haberler, v.taslaklar, kullanici, benId]);

  const taze = useMemo(() => satirlar?.filter((s) => s.adim < 2 || Date.now() - s.zaman < TAZE_SAAT * 3600e3) ?? null, [satirlar]);
  return { satirlar, taze, hata, yenile };
}

/** Haberin yolu: dolu adımlar mavi, sıradaki adım çerçeveli */
export function Yol({ adim, sorun }: { adim: number; sorun?: boolean }) {
  return (
    <span className={"mas-yol" + (sorun ? " sorun" : "")} role="img" aria-label={`Yol: ${ADIMLAR.map((a, i) => (i < adim ? `${a} tamam` : i === adim ? `${a} sırada` : a)).join(", ")}`}>
      {ADIMLAR.map((_, i) => <span key={i} className="mas-yol-p">{i > 0 && <em className={i <= adim ? "d" : ""} />}<i className={i < adim ? "d" : i === adim ? "s" : ""} /></span>)}
    </span>
  );
}

/** Sıra tablosu: Masam'da ilk satırlar, Taslaklar'da tamamı */
export function SiraTablo({ satirlar, ilkAna = true }: { satirlar: Satir[]; ilkAna?: boolean }) {
  const git = useNavigate();
  const canli = useCanli();
  const is_ = useIs();
  const ac = (s: Satir) => { if (s.siteId) git(`/yaz/${s.siteId}`); else if (s.taslakId) git(`/haber-masasi?b=taslak&t=${s.taslakId}`); };
  return (
    <table className="mas-tablo">
      <thead><tr><th>Haber</th><th>Yol</th><th className="mas-sag mas-genis">Öncelik</th><th className="mas-sag"><span className="mas-gizli">Sıradaki adım</span></th></tr></thead>
      <tbody>
        {satirlar.map((s, i) => {
          const okuyan = s.siteId ? canli.kisiler.filter((k) => k.id !== canli.ben && k.nesne?.tur === "haber" && k.nesne.id === s.siteId) : [];
          return (
            <tr key={s.anahtar}>
              <td><div className="mas-ad"><b>{s.baslik}</b><span>{s.alt}</span></div></td>
              <td className="mas-yolh"><div className="mas-yol-et"><Yol adim={s.adim} sorun={!!s.sorun && s.adim === 1} /><span><b>{s.durum}</b> · {sure(s.zaman)}{s.sorun ? ` · ${s.sorun}` : ""}</span></div></td>
              <td className="mas-sag mas-genis">{s.puan !== null ? <span className="mas-puan">{Math.round(s.puan)}<small>/100</small></span> : <span className="mas-puan"><small>puansız</small></span>}</td>
              <td className="mas-sag">
                {okuyan.length ? (
                  <button type="button" className="mas-okuyan" onClick={() => ac(s)} title="Yine de aç">
                    <Avatar kisi={{ name: okuyan[0].ad, email: okuyan[0].email, avatar_url: okuyan[0].foto, emoji: null }} boyut={20} />{okuyan[0].ad.split(" ")[0]} {okuyan[0].nesne?.eylem === "düzenliyor" ? "düzenliyor" : "okuyor"}
                  </button>
                ) : s.adim === 1 ? (
                  s.sorun && s.haber ? <button className="btn sm ghost" onClick={() => is_(s.haber!, "taslak")}>Yeniden dene</button> : <button className="btn sm ghost" disabled>Bekle</button>
                ) : (
                  <button className={"btn sm" + (ilkAna && i === 0 ? "" : " ghost")} onClick={() => ac(s)}>{s.siteId ? "Oku ve yayınla" : "Aç"}</button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
