import { useCallback, useState } from "react";
import { MasaProvider, useMasa } from "../haber-masasi/veri";
import { Grup, Satir, useAyarYaz } from "../haber-masasi/ayarParcalari";
import { ElemeKiyas, GorselTablo, KIYAS_BITIS_VARSAYILAN, KiyasAyari, KiyasOrani, KunyeKiyas, YaziKiyas } from "../haber-masasi/Kiyas";

// Yapay zekâ kıyası (yönetici; 4 Kasım 2026, kullanıcı: "kıyasla ilgili her şeyi bir yere toplayalım; kolay erişip gözlemleyip karar
// verebilelim, bu önemli bir süreç"). Özet (her işte kim çalışıyor, kim önde), işler (tablo + giren işler), ayarlar, modeller ve fiyatlar,
// dış ölçümler. Karar ölçümle verilir; dış siteler yalnız yön gösterir.
export default function YzKiyas() {
  return <MasaProvider><Sayfa /></MasaProvider>;
}

// Kıyastaki modeller ve fiyatları (sunucudaki liste: supabase/functions/triyaj-taslak/kiyas.ts KIYAS_MODELLERI; fiyatlar 4 Kasım 2026)
const MODELLER: [string, string, string, string][] = [
  ["Gemini 3.5 Flash-Lite", "Google", "Asıl iş (eleme), ücretsiz katman", "ücretsiz"],
  ["Gemini 3.8 Flash", "Google", "Ucuz sınıf, ücretsiz katman", "ücretsiz"],
  ["Claude Haiku 5.5", "Anthropic", "Ucuz sınıf", "0,10 $ / 0,50 $"],
  ["GPT-6 Luna", "OpenAI", "Ucuz sınıf", "0,10 $ / 0,50 $"],
  ["Claude Sonnet 5.5", "Anthropic", "Güçlü sınıf", "2 $ / 10 $"],
  ["Claude Opus 5.5", "Anthropic", "En güçlü (tavan ölçüsü)", "4 $ / 20 $"],
  ["GPT-6.1 Sol", "OpenAI", "Güçlü sınıf", "2 $ / 10 $"],
  ["Gemini 4 Argon", "Google", "Güçlü sınıf, ücretli proje", "2 $ / 10 $ (1 Aralık'tan sonra 4 $ / 20 $)"],
];

