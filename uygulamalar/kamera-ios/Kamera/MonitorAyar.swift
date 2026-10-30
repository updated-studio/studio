import Foundation

/// Bir monitör bölmesinin ayarları (araçlar) — Android Ayarlar.kt ile aynı alanlar. Her bölmenin kendi ayarı vardır; saklanır.
struct BolmeAyari: Codable, Equatable {
    var peaking = false
    var peakEsik: Float = 0.18          // kenar şiddeti eşiği (düşük = daha çok vurgu)
    var peakRenk = 0                    // 0 kırmızı, 1 mavi, 2 beyaz, 3 sarı
    var zebra = false
    var zebraEsik: Float = 0.95         // 0,95 = %95 IRE (patlama), 0,70 = ten
    var falseColor = false
    var lutAcik = false
    var desqueeze: Float = 1            // anamorfik açma: 1; 1,33; 1,5; 1,6; 1,8; 2
    var kilavuz: Float = 0              // kadraj kılavuzu en-boy oranı (0 = yok)
    var izgara = false
    var merkez = false
    var guvenli: Float = 0              // güvenli alan (0, 0,9, 0,8)
    var zoom: Float = 1
    var ayna = false
    var cevir = false
    var dondur = 0                      // 0/90/180/270
    var monokrom = false
    var temiz = false                   // temiz görüntü: odak/zebra/false color/kılavuzlar gizli (LUT kalır)
    var lutAdi = ""

    static let peakRenkleri: [(Float, Float, Float)] = [(1, 0.15, 0.15), (0.2, 0.5, 1), (1, 1, 1), (1, 0.9, 0.1)]
}

/// Telefon kamerasının el ile ayarları (kamera başına saklanır). nil = otomatik.
struct KameraAyari: Codable, Equatable {
    var fps: Int?
    var enstantane: Double?             // saniye
    var iso: Float?
    var kelvin: Int?
    var ton: Float?                     // yeşil (−) … macenta (+), −100…100; nil = 0
    var ev: Float = 0
    var odak: Float?                    // 0 sonsuz … 1 en yakın
    var boyut: String?                  // "1920x1080"
    var sabitleme = true
}

/// Gölgelendiriciye giden ayar (Monitor.metal'deki MonitorAyar ile aynı sıra; hepsi 4 bayt)
struct GPUAyar {
    var lutBoyut: Float = 2; var lutAcik: Int32 = 0
    var peaking: Int32 = 0; var peakEsik: Float = 0.18; var peakR: Float = 1; var peakG: Float = 0; var peakB: Float = 0
    var zebra: Int32 = 0; var zebraEsik: Float = 0.95; var sahte: Int32 = 0; var mono: Int32 = 0
    var zoom: Float = 1; var ayna: Int32 = 0; var cevir: Int32 = 0; var dondur: Int32 = 0
    var kilavuz: Float = 0; var izgara: Int32 = 0; var merkez: Int32 = 0; var guvenli: Float = 0
    var oran: Float = 1; var pikselX: Float = 0.001; var pikselY: Float = 0.001; var cikisX: Float = 1; var cikisY: Float = 1
}

enum Saklama {
    static func oku<T: Decodable>(_ anahtar: String, _ tur: T.Type) -> T? {
        guard let d = UserDefaults.standard.data(forKey: anahtar) else { return nil }
        return try? JSONDecoder().decode(tur, from: d)
    }

    static func yaz<T: Encodable>(_ anahtar: String, _ deger: T) {
        if let d = try? JSONEncoder().encode(deger) { UserDefaults.standard.set(d, forKey: anahtar) }
    }
}
