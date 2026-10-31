// Gemini anahtar havuzu (30 Ekim 2026, kullanıcı: "başka Google hesaplarından da ekleyebilelim, kimin girdiğini görüp kontrol edebilelim").
// Anahtarlar public.gemini_anahtarlari'nda (göç 0052): sırayla kullanılır; birinin günlük kotası dolunca (429) "kota_dolu" işaretlenir ve
// sıradakine geçilir; Google kotayı Pasifik gece yarısı yeniler, ertesi gün yeniden en baştan. Geçersiz anahtar atlanır (Stüdyo'da "Dene" sıfırlar).
// Sunucudaki ana anahtar (GEMINI_API_KEY) tabloda değeri boş satırdır. Göç uygulanmamışsa eski yol: ana + baglanti_anahtarlari.gemini_yedek.
// BU DOSYA Gemini kullanan her fonksiyonda AYNIDIR (fonksiyonlar ayrı yüklenir): kunye-otomatik, kunye-doldur, yarisma-bul, gorsel-odak,
// triyaj-topla, triyaj-taslak. Değişiklikte hepsine kopyalanır.
import { createClient } from "npm:@supabase/supabase-js@2";

export type Anahtar = { id: number | null; deger: string; etiket: string };
type Durum = "calisiyor" | "kota_dolu" | "gecersiz";

let sb: ReturnType<typeof createClient> | null = null;
function istemci() {
  if (sb) return sb;
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const dict = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  const key = legacy || ((dict.default ?? Object.values(dict)[0]) as string);
  sb = createClient(Deno.env.get("SUPABASE_URL")!, key);
  return sb;
}
// Kullanım sayacı (31 Ekim 2026, göç 0055): bu dosyayı yükleyen fonksiyonun bütün Gemini istekleri (generativelanguage.googleapis.com)
// fonksiyon adı + model + sonuçla public.gemini_kullanim'a sayılır. fetch sarılır; istek ve yanıt değişmez, sayım beklenmez.
const FONK = (() => { try { return new URL(import.meta.url).pathname.split("/").slice(-2, -1)[0] || "?"; } catch { return "?"; } })();
const asilFetch = globalThis.fetch;
if (!(asilFetch as unknown as { sayacli?: boolean }).sayacli) {
  const sarili = async (girdi: Request | URL | string, ayar?: RequestInit) => {
    const url = typeof girdi === "string" ? girdi : girdi instanceof URL ? girdi.href : girdi.url;
    if (!url.includes("generativelanguage.googleapis.com")) return asilFetch(girdi, ayar);
    const model = url.match(/models\/([^:/?]+)/)?.[1] ?? "?";
    const say = (sonuc: string) => { istemci().rpc("gemini_say", { p_fonk: FONK, p_model: model, p_sonuc: sonuc }).then(() => {}, () => {}); };
    try { const r = await asilFetch(girdi, ayar); say(r.ok ? "basarili" : r.status === 429 ? "kota" : "hata"); return r; }
    catch (e) { say("hata"); throw e; }
  };
  (sarili as unknown as { sayacli: boolean }).sayacli = true;
  globalThis.fetch = sarili as typeof fetch;
}
// Google'ın günlük kotası Pasifik saatiyle gece yarısı yenilenir (yaklaşık UTC-8)
const pasifikGun = (t: number) => new Date(t - 8 * 3600e3).toISOString().slice(0, 10);

/** Kullanılacak anahtarlar, sırayla: bugün kotası dolmuş olanlar sona, geçersizler hiç. */
export async function anahtarlar(): Promise<Anahtar[]> {
  const ana = Deno.env.get("GEMINI_API_KEY") ?? "";
  const { data, error } = await istemci().from("gemini_anahtarlari").select("id,deger,etiket,durum,durum_zaman").order("sira").order("id");
  if (error || !data) {
    const l: Anahtar[] = ana ? [{ id: null, deger: ana, etiket: "Ana anahtar" }] : [];
    const { data: y } = await istemci().from("baglanti_anahtarlari").select("deger").eq("ad", "gemini_yedek").maybeSingle();
    if (y?.deger) l.push({ id: null, deger: String(y.deger), etiket: "Yedek" });
    return l;
  }
  const bugun = pasifikGun(Date.now());
  const l = (data as { id: number; deger: string | null; etiket: string; durum: string; durum_zaman: string | null }[])
    .filter((r) => r.durum !== "gecersiz")
    .map((r) => ({ id: r.id, deger: r.deger || ana, etiket: r.etiket, dolu: r.durum === "kota_dolu" && !!r.durum_zaman && pasifikGun(+new Date(r.durum_zaman)) === bugun }))
    .filter((a) => a.deger);
  return [...l.filter((a) => !a.dolu), ...l.filter((a) => a.dolu)].map(({ id, deger, etiket }) => ({ id, deger, etiket }));
}

const isaretlenen = new Map<number, string>();
/** Anahtarın durumunu yazar ("calisiyor" bir çalıştırmada bir kez). Hata metninde anahtar geçmez. */
export async function isaretle(a: Anahtar | undefined, durum: Durum, hata = "") {
  if (!a || a.id == null) return;
  const anahtar = `${durum}`;
  if (durum === "calisiyor" && isaretlenen.get(a.id) === anahtar) return;
  isaretlenen.set(a.id, anahtar);
  const simdi = new Date().toISOString();
  await istemci().from("gemini_anahtarlari").update({ durum, durum_zaman: simdi, son_hata: hata ? hata.replaceAll(a.deger, "…").slice(0, 300) : null, ...(durum === "calisiyor" ? { son_kullanim: simdi } : {}) }).eq("id", a.id);
}
/** HTTP yanıtına göre anahtar hatası mı: 429 kota, 400/401/403 + "API key" geçersiz */
export function anahtarHatasi(durum: number, govde: string): Durum | null {
  if (durum === 429) return "kota_dolu";
  if ([400, 401, 403].includes(durum) && /API[_ ]?key|API_KEY_INVALID|PERMISSION_DENIED|SERVICE_DISABLED/i.test(govde)) return "gecersiz";
  return null;
}

// Tek anahtarla çalışan (sırayla model deneyen) fonksiyonlar için: o anki anahtar ve sıradakine geçiş
let liste: Anahtar[] = [], sira = 0;
export async function anahtarYukle() { liste = await anahtarlar(); sira = 0; }
export const aktif = (): Anahtar | undefined => liste[sira];
export const aktifDeger = () => liste[sira]?.deger ?? Deno.env.get("GEMINI_API_KEY") ?? "";
/** O anki anahtarın kotası doldu ya da geçersiz: işaretle, sıradakine geç; başka anahtar varsa true */
export async function sonrakine(durum: Durum, hata: string) {
  await isaretle(liste[sira], durum, hata);
  if (sira + 1 < liste.length) { sira++; return true; }
  return false;
}
