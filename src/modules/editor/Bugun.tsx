import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../shared/auth";
import { Ikon } from "../../shared/Ikon";
import { sb } from "../../shared/supabase";
import type { Icerik } from "../site/api";
import { kontrolSayisi, taslaklar as taslakGetir, usePanelKullanici } from "./Taslaklarim";

// Ana ekran (1 Kasım 2026, onaylı tasarım claude.ai/artifact/MHuFqWTFFZuDfzfoiGxsNE). Kişiye atama ve sahiplik yok (kullanıcı: "kişilere
// atamayı durduralım, sahiplikleri kaldır"): herkes aynı şeyi görür. Haber yaz / çekime başla, yarım kalan ve onay bekleyen taslaklar,
// Haber Masası'ndaki yeni haber sayısı, yayından önceki 5 kural.
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
  const { kullanici } = usePanelKullanici();
  const git = useNavigate();
  const [taslak, setTaslak] = useState<Icerik[] | null>(null);
  const [yeniHaber, setYeniHaber] = useState<number | null>(null);

  useEffect(() => {
    sb.from("tr_items").select("id", { count: "exact", head: true }).eq("status", "aday").gte("created_at", new Date(Date.now() - 864e5).toISOString())
      .then(({ count }) => setYeniHaber(count ?? 0));
  }, []);
  useEffect(() => { if (kullanici) taslakGetir().then(setTaslak).catch(() => setTaslak([])); else if (kullanici === null) setTaslak([]); }, [kullanici]);

  const kartlar: Kart[] = [
    ...(yeniHaber ? [{ ton: "turuncu" as const, ikon: "masa", ust: "HABER MASASI · SON 24 SAAT", baslik: `${yeniHaber} yeni haber bekliyor`, alt: "Önemlileri seçip taslağa çevir", eylem: "Haber Masası'nı aç", git: "/haber-masasi" }] : []),
    ...(taslak ?? []).filter((x) => x.workflow?.state === "taslak" && kontrolSayisi(x) > 0 && kontrolSayisi(x) < 10).slice(0, 3).map((x): Kart => ({ ton: "sari", ikon: "uyari", ust: `YARIM · ${kontrolSayisi(x)}/10 KONTROL`, baslik: x.title || "Başlıksız taslak", alt: "Eksik kontrol maddelerini tamamla", eylem: "Devam et", git: `/yaz/${x.id}` })),
    ...(taslak ?? []).filter((x) => x.workflow?.state === "incelemede").slice(0, 3).map((x): Kart => ({ ton: "mavi", ikon: "check", ust: "YAYIN ONAYINDA", baslik: x.title || "Başlıksız", alt: "Yayın yönetmeni bakıyor", eylem: "Aç", git: `/yaz/${x.id}` })),
  ];
  const yuklendi = taslak !== null && yeniHaber !== null;

  return (
    <div className="ed-sayfa">
      <div className="ed-bas">
        <div>
          <span className="ed-ust">{new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" }).toLocaleUpperCase("tr-TR")}</span>
          <h1>{selam()}, {profile!.name.split(" ")[0]}</h1>
        </div>
        <div className="ed-hizli">
          <button className="btn ed-ana" onClick={() => git("/yaz/yeni")}><Ikon ad="plus" />Yeni haber yaz</button>
          <button className="btn ed-ana ed-turuncu" onClick={() => git("/cekim")}><Ikon ad="kamera" />Çekime başla</button>
        </div>
      </div>

      <section aria-labelledby="ed-yap">
        <h2 id="ed-yap" className="ed-baslik">BUGÜN YAPILACAKLAR</h2>
        {!yuklendi ? <div className="muted">Yükleniyor…</div> : !kartlar.length ? (
          <div className="ed-bos"><Ikon ad="check" /><b>Bekleyen iş yok</b><span>Haber Masası'ndan bir haber seçebilir ya da kendi haberini yazabilirsin.</span></div>
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
        <section aria-labelledby="ed-tas" className="ed-blok">
          <div className="ed-blok-bas"><h2 id="ed-tas" className="ed-baslik">SON TASLAKLAR</h2><button className="ed-bag" onClick={() => git("/taslaklar")}>Tümü</button></div>
          {!taslak ? <div className="muted">Yükleniyor…</div> : !taslak.length ? <div className="muted ed-ic">Bekleyen taslak yok.</div> : (
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
        </section>
        <aside aria-labelledby="ed-kur" className="ed-blok">
          <h2 id="ed-kur" className="ed-baslik">YAYINDAN ÖNCE · 5 ALTIN KURAL</h2>
          <ol className="ed-kurallar">{KURALLAR.map((k, i) => <li key={i}><span>{i + 1}</span>{k}</li>)}</ol>
        </aside>
      </div>
    </div>
  );
}
