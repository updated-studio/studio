import Foundation
import AppKit

enum MikrofonDurumu: Equatable {
    case kapali, acik, dinliyor, izinYok, desteklenmiyor, dikteKapali, anahtarYok, modelHazirlaniyor
    case modelIndiriliyor(Double)
    case hata(String)

    var yazi: String {
        switch self {
        case .kapali: return "Mikrofon kapalı"
        case .acik: return "Dinlemeye hazır"
        case .dinliyor: return "Sesi takip ediyor"
        case .izinYok: return "Mikrofon ya da konuşma tanıma izni yok"
        case .desteklenmiyor: return "Türkçe konuşma tanıma kullanılamıyor"
        case .dikteKapali: return "Mac'te Dikte kapalı"
        case .anahtarYok: return "Deepgram anahtarı girilmemiş"
        case .modelHazirlaniyor: return "Model hazırlanıyor (ilk seferde 1-2 dk sürebilir)"
        case .modelIndiriliyor(let p): return "Model indiriliyor %\(Int(p * 100))"
        case .hata(let m): return "Hata: \(m)"
        }
    }

    var sorunlu: Bool {
        switch self {
        case .izinYok, .desteklenmiyor, .dikteKapali, .anahtarYok, .hata: return true
        default: return false
        }
    }
}

/// Prompter'ın o anki durumu: hangi kelimede, çalışıyor mu, süre, mikrofon.
final class Oturum: ObservableObject {
    static let ortak = Oturum()

    @Published private(set) var ayrisim = Ayrisim.bos
    @Published var ptr = 0
    @Published private(set) var calisiyor = false
    @Published private(set) var sure: TimeInterval = 0
    @Published var mikrofon: MikrofonDurumu = .kapali
    @Published private(set) var geriSayimKalan: Int?
    @Published var panelGorunur = false
    @Published var ustBosluk: CGFloat = 38

    weak var gorunum: PrompterMetinView?
    let takipci = SesTakipci()

    private var sureZamanlayici: Timer?
    private var geriSayimZamanlayici: Timer?
    private var yukleIsi: DispatchWorkItem?

    private init() {
        takipci.ilerledi = { [weak self] p in
            guard let self else { return }
            if p > self.ptr { self.ptr = p }
        }
        takipci.durumDegisti = { [weak self] d in self?.mikrofon = d }
    }

    var kalanSure: TimeInterval { Double(max(0, ayrisim.tokenlar.count - ptr)) / 140.0 * 60.0 }

    func metniYukle(hemen: Bool = false) {
        yukleIsi?.cancel()
        let isNesnesi = DispatchWorkItem { [weak self] in
            guard let self else { return }
            let a = Ayrisim.ayir(MetinDeposu.ortak.secili?.govde ?? "")
            self.ayrisim = a
            self.takipci.tokenlariAyarla(a.tokenlar)
            if self.ptr >= a.tokenlar.count { self.ptr = max(0, a.tokenlar.count - 1) }
            self.takipci.konumAyarla(self.ptr)
        }
        yukleIsi = isNesnesi
        DispatchQueue.main.asyncAfter(deadline: .now() + (hemen ? 0 : 0.3), execute: isNesnesi)
    }

    func yeniMetinSecildi() {
        durdur()
        ptr = 0
        sure = 0
        gorunum?.basaDon()
        metniYukle(hemen: true)
    }

    func baslat() {
        guard !calisiyor, geriSayimZamanlayici == nil else { return }
        PanelYoneticisi.ortak.goster()
        if Ayarlar.ortak.geriSayim {
            geriSayimKalan = 3
            let t = Timer(timeInterval: 1, repeats: true) { [weak self] t in
                guard let self else { t.invalidate(); return }
                let kalan = (self.geriSayimKalan ?? 1) - 1
                if kalan <= 0 {
                    t.invalidate()
                    self.geriSayimZamanlayici = nil
                    self.geriSayimKalan = nil
                    self.gercektenBaslat()
                } else {
                    self.geriSayimKalan = kalan
                }
            }
            RunLoop.main.add(t, forMode: .common)
            geriSayimZamanlayici = t
        } else {
            gercektenBaslat()
        }
    }

    private func gercektenBaslat() {
        calisiyor = true
        if Ayarlar.ortak.kip == .ses { takipci.baslat(konum: ptr) }
        let t = Timer(timeInterval: 0.25, repeats: true) { [weak self] _ in self?.sure += 0.25 }
        RunLoop.main.add(t, forMode: .common)
        sureZamanlayici = t
    }

    func durdur() {
        geriSayimZamanlayici?.invalidate(); geriSayimZamanlayici = nil; geriSayimKalan = nil
        sureZamanlayici?.invalidate(); sureZamanlayici = nil
        calisiyor = false
        takipci.durdur()
    }

    func degistir() {
        if calisiyor || geriSayimZamanlayici != nil { durdur() } else { baslat() }
    }

    func basaDon() {
        ptr = 0
        sure = 0
        gorunum?.basaDon()
        takipci.konumAyarla(0)
    }

    /// Kelime sayısı kadar ileri/geri (sese göre) ya da iki satır (diğer kiplerde).
    func zipla(_ fark: Int) {
        if Ayarlar.ortak.kip == .ses {
            ptr = min(max(0, ptr + fark), max(0, ayrisim.tokenlar.count - 1))
            takipci.konumAyarla(ptr)
        } else {
            gorunum?.satirKaydir(fark > 0 ? 2 : -2)
        }
    }

    /// Sese göre kipte kullanıcı fareyle kaydırdığında takip o noktadan sürer.
    func elleKonum(_ p: Int) {
        ptr = p
        takipci.konumAyarla(p)
    }

    func kipDegisti() {
        guard calisiyor else { return }
        if Ayarlar.ortak.kip == .ses { takipci.baslat(konum: ptr) } else { takipci.durdur() }
    }

    /// Konuşma tanıma motoru değişti: çalışıyorsa yeni motorla yeniden başlar.
    func motorDegisti() {
        takipci.durdur()
        if calisiyor && Ayarlar.ortak.kip == .ses { takipci.baslat(konum: ptr) }
    }

    func hizDegistir(_ fark: Double) {
        Ayarlar.ortak.hiz = min(160, max(10, Ayarlar.ortak.hiz + fark))
    }
}
