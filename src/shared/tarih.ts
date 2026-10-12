// Ortak tarih yardımcıları. Tarihler veritabanında "YYYY-MM-DD" metni olarak durur.
export const BUGUN = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
export const GUN = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

export const ekle = (n: number, b: Date = BUGUN) => { const d = new Date(b); d.setDate(d.getDate() + n); return d; };
export const iso = (d: Date) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
export const D = (s: string) => new Date(s + "T00:00");
export const kalan = (s: string) => Math.round((D(s).getTime() - BUGUN.getTime()) / 864e5);
export const kisa = (s: string) => D(s).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
export const kisaY = (s: string) => D(s).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: D(s).getFullYear() !== BUGUN.getFullYear() ? "numeric" : undefined });
export const uzun = (s: string) => D(s).toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" });
export const pazartesi = (d: Date = BUGUN) => ekle(-((d.getDay() + 6) % 7), d);
export const BU_HAFTA = [0, 1, 2, 3, 4, 5, 6].map((i) => ekle(i, pazartesi()));
export const saatMetni = (t: string) => (/^\d\d:\d\d$/.test(t || "") ? t + " sonrası" : t || "");
