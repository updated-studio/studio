import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useAuth } from "../../shared/auth";
import { Avatar, tekEmojiMi } from "../../shared/Avatar";
import { Ikon } from "../../shared/Ikon";
import { sb } from "../../shared/supabase";
import { hataMetni, useToast } from "../../shared/toast";
import { useVeri } from "../../shared/veri";

// Fotoğrafı tarayıcıda 512 px kare WebP'ye küçültür: yükleme hızlı, depolama az (50+ kişide de ucuz).
async function kucult(dosya: File): Promise<Blob> {
  const img = await createImageBitmap(dosya);
  const k = Math.min(img.width, img.height), b = 512;
  const c = document.createElement("canvas");
  c.width = b; c.height = b;
  c.getContext("2d")!.drawImage(img, (img.width - k) / 2, (img.height - k) / 2, k, k, 0, 0, b, b);
  return new Promise((ok, red) => c.toBlob((x) => (x ? ok(x) : red(new Error("Görsel işlenemedi"))), "image/webp", 0.85));
}

// Hazır seçenekler (hayvanlar); dışında tek bir emoji yazılabilir, yazı kabul edilmez (Mac: Ctrl+Cmd+Boşluk).
const EMOJILER = ["🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🐶", "🐱", "🐰", "🐹", "🦉", "🐧", "🦅", "🐢", "🐙", "🦈", "🐬", "🦄", "🐝", "🦋"];

export default function Profil() {
  const { profile, reloadProfile } = useAuth();
  const { yenile } = useVeri();
  const toast = useToast();
  const ben = profile!;
  const dosyaGir = useRef<HTMLInputElement>(null);
  const [yukleniyor, setYukleniyor] = useState(false);

  async function fotoSec(e: ChangeEvent<HTMLInputElement>) {
    const dosya = e.target.files?.[0];
    e.target.value = "";
    if (!dosya) return;
    if (!dosya.type.startsWith("image/")) return toast("Lütfen bir görsel seç.");
    setYukleniyor(true);
    try {
      const yol = `${ben.id}/${Date.now()}.webp`;
      const up = await sb.storage.from("avatars").upload(yol, await kucult(dosya), { contentType: "image/webp" });
      if (up.error) throw up.error;
      const url = sb.storage.from("avatars").getPublicUrl(yol).data.publicUrl;
      const r = await sb.from("profiles").update({ avatar_url: url }).eq("id", ben.id);
      if (r.error) throw r.error;
      await eskileriSil(yol);
      toast("Profil fotoğrafı güncellendi."); await reloadProfile(); yenile();
    } catch (err) {
      toast(hataMetni(err as { message: string }));
    } finally { setYukleniyor(false); }
  }

  async function eskileriSil(kalan?: string) {
    const { data } = await sb.storage.from("avatars").list(ben.id);
    const sil = (data ?? []).map((f) => `${ben.id}/${f.name}`).filter((y) => y !== kalan);
    if (sil.length) await sb.storage.from("avatars").remove(sil);
  }

  async function fotoKaldir() {
    const r = await sb.from("profiles").update({ avatar_url: null }).eq("id", ben.id);
    if (r.error) return toast(hataMetni(r.error));
    await eskileriSil(); toast("Fotoğraf kaldırıldı."); await reloadProfile(); yenile();
  }

  async function emojiKaydet(emoji: string | null) {
    const r = await sb.from("profiles").update({ emoji }).eq("id", ben.id);
    if (r.error) return toast(hataMetni(r.error));
    await reloadProfile(); yenile();
  }

  async function kaydet(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await sb.from("profiles").update({
      name: String(f.get("ad")).trim(), role: String(f.get("rol")).trim(),
      org: String(f.get("yer")).trim(), interests: String(f.get("ilgi")).trim(), notify_email: f.get("eposta") === "1",
    }).eq("id", ben.id);
    if (r.error) return toast(hataMetni(r.error));
    toast("Kaydedildi."); reloadProfile(); yenile();
  }

  return (
    <>
      <h2>Profilim</h2>
      <div className="panel">
        <div className="row" style={{ gap: 16 }}>
          <Avatar kisi={ben} boyut={88} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="bname" style={{ fontSize: 20 }}>{ben.name}</div>
            <div className="muted">{ben.email}</div>
            <div className="row">
              <button className="btn sm" disabled={yukleniyor} onClick={() => dosyaGir.current?.click()}>
                <Ikon ad="foto" />{yukleniyor ? "Yükleniyor…" : ben.avatar_url ? "Fotoğrafı değiştir" : "Fotoğraf ekle"}
              </button>
              {ben.avatar_url && <button className="btn ghost sm" onClick={fotoKaldir}>Kaldır</button>}
            </div>
            {!ben.avatar_url && <div className="muted" style={{ fontSize: 13 }}>Fotoğraf eklemezsen <a href="https://gravatar.com" target="_blank" rel="noreferrer">Gravatar</a>'daki fotoğrafın (WordPress'in kullandığı) görünür.</div>}
            <input ref={dosyaGir} type="file" accept="image/*" hidden onChange={fotoSec} />
          </div>
        </div>
      </div>
      <div className="panel">
        <div className="row"><h3 style={{ margin: 0, marginRight: "auto" }}>Emoji</h3>
          {ben.emoji && <button className="btn ghost sm" onClick={() => emojiKaydet(null)}>Kaldır</button>}</div>
        <div className="muted">Fotoğrafının köşesinde görünür. Listede yoksa kutuya tek bir emoji yazabilirsin.</div>
        <div className="emojiler" role="group" aria-label="Emoji seç">
          {EMOJILER.map((em) => <button key={em} aria-pressed={ben.emoji === em} onClick={() => emojiKaydet(ben.emoji === em ? null : em)}>{em}</button>)}
        </div>
        <form className="row" onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget, v = String(new FormData(f).get("em")).trim();
          if (!tekEmojiMi(v)) return toast("Sadece tek bir emoji yazabilirsin.");
          emojiKaydet(v); f.reset(); }}>
          <input name="em" type="text" maxLength={16} placeholder="Başka bir emoji (Mac: Ctrl+Cmd+Boşluk)" inputMode="text" aria-label="Kendi emojin" style={{ flex: "1 1 160px", width: "auto" }} />
          <button className="btn ghost sm">Kullan</button>
        </form>
      </div>
      <div className="panel">
        <form className="grid" onSubmit={kaydet} key={ben.id + ben.name}>
          <label htmlFor="p-ad">Ad<input id="p-ad" name="ad" type="text" required maxLength={40} defaultValue={ben.name} /></label>
          <label htmlFor="p-rol">Rol<input id="p-rol" name="rol" type="text" maxLength={40} placeholder="Editör, lens uzmanı…" defaultValue={ben.role} /></label>
          <label htmlFor="p-yer">Çalıştığın yer<input id="p-yer" name="yer" type="text" maxLength={40} placeholder="GZT, Sigma…" defaultValue={ben.org} /></label>
          <label htmlFor="p-ilgi">İlgi alanları (Haber Masası sana uygun haberleri önerir)<input id="p-ilgi" name="ilgi" type="text" maxLength={200} placeholder="kamera, drone, yapay zekâ…" defaultValue={ben.interests ?? ""} /></label>
          <label htmlFor="p-eposta">E-posta bildirimi
            <select id="p-eposta" name="eposta" defaultValue={ben.notify_email ? "1" : ""}><option value="1">Açık</option><option value="">Kapalı</option></select>
          </label>
          <button className="btn">Kaydet</button>
        </form>
      </div>
    </>
  );
}
