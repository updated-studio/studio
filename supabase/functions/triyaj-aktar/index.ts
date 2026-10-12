// Tek seferlik: eski "Updated Triyaj" tablosundaki işlem görmüş haberleri (alındı/yayında/pas) Haber Masası'na aktarır.
// Tablo sayfasından çağrılır; tr_settings.aktarim_anahtari ile eşleşen tek kullanımlık anahtar ister. İş bitince silinir.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const dict = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  return (dict.default ?? Object.values(dict)[0]) as string;
}
const DURUM: Record<string, string> = { "Alındı": "alindi", "Yayında": "yayinda", "Pas": "pas" };
// "2026-09-30 15:00" İstanbul saati → ISO
const zaman = (t: string) => (t ? new Date(t.replace(" ", "T") + ":00+03:00").toISOString() : null);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey());
  const { anahtar, satirlar } = await req.json().catch(() => ({}));
  const { data: ayar } = await sb.from("tr_settings").select("value").eq("key", "aktarim_anahtari").maybeSingle();
  if (!anahtar || !ayar?.value || ayar.value !== anahtar) return Response.json({ hata: "anahtar geçersiz" }, { status: 403, headers: CORS });

  const { data: kisiler } = await sb.from("profiles").select("id,name");
  const kim = (ad: string) => (kisiler ?? []).find((p) => p.name.toLocaleLowerCase("tr") === String(ad ?? "").toLocaleLowerCase("tr"))?.id ?? null;
  const kayitlar = (satirlar as Record<string, string>[]).filter((r) => DURUM[r.durum] && r.link).map((r) => {
    const durum = DURUM[r.durum];
    const t = zaman(r.tarih);
    const alan = durum === "pas" ? null : kim(r.editor);
    return {
      created_at: t ?? new Date().toISOString(), published_at: t, source_name: r.kaynak ?? "", link: r.link, title: r.baslik ?? "",
      event: r.olay ?? "", brand: r.marka ?? "", kind: r.tur ?? "", topic: r.konu ?? "",
      priority: Math.min(5, Number((r.oncelik ?? "").match(/\((\d+)\)/)?.[1] ?? 0)), model: "eski tablo", status: durum,
      taken_by: alan, taken_at: alan ? t : null, touched: true,
    };
  });
  const { error, count } = await sb.from("tr_items").upsert(kayitlar, { onConflict: "link", ignoreDuplicates: true, count: "exact" });
  await sb.from("tr_settings").delete().eq("key", "aktarim_anahtari");
  if (error) return Response.json({ hata: error.message }, { status: 500, headers: CORS });
  return Response.json({ gelen: satirlar.length, yazilan: count ?? kayitlar.length }, { headers: CORS });
});
