// Tek seferlik: eski "Updated Triyaj" tablosundaki verileri Haber Masası'na aktarır.
// Tablo sayfasından (Google oturumu açık sekme) çağrılır; tr_settings.aktarim_anahtari ile eşleşen tek kullanımlık anahtar ister.
// tur: "adaylar" | "belirsiz" | "elenenler" | "oylar" | "bildirimler" | "bitir" (anahtarı siler)
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const dict = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  return (dict.default ?? Object.values(dict)[0]) as string;
}
type R = Record<string, string>;
const DURUM: Record<string, string> = { "Yeni": "aday", "": "aday", "Alındı": "alindi", "Yayında": "yayinda", "Pas": "pas" };
const TUR: Record<string, string> = { "aldı": "aldı", "yayında": "yayında", "pas": "pas", "bıraktı": "bıraktı", "aktar": "aktar" };
// "2026-09-30 15:00" İstanbul saati → ISO
const zaman = (t: string) => { const m = String(t ?? "").match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/); return m ? new Date(`${m[1]}T${m[2]}:00+03:00`).toISOString() : null; };
const diger = (s: string) => String(s ?? "").split("\n").map((l) => l.match(/^(.*?):\s*(https?:\/\/\S+)/)).filter(Boolean).map((m) => ({ name: m![1].trim(), link: m![2] }));
const gunOnce = (n: number) => Date.now() - n * 86_400_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey());
  const { anahtar, tur, satirlar } = await req.json().catch(() => ({}));
  const { data: ayar } = await sb.from("tr_settings").select("value").eq("key", "aktarim_anahtari").maybeSingle();
  if (!anahtar || !ayar?.value || ayar.value !== anahtar) return Response.json({ hata: "anahtar geçersiz" }, { status: 403, headers: CORS });
  if (tur === "bitir") { await sb.from("tr_settings").delete().eq("key", "aktarim_anahtari"); return Response.json({ bitti: true }, { headers: CORS }); }

  const { data: kisiler } = await sb.from("profiles").select("id,name");
  const kim = (ad: string) => (kisiler ?? []).find((p) => p.name.toLocaleLowerCase("tr") === String(ad ?? "").split(" · ")[0].trim().toLocaleLowerCase("tr"))?.id ?? null;
  const rows = (satirlar ?? []) as R[];
  const rapor: Record<string, unknown> = { gelen: rows.length };
  const eksikKisi = new Set<string>();

  if (tur === "adaylar") {
    // Var olan haberler güncellenir; olmayanlardan son 3 günün "Yeni"leri ve tüm alındı/yayında/pas haberleri eklenir.
    const linkler = rows.map((r) => r["Link"]).filter(Boolean);
    const mevcut = new Map<string, { id: number }>();
    for (let i = 0; i < linkler.length; i += 200) {
      const { data } = await sb.from("tr_items").select("id,link").in("link", linkler.slice(i, i + 200));
      (data ?? []).forEach((x: { id: number; link: string }) => mevcut.set(x.link, x));
    }
    let guncellenen = 0, eklenen = 0; const hatalar: string[] = [];
    const yeni: Record<string, unknown>[] = [];
    for (const r of rows) {
      if (!r["Link"]) continue;
      const durum = DURUM[r["Durum"] ?? ""] ?? "aday";
      const t = zaman(r["Tarih"]);
      const o = r["Öncelik"] ?? "";
      const alan = durum === "aday" ? null : kim(r["Alan Editör"]);
      if (r["Alan Editör"] && !alan && durum !== "aday") eksikKisi.add(r["Alan Editör"]);
      const aktaran = r["Aktaran"] ? kim(r["Aktaran"]) : null;
      const ortak: Record<string, unknown> = {
        origin: r["Asıl Kaynak"] ?? "", other_sources: diger(r["Diğer Kaynaklar"]),
        turkey: /Türkiye ilgisi zayıf/.test(o) ? "yok" : /global ilgi/.test(o) ? "global" : "var",
        draft_url: r["Taslak"] ?? "", translation: r["Çeviri"] ?? "", last_action: r["Güncelleme"] ?? "",
        last_dropped_by: durum === "aday" && r["Son Bırakan"] ? kim(r["Son Bırakan"]) : null,
        transfer_from: durum === "alindi" ? aktaran : null, transfer_seen: !(durum === "alindi" && aktaran && !r["Aktarım Görüldü"]),
        kind: r["Tür"] ?? "", topic: r["Konu"] ?? "", brand: r["Marka"] ?? "", event: r["Olay"] ?? "",
      };
      const m = mevcut.get(r["Link"]);
      if (m && durum === "aday") continue; // yeni sistem bu haberi zaten topladı; etiketlerine dokunma
      if (m) {
        const { error } = await sb.from("tr_items").update(ortak).eq("id", m.id);
        if (error) hatalar.push(error.message); else guncellenen++;
        continue;
      }
      if (durum === "aday" && (!t || Date.parse(t) < gunOnce(3))) continue; // eski havuz: sadece son 3 gün (saklama kuralı)
      yeni.push({
        ...ortak, created_at: t ?? new Date().toISOString(), published_at: t, source_name: String(r["İlk Yazan"] ?? "").split(" · ")[0],
        link: r["Link"], title: r["Başlık"] ?? "", model: "eski tablo", status: durum, priority: 0,
        taken_by: durum === "alindi" || durum === "yayinda" ? alan : null, taken_at: alan ? t : null, updated_by: durum === "pas" ? alan : null,
        touched: durum !== "aday",
      });
    }
    for (let i = 0; i < yeni.length; i += 200) {
      const { error, count } = await sb.from("tr_items").upsert(yeni.slice(i, i + 200), { onConflict: "link", ignoreDuplicates: true, count: "exact" });
      if (error) hatalar.push(error.message); else eklenen += count ?? 0;
    }
    // Diğer kaynak bağlantıları tekrar gelmesin
    const gor = yeni.flatMap((x) => (x.other_sources as { link: string }[]).map((o) => ({ link: o.link })));
    if (gor.length) await sb.from("tr_seen").upsert(gor, { onConflict: "link", ignoreDuplicates: true });
    Object.assign(rapor, { guncellenen, eklenen, hatalar: hatalar.slice(0, 5) });
  }

  if (tur === "belirsiz" || tur === "elenenler") {
    // Son 3 gün + (yaş fark etmeksizin) "yanlış elenmiş" işaretli olanlar (ekip geri bildirimi)
    const yeni = rows.filter((r) => r["Link"] && zaman(r["Tarih"]) && (Date.parse(zaman(r["Tarih"])!) >= gunOnce(3) || (tur === "elenenler" && !!r["Yanlış mı?"]))).map((r) => {
      const t = zaman(r["Tarih"]);
      const yanlis = tur === "elenenler" && r["Yanlış mı?"] ? kim(String(r["Yanlış mı?"]).replace(/^Evet · /, "")) : null;
      return {
        created_at: t, published_at: t, source_name: r["Kaynak"] ?? "", link: r["Link"], title: r["Başlık"] ?? "", brand: r["Marka"] ?? "",
        product: r["Ürün"] ?? "", topic: r["Konu"] ?? "", event: tur === "belirsiz" ? r["Model Notu"] ?? "" : "",
        reason: tur === "belirsiz" ? r["Model Notu"] ?? "" : r["Eleme Nedeni"] ?? "", model: "eski tablo",
        status: tur === "belirsiz" ? "belirsiz" : "elendi", turkey: tur === "belirsiz" ? "belirsiz" : "", wrong_by: yanlis, touched: !!yanlis,
      };
    });
    let eklenen = 0; const hatalar: string[] = [];
    for (let i = 0; i < yeni.length; i += 200) {
      const { error, count } = await sb.from("tr_items").upsert(yeni.slice(i, i + 200), { onConflict: "link", ignoreDuplicates: true, count: "exact" });
      if (error) hatalar.push(error.message); else eklenen += count ?? 0;
    }
    Object.assign(rapor, { son3gun: yeni.length, eklenen, hatalar });
  }

  if (tur === "oylar") {
    let eklenen = 0; const hatalar: string[] = [];
    for (const r of rows) {
      const u = kim(r["Editör"]);
      if (!u) { eksikKisi.add(r["Editör"]); continue; }
      const { data: it } = await sb.from("tr_items").select("id").eq("link", r["Link"]).maybeSingle();
      const { error } = await sb.from("tr_votes").insert({
        item_id: it?.id ?? null, user_id: u, value: Number(r["Oy"]) > 0 ? 1 : -1, note: r["Not"] ?? "",
        created_at: zaman(r["Tarih"]) ?? new Date().toISOString(), brand: r["Marka"] ?? "", topic: r["Konu"] ?? "", event: r["Olay"] ?? "", link: r["Link"] ?? "",
      });
      if (error && !/duplicate/.test(error.message)) hatalar.push(error.message); else if (!error) eklenen++;
    }
    Object.assign(rapor, { eklenen, hatalar: hatalar.slice(0, 5) });
  }

  if (tur === "bildirimler") {
    const { count } = await sb.from("tr_activity").select("id", { count: "exact", head: true }).lt("created_at", "2026-10-13T00:00:00Z");
    if ((count ?? 0) > 0) return Response.json({ hata: "Bildirimler zaten aktarılmış" }, { status: 409, headers: CORS });
    const linkler = [...new Set(rows.map((r) => r["Link"]).filter(Boolean))];
    const idler = new Map<string, number>();
    for (let i = 0; i < linkler.length; i += 200) {
      const { data } = await sb.from("tr_items").select("id,link").in("link", linkler.slice(i, i + 200));
      (data ?? []).forEach((x: { id: number; link: string }) => idler.set(x.link, x.id));
    }
    const kayit = rows.filter((r) => r["Zaman"] && TUR[r["Tür"]]).map((r) => {
      const okuyan = String(r["Okuyanlar"] ?? "").split("|").map((x) => kim(x)).filter(Boolean) as string[];
      if (r["Kimden"] && !kim(r["Kimden"])) eksikKisi.add(r["Kimden"]);
      return {
        created_at: new Date(Number(r["Zaman"])).toISOString(), kind: TUR[r["Tür"]], actor: kim(r["Kimden"]), target: r["Kime"] ? kim(r["Kime"]) : null,
        actor_name: r["Kimden"] ?? "", target_name: r["Kime"] ?? "", item_id: idler.get(r["Link"]) ?? null, title: r["Başlık"] ?? "", link: r["Link"] ?? "",
        note: r["Mesaj"] ?? "", read_by: [...new Set(okuyan)],
      };
    });
    const { error } = await sb.from("tr_activity").insert(kayit);
    Object.assign(rapor, { eklenen: error ? 0 : kayit.length, hata: error?.message });
  }

  rapor.eksikKisi = [...eksikKisi].filter(Boolean);
  return Response.json(rapor, { headers: CORS });
});
