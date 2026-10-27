import AVFoundation
import Photos
import UIKit

/// Hazır Pro modlar kameraya: ISO / enstantane (tam el ile ya da enstantane önceliği), EV, beyaz dengesi, odak, yakınlaştırma;
/// çekimde tek kare, kare birleştirme ya da seri çekim. Android'deki KameraKaynak.pro ile aynı mantık.
extension Kamera {

    // MARK: seçim

    func proModSec(_ m: ProMod) {
        proMod = m
        proAyar = m.oku()
        UserDefaults.standard.set(m.rawValue, forKey: "proMod")
        kuyruk.async { self.proUygula() }
    }

    func proAyarDegistir(_ a: ProAyar) {
        proAyar = a
        proMod.yaz(a)
        kuyruk.async { self.proUygula() }
    }

    func proVarsayilan() { proAyarDegistir(proMod.varsayilan) }

    /// Telefon tek karede bu enstantaneyi veremiyorsa ekranda "birleştirilir" bilgisi
    var proBirlestirilecek: Birlestir? { proMod.birlestirme(proAyar, enUzun: enUzunEnst) }

    // MARK: kameraya uygula (kuyrukta)

    func proUygula() {
        guard let d = cihaz, (try? d.lockForConfiguration()) != nil else { return }
        defer { d.unlockForConfiguration() }
        let m = proMod, a = proAyar
        let bicim = d.activeFormat
        let enKisa = bicim.minExposureDuration.seconds, enUzun = bicim.maxExposureDuration.seconds

        d.videoZoomFactor = m.tele ? min(3, d.maxAvailableVideoZoomFactor) : 1

        // Pozlama
        d.activeMaxExposureDuration = .invalid
        if a.iso == nil && a.enst == nil {
            if d.isExposureModeSupported(.continuousAutoExposure) { d.exposureMode = .continuousAutoExposure }
            if let ust = m.enstUst { d.activeMaxExposureDuration = CMTime(seconds: max(enKisa, min(ust, enUzun)), preferredTimescale: 1_000_000) }
            d.setExposureTargetBias(min(max(a.ev, d.minExposureTargetBias), d.maxExposureTargetBias))
        } else {
            d.setExposureTargetBias(0)
            // Telefon istenen süreyi tek karede veremiyorsa en uzun süre kullanılır, ISO aradaki fark kadar artar (birleştirme bunu tamamlar)
            let istenen = a.enst ?? d.exposureDuration.seconds
            let sure = min(max(istenen, enKisa), enUzun)
            var iso: Float
            if let i = a.iso {
                iso = i * Float(max(1, istenen / sure))
            } else {
                // Enstantane önceliği: son otomatik ölçümün ışığı korunur
                iso = d.iso * Float(d.exposureDuration.seconds / sure)
                if let ust = m.isoUst { iso = min(iso, ust) }
            }
            iso = min(max(iso, bicim.minISO), bicim.maxISO)
            d.setExposureModeCustom(duration: CMTime(seconds: sure, preferredTimescale: 1_000_000), iso: iso)
        }

        // Beyaz dengesi
        if let k = a.bd, d.isWhiteBalanceModeSupported(.locked) {
            var g = d.deviceWhiteBalanceGains(for: AVCaptureDevice.WhiteBalanceTemperatureAndTintValues(temperature: k, tint: 0))
            let ust = d.maxWhiteBalanceGain
            g.redGain = min(max(g.redGain, 1), ust); g.greenGain = min(max(g.greenGain, 1), ust); g.blueGain = min(max(g.blueGain, 1), ust)
            d.setWhiteBalanceModeLocked(with: g)
        } else if d.isWhiteBalanceModeSupported(.continuousAutoWhiteBalance) {
            d.whiteBalanceMode = .continuousAutoWhiteBalance
        }

        // Odak (sonsuz ve 2 m elle; mercek konumu 0 yakın, 1 uzak)
        switch a.odak {
        case .afs: if d.isFocusModeSupported(.autoFocus) { d.focusMode = .autoFocus }
        case .afc: if d.isFocusModeSupported(.continuousAutoFocus) { d.focusMode = .continuousAutoFocus }
        case .sonsuz: if d.isLockingFocusWithCustomLensPositionSupported { d.setFocusModeLocked(lensPosition: 1) }
        case .iki: if d.isLockingFocusWithCustomLensPositionSupported { d.setFocusModeLocked(lensPosition: 0.8) }
        }
    }

