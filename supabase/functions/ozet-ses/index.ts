// "Bugün 60 saniyede" sesli özeti (1 Kasım 2026, site kullanıcısı: "ses robot gibi; çok iyi, gerçek insan sesi olmalı; okuduğu şey her şey değil,
// haberin kısa özeti ve yorum, önemli noktalar; cihazın ses panelinden kontrol edilebilmeli").
// 1) Sitenin en yeni 6 haberi panelden okunur (yayında olanlar).
// 2) Ücretsiz Gemini (anahtar havuzu) sunucu metnini yazar: giriş, her haber için 2-3 cümle (ne oldu, önemli nokta, kısa yorum), kapanış.
//    Yalnız haberdeki bilgi kullanılır; uydurma yok.
// 3) Gemini'nin ses modeli metni doğal Türkçe sesle okur; ses MP3'e çevrilir (64 kbps), "icerik" kovasına yazılır (ozet/).
// 4) GET herkese açık: son özeti (ses adresi, metin, her haberin başladığı saniye) verir. Özet eskidiyse (haber listesi değişti ya da 12 saat
//    geçti) arka planda yenisi üretilir; iki üretim arasında en az 20 dakika, günde en çok URETIM_MAX üretim (ücretsiz kota).
//    Site (ana sayfa) bu GET'i okur; zamanlayıcı ya da göç gerekmez. Gizli bilgi dönmez.
import { createClient } from "npm:@supabase/supabase-js@2";
import { Mp3Encoder } from "npm:@breezystack/lamejs@1.2.7";
import { anahtarHatasi, anahtarlar as geminiAnahtarlari, isaretle } from "./anahtar.ts";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const yanit = (j: unknown, status = 200, ek: Record<string, string> = {}) => Response.json(j, { status, headers: { ...CORS, ...ek } });
const PANEL = "https://panel.updated.com.tr";
const ADRES = Deno.env.get("PUBLIC_SUPABASE_URL") || PANEL;
const KOVA = "icerik";
const SON = "ozet/son.json", KILIT = "ozet/kilit.json";
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
- Her haber için 2-3 kısa cümle: ne oldu, en önemli nokta (okur için neden önemli), kısa ve ölçülü bir yorum. Başlığı aynen okuma, kendi cümlenle anlat.
- Konuşma dili: doğal, sıcak, akıcı; radyo haber sunucusu gibi. Abartı, ünlem, "inanılmaz", "şok" yok.
- Sayıları okunacak biçimde yaz (ör. "yetmiş dokuz bin sekiz yüz dolar" değil "79 bin 800 dolar" yaz; ses modeli okur). Kısaltmaları açılmış ya da okunur yaz.
- Toplam 170-210 kelime (yaklaşık 70-80 saniye). Giriş tek kısa cümle ("Günaydın" gibi saate bağlı selam yok). Kapanış tek cümle: ayrıntılar updated.com.tr'de.
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
    const b = Uint8Array.from(atob(p.inlineData.data), (c) => c.charCodeAt(0));
    return { pcm: new Int16Array(b.buffer, b.byteOffset, Math.floor(b.byteLength / 2)), hz, model };
  }
  throw new Error(`ses üretilemedi: ${son}`);
}

function mp3(pcm: Int16Array, hz: number): Uint8Array {
  const enc = new Mp3Encoder(1, hz, 64), parca: Uint8Array[] = []
  for (let i = 0; i < pcm.length; i += 1152) { const b = enc.encodeBuffer(pcm.subarray(i, i + 1152)); if (b.length) parca.push(new Uint8Array(b)); }
  const s = enc.flush(); if (s.length) parca.push(new Uint8Array(s));
  const out = new Uint8Array(parca.reduce((t, x) => t + x.length, 0)); let o = 0; for (const x of parca) { out.set(x, o); o += x.length; }
  return out;
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
  const zaman = Date.now(), yol = `ozet/${zaman}.mp3`;
  await yaz(sb, yol, mp3(pcm, hz), "audio/mpeg");
  const bugun = gun();
  const o: Ozet = { tarih: new Date(zaman).toISOString(), ses: `${ADRES}/storage/v1/object/public/${KOVA}/${yol}`, sure: Math.round(sure * 10) / 10, metin, maddeler, kimlik: h.map((x) => x.id).join(","),
    gunluk: { gun: bugun, sayi: (onceki?.gunluk?.gun === bugun ? onceki.gunluk.sayi : 0) + 1 } };
  await yaz(sb, SON, JSON.stringify(o), "application/json");
  // Eski ses dosyaları: son 3 kalır
  const { data: l } = await sb.storage.from(KOVA).list("ozet", { limit: 100, sortBy: { column: "name", order: "desc" } });
  const eski = (l ?? []).filter((f) => f.name.endsWith(".mp3")).slice(3).map((f) => `ozet/${f.name}`);
  if (eski.length) await sb.storage.from(KOVA).remove(eski);
  return o;
}

/** Gerekirse yeniler; kilit ve günlük sınırla korunur. Sonuç: yeni özet ya da neden üretilmediği. */
async function gerekirseUret(sb: Sb, zorla = false): Promise<{ durum: string; ozet?: Ozet }> {
  const onceki = await oku(sb, SON) as Ozet | null;
  const h = await haberler(); if (!h.length) return { durum: "haber yok" };
  const kimlik = h.map((x) => x.id).join(",");
  const tazeMi = onceki && onceki.kimlik === kimlik && Date.now() - +new Date(onceki.tarih) < ESKI;
  if (tazeMi && !zorla) return { durum: "güncel" };
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
    if (req.method === "POST" || u.searchParams.has("simdi")) return yanit(await gerekirseUret(sb, req.method === "POST"));
    const o = await oku(sb, SON) as Ozet | null;
    // Okur isteğini bekletmeden arka planda tazele
    const bg = gerekirseUret(sb).catch((e) => console.log("ozet-ses:", (e as Error).message));
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil?.(bg);
    if (!o) return yanit({ ozet: null }, 200, { "Cache-Control": "no-store" });
    const { gunluk: _g, kimlik: _k, ...acik } = o;
    return yanit({ ozet: acik }, 200, { "Cache-Control": "public, max-age=60" });
  } catch (e) { return yanit({ hata: (e as Error).message }, 500); }
});
