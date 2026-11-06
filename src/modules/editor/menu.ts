// Stüdyo menüsü (6 Kasım 2026, onaylı düzen claude.ai/artifact/Mv3EEBjadgjSdnRiRCaLFF): tek menü, gruplar hâlinde. Herkes aynı ekranı görür;
// rol yalnız hangi grupların açık olduğunu değiştirir (Site içeriği ve Yönetim yöneticide). Telefonda alt çubuk: Masam, Gelen, Taslaklar,
// Çekim, Menü; "Menü" bu listenin tamamını açar. Bir öğenin etkin olup olmadığı adresten (yol + ?b= / ?bolum=) anlaşılır.
export type Oge = { yol: string; ad: string; ikon: string; kisa?: string; etkin: (yol: string, sp: URLSearchParams) => boolean };
/** acilir: grup menüde tek satır olarak durur, basınca açılır (yöneticiye özel bölümler: 6 Kasım 2026, kullanıcı: "yönetime özel kısımları
 *  yönetim adı altında bir yerde toplayalım, açılır sekme gibi olsun") */
export type Grup = { ad: string; yonetici?: boolean; acilir?: boolean; ikon?: string; ogeler: Oge[] };

// Site bölümleri (panelin koleksiyon adları): menüdeki beş öğeden hangisine düştüğü
const TOPLULUK = new Set(["yorumlar", "uyeler", "uye-giris", "yarismalar", "kulup-tracks", "kulup-quizzes", "gorevler", "gorev-fotolari", "gorev-gorselleri"]);
const siteBolum = (sp: URLSearchParams) => sp.get("bolum") || "news";
const sitede = (yol: string) => yol.startsWith("/site");
const masada = (yol: string) => yol.startsWith("/haber-masasi");
const YONETIM_YOLLARI = ["/yonetim-merkezi", "/yonetim", "/baglantilar", "/sistem", "/hareketler", "/yz-kiyas", "/deneme-masasi"];
const yonetimde = (yol: string, sp: URLSearchParams) => YONETIM_YOLLARI.some((y) => yol === y || yol.startsWith(y + "/")) || (masada(yol) && ["kaynak", "ayar"].includes(sp.get("b") ?? ""));

export const MASAM: Oge = { yol: "/masam", ad: "Masam", ikon: "bugun", etkin: (y) => y.startsWith("/masam") };
const GELEN: Oge = { yol: "/haber-masasi", ad: "Gelen", ikon: "triyaj", etkin: (y, sp) => masada(y) && !["rehber", "kaynak", "ayar", "taslak"].includes(sp.get("b") ?? "") };
const TASLAKLAR: Oge = { yol: "/taslaklar", ad: "Taslaklar", ikon: "taslak", etkin: (y, sp) => y.startsWith("/taslaklar") || y.startsWith("/yaz") || y.startsWith("/oku") || (masada(y) && sp.get("b") === "taslak") };
const CEKIM: Oge = { yol: "/cekim", ad: "Çekim listesi", kisa: "Çekim", ikon: "klaket", etkin: (y) => y.startsWith("/cekim") };
export const MENU: Oge = { yol: "/menu", ad: "Menü", ikon: "isler", etkin: (y) => y.startsWith("/menu") };

export const GRUPLAR: Grup[] = [
  { ad: "", ogeler: [MASAM] },
  { ad: "Haberler", ogeler: [
    GELEN, TASLAKLAR,
    // 6 Kasım 2026 (kullanıcı: "bunun butonu nerede"): Word/PDF belgesinden taslak, menüde de görünür
    { yol: "/belgeden-yaz", ad: "Belgeden yaz", ikon: "yaz", etkin: (y) => y.startsWith("/belgeden-yaz") },
    { yol: "/yayinda", ad: "Yayında", ikon: "check", etkin: (y) => y.startsWith("/yayinda") },
    { yol: "/haber-masasi?b=rehber", ad: "Rehberler", ikon: "yardim", etkin: (y, sp) => masada(y) && sp.get("b") === "rehber" },
  ] },
  { ad: "Ekip", ogeler: [
    { yol: "/icerik", ad: "Tasarım", ikon: "icerik", etkin: (y) => y.startsWith("/icerik") },
    CEKIM,
    { yol: "/ekip", ad: "İşler", ikon: "ekip", etkin: (y) => y.startsWith("/ekip") },
    { yol: "/takvim", ad: "Takvim", ikon: "takvim", etkin: (y) => y.startsWith("/takvim") },
    { yol: "/notlar", ad: "Notlar", ikon: "yaz", etkin: (y) => y.startsWith("/notlar") },
    // 6 Kasım 2026 (kullanıcı: "marka kitini editörler de kullanmak isteyebilir"): profil menüsünden buraya taşındı
    { yol: "/marka-kiti", ad: "Marka kiti", ikon: "marka", etkin: (y) => y.startsWith("/marka-kiti") },
  ] },
  // Yöneticiye özel her şey tek açılır grupta: site içeriği ve ayarlar
  { ad: "Yönetim", yonetici: true, acilir: true, ikon: "yonetim", ogeler: [
    { yol: "/site?bolum=products", ad: "Künyeler", ikon: "liste", etkin: (y, sp) => sitede(y) && siteBolum(sp) === "products" },
    { yol: "/site?bolum=reviews", ad: "İncelemeler", ikon: "okuma", etkin: (y, sp) => sitede(y) && siteBolum(sp) === "reviews" },
    { yol: "/site?bolum=comparisons", ad: "Kıyaslamalar", ikon: "kurgu", etkin: (y, sp) => sitede(y) && siteBolum(sp) === "comparisons" },
    { yol: "/site?bolum=yorumlar", ad: "Topluluk", ikon: "sohbet", etkin: (y, sp) => sitede(y) && TOPLULUK.has(siteBolum(sp)) },
    { yol: "/site?bolum=pages", ad: "Site", ikon: "site", etkin: (y, sp) => sitede(y) && !["products", "reviews", "comparisons"].includes(siteBolum(sp)) && !TOPLULUK.has(siteBolum(sp)) },
    { yol: "/yonetim-merkezi", ad: "Ayarlar", ikon: "masa", etkin: yonetimde },
  ] },
];
export const ALT_CUBUK: Oge[] = [MASAM, GELEN, TASLAKLAR, CEKIM, MENU];
