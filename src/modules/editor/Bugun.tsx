import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../shared/auth";
import { Ikon } from "../../shared/Ikon";
import { sb } from "../../shared/supabase";
import { kalan, kisa } from "../../shared/tarih";
import { useVeri } from "../../shared/veri";
import type { Icerik } from "../site/api";
import { gorevleri } from "./gorev";
import { benimTaslaklarim, kontrolSayisi, usePanelKullanici } from "./Taslaklarim";

// Editörün ana ekranı (1 Kasım 2026, onaylı tasarım: claude.ai/artifact/MHuFqWTFFZuDfzfoiGxsNE): bugün yapılacaklar (Haber Masası'ndan
// atananlar, düzeltme bekleyen taslaklar, çekimler), taslaklar ve yayından önceki 5 kural. Yalnız kişinin işiyle ilgili olan görünür.
type MasaHaberi = { id: number; title: string; brand: string | null; status: string; taken_by: string | null; priority: number | null; created_at: string };
type Kart = { ton: "turuncu" | "mavi" | "sari"; ikon: string; ust: string; baslik: string; alt: string; eylem: string; git: string };

const KURALLAR = [
  "Başlıkta ünlem ve abartı yok; ürün adı başta.",
  "Kapak 16:9, en az 1600 px, kaynağı yazılı.",
  "En az bir birincil kaynak bağlantısı.",
  "Sızıntıysa başlık \"Sızıntı:\" ile başlar.",
  "Ürün künyesini bağla, en çok 3 etiket.",
];
const selam = () => { const s = new Date().getHours(); return s < 6 ? "İyi geceler" : s < 12 ? "Günaydın" : s < 18 ? "İyi günler" : "İyi akşamlar"; };

