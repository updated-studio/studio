import { useEffect, useState } from "react";
import type { Profile } from "./supabase";

// Kişi görseli. Sıra: Stüdyo'ya yüklenen fotoğraf → Gravatar (WordPress'in kullandığı servis) → adın baş harfi.
// Köşede seçtiyse emoji rozeti; emoji metin olarak saklanır, cihazın kendi setiyle çizilir.
type Kisi = Pick<Profile, "name" | "email" | "avatar_url" | "emoji">;

const gravatar = new Map<string, Promise<string | null>>();
function gravatarAdresi(email: string): Promise<string | null> {
  const e = email.trim().toLowerCase();
  if (!gravatar.has(e)) {
    gravatar.set(e, crypto.subtle.digest("SHA-256", new TextEncoder().encode(e)).then((b) => {
      const hash = [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
      const url = `https://gravatar.com/avatar/${hash}?s=256&d=404`;
      // d=404: Gravatar'da fotoğraf yoksa resim gelmez, baş harf gösterilir.
      return new Promise<string | null>((ok) => { const i = new Image(); i.onload = () => ok(url); i.onerror = () => ok(null); i.src = url; });
    }).catch(() => null));
  }
  return gravatar.get(e)!;
}

export function Avatar({ kisi, boyut = 40 }: { kisi: Kisi; boyut?: number }) {
  const [grav, setGrav] = useState<string | null>(null);
  useEffect(() => {
    let iptal = false;
    if (!kisi.avatar_url && kisi.email) gravatarAdresi(kisi.email).then((u) => { if (!iptal) setGrav(u); });
    return () => { iptal = true; };
  }, [kisi.avatar_url, kisi.email]);

  const src = kisi.avatar_url || grav;
  const stil = { width: boyut, height: boyut, fontSize: Math.round(boyut * 0.42) };
  const gorsel = src
    ? <img className="avatar" style={stil} src={src} alt={kisi.name} loading="lazy" />
    : <div className="avatar" style={stil} aria-hidden="true">{(kisi.name || "?")[0].toLocaleUpperCase("tr")}</div>;
  if (!kisi.emoji) return gorsel;
  const e = Math.max(16, Math.round(boyut * 0.42));
  return (
    <span className="avatarkutu">
      {gorsel}
      <span className="emoji" style={{ width: e, height: e, fontSize: Math.round(e * 0.72) }} aria-label={"Durum: " + kisi.emoji}>{kisi.emoji}</span>
    </span>
  );
}

// Tek bir emoji mi? (harf, rakam, yazı kabul edilmez)
export function tekEmojiMi(s: string): boolean {
  const t = s.trim();
  if (!t || /[\p{L}\p{N}#*\s]/u.test(t.replace(/\p{Extended_Pictographic}/gu, ""))) return false;
  if (!/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(t)) return false;
  return [...new Intl.Segmenter("tr", { granularity: "grapheme" }).segment(t)].length === 1;
}
