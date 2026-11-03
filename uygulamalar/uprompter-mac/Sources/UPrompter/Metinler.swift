import Foundation
import SwiftUI

struct Metin: Identifiable, Codable, Equatable {
    var id = UUID()
    var baslik: String
    var govde: String
    var degisti = Date()
}

/// Metin kütüphanesi: ~/Library/Application Support/UPrompter/metinler.json
final class MetinDeposu: ObservableObject {
    static let ortak = MetinDeposu()

    @Published var metinler: [Metin] { didSet { kaydetPlanla() } }
    @Published var seciliID: UUID? {
        didSet {
            UserDefaults.standard.set(seciliID?.uuidString, forKey: "seciliMetin")
            if oldValue != seciliID { Oturum.ortak.yeniMetinSecildi() }
        }
    }

    private var kayitIsi: DispatchWorkItem?

    private static var dosya: URL {
        let kok = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return kok.appendingPathComponent("UPrompter", isDirectory: true).appendingPathComponent("metinler.json")
    }

    private init() {
        var yuklenen: [Metin] = []
        if let veri = try? Data(contentsOf: Self.dosya),
           let liste = try? JSONDecoder().decode([Metin].self, from: veri) {
            yuklenen = liste
        }
        if yuklenen.isEmpty { yuklenen = [Metin(baslik: "Örnek: dizüstü ilk izlenim", govde: Self.ornek)] }
        metinler = yuklenen
        let kayitli = UserDefaults.standard.string(forKey: "seciliMetin").flatMap(UUID.init(uuidString:))
        seciliID = yuklenen.contains(where: { $0.id == kayitli }) ? kayitli : yuklenen.first?.id
    }

    var secili: Metin? { metinler.first { $0.id == seciliID } }

    func ekle() {
        let m = Metin(baslik: "Yeni metin", govde: "")
        metinler.insert(m, at: 0)
        seciliID = m.id
    }

    func sil(_ id: UUID) {
        metinler.removeAll { $0.id == id }
        if seciliID == id { seciliID = metinler.first?.id }
    }

    func baslikBaglama(_ id: UUID) -> Binding<String> {
        Binding(
            get: { self.metinler.first { $0.id == id }?.baslik ?? "" },
            set: { yeni in
                guard let i = self.metinler.firstIndex(where: { $0.id == id }) else { return }
                self.metinler[i].baslik = yeni
                self.metinler[i].degisti = Date()
            }
        )
    }

    func govdeBaglama(_ id: UUID) -> Binding<String> {
        Binding(
            get: { self.metinler.first { $0.id == id }?.govde ?? "" },
            set: { yeni in
                guard let i = self.metinler.firstIndex(where: { $0.id == id }) else { return }
                self.metinler[i].govde = yeni
                self.metinler[i].degisti = Date()
                Oturum.ortak.metniYukle()
            }
        )
    }

    private func kaydetPlanla() {
        kayitIsi?.cancel()
        let isNesnesi = DispatchWorkItem { [weak self] in self?.simdiKaydet() }
        kayitIsi = isNesnesi
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6, execute: isNesnesi)
    }

    func simdiKaydet() {
        let url = Self.dosya
        do {
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            let veri = try JSONEncoder().encode(metinler)
            try veri.write(to: url, options: .atomic)
        } catch {
            NSLog("UPrompter: metinler kaydedilemedi: \(error.localizedDescription)")
        }
    }

    static let ornek = """
    Merhaba, UPDATED'a hoş geldiniz. Bugün yeni dizüstümüzün ilk izlenimlerini anlatacağım. Önce tasarıma bakalım, sonra performans testlerine geçeceğiz.

    [DURAKLA]

    Kasa tek parça alüminyum ve elde oldukça sağlam hissettiriyor. Ekranın kenarları ince, kamera üst çerçevenin ortasında duruyor. Klavyenin tuş hissi yumuşak ama net.

    [ÜRÜNÜ GÖSTER]

    Şimdi performansa geçelim. Günlük kullanımda uygulamalar hızlı açılıyor, video düzenlerken fanlar neredeyse hiç duyulmuyor. Pil tarafında ise bir iş günü rahatça çıkıyor.

    Videonun devamında bütün testleri tek tek göstereceğim. Beğendiyseniz abone olmayı unutmayın, görüşmek üzere.
    """
}

enum Ozet {
    static func kelimeSayisi(_ s: String) -> Int { Ayrisim.ayir(s).tokenlar.count }

    static func sureYazisi(_ s: String) -> String {
        let sn = Int((Double(kelimeSayisi(s)) / 140.0 * 60).rounded())
        return "\(sn / 60) dk \(sn % 60) sn"
    }

    static func ayrinti(_ s: String) -> String {
        "\(kelimeSayisi(s)) kelime · dakikada 140 kelimeyle ~\(sureYazisi(s))"
    }

    private static let bicim: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "tr_TR")
        f.dateFormat = "d MMM"
        return f
    }()

    static func tarih(_ d: Date) -> String {
        let t = Calendar.current
        if t.isDateInToday(d) { return "bugün" }
        if t.isDateInYesterday(d) { return "dün" }
        return bicim.string(from: d)
    }
}
