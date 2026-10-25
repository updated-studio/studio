// Yeni bildirimleri ve davetleri e-posta olarak gönderir. Tetikleyici: notifications tablosuna ekleme (0003),
// invites tablosuna ekleme ya da davet_gonderildi'nin boşaltılması (0025, "Daveti yeniden gönder").
// Gizli bilgi (Supabase > Edge Functions > Secrets; koda yazılmaz):
//   MAIL_FROM: gönderen adres. SMTP_PASSWORD: o adresin şifresi (yoksa eski GMAIL_APP_PASSWORD kullanılır).
//   SMTP_HOST / SMTP_PORT: posta sunucusu (yoksa Gmail: smtp.gmail.com / 465). Kurumsal adres (Natro) için
//   SMTP_HOST'a Natro'nun verdiği sunucu (genelde mail.<alan adı>) yazılır. SMTP_USER yoksa MAIL_FROM kullanılır.
// Not: Supabase panelinde "Verify JWT" kapalı; fonksiyon girdi almaz, sadece bekleyen bildirimleri işler.
// Telefon bildirimi (25 Ekim 2026, göç 0034): yeni bildirimler kayıtlı cihazlara web push ile de gider (e-posta tercihinden bağımsız).
//   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT: sunucuda functions.env; açık anahtar Stüdyo'da src/shared/telefonBildirimi.ts.
import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.14";
import webpush from "npm:web-push@3.6.7";

// Gönderen adres Supabase Secrets'taki MAIL_FROM'dan okunur (depo açık olduğu için kodda yazılmaz).
const FROM = Deno.env.get("MAIL_FROM") ?? "";
const PANEL = "https://studio.updated.com.tr/"; // eski adres (updated-studio.github.io/studio) buraya yönlenir

function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const dict = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  return (dict.default ?? Object.values(dict)[0]) as string;
}

/** Gönderilmemiş davetler: kişiye Stüdyo'nun kayıt bağlantısı gider (e-posta önceden doldurulmuş). Önce işaretlenir, iki kez gitmez. */
// deno-lint-ignore no-explicit-any
async function davetleriGonder(sb: any, tx: any) {
  const { data: rows, error } = await sb.from("invites")
    .update({ davet_gonderildi: new Date().toISOString() }).is("davet_gonderildi", null)
    .select("email,name");
  if (error) return { gonderilen: 0, hata: error.message };
  let gonderilen = 0;
  const errs: string[] = [];
  for (const d of rows ?? []) {
    const link = PANEL + "?davet=" + encodeURIComponent(d.email);
    const text = "Merhaba " + d.name + ",\n\nUpdated ekibine davet edildin. Stüdyo, ekibin haber masası, içerik ve site yönetimi ekranı.\n\n" +
      "Hesabını açmak için bu bağlantıya tıkla ve kendi şifreni belirle:\n" + link +
      "\n\nArdından e-postana gelecek onay bağlantısına tıklaman yeterli.";
    try {
      await tx.sendMail({ from: '"Updated Stüdyo" <' + FROM + ">", to: d.email, subject: "Updated Stüdyo'ya davet edildin", text });
      gonderilen++;
    } catch (e) {
      errs.push(d.email + ": " + String(e)); // yeniden denemek: Ekip → Yönetim'de "Daveti yeniden gönder" (burada boşaltmak tetikleyiciyle döngü olur)
    }
  }
  return { gonderilen, errs };
}

