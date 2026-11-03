// UPDATED künye görseli (Cloudflare Worker) — 27 Ekim 2026
// Ürün fotoğrafının arka planını siler (Cloudflare Images "segment", BiRefNet modeli), boş kenarları kırpar ve
// ürünü 1600×900 şeffaf tuvalin ortasına yerleştirir. Yalnız UPDATED Stüdyo çağırır (x-anahtar başlığı = ANAHTAR sırrı).
// Kurulum: Stüdyo → Bağlantı anahtarları → Cloudflare. Gerekenler: "IMAGES" adlı Images bağlaması, "ANAHTAR" adlı sır.
// Ücretsiz planda ayda 5.000 işlem; sınır aşılırsa ücret çıkmaz, istek reddedilir.
// 2 Kasım 2026: "/uret" yolu: haber için uygun görsel bulunamazsa Workers AI ile görsel üretir (FLUX.2 [klein] 9B, olmazsa FLUX.1 [schnell]), 1600×900'e kırpar.
// Gereken: "AI" adlı Workers AI bağlaması. Ücretsiz planda günlük ücretsiz kullanım payı var; aşılırsa istek reddedilir.
export default {
  async fetch(req, env) {
    if (req.method !== "POST") return new Response("UPDATED görsel programı çalışıyor.", { status: 200 });
    if (!env.ANAHTAR || req.headers.get("x-anahtar") !== env.ANAHTAR) return new Response("yetkisiz", { status: 401 });
    if (new URL(req.url).pathname === "/uret") return uret(req, env);
    if (!env.IMAGES) return new Response("IMAGES bağlaması eksik", { status: 500 });
    if (Number(req.headers.get("content-length") || 0) > 20e6) return new Response("görsel 20 MB üstü", { status: 413 });
    try {
      // 1) Arka planı sil
      const kes = await env.IMAGES.input(req.body).transform({ segment: "foreground" }).output({ format: "image/png" });
      // 2) Şeffaf kenarları kırp, ürünü 1360×720 alana sığdır, kenar boşluğuyla 1600×900 tuvale tamamla
      const son = await env.IMAGES.input(kes.image())
        .transform({ trim: { border: { color: "rgba(0,0,0,0)", tolerance: 20, keep: 0 } } })
        .transform({ width: 1360, height: 720, fit: "pad", background: "rgba(0,0,0,0)" })
        .transform({ border: { color: "rgba(0,0,0,0)", top: 90, bottom: 90, left: 120, right: 120 } })
        .output({ format: "image/webp", quality: 90 });
      return son.response();
    } catch (e) {
      return new Response("işlenemedi: " + String(e && e.message || e).slice(0, 200), { status: 422 });
    }
  },
};

async function uret(req, env) {
  if (!env.AI) return new Response("AI bağlaması eksik", { status: 500 });
  try {
    const { istem } = await req.json();
    const prompt = String(istem || "").slice(0, 2000);
    let b64 = "", hata = "";
    // Önce FLUX.2 [klein] 9B (daha gerçekçi); günlük ücretsiz pay biterse ya da hata verirse FLUX.1 [schnell]
    try {
      const form = new FormData();
      form.append("prompt", prompt); form.append("width", "1600"); form.append("height", "896");
      const fr = new Response(form);
      const r = await env.AI.run("@cf/black-forest-labs/flux-2-klein-9b", { multipart: { body: fr.body, contentType: fr.headers.get("content-type") } });
      b64 = r && r.image || "";
    } catch (e) { hata = String(e && e.message || e).slice(0, 120); }
    if (!b64) { const r = await env.AI.run("@cf/black-forest-labs/flux-1-schnell", { prompt, steps: 8 }); b64 = r && r.image || ""; }
    if (!b64) return new Response("üretilemedi: " + hata, { status: 422 });
    const ham = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    if (!env.IMAGES) return new Response(ham, { headers: { "content-type": "image/jpeg" } });
    const son = await env.IMAGES.input(new Blob([ham]).stream()).transform({ width: 1600, height: 900, fit: "cover" }).output({ format: "image/webp", quality: 88 });
    return son.response();
  } catch (e) {
    return new Response("üretilemedi: " + String(e && e.message || e).slice(0, 200), { status: 422 });
  }
}
