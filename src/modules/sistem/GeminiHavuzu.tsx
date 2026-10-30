// Gemini anahtar havuzu (30 Ekim 2026, kullanıcı: "başka Google hesaplarından da ekleyebilelim; kimlerin girdiğini görüp kontrol edebilelim").
// Yalnız yöneticiler: anahtar ekle (hangi Google hesabı), sırala, sil, hepsini dene. Anahtarın kendisi hiç görünmez, yalnız son 4 hanesi.
// Fonksiyonlar anahtarları bu sırayla kullanır; kotası dolan sona düşer, ertesi gün yeniden baştan (supabase/functions/*/anahtar.ts, göç 0052).
import { useCallback, useEffect, useState } from "react";
import { sb } from "../../shared/supabase";
import { useToast } from "../../shared/toast";
import { Ikon } from "../../shared/Ikon";

type Satir = { id: number; etiket: string; son4: string | null; ana: boolean; ekleyen_ad: string | null; created_at: string; sira: number; durum: string; durum_zaman: string | null; son_hata: string | null; son_kullanim: string | null };
const tarih = (s?: string | null) => (s ? new Date(s).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const DURUM: Record<string, [string, string]> = {
  calisiyor: ["Çalışıyor", "ok"], kota_dolu: ["Bugünlük kotası dolu", "wait"], gecersiz: ["Geçersiz", "rose"], bilinmiyor: ["Denenmedi", "wait"],
};
const ADIMLAR: { metin: string; link?: string }[] = [
  { metin: "Bilgisayardan Google AI Studio'nun anahtar sayfasını aç; sağ üstte anahtarı verecek Google hesabı açık olsun (listede olmayan bir hesap)", link: "https://aistudio.google.com/apikey" },
  { metin: "İlk girişse kullanım şartlarını onayla (Terms of Service kutusunu işaretle → Continue)" },
  { metin: "Sağ üstteki \"Create API key\" düğmesine bas; proje sorulursa \"Create API key in new project\" seç (kota proje başına sayılır)" },
  { metin: "Anahtar listesinde yeni anahtarın satırındaki kopyala simgesine bas (proje adını değil), aşağıya yapıştır" },
  { metin: "\"Hangi Google hesabı\" kutusuna kimin hangi hesabı olduğunu yaz (ör. Fatih – kişisel Gmail) → Ekle. Fatura (billing) ekleme" },
];

export default function GeminiHavuzu() {
  const toast = useToast();
  const [liste, setListe] = useState<Satir[] | null>(null);
  const [hata, setHata] = useState("");
  const [deger, setDeger] = useState("");
  const [etiket, setEtiket] = useState("");
  const [mesgul, setMesgul] = useState("");
  const [adimAcik, setAdimAcik] = useState(false);

  const yukle = useCallback(async () => {
    const { data, error } = await sb.rpc("gemini_liste");
    if (error) { setHata(/gemini_liste/.test(error.message) ? "Anahtar listesi henüz kurulmadı (göç 0052 bekleniyor)." : error.message); return; }
    setHata(""); setListe((data ?? []) as Satir[]);
  }, []);
  useEffect(() => { yukle(); }, [yukle]);

  async function ekle() {
    setMesgul("ekle");
    const { error } = await sb.rpc("gemini_ekle", { p_deger: deger.trim(), p_etiket: etiket.trim() });
    setMesgul("");
    if (error) { toast(error.message); return; }
    setDeger(""); setEtiket(""); toast("Anahtar eklendi; deneniyor…");
    await yukle(); await dene();
  }
  async function sil(s: Satir) {
    if (!confirm(`"${s.etiket}" anahtarı silinsin mi?`)) return;
    setMesgul("sil" + s.id);
    const { error } = await sb.rpc("gemini_sil", { p_id: s.id });
    setMesgul("");
    if (error) { toast(error.message); return; }
    toast("Anahtar silindi."); await yukle();
  }
  async function sira(s: Satir, yon: number) {
    const { error } = await sb.rpc("gemini_sira", { p_id: s.id, p_yon: yon });
    if (error) { toast(error.message); return; }
    await yukle();
  }
  async function dene() {
    setMesgul("dene");
    const { data, error } = await sb.functions.invoke("gemini-dene", { body: {} });
    setMesgul("");
    const d = data as { sonuc?: { durum: string }[]; hata?: string } | null;
    if (error || d?.hata) { toast("Denenemedi: " + (d?.hata ?? error?.message)); return; }
    const say = (k: string) => (d?.sonuc ?? []).filter((x) => x.durum === k).length;
    toast(`Denendi: ${say("calisiyor")} çalışıyor, ${say("kota_dolu")} kotası dolu, ${say("gecersiz")} geçersiz.`);
    await yukle();
  }

  return (
    <div className="panel" style={{ marginTop: 4, gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}><Ikon ad="triyaj" /> Google (Gemini) anahtarları</h3>
        <button className="btn ghost sm" disabled={!!mesgul || !liste?.length} onClick={dene}>{mesgul === "dene" ? "Deneniyor…" : "Anahtarları dene"}</button>
      </div>
      <div className="muted">Haber Masası, künye, yarışma tarama ve görsel odak Gemini'yi kullanır. Anahtarlar yukarıdan aşağı sırayla kullanılır: birinin günlük kotası dolunca sıradakine geçilir, ertesi gün yeniden baştan. Kota Google projesi başına sayılır; her anahtar ayrı bir Google hesabından olursa toplam kota artar.</div>
      {hata && <div className="msg err">{hata}</div>}
      {liste && (
        <div className="stack" style={{ gap: 0 }}>
          {liste.map((s, i) => {
            const [ad, renk] = DURUM[s.durum] ?? DURUM.bilinmiyor;
            return (
              <div key={s.id} className="row" style={{ gap: 10, padding: "10px 0", borderTop: i ? "1px solid var(--line)" : undefined, alignItems: "flex-start", flexWrap: "wrap" }}>
                <span className="mono muted" style={{ width: 22 }}>{i + 1}</span>
                <div className="stack" style={{ gap: 2, flex: 1, minWidth: 200 }}>
                  <strong>{s.etiket}</strong>
                  <span className="muted" style={{ fontSize: 13 }}>
                    {s.ana ? "Sunucuda duran ana anahtar" : <>…{s.son4} · {s.ekleyen_ad ?? "bilinmeyen"} ekledi, {tarih(s.created_at)}</>}
                    {s.son_kullanim ? ` · son kullanım ${tarih(s.son_kullanim)}` : ""}
                  </span>
                  {s.son_hata && s.durum !== "calisiyor" && <span className="muted" style={{ fontSize: 12 }}>{s.son_hata}</span>}
                </div>
                <span className={"pill " + renk} title={s.durum_zaman ? tarih(s.durum_zaman) : undefined}>{ad}</span>
                <div className="row" style={{ gap: 4 }}>
                  <button className="btn ghost sm" disabled={i === 0} onClick={() => sira(s, -1)} aria-label="Yukarı">↑</button>
                  <button className="btn ghost sm" disabled={i === liste.length - 1} onClick={() => sira(s, 1)} aria-label="Aşağı">↓</button>
                  {!s.ana && <button className="btn ghost sm" disabled={!!mesgul} onClick={() => sil(s)}>Sil</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="stack" style={{ gap: 8, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
        <strong>Anahtar ekle</strong>
        <button type="button" className="btn ghost sm" style={{ justifySelf: "start" }} onClick={() => setAdimAcik((x) => !x)}>{adimAcik ? "Adımları gizle" : "Anahtar nasıl alınır?"}</button>
        {adimAcik && <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 4 }}>
          {ADIMLAR.map((s) => <li key={s.metin}>{s.metin}{s.link && <> · <a href={s.link} target="_blank" rel="noopener noreferrer">aç</a></>}</li>)}
        </ol>}
        <label>Anahtar
          <input type="password" autoComplete="off" spellCheck={false} value={deger} onChange={(e) => setDeger(e.target.value)} placeholder="Buraya yapıştır" />
        </label>
        <label>Hangi Google hesabı
          <input value={etiket} maxLength={80} onChange={(e) => setEtiket(e.target.value)} placeholder="ör. Fatih – kişisel Gmail" />
        </label>
        <div className="row"><button className="btn sm" disabled={!!mesgul || deger.trim().length < 30 || etiket.trim().length < 2} onClick={ekle}>{mesgul === "ekle" ? "Ekleniyor…" : "Ekle"}</button></div>
      </div>
    </div>
  );
}