    /// Pro moddan çıkınca kamera otomatiğe döner
    func proBirak() {
        guard let d = cihaz, (try? d.lockForConfiguration()) != nil else { return }
        defer { d.unlockForConfiguration() }
        d.videoZoomFactor = 1
        d.activeMaxExposureDuration = .invalid
        if d.isExposureModeSupported(.continuousAutoExposure) { d.exposureMode = .continuousAutoExposure }
        d.setExposureTargetBias(0)
        if d.isWhiteBalanceModeSupported(.continuousAutoWhiteBalance) { d.whiteBalanceMode = .continuousAutoWhiteBalance }
        if d.isFocusModeSupported(.continuousAutoFocus) { d.focusMode = .continuousAutoFocus }
    }

    // MARK: çekim

    func proCek(yon: AVCaptureVideoOrientation) {
        if proCalisiyor { kareKuyruk.async { self.birlestirmeBitir() }; return }
        let m = proMod, a = proAyar
        let yol = m.birlestirme(a, enUzun: enUzunEnst)
        proCalisiyor = true
        Task { @MainActor in
            for i in stride(from: a.zamanlayici, to: 0, by: -1) {
                proIlerleme = "\(i)"
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                if !proCalisiyor { proIlerleme = nil; return }
            }
            proIlerleme = nil
            guard let yol else {
                kuyruk.async {
                    self.fotoCikti.connection(with: .video)?.videoOrientation = yon
                    self.fotoCek(hizli: m.seri)
                }
                proCalisiyor = false
                return
            }
            UIApplication.shared.isIdleTimerDisabled = true
            let hedef = yol == .ortalama && !m.sureVar ? m.kareSayisi(a) : 0
            let saniye = Double(a.sure > 0 ? a.sure : Int(max(1, (a.enst ?? 1).rounded())))
            proIlerleme = hedef > 0 ? "Birleştiriliyor 0/\(hedef)" : "0:00 / \(Kamera.saat(saniye))"
            kareKuyruk.async {
                self.kareCikti.connection(with: .video)?.videoOrientation = yon
                self.birlestirici = Birlestirici(yol)
                self.birlestirmeHedef = hedef
                self.birlestirmeBitis = hedef > 0 ? nil : Date().addingTimeInterval(saniye)
            }
        }
    }

    /// Spor / Kuş: deklanşör basılı tutulunca seri çekim
    func seriBasla(yon: AVCaptureVideoOrientation) {
        guard mod == .pro, proMod.seri, seriZamanlayici == nil else { return }
        kuyruk.async { self.fotoCikti.connection(with: .video)?.videoOrientation = yon }
        seriZamanlayici = Timer.scheduledTimer(withTimeInterval: 0.15, repeats: true) { [weak self] _ in
            self?.kuyruk.async { self?.fotoCek(hizli: true) }
        }
    }

    func seriBitir() { seriZamanlayici?.invalidate(); seriZamanlayici = nil }

    /// kareKuyruk'ta: biriken kareler tek fotoğraf olur
    func birlestirmeBitir() {
        guard let b = birlestirici else { return }
        birlestirici = nil
        birlestirmeBitis = nil
        let resim = b.sonuc(yon: .up)
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = false
            self.proCalisiyor = false
            self.proIlerleme = nil
            guard let veri = resim?.jpegData(compressionQuality: 0.95) else { self.bildirim = "Birleştirilemedi."; return }
            self.kaydet({ PHAssetCreationRequest.forAsset().addResource(with: .photo, data: veri, options: nil) }, mesaj: "Fotoğraf kaydedildi (\(b.sayi) kare)")
        }
    }

    static func saat(_ s: Double) -> String {
        let t = Int(s)
        return t >= 3600 ? String(format: "%d:%02d:%02d", t / 3600, t / 60 % 60, t % 60) : String(format: "%d:%02d", t / 60, t % 60)
    }
}

extension Kamera: AVCaptureVideoDataOutputSampleBufferDelegate {
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        for d in kareDinleyiciler { d(sampleBuffer) }
        guard let b = birlestirici, let kare = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        b.ekle(kare)
        let bitti: Bool
        let yazi: String
        if birlestirmeHedef > 0 {
            bitti = b.sayi >= birlestirmeHedef
            yazi = "Birleştiriliyor \(b.sayi)/\(birlestirmeHedef)"
        } else if let son = birlestirmeBitis {
            let kalan = son.timeIntervalSinceNow
            bitti = kalan <= 0
            yazi = "\(b.sayi) kare · \(Kamera.saat(max(0, kalan))) kaldı"
        } else { bitti = true; yazi = "" }
        if bitti { birlestirmeBitir() } else { DispatchQueue.main.async { if self.proCalisiyor { self.proIlerleme = yazi } } }
    }
}
