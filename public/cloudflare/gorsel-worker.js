// UPDATED künye görseli (Cloudflare Worker) — 27 Ekim 2026
// Ürün fotoğrafının arka planını siler (Cloudflare Images "segment", BiRefNet modeli), boş kenarları kırpar ve
// ürünü 1600×900 şeffaf tuvalin ortasına yerleştirir. Yalnız UPDATED Stüdyo çağırır (x-anahtar başlığı = ANAHTAR sırrı).
// Kurulum: Stüdyo → Bağlantı anahtarları → Cloudflare. Gerekenler: "IMAGES" adlı Images bağlaması, "ANAHTAR" adlı sır.
// Ücretsiz planda ayda 5.000 işlem; sınır aşılırsa ücret çıkmaz, istek reddedilir.
export default {
  async fetch(req, env) {
    if (req.method !== "POST") return new Response("UPDATED görsel programı çalışıyor.", { status: 200 });
    if (!env.ANAHTAR || req.headers.get("x-anahtar") !== env.ANAHTAR) return new Response("yetkisiz", { status: 401 });
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
