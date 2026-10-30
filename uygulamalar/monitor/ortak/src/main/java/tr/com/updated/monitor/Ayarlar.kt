package tr.com.updated.monitor

/** Bir monitör bölmesinin ayarları (araçlar). Her bölmenin kendi ayarı vardır; uygulama kapanınca saklanır. */
data class Ayarlar(
    var peaking: Boolean = false,
    var peakEsik: Float = 0.18f,          // kenar şiddeti eşiği (düşük = daha çok vurgu)
    var peakRenk: Int = 0,                // 0 kırmızı, 1 mavi, 2 beyaz, 3 sarı
    var zebra: Boolean = false,
    var zebraEsik: Float = 0.95f,         // 0,95 = %95 IRE (patlama), 0,70 = ten
    var falseColor: Boolean = false,
    var lutAcik: Boolean = false,
    var desqueeze: Float = 1f,            // anamorfik açma: 1; 1,33; 1,5; 1,6; 1,8; 2
    var kilavuz: Float = 0f,              // kadraj kılavuzu en-boy oranı (0 = yok): 2,39 · 1,85 · 16/9 · 4/5 · 9/16 · 1
    var izgara: Boolean = false,          // üçte bir ızgarası
    var merkez: Boolean = false,          // merkez işareti
    var guvenli: Float = 0f,              // güvenli alan (0, 0,9 = %90, 0,8 = %80)
    var zoom: Float = 1f,                 // büyütme (odak kontrolü)
    var ayna: Boolean = false,
    var cevir: Boolean = false,
    var dondur: Int = 0,                  // 0/90/180/270 (telefon kamerası ve ters takılan kaynaklar)
    var monokrom: Boolean = false,
    var temiz: Boolean = false,           // temiz görüntü: odak/zebra/false color/kılavuzlar gizli (LUT kalır)
    var lutAdi: String = "",
    /** Stiller (Kamera'daki ile aynı): seçili LUT'un üstüne biner, yalnız ekrana */
    var stil: Stil = Stil(),
)

val PEAK_RENKLERI = arrayOf(floatArrayOf(1f, 0.15f, 0.15f), floatArrayOf(0.2f, 0.55f, 1f), floatArrayOf(1f, 1f, 1f), floatArrayOf(1f, 0.9f, 0.1f))
