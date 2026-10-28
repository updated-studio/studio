import Foundation

/// Hazır Pro çekim modları: Android sürümündeki ProModlar.kt ile aynı modlar, aynı varsayılanlar, aynı yazım.
/// Her modun baştan ayarlı değerleri var; kullanıcı hazır seçeneklerle değiştirir, değişiklik mod başına saklanır.
/// Telefon istenen enstantaneyi tek karede veremiyorsa (ya da iz modlarında her zaman) kareler birleştirilir.
struct ProAyar: Codable, Equatable {
    enum Odak: Int, Codable, CaseIterable { case afs, afc, sonsuz, iki }
    /// nil: otomatik
    var iso: Float?
    /// saniye; nil: otomatik
    var enst: Double?
    var odak: Odak
    /// Kelvin; nil: AWB
    var bd: Float?
    var ev: Float
    /// Kare birleştirme süresi (sn)
    var sure: Int
    var zamanlayici: Int
    /// Mercek (görünen çarpan: 0,5 / 1 / 2 / tele); nil: modun varsayılanı
    var mercek: Double? = nil
}

/// ortalama: kumlanma azalır, su ipeksi akar · toplam: ışık birikir, karanlık sahne aydınlanır · enParlak: ışık izleri üst üste biner
enum Birlestir: String { case ortalama, toplam, enParlak }

enum ProMod: String, CaseIterable, Identifiable {
    case samanyolu, yildizIzi, isikGrafiti, aracIzi, ipeksiSu, havaiFisek, spor, kusUcak, geceSehir

    var id: String { rawValue }

    var ad: String {
        switch self {
        case .samanyolu: return "Samanyolu"
        case .yildizIzi: return "Yıldız izi"
        case .isikGrafiti: return "Işık grafiti"
        case .aracIzi: return "Araç ışık izi"
        case .ipeksiSu: return "İpeksi su"
        case .havaiFisek: return "Havai fişek"
        case .spor: return "Spor"
        case .kusUcak: return "Kuş ve uçak"
        case .geceSehir: return "Gece şehir"
        }
    }

    var simge: String {
        switch self {
        case .samanyolu: return "sparkles"
        case .yildizIzi: return "circle.dashed"
        case .isikGrafiti: return "wand.and.rays"
        case .aracIzi: return "car.rear.road.lane"
        case .ipeksiSu: return "drop"
        case .havaiFisek: return "fireworks"
        case .spor: return "figure.run"
        case .kusUcak: return "bird"
        case .geceSehir: return "building.2"
        }
    }

    var ipucu: String {
        switch self {
        case .samanyolu: return "Tripod, karanlık ve açık gökyüzü"
        case .yildizIzi: return "Tripod; yıldızlar çember çizer"
        case .isikGrafiti: return "Karanlıkta fenerle havaya çiz; tripod"
        case .aracIzi: return "Yol ya da köprü; farlar çizgi olur"
        case .ipeksiSu: return "Şelale, dalga; su pamuk gibi akar"
        case .havaiFisek: return "Tripod; patlamalar üst üste biner"
        case .spor: return "Koşan, zıplayan; hareket donar"
        case .kusUcak: return "Gökyüzünde hızlı konu"
        case .geceSehir: return "Elde gece; kumlanma azalır"
        }
    }

    var uyari: String {
        switch self {
        case .samanyolu: return "Tripod kullanın ya da telefonu sabitleyin. Ekran parlaklığını kısın, gözünüz karanlığa alışsın."
        case .yildizIzi: return "Tripod kullanın ya da telefonu sabitleyin. Çekim uzun sürer; telefonu şarja takın."
        case .isikGrafiti: return "Tripod kullanın. Zamanlayıcı bitince ışıkla çizmeye başlayın."
        case .aracIzi: return "Tripod kullanın ya da telefonu bir yere dayayın."
        case .ipeksiSu: return "Tripod kullanın ya da telefonu sabitleyin; telefon kıpırdarsa su yerine her şey bulanıklaşır."
        case .havaiFisek: return "Tripod kullanın. İlk patlamayla birlikte deklanşöre basın."
        case .spor: return "Konuyu kadrajda takip edin; deklanşörü basılı tutunca seri çeker."
        case .kusUcak: return "Konuyu kadrajın ortasında tutun; deklanşörü basılı tutunca seri çeker."
        case .geceSehir: return "Çekim bitene kadar telefonu kıpırdatmayın (yaklaşık 1 sn)."
        }
    }

    var varsayilan: ProAyar {
        switch self {
        case .samanyolu: return ProAyar(iso: 3200, enst: 20, odak: .sonsuz, bd: 4000, ev: 0, sure: 0, zamanlayici: 3)
        case .yildizIzi: return ProAyar(iso: 800, enst: 20, odak: .sonsuz, bd: 4000, ev: 0, sure: 30 * 60, zamanlayici: 3)
        case .isikGrafiti: return ProAyar(iso: 100, enst: 10, odak: .iki, bd: 3200, ev: 0, sure: 10, zamanlayici: 3)
        case .aracIzi: return ProAyar(iso: 100, enst: 8, odak: .sonsuz, bd: nil, ev: 0, sure: 8, zamanlayici: 0)
        case .ipeksiSu: return ProAyar(iso: 100, enst: 2, odak: .afs, bd: nil, ev: -0.7, sure: 2, zamanlayici: 2)
        case .havaiFisek: return ProAyar(iso: 100, enst: 4, odak: .sonsuz, bd: nil, ev: 0, sure: 4, zamanlayici: 0)
        case .spor: return ProAyar(iso: nil, enst: 1.0 / 1000, odak: .afc, bd: nil, ev: 0, sure: 0, zamanlayici: 0)
        case .kusUcak: return ProAyar(iso: nil, enst: 1.0 / 2000, odak: .afc, bd: nil, ev: 0.3, sure: 0, zamanlayici: 0)
        case .geceSehir: return ProAyar(iso: nil, enst: nil, odak: .afs, bd: nil, ev: 0, sure: 0, zamanlayici: 0)
        }
    }

