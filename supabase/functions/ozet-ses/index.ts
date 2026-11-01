// "Bugün 60 saniyede" sesli özeti (1 Kasım 2026, site kullanıcısı: "ses robot gibi; çok iyi, gerçek insan sesi olmalı; okuduğu şey her şey değil,
// haberin kısa özeti ve yorum, önemli noktalar; cihazın ses panelinden kontrol edilebilmeli").
// 1) Sitenin en yeni 6 haberi panelden okunur (yayında olanlar).
// 2) Ücretsiz Gemini (anahtar havuzu) sunucu metnini yazar: giriş, her haber için 2-3 cümle (ne oldu, önemli nokta, kısa yorum), kapanış.
//    Yalnız haberdeki bilgi kullanılır; uydurma yok.
// 3) Gemini'nin ses modeli metni doğal Türkçe sesle okur; ham ses (WAV) "media" kovasına yazılır: ozet/ham-<zaman>.wav + ozet/bekleyen.json.
// 4) MP3'e çevirme burada yapılmaz (fonksiyonların işlemci sınırı ~2 sn, çevirme ~4 sn): panel (site deposu apps/cms/src/lib/ozetSes.ts)
//    5 dakikada bir bekleyen sesi MP3'e çevirir, ozet/son.json'u yazar; haber listesi değişince bu fonksiyonu POST ile o çağırır.
//    Kötüye kullanıma karşı: haberleri fonksiyon kendi okur (dışarıdan metin almaz), iki üretim arası en az 20 dk, günde en çok URETIM_MAX.
import { createClient } from "npm:@supabase/supabase-js@2";
import { decodeBase64 } from "jsr:@std/encoding@1/base64";
import { anahtarHatasi, anahtarlar as geminiAnahtarlari, isaretle } from "./anahtar.ts";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const yanit = (j: unknown, status = 200, ek: Record<string, string> = {}) => Response.json(j, { status, headers: { ...CORS, ...ek } });
const PANEL = "https://panel.updated.com.tr";
const KOVA = "media";
const SON = "ozet/son.json", BEKLEYEN = "ozet/bekleyen.json", KILIT = "ozet/kilit.json";
const ARALIK = 20 * 60e3;          // iki üretim arası en az
const ESKI = 12 * 3600e3;          // haber değişmese de bu kadar sonra yenilenir
const URETIM_MAX = 8;              // günde en çok üretim (ses modeli ücretsiz kotası)
const SES = "Charon";              // Gemini hazır sesi: bilgilendirici, erkek; Türkçe okur
function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const dict = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  return (dict.default ?? Object.values(dict)[0]) as string;
}
type Sb = ReturnType<typeof createClient>;
type Haber = { id: number; baslik: string; spot: string; kisa: string; kategori: string; yol: string };
type Ozet = { tarih: string; ses: string; sure: number; metin: string; maddeler: { id: number; yol: string; baslik: string; bas: number }[]; kimlik: string; gunluk: { gun: string; sayi: number } };

function jsonOku(s: string) { try { return JSON.parse(s); } catch { const m = s.match(/\{[\s\S]*\}/); try { return m ? JSON.parse(m[0]) : null; } catch { return null; } } }
const duz = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
const gun = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10); // İstanbul