function Sayfa() {
  const { v } = useMasa();
  const ayar = useAyarYaz();
  const [acik, setAcik] = useState("");
  const [onde, setOnde] = useState<Record<string, string>>({});
  const bildir = useCallback((is: string, metin: string) => setOnde((x) => (x[is] === metin ? x : { ...x, [is]: metin })), []);
  const p = { acik, ac: setAcik };
  const k = { eleme_oran: 10, kunye_oran: 20, bitis: KIYAS_BITIS_VARSAYILAN, ...((v.ayarlar.yz_kiyas ?? {}) as { eleme_oran?: number; kunye_oran?: number; bitis?: string }) };
  const g = { acik: true, gunluk: 3, ...((v.ayarlar.gorsel_kiyas ?? {}) as { acik?: boolean; gunluk?: number }) };
  const bitis = new Date(k.bitis);
  const kalan = Math.round((+bitis - Date.now()) / 864e5);
  const tarih = bitis.toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
  const ozet: [string, string, string, string][] = [
    ["Taslak yazımı", "Claude Sonnet 5.5 yazar, Opus 5.5 denetler", "Gemini (ücretsiz) her taslakta kör yarışır; editör seçer", "yazi"],
    ["Kapak görseli", "FLUX.2 klein → Nano Banana 2.1 → GPT Image 2.5", `Günde ${g.gunluk} taslakta bütün modeller birlikte üretir (kıyas süresince en yüksek kalite ayarları da)`, "gorsel"],
    ["Haber eleme", "Gemini 3.5 Flash-Lite (ücretsiz)", `Haberlerin %${k.eleme_oran}'unda 7 model daha`, "eleme"],
    ["Künye", "Gemini (ücretsiz)", `Ürünlerin %${k.kunye_oran}'sinde 7 model daha`, "kunye"],
  ];
  return (
    <section className="bg ay">
      <header>
        <h1 className="bg-h1">Yapay zekâ kıyası</h1>
        <p className="bg-ozet"><b>Her işi en iyi yapan modele vermek için ölçüyoruz.</b> {kalan > 0 ? `Eleme ve künye kıyası ${tarih}'e kadar açık (${kalan} gün kaldı); sonra kendiliğinden durur.` : `Eleme ve künye kıyası ${tarih}'te bitti; kazananı seçme zamanı.`} Kıyas asıl işleri değiştirmez; kıyastaki modellerin sonuçları yalnız burada.</p>
      </header>

      {/* Özetteki "önde" için bölümler görünmeden de hesaplanır */}
      <div hidden><YaziKiyas onde={bildir} /><GorselTablo onde={bildir} /><ElemeKiyas onde={bildir} /><KunyeKiyas onde={bildir} /></div>

      <Grup id="ozet" ad="Özet" ne="Her işte şu an kim çalışıyor, kim yarışıyor, ölçüye göre kim önde.">
        <div className="kiyas-ozet tbl"><table>
          <thead><tr><th>İş</th><th>Asıl işi yapan</th><th>Kıyas</th><th>Şu an önde</th></tr></thead>
          <tbody>{ozet.map(([is, asil, kiyas, id]) => (
            <tr key={id}><td><b>{is}</b></td><td>{asil}</td><td className="muted">{kiyas}</td><td>{onde[id] ?? "…"}</td></tr>
          ))}</tbody>
        </table></div>
      </Grup>

      <Grup id="isler" ad="İşler" ne="Her satırda özet tablo; altında giren işler ve her modelin sonucu.">
        <Satir {...p} id="yazi" ad="Taslak yazımı" ne="Claude ve Gemini aynı haberi yazar; editör kimin olduğunu bilmeden seçer." deger={onde.yazi}><YaziKiyas /></Satir>
        <Satir {...p} id="gorsel" ad="Kapak görseli" ne="Denetim puanı, kapak olma, süre ve maliyet." deger={onde.gorsel}><GorselTablo /></Satir>
        <Satir {...p} id="eleme" ad="Haber eleme" ne="Havuza alma kararı; editör ve hakem kararıyla doğruluk. Anlaşmazlıklarda hakem sensin." deger={onde.eleme}><ElemeKiyas /></Satir>
        <Satir {...p} id="kunye" ad="Künye" ne="Bulunan özellik, kanıt alıntısının sayfada geçmesi, değer farkları." deger={onde.kunye}><KunyeKiyas /></Satir>
      </Grup>

      <Grup id="ayar" ad="Ayarlar" ne="Kıyasa ne kadar iş girer, ne zaman biter.">
        <Satir {...p} id="oran" ad="Eleme ve künye kıyası" ne="Örnekleme oranı ve bitiş tarihi." deger={`%${k.eleme_oran} · %${k.kunye_oran} · ${tarih}`}><KiyasOrani ayar={ayar} /></Satir>
        <Satir {...p} id="gk" ad="Görsel kıyası" ne="Günde kaç taslakta bütün görsel modelleri birlikte üretir." deger={g.acik ? `günde ${g.gunluk} taslak` : "kapalı"}><KiyasAyari ayar={ayar} /></Satir>
      </Grup>

      <Grup id="modeller" ad="Kıyastaki modeller" ne="Her firmadan bir ucuz, bir güçlü model. Fiyatlar firmaların sayfalarından, 1M jeton başına girdi / çıktı (4 Kasım 2026).">
        <div className="kiyas-ozet tbl"><table>
          <thead><tr><th>Model</th><th>Firma</th><th>Rolü</th><th>Fiyat</th></tr></thead>
          <tbody>{MODELLER.map(([ad, firma, rol, fiyat]) => <tr key={ad}><td><b>{ad}</b></td><td>{firma}</td><td className="muted">{rol}</td><td>{fiyat}</td></tr>)}</tbody>
        </table></div>
      </Grup>

      <Grup id="dis" ad="Dış ölçümler" ne="Bağımsız sitelerin sonuçları yön gösterir; karar bizim verimizle verilir.">
        <div className="kiyas-dis">
          <p><b>Görsel (Artificial Analysis, 4 Kasım 2026):</b> GPT Image 2.5 Sunburst ve Flare en üstte (en yüksek kalitede görsel başı ~0,21 $). Nano Banana 2.1 hemen arkasında ve çok daha ucuz (~0,034 $). FLUX.2 dev orta, klein biraz altında; Lucid Origin listenin alt sıralarında.</p>
          <p><b>Metin (Artificial Analysis, 4 Kasım 2026):</b> Genel zekâ endeksinde Gemini 4 Carbon (60), Claude Opus 5.5 (59) ve GPT-6 Astra (57) önde. Alan endekslerinde Claude Opus 5.5 altı alanın altısında birinci; Claude Sonnet 5.5 ve GPT-6.1 Sol arkasında. Ucuz sınıf modellerin puanı sitede yok; o yüzden bizim ölçümümüz belirleyici.</p>
          <p><a href="https://artificialanalysis.ai" target="_blank" rel="noreferrer">Artificial Analysis ↗</a> · <a href="https://arena.ai/leaderboard" target="_blank" rel="noreferrer">Arena ↗</a></p>
        </div>
      </Grup>
    </section>
  );
}
