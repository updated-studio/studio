import Foundation
import CoreGraphics

enum Kip: String, CaseIterable, Identifiable {
    case ses, hiz, elle
    var id: String { rawValue }
    var ad: String {
        switch self {
        case .ses: return "Sese göre"
        case .hiz: return "Sabit hız"
        case .elle: return "Elle"
        }
    }
}

/// Konuşma tanıma motoru.
enum Motor: String, CaseIterable, Identifiable {
    case apple, whisperHizli, whisperDengeli, whisperEnIyi, deepgram
    var id: String { rawValue }

    var ad: String {
        switch self {
        case .apple: return "Apple (Dikte)"
        case .whisperHizli: return "Whisper · hızlı"
        case .whisperDengeli: return "Whisper · dengeli"
        case .whisperEnIyi: return "Whisper · en doğru"
        case .deepgram: return "Deepgram (bulut)"
        }
    }

    var aciklama: String {
        switch self {
        case .apple: return "Ücretsiz. Mac'te Dikte açık olmalı, internet gerekir."
        case .whisperHizli: return "Mac'in üzerinde çalışır, internet ve Dikte gerekmez. İlk kullanımda ~150 MB model iner."
        case .whisperDengeli: return "Türkçede daha doğru, biraz daha yavaş. İlk kullanımda ~500 MB model iner."
        case .whisperEnIyi: return "En doğru Whisper; güçlü Mac'lerde (M2 ve üstü) akıcı. İlk kullanımda ~630 MB model iner."
        case .deepgram: return "En düşük gecikme. Kendi Deepgram anahtarınızla çalışır, dakika başına ücretlidir; ses Deepgram'a gönderilir."
        }
    }

    var whisperModeli: String? {
        switch self {
        case .whisperHizli: return "openai_whisper-base"
        case .whisperDengeli: return "openai_whisper-small"
        case .whisperEnIyi: return "openai_whisper-large-v3-v20240930_turbo_632"
        default: return nil
        }
    }
}

/// Kullanıcı ayarları; her değişiklik hemen UserDefaults'a yazılır.
final class Ayarlar: ObservableObject {
    static let ortak = Ayarlar()
    private let d = UserDefaults.standard

    @Published var kip: Kip { didSet { d.set(kip.rawValue, forKey: "kip"); Oturum.ortak.kipDegisti() } }
    @Published var yaziBoyu: Double { didSet { d.set(yaziBoyu, forKey: "yaziBoyu") } }
    @Published var genislik: Double { didSet { d.set(genislik, forKey: "genislik") } }
    @Published var satir: Double { didSet { d.set(satir, forKey: "satir") } }
    @Published var hiz: Double { didSet { d.set(hiz, forKey: "hiz") } }
    @Published var ayna: Bool { didSet { d.set(ayna, forKey: "ayna") } }
    @Published var paylasimdaGizle: Bool { didSet { d.set(paylasimdaGizle, forKey: "paylasimdaGizle") } }
    @Published var geriSayim: Bool { didSet { d.set(geriSayim, forKey: "geriSayim") } }
    @Published var otomatikGuncelle: Bool { didSet { d.set(otomatikGuncelle, forKey: "otomatikGuncelle") } }
    @Published var motor: Motor { didSet { d.set(motor.rawValue, forKey: "motor"); Oturum.ortak.motorDegisti() } }
    /// Kullanıcının kendi Deepgram anahtarı; yalnız bu Mac'te saklanır.
    @Published var deepgramAnahtari: String { didSet { d.set(deepgramAnahtari, forKey: "deepgramAnahtari") } }

    private init() {
        kip = Kip(rawValue: d.string(forKey: "kip") ?? "") ?? .ses
        yaziBoyu = d.object(forKey: "yaziBoyu") as? Double ?? 26
        genislik = d.object(forKey: "genislik") as? Double ?? 620
        satir = d.object(forKey: "satir") as? Double ?? 3
        hiz = d.object(forKey: "hiz") as? Double ?? 40
        ayna = d.object(forKey: "ayna") as? Bool ?? false
        paylasimdaGizle = d.object(forKey: "paylasimdaGizle") as? Bool ?? true
        geriSayim = d.object(forKey: "geriSayim") as? Bool ?? true
        otomatikGuncelle = d.object(forKey: "otomatikGuncelle") as? Bool ?? true
        motor = Motor(rawValue: d.string(forKey: "motor") ?? "") ?? .apple
        deepgramAnahtari = d.string(forKey: "deepgramAnahtari") ?? ""
    }

    /// Bir satırın yüksekliği (pt). Prompter görünümü ve panel boyu aynı formülü kullanır.
    var satirYuksekligi: CGFloat { (CGFloat(yaziBoyu) * 1.3).rounded() }
    var satirSayisi: Int { Int(satir.rounded()) }
}
