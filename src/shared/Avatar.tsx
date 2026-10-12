import type { Profile } from "./supabase";

// Kişi görseli: profil fotoğrafı varsa o, yoksa adın baş harfi; seçtiyse köşede emoji rozeti.
// Emoji metin olarak saklanır ve cihazın kendi emoji setiyle çizilir (iPhone/Mac'te Apple emojileri).
export function Avatar({ kisi, boyut = 40 }: { kisi: Pick<Profile, "name" | "avatar_url" | "emoji">; boyut?: number }) {
  const stil = { width: boyut, height: boyut, fontSize: Math.round(boyut * 0.42) };
  const gorsel = kisi.avatar_url
    ? <img className="avatar" style={stil} src={kisi.avatar_url} alt={kisi.name} loading="lazy" />
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