/** Gönderilmemiş bildirimleri kişinin kayıtlı cihazlarına yollar; artık geçerli olmayan cihaz kaydı silinir. */
// deno-lint-ignore no-explicit-any
async function telefonaGonder(sb: any) {
  const pub = Deno.env.get("VAPID_PUBLIC_KEY"), priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!pub || !priv) return { gonderilen: 0, not: "VAPID anahtarı yok" };
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:studio@updated.com.tr", pub, priv);
  const { data: rows, error } = await sb.from("notifications")
    .update({ pushed: true }).eq("pushed", false)
    .select("id,user_id,body,created_at,link");
  if (error) return { gonderilen: 0, hata: error.message };
  const taze = (rows ?? []).filter((r: { created_at: string }) => Date.now() - new Date(r.created_at).getTime() < 60 * 60 * 1000);
  if (!taze.length) return { gonderilen: 0 };
  const { data: cihazlar } = await sb.from("push_abonelikleri").select("id,user_id,endpoint,p256dh,auth")
    .in("user_id", [...new Set(taze.map((r: { user_id: string }) => r.user_id))]);
  let gonderilen = 0;
  for (const c of cihazlar ?? []) {
    for (const r of taze.filter((x: { user_id: string }) => x.user_id === c.user_id)) {
      const govde = JSON.stringify({ baslik: "Updated Stüdyo", metin: r.body.slice(0, 180), link: r.link || "", id: r.id });
      try {
        await webpush.sendNotification({ endpoint: c.endpoint, keys: { p256dh: c.p256dh, auth: c.auth } }, govde, { TTL: 6 * 3600 });
        gonderilen++;
      } catch (e) {
        const kod = (e as { statusCode?: number }).statusCode;
        if (kod === 404 || kod === 410) { await sb.from("push_abonelikleri").delete().eq("id", c.id); break; }
        console.error("push", kod, String(e).slice(0, 200));
      }
    }
  }
  return { gonderilen };
}

Deno.serve(async () => {
  const telefon = await telefonaGonder(createClient(Deno.env.get("SUPABASE_URL")!, serviceKey())).catch((e) => ({ gonderilen: 0, hata: String(e) }));
  if (telefon.gonderilen || "hata" in telefon) console.log(JSON.stringify({ telefon }));
  const pass = Deno.env.get("SMTP_PASSWORD") ?? Deno.env.get("GMAIL_APP_PASSWORD");
  if (!pass || !FROM) return new Response("SMTP_PASSWORD (ya da GMAIL_APP_PASSWORD) veya MAIL_FROM yok", { status: 500 });
  const host = Deno.env.get("SMTP_HOST") || "smtp.gmail.com";
  const port = Number(Deno.env.get("SMTP_PORT") || 465);
  const user = Deno.env.get("SMTP_USER") || FROM;
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey());
  const tx = nodemailer.createTransport({
    host, port, secure: port === 465,
    auth: { user, pass: host === "smtp.gmail.com" ? pass.replace(/\s/g, "") : pass },
  });
  const davet = await davetleriGonder(sb, tx);
  if (davet.gonderilen || davet.errs?.length || davet.hata) console.log(JSON.stringify({ davet }));

  const { data: rows, error } = await sb.from("notifications")
    .update({ emailed: true }).eq("emailed", false)
    .select("id,user_id,body,created_at,link");
  if (error) return new Response(error.message, { status: 500 });

  const hourAgo = Date.now() - 60 * 60 * 1000;
  const fresh = (rows ?? []).filter((r) => new Date(r.created_at).getTime() >= hourAgo);
  if (!fresh.length) return Response.json({ sent: 0, davet });

  const ids = [...new Set(fresh.map((r) => r.user_id))];
  const { data: people } = await sb.from("profiles")
    .select("id,email,name,notify_email").in("id", ids);

  let sent = 0;
  const errs: string[] = [];
  for (const p of people ?? []) {
    if (!p.notify_email) continue;
    const mine = fresh.filter((r) => r.user_id === p.id);
    const subject = mine.length === 1 ? mine[0].body.slice(0, 90) : mine.length + " yeni bildirim";
    const text = "Merhaba " + p.name + ",\n\n" + mine.map((r) => "- " + r.body + (r.link ? "\n  Aç: " + PANEL + r.link : "")).join("\n") +
      "\n\nPanel: " + PANEL + "\n\nBu e-postalari Studyo'da Ekip > Profilim bolumunden kapatabilirsin.";
    try {
      await tx.sendMail({ from: '"Updated Stüdyo" <' + FROM + ">", to: p.email, subject: "Updated: " + subject, text });
      sent++;
    } catch (e) {
      errs.push(String(e));
    }
  }
  console.log(JSON.stringify({ sent, errs, davet }));
  return Response.json({ sent, errs, davet });
});
