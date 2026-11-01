// Çekim kontrol listesi (1 Kasım 2026, kullanıcı: "video içerik çekeceği zaman telefondan açıp içeriğin türüne göre adım adım ne yapacaklarını
// ve nelere dikkat edeceklerini görecekleri bir sistem"). Maddeler TASLAK: genel profesyonel çekim pratiği + UPDATED Marka Kiti; video ekibi
// düzeltir. Madde eklemek/çıkarmak için bu dosya değişir; işaretler maddenin kimliğiyle (k) saklanır, kimliği değişen madde işaretsiz kalır.
export type Madde = { k: string; t: string; n: string };
export type Grup = { ad: string; maddeler: Madde[] };
export type Tur = { id: string; ad: string; gruplar: Grup[] };

export const TURLER: Tur[] = [
  { id: "inceleme", ad: "İnceleme", gruplar: [
    { ad: "Çekim öncesi", maddeler: [
      { k: "kunye", t: "Künye ve ambargo", n: "Ürün künyesi açık mı, yayın tarihi ve ambargo saati takvimde mi?" },
      { k: "batarya", t: "Batarya ve kartlar", n: "Bütün piller dolu, kartlar boşaltılmış; yedek kart çantada." },
      { k: "temiz", t: "Lens ve ürün temiz", n: "Ürünün ekranı ve camı da silindi, parmak izi yok." },
    ] },
    { ad: "Set", maddeler: [
      { k: "arkaplan", t: "Arka plan Marka Kiti'ne uygun", n: "UPDATED logosu görünür, dağınıklık yok." },
      { k: "isik", t: "Işık", n: "Ana ışık 45 derece; bütün ışıklar aynı renk sıcaklığında (5600 K)." },
      { k: "ses", t: "Ses testi", n: "Yaka mikrofonuyla 10 saniye kaydedip dinle; klima ve buzdolabı kapalı." },
      { k: "ayar", t: "Kamera ayarı", n: "4K 25p, enstantane 1/50, beyaz dengesi elle, log profil." },
    ] },
    { ad: "Çekim", maddeler: [
      { k: "giris", t: "İlk 5 saniye", n: "Videonun tek cümlelik vaadi: neden izlemeli?" },
      { k: "broll", t: "B-roll: 6 plan", n: "Genel, yakın, detay, kullanımda, ekran, kutu." },
      { k: "puan", t: "Puan ve hüküm", n: "/20 puan, artılar, eksiler, kime uygun." },
      { k: "rakip", t: "Rakiple yan yana", n: "Künyedeki rakiple en az bir karşılaştırma planı." },
    ] },
    { ad: "Çekim sonrası", maddeler: [
      { k: "yedek", t: "İki kopya yedek", n: "Kartı sunucuya ve diske kopyala, sonra boşalt." },
      { k: "kapak", t: "Kapak fotoğrafı", n: "16:9, en az 3 seçenek; yüz ve ürün net." },
    ] },
  ] },
  { id: "kiyas", ad: "Kıyas", gruplar: [
    { ad: "Çekim öncesi", maddeler: [
      { k: "sarj", t: "İki ürün de şarjlı", n: "Aynı yazılım sürümü, aynı ayarlar." },
      { k: "maddeler", t: "Kıyas maddeleri hazır", n: "Künyedeki farklı özelliklerden en az 5 madde." },
    ] },
    { ad: "Çekim", maddeler: [
      { k: "kosul", t: "Aynı ışık, aynı açı", n: "İki ürün de aynı koşulda çekilir." },
      { k: "kazanan", t: "Kazanan her bölümde söylenir", n: "Kararsız bırakma." },
    ] },
    { ad: "Çekim sonrası", maddeler: [{ k: "yedek", t: "İki kopya yedek", n: "Sunucu ve disk." }] },
  ] },
  { id: "kutu", ad: "Kutu açılışı", gruplar: [
    { ad: "Set", maddeler: [
      { k: "kutu", t: "Kutu hasarsız ve temiz", n: "Jelatin kamera karşısında açılır." },
      { k: "ust", t: "Üstten plan", n: "Masa boş, kutu ortada." },
    ] },
    { ad: "Çekim", maddeler: [
      { k: "icerik", t: "Kutudan çıkan her şey", n: "Tek tek, adıyla." },
      { k: "acilis", t: "İlk açılış ekranı", n: "Kurulumun ilk dakikası." },
    ] },
  ] },
  { id: "haber", ad: "Haber videosu", gruplar: [
    { ad: "Çekim öncesi", maddeler: [
      { k: "kaynak", t: "Kaynak doğrulandı", n: "Haberin birincil kaynağı açık." },
      { k: "sure", t: "Metin 60 saniye", n: "Okuma süresi bir dakikayı geçmez." },
    ] },
    { ad: "Çekim", maddeler: [
      { k: "format", t: "Dikey ve yatay", n: "Reels için 9:16, YouTube için 16:9." },
      { k: "altyazi", t: "Altyazı", n: "Sesi kapalı izleyen için." },
    ] },
  ] },
];

/** İşin türünden (jobs.type) listeyi tahmin eder: "Kutu açılışı" → kutu… */
export function turTahmin(isTuru?: string | null): string {
  const t = (isTuru ?? "").toLocaleLowerCase("tr-TR");
  if (t.includes("kıyas") || t.includes("karşılaştır")) return "kiyas";
  if (t.includes("kutu")) return "kutu";
  if (t.includes("haber")) return "haber";
  return "inceleme";
}
export const maddeSayisi = (t: Tur) => t.gruplar.reduce((s, g) => s + g.maddeler.length, 0);