export default function Bugun() {
  const { profile } = useAuth();
  const { veri } = useVeri();
  const { kullanici } = usePanelKullanici();
  const git = useNavigate();
  const g = gorevleri(profile);
  const [masa, setMasa] = useState<MasaHaberi[] | null>(null);
  const [taslak, setTaslak] = useState<Icerik[] | null>(null);
  const uid = profile!.id;

  useEffect(() => {
    if (!g.includes("haber")) { setMasa([]); return; }
    sb.from("tr_items").select("id,title,brand,status,taken_by,priority,created_at")
      .or(`and(status.eq.alindi,taken_by.eq.${uid}),and(status.eq.aday,suggested_editor.eq.${uid})`)
      .order("created_at", { ascending: false }).limit(6)
      .then(({ data }) => setMasa((data ?? []) as MasaHaberi[]));
  }, [uid, g.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (kullanici) benimTaslaklarim(kullanici).then(setTaslak).catch(() => setTaslak([])); else if (kullanici === null) setTaslak([]); }, [kullanici]);

  const cekimler = g.includes("video") ? veri.jobs.filter((j) => j.assignee === uid && j.status !== "bitti").sort((a, b) => a.due.localeCompare(b.due)) : [];
  const kartlar: Kart[] = [
    ...(masa ?? []).filter((h) => h.status === "alindi").map((h): Kart => ({ ton: "turuncu", ikon: "masa", ust: "SENDE · HABER MASASI", baslik: h.title, alt: [h.brand, h.priority ? `öncelik ${h.priority}` : ""].filter(Boolean).join(" · "), eylem: "Haber Masası'nda aç", git: "/masa" })),
    ...(taslak ?? []).filter((x) => x.workflow?.state === "taslak" && kontrolSayisi(x) > 0 && kontrolSayisi(x) < 10).slice(0, 2).map((x): Kart => ({ ton: "sari", ikon: "uyari", ust: `YARIM · ${kontrolSayisi(x)}/10 KONTROL`, baslik: x.title || "Başlıksız taslak", alt: "Eksik kontrol maddelerini tamamla", eylem: "Devam et", git: `/yaz/${x.id}` })),
    ...(taslak ?? []).filter((x) => x.workflow?.state === "incelemede").slice(0, 2).map((x): Kart => ({ ton: "mavi", ikon: "check", ust: "YAYIN ONAYINDA", baslik: x.title || "Başlıksız", alt: "Yayın yönetmeni bakıyor", eylem: "Durumu gör", git: `/yaz/${x.id}` })),
    ...cekimler.slice(0, 3).map((j): Kart => { const k = kalan(j.due); return { ton: k <= 0 ? "turuncu" : "mavi", ikon: "kamera", ust: `ÇEKİM · ${k < 0 ? `${-k} GÜN GECİKTİ` : k === 0 ? "BUGÜN" : k === 1 ? "YARIN" : kisa(j.due).toLocaleUpperCase("tr-TR")}`, baslik: j.title, alt: [j.type, j.brand].filter(Boolean).join(" · "), eylem: "Kontrol listesini aç", git: `/cekim/${j.id}` }; }),
  ];
  const adaylar = (masa ?? []).filter((h) => h.status === "aday");
  const yuklendi = masa !== null && (taslak !== null || !g.includes("haber"));

  return (
    <div className="ed-sayfa">
      <div className="ed-bas">
        <div>
          <span className="ed-ust">{new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" }).toLocaleUpperCase("tr-TR")}</span>
          <h1>{selam()}, {profile!.name.split(" ")[0]}</h1>
        </div>
        <div className="ed-hizli">
          {g.includes("haber") && <button className="btn ed-ana" onClick={() => git("/yaz/yeni")}><Ikon ad="plus" />Yeni haber yaz</button>}
          {g.includes("video") && <button className="btn ed-ana ed-turuncu" onClick={() => git("/cekim")}><Ikon ad="kamera" />Çekime başla</button>}
        </div>
      </div>

      <section aria-labelledby="ed-yap">
        <h2 id="ed-yap" className="ed-baslik">BUGÜN YAPILACAKLAR</h2>
        {!yuklendi ? <div className="muted">Yükleniyor…</div> : !kartlar.length ? (
          <div className="ed-bos"><Ikon ad="check" /><b>Bekleyen işin yok</b><span>{g.includes("haber") ? "Haber Masası'ndan bir haber alabilir ya da kendi haberini yazabilirsin." : "Yeni bir çekim atandığında burada görünür."}</span></div>
        ) : (
          <div className="ed-kartlar">
            {kartlar.map((k, i) => (
              <button key={i} className={`ed-kart ${k.ton}`} onClick={() => git(k.git)}>
                <span className="ed-kart-ust"><Ikon ad={k.ikon} />{k.ust}</span>
                <b>{k.baslik}</b>
                {k.alt && <span className="muted">{k.alt}</span>}
                <span className="ed-kart-eylem">{k.eylem}<Ikon ad="ileri" /></span>
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="ed-iki">
        {g.includes("haber") && <section aria-labelledby="ed-tas" className="ed-blok">
          <div className="ed-blok-bas"><h2 id="ed-tas" className="ed-baslik">TASLAKLARIM</h2><button className="ed-bag" onClick={() => git("/taslaklarim")}>Tümü</button></div>
          {!taslak ? <div className="muted">Yükleniyor…</div> : !taslak.length ? <div className="muted ed-ic">Taslağın yok.</div> : (
            <div className="ed-liste">
              {taslak.slice(0, 5).map((x) => (
                <button key={x.id} className="ed-satir" onClick={() => git(`/yaz/${x.id}`)}>
                  <span className="ed-satir-m"><b>{x.title || "Başlıksız taslak"}</b></span>
                  <span className={kontrolSayisi(x) >= 10 ? "ed-sayi tamam" : "ed-sayi"}>{kontrolSayisi(x)}/10</span>
                  <Ikon ad="ileri" />
                </button>
              ))}
            </div>
          )}
          {adaylar.length > 0 && <>
            <div className="ed-blok-bas" style={{ marginTop: 18 }}><h2 className="ed-baslik">SANA ÖNERİLEN HABERLER</h2><button className="ed-bag" onClick={() => git("/masa")}>Haber Masası</button></div>
            <div className="ed-liste">{adaylar.slice(0, 4).map((h) => <button key={h.id} className="ed-satir" onClick={() => git("/masa")}><span className="ed-satir-m"><b>{h.title}</b><span className="muted">{h.brand}</span></span><Ikon ad="ileri" /></button>)}</div>
          </>}
        </section>}
        {g.includes("haber") ? (
          <aside aria-labelledby="ed-kur" className="ed-blok">
            <h2 id="ed-kur" className="ed-baslik">YAYINDAN ÖNCE · 5 ALTIN KURAL</h2>
            <ol className="ed-kurallar">{KURALLAR.map((k, i) => <li key={i}><span>{i + 1}</span>{k}</li>)}</ol>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
