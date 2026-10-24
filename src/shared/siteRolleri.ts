// Site panelindeki (Payload) roller: site deposu apps/cms/src/access/roles.ts ROLES ile aynı (veritabanı: 0025, profiles/invites.site_rol).
// Kişinin site rolü yalnız Stüdyo'dan (Ekip → Yönetim) değişir; panel hesabı ilk Site isteğinde bu rolle kendiliğinden açılır.
export const SITE_ROLLERI: [string, string][] = [
  ["editor", "Editör"],
  ["yayin-yonetmeni", "Yayın yönetmeni"],
  ["admin", "Yönetici"],
  ["video", "Video"],
  ["tasarimci", "Tasarımcı"],
  ["sosyal", "Sosyal medya"],
  ["yok", "Sitede yetkisi yok"],
];
export const siteRolAdi = (r?: string | null) => SITE_ROLLERI.find(([k]) => k === r)?.[1] ?? "Sitede yetkisi yok";
