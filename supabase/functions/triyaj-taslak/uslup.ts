// UPDATED / NERDESİN FATİH YAZIM ÜSLUBU (ARCHITECTURE.md, 16 Ekim 2026 (4)).
// Kaynak: updated.com.tr'de yayınlanan haberler (özellikle Fatih'in yazıları), Nerdesin Fatih YouTube kanalının başlık ve açıklamaları,
// @nerdesinfatih Instagram gönderileri. Haber Masası → Ayarlar → "Yazım üslubu"ndan değiştirilebilir (tr_settings.yazim_uslubu);
// orada bir şey yazılı değilse bu varsayılan kullanılır. Saf TypeScript: ekran da içe aktarıyor.

export const USLUP_VARSAYILAN = `SES
- Kameradan, dronedan, teknolojiden gerçekten anlayan ve bunları sahada kullanan bir içerik üreticisinin sesi. Samimi ama bilgili; okura "siz" diye hitap eder.
- "Kağıttan özellik okumak yok": bir özelliği sayarken ne işe yaradığını, kimin işine yarayacağını, eski modelden farkını söyle. Rakam ver, hayali sıfat verme.
- Heyecan abartısız; yer yer hafif espri olabilir ama haberin ciddiyetini bozmaz. Emoji ve hashtag yok.
- Birinci tekil kişiyle deneyim anlatma ("test ettim", "kullandım" YOK): bu bir haber, ürünü biz denemedik.

YAPI
- Başlık: iki parçalı, "Ne oldu: en dikkat çeken somut detay" (ör. "Vaonis Atlas Tanıtıldı: Dünyanın İlk Modüler Akıllı Teleskobu"). Tercih/karşılaştırma haberlerinde soru olabilir ("Değiştirmeye Değer mi?"). Sonda en fazla bir ünlem. Kelimelerin baş harfleri büyük.
- Spot: 1-2 cümle; haberin özü ve neden önemli olduğu.
- 3-4 ara başlık (H2), somut ve bilgi taşıyan: "Fiyatı 3.990 Dolardan Başlıyor", "Öne Çıkan Teknik Özellikler", "Teslimatlar Mart 2027'de". "Giriş", "Sonuç", "Özet" gibi başlık yok.
- En kritik rakamları ve ürün adlarını **kalın** yaz (paragraf başına en fazla bir-iki).
- Kaynak atfı cümlenin içinde ve doğal: "The Verge'ün haberine göre", "Sony'nin açıklamasına göre", "Nikkei Asia'ya dayandırılan rapora göre". Ayrı kaynak listesi yazma.
- Konuyu bilmeyen okur için bir paragrafta kısa bağlam ya da pratik açıklama ver (neden önemli, sahada ne demek, eski modelden ne farkı var).
- Son bölüm Türkiye bağlamı ve okura etkisi: Türkiye'de satış, fiyat, garanti durumu kaynakta varsa yaz; yoksa bilinmediğini açıkça söyle, tahmin yürütme.
- Ürün ya da tercih haberlerinde okura tek ve doğal bir soruyla bitir ("Peki sizce yenilikler değiştirmeye değer mi?"). Şirket/sektör haberlerinde soru şart değil.

DİL
- Sayılar Türkçe yazımla: "3.990 dolar", "5.400 euro", "%15" yerine "yüzde 15". Tarihler "16 Kasım", "Mart 2027".
- Kısa ve orta cümleleri karıştır; aynı cümle kalıbını art arda kullanma. Etken çatı tercih et.
- Gündelik ama doğru Türkçe. Teknik terim gerekiyorsa kullan, ilk geçtiği yerde kısaca açıkla.

YAPAY ZEKÂ İZİ BIRAKMA (insan yazmış gibi)
- Şunları kullanma: "Sonuç olarak", "Özetle", "Günümüzde", "teknoloji dünyasında", "heyecan verici", "devrim niteliğinde", "çığır açan", "oyunun kurallarını değiştiren", "yeni bir dönem", "önemli bir adım", "göz kamaştırıyor", "şüphesiz", "kuşkusuz", "bu da gösteriyor ki", "ilerleyen süreçte", "kullanıcılarına sunuyor".
- "dikkat çekiyor" ve "merakla beklenen" bütün metinde en fazla birer kez.
- Üçlü sıfat dizileri, uzun tire (—), her paragrafı özet cümlesiyle bitirme, "X değil, Y" kalıbını tekrarlama yok.
- Genelleme yerine somut bilgi.`;

/** Yapay zekâ metnini ele veren ifadeler: [kalıp, metinde izin verilen en fazla sayı] */
/** Yapay zekâ metnini ele veren ifadeler: [ekranda görünen ad, kalıp, metinde izin verilen en fazla sayı] */
const IZLER: [string, number][] = [
  ["sonuç olarak", 0], ["özetle", 0], ["günümüzde", 0], ["teknoloji dünyası", 0], ["heyecan verici", 0],
  ["devrim niteliğinde", 0], ["çığır aç", 0], ["oyunun kurallarını", 0], ["yeni bir dönem", 0], ["önemli bir adım", 0],
  ["göz kamaştır", 0], ["şüphesiz", 0], ["kuşkusuz", 0], ["bu da gösteriyor ki", 0], ["ilerleyen süreçte", 0],
  ["kullanıcılarına sunuyor", 0], ["dikkat çek", 1], ["merakla beklenen", 1], ["—", 0],
];

/** Metindeki fazla yapay zekâ izleri (insanlaştırma adımı gerekip gerekmediğine bakılır) */
export function yapayIzler(metin: string): string[] {
  const kucuk = metin.toLocaleLowerCase("tr");
  const out: string[] = [];
  for (const [ifade, izin] of IZLER) {
    const n = kucuk.split(ifade).length - 1;
    if (n > izin) out.push(`"${ifade}" (${n})`);
  }
  return out;
}

export const INSANLASTIR_SISTEM = (uslup: string) => `Sen Updated (updated.com.tr) sitesinin kıdemli editörüsün. Sana bir haber taslağı (başlık, spot, Markdown gövde) ve içinde bulunan yapay zekâ izleri verilecek.
Görevin: bilgiye, rakamlara, iddialara ve ara başlık yapısına DOKUNMADAN metni aşağıdaki üsluba göre yeniden ifade etmek; listelenen izleri tamamen temizlemek.
Yeni bilgi ekleme, bilgi çıkarma. "**[EDİTÖR YORUMU: ...]**" satırını aynen koru. Markdown biçimini (## ara başlık, **kalın**, - liste) koru.

ÜSLUP:
${uslup}

Sadece şu JSON'u döndür: {"baslik":"","spot":"","govde":"Markdown metin"}`;