async function haberler(): Promise<Haber[]> {
  const q = new URLSearchParams({ limit: "6", depth: "1", sort: "-publishedAt", "where[_status][equals]": "published" });
  const r = await fetch(`${PANEL}/api/news?${q}`, { signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`panel ${r.status}`);
  const j = await r.json();
  return (j.docs ?? []).map((d: Record<string, unknown>) => ({
    id: d.id as number, baslik: duz(d.title), spot: duz(d.spot), kisa: duz(d.shortAnswer).slice(0, 600),
    kategori: duz((d.category as { name?: string } | null)?.name), yol: duz(d.path) || `/${duz(d.slug)}`,
  }));
}

async function oku(sb: Sb, yol: string) { const { data } = await sb.storage.from(KOVA).download(yol); return data ? jsonOku(await data.text()) : null; }
async function yaz(sb: Sb, yol: string, govde: Uint8Array | string, tur: string) {
  const { error } = await sb.storage.from(KOVA).upload(yol, typeof govde === "string" ? new TextEncoder().encode(govde) : govde, { contentType: tur, upsert: true, cacheControl: tur.startsWith("audio") ? "31536000" : "60" });
  if (error) throw new Error(`kova: ${error.message}`);
}

const SISTEM = `Sen UPDATED'in (Türkçe teknoloji haber sitesi) sesli bülten sunucususun. "Bugün 60 saniyede" için okunacak metni yazıyorsun.
Kurallar:
- Yalnız verilen haber bilgilerini kullan; rakam, tarih, fiyat uydurma. Emin olmadığın bir şeyi söyleme.
- Her haber için tam 2 cümle: birinci cümle ne oldu (en önemli rakam ya da ayrıntıyla); ikinci cümle okur için neden önemli ya da kısa, ölçülü bir yorum (pazar, rakipler, kullanıcıya etkisi). İkinci cümle birincinin tekrarı olmasın. Başlığı aynen okuma, kendi cümlenle anlat.
- Konuşma dili: doğal, sıcak, akıcı; radyo haber sunucusu gibi. Abartı, ünlem, "inanılmaz", "şok" yok.
- Sayıları okunacak biçimde yaz (ör. "yetmiş dokuz bin sekiz yüz dolar" değil "79 bin 800 dolar" yaz; ses modeli okur). Kısaltmaları açılmış ya da okunur yaz.
- Toplam 150-170 kelime (yaklaşık 60-65 saniye); verilen haberlerin hepsine yer ver. Giriş tek kısa cümle ("Günaydın" gibi saate bağlı selam yok). Kapanış tek cümle: ayrıntılar updated.com.tr'de.
- Yanıt yalnız JSON: {"giris": "...", "maddeler": [{"id": <haber id>, "metin": "..."}], "kapanis": "..."}; maddeler verilen sırayla.`;

async function geminiMetin(h: Haber[]): Promise<{ giris: string; maddeler: { id: number; metin: string }[]; kapanis: string }> {
  const istem = h.map((x, i) => `${i + 1}. [id ${x.id}] (${x.kategori}) ${x.baslik}\nÖzet: ${x.spot}${x.kisa ? `\nKısa cevap: ${x.kisa}` : ""}`).join("\n\n");
  const anahtarlar = await geminiAnahtarlari(); if (!anahtarlar.length) throw new Error("Gemini anahtarı yok");
  let son = "";
  for (const a of anahtarlar) for (const model of ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"]) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST", signal: AbortSignal.timeout(90_000), headers: { "Content-Type": "application/json", "x-goog-api-key": a.deger },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SISTEM }] }, contents: [{ role: "user", parts: [{ text: istem }] }], generationConfig: { temperature: 0.6, responseMimeType: "application/json" } }),
    }).catch(() => null);
    if (!r) { son = `${model} yanıt vermedi`; continue; }
    const g = await r.text();
    if (!r.ok) { son = `${a.etiket} · ${model} ${r.status}`; const ah = anahtarHatasi(r.status, g); if (ah === "gecersiz") { await isaretle(a, "gecersiz", son); break; } if (ah === "kota_dolu") continue; continue; }
    await isaretle(a, "calisiyor");
    const metin = (JSON.parse(g)?.candidates?.[0]?.content?.parts ?? []).filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text ?? "").join("");
    const v = jsonOku(metin);
    if (v?.giris && Array.isArray(v.maddeler) && v.maddeler.length) return v;
    son = `${model} geçersiz yanıt`;
  }
  throw new Error(`metin yazılamadı: ${son}`);
}

/** Ses modelleri: hesabın gördüğü listeden "tts" geçenler; tercih: flash (kota daha geniş), sonra pro */
async function sesModelleri(anahtar: string): Promise<string[]> {
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": anahtar }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
  const l: string[] = r?.ok ? ((await r.json()).models ?? []).map((m: { name: string }) => m.name.replace("models/", "")).filter((n: string) => /tts/i.test(n)) : [];
  const puan = (n: string) => (/flash/.test(n) ? 0 : 1) + (/preview/.test(n) ? 0.5 : 0) - (parseFloat(n.match(/(\d+(?:\.\d+)?)/)?.[1] ?? "0") / 100);
  return l.length ? l.sort((a, b) => puan(a) - puan(b)) : ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"];
}

async function sesUret(metin: string): Promise<{ pcm: Int16Array; hz: number; model: string }> {
  const anahtarlar = await geminiAnahtarlari(); if (!anahtarlar.length) throw new Error("Gemini anahtarı yok");
  const modeller = await sesModelleri(anahtarlar[0].deger);
  let son = "";
  for (const a of anahtarlar) for (const model of modeller) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST", signal: AbortSignal.timeout(150_000), headers: { "Content-Type": "application/json", "x-goog-api-key": a.deger },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `Bir teknoloji haber bülteninin sunucusu gibi oku: doğal, sıcak, akıcı ve net bir Türkçeyle; acele etmeden, cümle aralarında kısa nefeslerle.\n\n${metin}` }] }],
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: SES } } } },
      }),
    }).catch(() => null);
    if (!r) { son = `${model} yanıt vermedi`; continue; }
    const g = await r.text();
    if (!r.ok) { son = `${a.etiket} · ${model} ${r.status} ${g.slice(0, 160)}`; const ah = anahtarHatasi(r.status, g); if (ah === "gecersiz") { await isaretle(a, "gecersiz", son); break; } continue; }
    const p = (JSON.parse(g)?.candidates?.[0]?.content?.parts ?? []).find((x: { inlineData?: { data?: string } }) => x.inlineData?.data);
    if (!p) { son = `${model} ses dönmedi`; continue; }
    const hz = Number((p.inlineData.mimeType as string).match(/rate=(\d+)/)?.[1] ?? 24000);
    const b = decodeBase64(p.inlineData.data);
    return { pcm: new Int16Array(b.buffer, b.byteOffset, Math.floor(b.byteLength / 2)), hz, model };
  }
  throw new Error(`ses üretilemedi: ${son}`);
}

