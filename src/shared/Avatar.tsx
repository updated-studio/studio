import type { Profile } from "./supabase";

// Kişi görseli: profil fotoğrafı varsa o, yoksa adın baş harfi. Her yerde bu bileşen kullanılır.
export function Avatar({ kisi, boyut = 40 }: { kisi: Pick<Profile, "name" | "avatar_url">; boyut?: number }) {
  const stil = { width: boyut, height: boyut, fontSize: Math.round(boyut * 0.42) };
  return kisi.avatar_url
    ? <img className="avatar" style={stil} src={kisi.avatar_url} alt={kisi.name} loading="lazy" />
    : <div className="avatar" style={stil} aria-hidden="true">{(kisi.name || "?")[0].toLocaleUpperCase("tr")}</div>;
}
