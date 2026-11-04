import Foundation
import AVFoundation

/// Bir konuşma tanıma motoru. Bütün geri çağrılar ana iş parçacığında gelir.
protocol KonusmaKaynagi: AnyObject {
    /// Geçerli oturumda o ana kadar duyulan bütün kelimeler (birikimli; ara sonuçlar düzelebilir).
    var kelimeler: (([String]) -> Void)? { get set }
    /// Yeni oturum başladı: bundan sonraki kelimeler sıfırdan sayılır.
    var yeniOturum: (() -> Void)? { get set }
    var durum: ((MikrofonDurumu) -> Void)? { get set }
    func baslat()
    func durdur()
}

/// Seçili motoru çalıştırır ve duyulan kelimeleri prompter metnindeki konuma eşler.
final class SesTakipci {
    var ilerledi: ((Int) -> Void)?
    var durumDegisti: ((MikrofonDurumu) -> Void)?

    private var kaynak: KonusmaKaynagi?
    private var tokenlar: [String] = []
    private var taban = 0
    private var atla = 0
    private var sonSayi = 0
    private var konum = 0
    private var acik = false

    func tokenlariAyarla(_ t: [String]) {
        tokenlar = t
        if konum >= t.count { konum = max(0, t.count - 1) }
        taban = konum
        atla = sonSayi
    }

    /// Konum dışarıdan değişti (geri sar, fareyle kaydırma): takip yeni yerden sürer.
    func konumAyarla(_ p: Int) {
        konum = p
        taban = p
        atla = sonSayi
    }

    func baslat(konum p: Int) {
        konum = p
        if acik { return }
        acik = true
        AVCaptureDevice.requestAccess(for: .audio) { izin in
            DispatchQueue.main.async {
                guard self.acik else { return }
                guard izin else {
                    self.acik = false
                    self.durumDegisti?(.izinYok)
                    return
                }
                let k = Self.olustur(Ayarlar.ortak.motor)
                k.kelimeler = { [weak self] w in self?.isle(w) }
                k.yeniOturum = { [weak self] in
                    guard let self else { return }
                    self.taban = self.konum
                    self.atla = 0
                    self.sonSayi = 0
                }
                k.durum = { [weak self] d in self?.durumGeldi(d) }
                self.kaynak = k
                self.taban = self.konum
                self.atla = 0
                self.sonSayi = 0
                k.baslat()
            }
        }
    }

    func durdur() {
        let oncedenAcik = acik
        acik = false
        kaynak?.durdur()
        kaynak = nil
        if oncedenAcik { durumDegisti?(.kapali) }
    }

    private static func olustur(_ m: Motor) -> KonusmaKaynagi {
        switch m {
        case .apple: return AppleKaynagi()
        case .deepgram: return DeepgramKaynagi()
        case .whisperHizli, .whisperDengeli, .whisperEnIyi: return WhisperKaynagi(model: m.whisperModeli ?? "openai_whisper-base")
        }
    }

    private func durumGeldi(_ d: MikrofonDurumu) {
        guard acik else { return }
        if d.sorunlu {
            acik = false
            kaynak?.durdur()
            kaynak = nil
        }
        durumDegisti?(d)
    }

    private func isle(_ kelimeler: [String]) {
        guard acik else { return }
        sonSayi = kelimeler.count
        let p = Hizalama.hizala(kelimeler, tokenlar: tokenlar, taban: taban, atla: atla)
        let yeni = min(p, max(0, tokenlar.count - 1))
        if yeni > konum {
            konum = yeni
            ilerledi?(yeni)
        }
        durumDegisti?(.dinliyor)
    }
}
