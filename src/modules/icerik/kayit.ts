// Tasarımların bulutta (Supabase) saklanması: tablo icerik_projeler, görseller 'icerik' deposu (migration 0019).
import { sb } from "../../shared/supabase";
import type { FormatId, Gorsel, GorselKey, Proje, SablonId, Slayt, StilId } from "./motor";

export type KayitSatiri = { id: string; ad: string; kapak: string | null; olusturan: string | null; guncelleyen: string | null; updated_at: string; veri: { format: FormatId; stil: StilId; slaytlar: Slayt[] } };

const ANAHTARLAR: GorselKey[] = ["gorsel", "gorselA", "gorselB"];

async function dataUrlBlob(u: string) { return (await fetch(u)).blob(); }
async function ozet(b: Blob) {
  const h = await crypto.subtle.digest("SHA-1", await b.arrayBuffer());
  return [...new Uint8Array(h)].slice(0, 10).map((x) => x.toString(16).padStart(2, "0")).join("");
}

// Yerel (data:) görselleri depoya yükler, slaytlarda adresleriyle değiştirir.
async function gorselleriYukle(projeId: string, slaytlar: Slayt[]): Promise<Slayt[]> {
  const yuklenen = new Map<string, string>();
  const out: Slayt[] = [];
  for (const s of slaytlar) {
    const icerik = { ...s.icerik };
    for (const k of ANAHTARLAR) {
      const g = icerik[k] as Gorsel | undefined;
      if (!g || !g.src.startsWith("data:")) continue;
      let url = yuklenen.get(g.src);
      if (!url) {
        const b = await dataUrlBlob(g.src);
        const uz = b.type === "image/png" ? "png" : b.type === "image/webp" ? "webp" : "jpg";
        const yol = `${projeId}/${await ozet(b)}.${uz}`;
        const { error } = await sb.storage.from("icerik").upload(yol, b, { contentType: b.type, upsert: true });
        if (error) throw error;
        url = sb.storage.from("icerik").getPublicUrl(yol).data.publicUrl;
        yuklenen.set(g.src, url);
      }
      icerik[k] = { ...g, src: url };
    }
    out.push({ ...s, icerik });
  }
  return out;
}

export async function kaydet(p: Proje, kapak: Blob | null): Promise<Proje> {
  const id = p.id ?? crypto.randomUUID();
  const slaytlar = await gorselleriYukle(id, p.slaytlar);
  let kapakUrl = p.kapak ?? null;
  if (kapak) {
    const yol = `${id}/kapak.jpg`;
    const { error } = await sb.storage.from("icerik").upload(yol, kapak, { contentType: "image/jpeg", upsert: true });
    if (!error) kapakUrl = sb.storage.from("icerik").getPublicUrl(yol).data.publicUrl + "?v=" + Date.now();
  }
  const veri = { format: p.format, stil: p.stil, slaytlar };
  const { data, error } = p.id
    ? await sb.from("icerik_projeler").update({ ad: p.ad, veri, kapak: kapakUrl }).eq("id", id).select("updated_at").single()
    : await sb.from("icerik_projeler").insert({ id, ad: p.ad, veri, kapak: kapakUrl }).select("updated_at").single();
  if (error) throw error;
  return { ...p, id, slaytlar, kapak: kapakUrl, updated_at: data.updated_at };
}

export async function listele(): Promise<KayitSatiri[]> {
  const { data, error } = await sb.from("icerik_projeler").select("id,ad,kapak,olusturan,guncelleyen,updated_at,veri").order("updated_at", { ascending: false }).limit(200);
  if (error) throw error;
  return data as KayitSatiri[];
}

export async function sil(id: string) {
  const { error } = await sb.from("icerik_projeler").delete().eq("id", id);
  if (error) throw error;
  const { data } = await sb.storage.from("icerik").list(id);
  if (data?.length) await sb.storage.from("icerik").remove(data.map((f) => `${id}/${f.name}`));
}

export const satirdanProje = (r: KayitSatiri): Proje => ({ id: r.id, ad: r.ad, kapak: r.kapak, updated_at: r.updated_at, ...r.veri });

// ---------- Hazır düzenler (migration 0021): sadece yerleşim, içerik değil ----------
export type Duzen = { id: string; ad: string; sablon: SablonId; serbest: Slayt["serbest"]; olusturan: string | null; created_at: string };
export async function duzenler(sablon: SablonId): Promise<Duzen[]> {
  const { data, error } = await sb.from("icerik_duzenler").select("id,ad,sablon,serbest,olusturan,created_at").eq("sablon", sablon).order("created_at", { ascending: false }).limit(50);
  if (error) throw error;
  return data as Duzen[];
}
export async function duzenKaydet(ad: string, sablon: SablonId, serbest: Slayt["serbest"]) {
  const { error } = await sb.from("icerik_duzenler").insert({ ad, sablon, serbest });
  if (error) throw error;
}
export async function duzenSil(id: string) {
  const { error } = await sb.from("icerik_duzenler").delete().eq("id", id);
  if (error) throw error;
}
