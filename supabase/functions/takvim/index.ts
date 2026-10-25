// Takvim aboneliği (25 Ekim 2026, göç 0035): GET /functions/v1/takvim?k=<kişinin gizli anahtarı> → iCalendar (.ics).
// İçerik: etkinlikler/lansmanlar (herkese), kişinin bitmemiş işleri (teslim günü), ekipman geliş/iade günleri.
// Anahtar Stüdyo → Takvim'de üretilir/yenilenir; yenilenince eski bağlantı çalışmaz. Giriş gerektirmez (takvim uygulamaları başlık gönderemez).
import { createClient } from "npm:@supabase/supabase-js@2";

function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const dict = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  return (dict.default ?? Object.values(dict)[0]) as string;
}
const kac = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const gun = (d: string) => d.replace(/-/g, "");
const ertesi = (d: string) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10).replace(/-/g, ""); };
// RFC 5545: satır 75 bayttan uzunsa katlanır
function katla(satir: string) {
  const b = new TextEncoder().encode(satir);
  if (b.length <= 74) return satir;
  const out: string[] = []; let parca = "";
  for (const ch of satir) { if (new TextEncoder().encode(parca + ch).length > 73) { out.push(parca); parca = " " + ch; } else parca += ch; }
  out.push(parca); return out.join("\r\n");
}

Deno.serve(async (req) => {
  const k = new URL(req.url).searchParams.get("k") ?? "";
  if (!/^[0-9a-f]{36}$/.test(k)) return new Response("Bağlantı geçersiz", { status: 404 });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey());
  const { data: a } = await sb.from("takvim_anahtarlari").select("user_id").eq("anahtar", k).maybeSingle();
  if (!a) return new Response("Bağlantı geçersiz ya da yenilenmiş", { status: 404 });
  const [ev, is, ek] = await Promise.all([
    sb.from("events").select("id,title,brand,start_day,end_day,certainty,note"),
    sb.from("jobs").select("id,brand,title,due,status,type").eq("assignee", a.user_id).neq("status", "bitti"),
    sb.from("gear").select("id,name,day,status").not("day", "is", null),
  ]);
  const damga = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const olay = (uid: string, bas: string, bit: string | null, baslik: string, aciklama = "") => [
    "BEGIN:VEVENT", `UID:${uid}@studio.updated.com.tr`, `DTSTAMP:${damga}`,
    `DTSTART;VALUE=DATE:${gun(bas)}`, `DTEND;VALUE=DATE:${ertesi(bit || bas)}`,
    `SUMMARY:${kac(baslik)}`, ...(aciklama ? [`DESCRIPTION:${kac(aciklama)}`] : []), "END:VEVENT",
  ];
  const satirlar = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Updated Stüdyo//Takvim//TR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:Updated Stüdyo", "X-WR-TIMEZONE:Europe/Istanbul", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"];
  for (const e of ev.data ?? []) satirlar.push(...olay(`etkinlik-${e.id}`, e.start_day, e.end_day, (e.brand ? e.brand + " · " : "") + e.title + (e.certainty === "tahmini" ? " (tahmini)" : ""), e.note || ""));
  for (const j of is.data ?? []) satirlar.push(...olay(`is-${j.id}`, j.due, null, `Teslim: ${j.brand ? j.brand + " " : ""}${j.title}`, `İş türü: ${j.type}. Stüdyo → Ekip → İşler`));
  for (const g of ek.data ?? []) satirlar.push(...olay(`ekipman-${g.id}`, g.day, null, (g.status === "yolda" ? "Geliyor: " : "İade: ") + g.name));
  satirlar.push("END:VCALENDAR");
  return new Response(satirlar.map(katla).join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store", "Content-Disposition": 'inline; filename="updated-studyo.ics"' },
  });
});