    /// Kareler nasıl birleşir (nil: hiç birleştirilmez)
    var birlestir: Birlestir? {
        switch self {
        case .samanyolu, .ipeksiSu, .geceSehir: return .ortalama
        case .yildizIzi, .isikGrafiti, .aracIzi, .havaiFisek: return .enParlak
        case .spor, .kusUcak: return nil
        }
    }
    var herZamanBirlestir: Bool { [.yildizIzi, .isikGrafiti, .aracIzi, .havaiFisek, .geceSehir].contains(self) }
    var seri: Bool { self == .spor || self == .kusUcak }
    var tele: Bool { self == .kusUcak }
    var isoUst: Float? { self == .spor ? 3200 : (self == .kusUcak ? 6400 : nil) }
    /// Gece şehirde otomatik pozlama bu süreyi aşmaz
    var enstUst: Double? { self == .geceSehir ? 1.0 / 15 : nil }
    /// Süre satırı yalnız iz modlarında anlamlı
    var sureVar: Bool { birlestir != nil && herZamanBirlestir && self != .geceSehir }

    /// Telefon istenen enstantaneyi tek karede veremiyorsa (ya da iz modlarında her zaman) birleştirilir
    func birlestirme(_ a: ProAyar, enUzun: Double) -> Birlestir? {
        guard let b = birlestir else { return nil }
        if herZamanBirlestir { return b }
        if let e = a.enst, enUzun >= e { return nil }
        return b
    }

    /// Ortalama birleştirmede kare sayısı
    func kareSayisi(_ a: ProAyar) -> Int {
        switch self {
        case .geceSehir: return 8
        case .samanyolu: return 16
        default: return min(max(a.sure * 15, 8), 90)
        }
    }

    // MARK: kayıt (mod başına; varsayılanla aynıysa silinir)
    func oku() -> ProAyar {
        guard let v = UserDefaults.standard.data(forKey: "pro_\(rawValue)"),
              let a = try? JSONDecoder().decode(ProAyar.self, from: v) else { return varsayilan }
        return a
    }
    func yaz(_ a: ProAyar) {
        if a == varsayilan { UserDefaults.standard.removeObject(forKey: "pro_\(rawValue)"); return }
        if let v = try? JSONEncoder().encode(a) { UserDefaults.standard.set(v, forKey: "pro_\(rawValue)") }
    }

    func ozet(_ a: ProAyar) -> String {
        [ad, "ISO \(ProMod.isoYazi(a.iso))", a.enst.map { "S \(ProMod.enstYazi($0))" }, sureVar ? "T \(ProMod.sureYazi(a.sure))" : nil]
            .compactMap { $0 }.joined(separator: " · ")
    }

    // MARK: hazır seçenekler (kaydırıcı yok) ve amiral gemisi Pro yazımı
    static let ISOLAR: [Float?] = [nil, 100, 200, 400, 800, 1600, 3200, 6400]
    static let ENSTLER: [Double?] = [nil, 1.0 / 4000, 1.0 / 2000, 1.0 / 1000, 1.0 / 500, 1.0 / 250, 1.0 / 60, 1.0 / 15, 1.0 / 4, 1, 2, 4, 8, 10, 15, 20, 30]
    static let BDLER: [Float?] = [nil, 3200, 4000, 5600, 6500]
    static let EVLER: [Float] = [-1, -0.7, -0.3, 0, 0.3, 0.7, 1]
    static let SURELER = [2, 4, 8, 10, 30, 60, 5 * 60, 15 * 60, 30 * 60, 60 * 60]
    static let ZAMANLAR = [0, 2, 3, 10]

    static func isoYazi(_ i: Float?) -> String { i.map { "\(Int($0))" } ?? "AUTO" }
    static func enstYazi(_ s: Double?) -> String {
        guard let s else { return "AUTO" }
        return s >= 1 ? "\(Int(s))\"" : "1/\(Int((1 / s).rounded()))"
    }
    static func odakYazi(_ o: ProAyar.Odak) -> String {
        switch o { case .afs: return "AF-S"; case .afc: return "AF-C"; case .sonsuz: return "MF ∞"; case .iki: return "MF 2 m" }
    }
    static func bdYazi(_ k: Float?) -> String { k.map { "\(Int($0))K" } ?? "AWB" }
    static func evYazi(_ e: Float) -> String { e == 0 ? "0" : String(format: "%+.1f", e).replacingOccurrences(of: ".", with: ",") }
    static func sureYazi(_ s: Int) -> String { s >= 3600 ? "\(s / 3600) sa" : (s >= 60 ? "\(s / 60) dk" : "\(s) sn") }
    static func zamanYazi(_ z: Int) -> String { z == 0 ? "Kapalı" : "\(z) sn" }
}
