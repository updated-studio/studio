// Yeni bildirimleri e-posta olarak gönderir. Tetikleyici: notifications tablosuna ekleme (0003).
// Gizli bilgi: GMAIL_APP_PASSWORD ve MAIL_FROM (Supabase > Edge Functions > Secrets). Koda yazılmaz.
// Not: Supabase'de şu an çalışan sürümde gönderen adres koda gömülü; bir sonraki yayında bu sürüme geçilecek.
// Not: Supabase panelinde "Verify JWT" kapalı; fonksiyon girdi almaz, sadece bekleyen bildirimleri işler.
import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.14";

// Gönderen adres Supabase Secrets'taki MAIL_FROM'dan okunur (depo açık olduğu için kodda yazılmaz).
const FROM = Deno.env.get("MAIL_FROM") ?? "";
const PANEL = "https://eneshsahin.github.io/updated-panel/ekip/";

function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const dict = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  return (dict.default ?? Object.values(dict)[0]) as string;
}

Deno.serve(async () => {
  const pass = Deno.env.get("GMAIL_APP_PASSWORD");
  if (!pass) return new Response("GMAIL_APP_PASSWORD yok", { status: 500 });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey());

  const { data: rows, error } = await sb.from("notifications")
    .update({ emailed: true }).eq("emailed", false)
    .select("id,user_id,body,created_at");
  if (error) return new Response(error.message, { status: 500 });

  const hourAgo = Date.now() - 60 * 60 * 1000;
  const fresh = (rows ?? []).filter((r) => new Date(r.created_at).getTime() >= hourAgo);
  if (!fresh.length) return Response.json({ sent: 0 });

  const ids = [...new Set(fresh.map((r) => r.user_id))];
  const { data: people } = await sb.from("profiles")
    .select("id,email,name,notify_email").in("id", ids);

  const tx = nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true,
    auth: { user: FROM, pass: pass.replace(/\s/g, "") },
  });

  let sent = 0;
  const errs: string[] = [];
  for (const p of people ?? []) {
    if (!p.notify_email) continue;
    const mine = fresh.filter((r) => r.user_id === p.id);
    const subject = mine.length === 1 ? mine[0].body.slice(0, 90) : mine.length + " yeni bildirim";
    const text = "Merhaba " + p.name + ",\n\n" + mine.map((r) => "- " + r.body).join("\n") +
      "\n\nPanel: " + PANEL + "\n\nBu e-postalari panelde Ekip > Profilim bolumunden kapatabilirsin.";
    try {
      await tx.sendMail({ from: '"Updated Ekip Paneli" <' + FROM + ">", to: p.email, subject: "Updated: " + subject, text });
      sent++;
    } catch (e) {
      errs.push(String(e));
    }
  }
  console.log(JSON.stringify({ sent, errs }));
  return Response.json({ sent, errs });
});