/** 16 bit tek kanal PCM → WAV (yalnız başlık eklenir; işlemci yükü yok) */
function wav(pcm: Int16Array, hz: number): Uint8Array {
  const veri = pcm.byteLength, out = new Uint8Array(44 + veri), d = new DataView(out.buffer)
  const yazS = (o: number, t: string) => { for (let i = 0; i < t.length; i++) out[o + i] = t.charCodeAt(i) }
  yazS(0, "RIFF"); d.setUint32(4, 36 + veri, true); yazS(8, "WAVE"); yazS(12, "fmt "); d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true)
  d.setUint32(24, hz, true); d.setUint32(28, hz * 2, true); d.setUint16(32, 2, true); d.setUint16(34, 16, true); yazS(36, "data"); d.setUint32(40, veri, true)
  out.set(new Uint8Array(pcm.buffer, pcm.byteOffset, veri), 44); return out
}

async function uret(sb: Sb, h: Haber[], onceki: Ozet | null): Promise<Ozet> {
  const m = await geminiMetin(h);
  const sira = h.map((x) => ({ x, metin: duz(m.maddeler.find((y) => Number(y.id) === x.id)?.metin) })).filter((y) => y.metin);
  const bolumler = [duz(m.giris), ...sira.map((y) => y.metin), duz(m.kapanis)];
  const metin = bolumler.join("\n\n");
  const { pcm, hz } = await sesUret(metin);
  const sure = pcm.length / hz;
  // Her haberin başladığı saniye: metin uzunluğuna orantılı (tek parça seste kesin sınır yok; kart eşlemesi için yeterli)
  const toplam = bolumler.reduce((t, b) => t + b.length, 0); let birikim = bolumler[0].length;
  const maddeler = sira.map((y) => { const bas = Math.round((birikim / toplam) * sure * 10) / 10; birikim += y.metin.length; return { id: y.x.id, yol: y.x.yol, baslik: y.x.baslik, bas }; });
  const zaman = Date.now(), yol = `ozet/ham-${zaman}.wav`;
  await yaz(sb, yol, wav(pcm, hz), "audio/wav");
  const bugun = gun();
  const o: Ozet = { tarih: new Date(zaman).toISOString(), ses: yol, sure: Math.round(sure * 10) / 10, metin, maddeler, kimlik: h.map((x) => x.id).join(","),
    gunluk: { gun: bugun, sayi: (onceki?.gunluk?.gun === bugun ? onceki.gunluk.sayi : 0) + 1 } };
  // Panel MP3'e çevirip son.json'u yazar; günlük sayaç son.json'dan devam eder
  await yaz(sb, BEKLEYEN, JSON.stringify(o), "application/json");
  return o;
}

/** Gerekirse yeniler; kilit ve günlük sınırla korunur. Sonuç: yeni özet ya da neden üretilmediği. */
async function gerekirseUret(sb: Sb, zorla = false): Promise<{ durum: string; ozet?: Ozet }> {
  const onceki = await oku(sb, SON) as Ozet | null;
  const h = await haberler(); if (!h.length) return { durum: "haber yok" };
  const kimlik = h.map((x) => x.id).join(",");
  const tazeMi = onceki && onceki.kimlik === kimlik && Date.now() - +new Date(onceki.tarih) < ESKI;
  if (tazeMi && !zorla) return { durum: "güncel" };
  const bek = await oku(sb, BEKLEYEN) as Ozet | null;
  if (bek && bek.kimlik === kimlik && !zorla) return { durum: "MP3'e çevrilmeyi bekliyor" };
  if (onceki?.gunluk?.gun === gun() && onceki.gunluk.sayi >= URETIM_MAX) return { durum: "günlük sınır" };
  const kilit = await oku(sb, KILIT) as { zaman?: number } | null;
  if (kilit?.zaman && Date.now() - kilit.zaman < (zorla ? 3 * 60e3 : ARALIK)) return { durum: "kısa süre önce denendi" };
  await yaz(sb, KILIT, JSON.stringify({ zaman: Date.now() }), "application/json");
  return { durum: "üretildi", ozet: await uret(sb, h, onceki) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey());
  const u = new URL(req.url);
  try {
    // Deneme: hesabın gördüğü ses modelleri (ad listesi, gizli bilgi yok)
    if (u.searchParams.has("modeller")) { const a = await geminiAnahtarlari(); return yanit({ modeller: a.length ? await sesModelleri(a[0].deger) : [] }); }
    if (req.method !== "POST") return yanit({ hata: "Özet panelden çağrılır; son özet media kovasında ozet/son.json" }, 405);
    const s = await gerekirseUret(sb, u.searchParams.has("zorla"));
    return yanit({ durum: s.durum, sure: s.ozet?.sure });
  } catch (e) { return yanit({ hata: (e as Error).message }, 500); }
});
