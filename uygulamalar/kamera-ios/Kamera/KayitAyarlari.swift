import AVFoundation

/// Genel Ayarlar'ın kayıt seçenekleri (Fatih 29 Ekim): kodek, SDR / HDR / Log, sabitleme, enstantane süre ↔ açı, ses girişi ve ses biçimi.
/// Telefonun desteklemediği seçenek ayarlarda soluk görünür; kayıtta desteklenmeyen seçim kendiliğinden en yakın desteklenene düşer.

enum Kodek: String, CaseIterable, Identifiable {
    case hevc, h264, proresHQ, prores, proresLT, proresProxy
    var id: String { rawValue }
    var ad: String {
        switch self {
        case .hevc: return "HEVC (H.265)"
        case .h264: return "H.264"
        case .proresHQ: return "ProRes 422 HQ"
        case .prores: return "ProRes 422"
        case .proresLT: return "ProRes 422 LT"
        case .proresProxy: return "ProRes 422 Proxy"
        }
    }
    /// Üst bilgide
    var kisa: String {
        switch self {
        case .hevc: return "HEVC"
        case .h264: return "H.264"
        case .proresHQ: return "HQ"
        case .prores: return "422"
        case .proresLT: return "LT"
        case .proresProxy: return "PROXY"
        }
    }
    var aciklama: String {
        switch self {
        case .hevc: return "Küçük dosya, yüksek kalite (MP4 uyumlu)"
        case .h264: return "En geniş uyumluluk (MP4)"
        case .proresHQ: return "Kurgu için en yüksek kalite, çok büyük dosya"
        case .prores: return "Kurgu için yüksek kalite"
        case .proresLT: return "ProRes, daha küçük dosya"
        case .proresProxy: return "Hafif ProRes, ön kurgu için"
        }
    }
    var prores: Bool { self != .hevc && self != .h264 }
    var tur: AVVideoCodecType {
        switch self {
        case .hevc: return .hevc
        case .h264: return .h264
        case .proresHQ: return .proRes422HQ
        case .prores: return .proRes422
        case .proresLT: return .proRes422LT
        case .proresProxy: return .proRes422Proxy
        }
    }
}

enum RenkModu: String, CaseIterable, Identifiable {
    case sdr, hdr, log
    var id: String { rawValue }
    var ad: String { switch self { case .sdr: return "SDR"; case .hdr: return "HDR (Dolby Vision / HLG)"; case .log: return "Apple Log" } }
    var kisa: String { switch self { case .sdr: return "SDR"; case .hdr: return "HDR"; case .log: return "LOG" } }
    var aciklama: String {
        switch self {
        case .sdr: return "Her ekranda aynı görünür, renk düzeltmesi gerekmez"
        case .hdr: return "Parlak ışıklar ve derin gölgeler; HDR ekranda en iyi görünür"
        case .log: return "Düz, soluk görüntü; kurguda renklendirmek için en geniş aralık"
        }
    }
}

enum Sabitleme: String, CaseIterable, Identifiable {
    case kapali, standart, sinematik, sinematikGenis, aksiyon
    var id: String { rawValue }
    var ad: String {
        switch self {
        case .kapali: return "Kapalı"
        case .standart: return "Standart"
        case .sinematik: return "Sinematik"
        case .sinematikGenis: return "Sinematik geniş"
        case .aksiyon: return "Aksiyon"
        }
    }
    var aciklama: String {
        switch self {
        case .kapali: return "Görüntü kırpılmaz; tripod ve gimbal için"
        case .standart: return "Hafif sabitleme, az kırpma"
        case .sinematik: return "Yürürken yumuşak görüntü"
        case .sinematikGenis: return "En güçlü sabitleme, daha çok kırpma"
        case .aksiyon: return "Koşu, araç içi gibi sert hareket"
        }
    }
    var mod: AVCaptureVideoStabilizationMode {
        switch self {
        case .kapali: return .off
        case .standart: return .standard
        case .sinematik: return .cinematic
        case .sinematikGenis: return .cinematicExtended
        case .aksiyon:
            if #available(iOS 18.0, *) { return .cinematicExtendedEnhanced }
            return .cinematicExtended
        }
    }
}

enum SesBicimi: String, CaseIterable, Identifiable {
    case oto, pcm24, pcm16, aac
    var id: String { rawValue }
    var ad: String {
        switch self {
        case .oto: return "Otomatik"
        case .pcm24: return "24 bit PCM"
        case .pcm16: return "16 bit PCM"
        case .aac: return "AAC"
        }
    }
    var aciklama: String {
        switch self {
        case .oto: return "Harici mikrofonda 24 bit PCM, telefonun mikrofonunda AAC"
        case .pcm24: return "Sıkıştırmasız, en geniş ses aralığı"
        case .pcm16: return "Sıkıştırmasız, CD kalitesi"
        case .aac: return "Sıkıştırılmış, küçük dosya"
        }
    }
}

struct SesGirdi: Identifiable, Hashable {
    let id: String
    let ad: String
    let harici: Bool
}

extension Kamera {
    /// Video enstantanesi: açı listesi (derece) ve süre listesi (sn); kare süresinden uzun olamaz
    static let acilar: [Double] = [45, 90, 144, 172.8, 180, 270, 360]
    static let videoEnstler: [Double] = [1.0 / 2000, 1.0 / 1000, 1.0 / 500, 1.0 / 250, 1.0 / 125, 1.0 / 120, 1.0 / 100, 1.0 / 60, 1.0 / 50, 1.0 / 48, 1.0 / 30, 1.0 / 25, 1.0 / 24]

    var videoEnstSecenekleri: [Double] {
        let kare = 1 / Double(max(1, videoFps))
        if enstAci { return Kamera.acilar.map { $0 / 360 * kare } }
        return Kamera.videoEnstler.filter { $0 <= kare + 1e-6 }
    }

    /// Ekranda enstantane: VİDEO'da açı seçiliyse derece ("180°"), değilse süre ("1/50")
    func enstGoster(_ e: Double) -> String {
        if e >= Kamera.bulb { return "BULB" }
        if mod == .video && enstAci {
            let a = 360 * Double(videoFps) * e
            return (abs(a - a.rounded()) < 0.05 ? String(Int(a.rounded())) : String(format: "%.1f", a).replacingOccurrences(of: ".", with: ",")) + "°"
        }
        return ProMod.enstYazi(e)
    }

    /// Beyaz denge şu an kaç Kelvin (oto iken telefonun tahmini)
    var mevcutKelvin: Float {
        if let k = bd { return k }
        guard let d = cihaz else { return 5500 }
        return d.temperatureAndTintValues(for: d.deviceWhiteBalanceGains).temperature
    }

    /// Yeşil (−) ↔ macenta (+); beyaz denge otomatikse o anki Kelvin'de kilitlenir
    func tonSec(_ t: Float) {
        if bd == nil { bd = (mevcutKelvin / 50).rounded() * 50 }
        renkTon = t
        kuyruk.async { self.normalUygula() }
    }

    /// Kuyrukta, yapılandırma içinde: renk alanı (SDR / HDR / Log). Fotoğrafta iPhone kendisi seçer (geniş renk).
    func renkAlaniUygula(_ d: AVCaptureDevice, video: Bool) {
        oturum.automaticallyConfiguresCaptureDeviceForWideColor = !video
        guard video, (try? d.lockForConfiguration()) != nil else { return }
        defer { d.unlockForConfiguration() }
        let alanlar = d.activeFormat.supportedColorSpaces
        switch renkModu {
        case .log where alanlar.contains(.appleLog): d.activeColorSpace = .appleLog
        case .hdr where alanlar.contains(.HLG_BT2020): d.activeColorSpace = .HLG_BT2020
        default: d.activeColorSpace = .sRGB
        }
    }

    /// Ayarlar açılınca: bu telefonda ve bu biçimde hangi seçenekler var
    func secenekleriYaz() {
        sesGirdileriYaz()
        kuyruk.async {
            guard let d = self.cihaz else { return }
            let h = self.videoYukseklik, f = self.videoFps
            let renkler = RenkModu.allCases.filter { r in
                r == .sdr || Kamera.videoBicimi(d, yukseklik: h, fps: f, renk: r).map { $0.supportedColorSpaces.contains(r == .log ? .appleLog : .HLG_BT2020) } ?? false
            }
            // ProRes: bu çözünürlük/kare hızı/renkte 10 bit 4:2:2 biçim varsa (etkin biçim ne olursa olsun; seçilince biçim o olur)
            let x422 = Kamera.videoBicimi(d, yukseklik: h, fps: f, renk: self.renkModu, prores: true)
                .map { CMFormatDescriptionGetMediaSubType($0.formatDescription) == Kamera.x422 } ?? false
            var kodekler: [Kodek] = [.hevc, .h264]
            if x422 { kodekler += [.proresHQ, .prores, .proresLT, .proresProxy] }
            if self.oturum.outputs.contains(self.videoCikti), self.cihaz.map({ CMFormatDescriptionGetMediaSubType($0.activeFormat.formatDescription) == Kamera.x422 }) == true {
                let var_ = self.videoCikti.availableVideoCodecTypes
                kodekler = kodekler.filter { !$0.prores || var_.contains($0.tur) }
            }
            // Bu çözünürlük/kare hızında herhangi bir biçimin desteklediği sabitlemeler (seçilince o biçime geçilir)
            let sabit = Sabitleme.allCases.filter { s in
                d.activeFormat.isVideoStabilizationModeSupported(s.mod) || Kamera.videoBicimi(d, yukseklik: h, fps: f, sabit: s.mod)?.isVideoStabilizationModeSupported(s.mod) == true
            }
            let fpsler = [24, 25, 30, 60].filter { Kamera.videoBicimi(d, yukseklik: h, fps: $0) != nil }
            DispatchQueue.main.async {
                self.renkModlari = renkler
                self.kodekler = kodekler
                self.sabitlemeler = sabit.isEmpty ? [.kapali] : sabit
                self.videoFpsler = fpsler.isEmpty ? [30] : fpsler
            }
        }
    }

    // MARK: ses

    /// Uygulamanın ses oturumu: ses girişini biz seçeriz (kamera oturumu kendisi ayarlamaz)
    func sesOturumuKur() {
        oturum.automaticallyConfiguresApplicationAudioSession = false
        let s = AVAudioSession.sharedInstance()
        try? s.setCategory(.playAndRecord, mode: .videoRecording, options: [.defaultToSpeaker, .allowBluetooth])
        try? s.setActive(true)
        sesGirdisiUygula()
        NotificationCenter.default.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] _ in
            self?.sesGirdileriYaz()
        }
    }

    func sesGirdileriYaz() {
        let s = AVAudioSession.sharedInstance()
        let liste = (s.availableInputs ?? []).map { SesGirdi(id: $0.uid, ad: $0.portName, harici: $0.portType != .builtInMic) }
        let etkin = s.currentRoute.inputs.first
        DispatchQueue.main.async {
            self.sesGirdileri = liste
            self.etkinSesGirdi = etkin?.portName
            self.harici = etkin.map { $0.portType != .builtInMic } ?? false
        }
    }

    /// nil = otomatik (takılan harici mikrofonu iPhone kendisi seçer)
    func sesGirdisiUygula() {
        let s = AVAudioSession.sharedInstance()
        let p = sesGirdi.flatMap { id in s.availableInputs?.first { $0.uid == id } }
        try? s.setPreferredInput(p)
        sesGirdileriYaz()
    }

    // MARK: kayıt

    /// Ayar değişince (VİDEO'da, kayıt yokken) kayıt biçimi hemen uygulanır
    func kayitHazirla() {
        guard kuruldu, mod == .video, !kayitta else { return }
        kuyruk.async { self.kayitBicimiUygula() }
    }

    /// Kuyrukta: kodek, sabitleme, ses biçimi. Değişmediyse dokunmaz (kayıt başında yeniden kurulum olmasın)
    func kayitBicimiUygula() {
        let ssdVar = ssdKayit && ssd.takili
        let imza = "\(kodek.rawValue)|\(sabitleme.rawValue)|\(sesBicimi.rawValue)|\(harici)|\(ssdVar)"
        guard imza != kayitImza else { return }
        kayitImza = imza
        if let b = videoCikti.connection(with: .video) {
            let var_ = videoCikti.availableVideoCodecTypes
            var k = kodek.tur
            // Apple kuralı: ProRes 4K 60 yalnız harici SSD'ye; SSD yoksa HEVC
            if proresSsdGerek, !ssdVar { k = .hevc }
            if !var_.contains(k) { k = var_.contains(.hevc) ? .hevc : (var_.first ?? .h264) }
            videoCikti.setOutputSettings([AVVideoCodecKey: k], for: b)
            if b.isVideoStabilizationSupported { b.preferredVideoStabilizationMode = sabitleme.mod }
        }
        guard let a = videoCikti.connection(with: .audio) else { return }
        if varsayilanSes == nil { varsayilanSes = videoCikti.outputSettings(for: a) }
        let bit: Int?
        switch sesBicimi {
        case .oto: bit = harici ? 24 : nil
        case .pcm24: bit = 24
        case .pcm16: bit = 16
        case .aac: bit = nil
        }
        let destek = Set(videoCikti.supportedOutputSettingsKeys(for: a))
        if let bit, destek.contains(AVFormatIDKey), destek.contains(AVLinearPCMBitDepthKey) {
            var ayar = varsayilanSes ?? [:]
            for anahtar in [AVEncoderBitRateKey, AVEncoderBitRatePerChannelKey, AVEncoderAudioQualityKey, AVEncoderBitRateStrategyKey,
                            AVEncoderAudioQualityForVBRKey, AVSampleRateConverterAudioQualityKey] { ayar.removeValue(forKey: anahtar) }
            ayar[AVFormatIDKey] = kAudioFormatLinearPCM
            ayar[AVLinearPCMBitDepthKey] = bit
            ayar[AVLinearPCMIsFloatKey] = false
            ayar[AVLinearPCMIsBigEndianKey] = false
            ayar[AVLinearPCMIsNonInterleaved] = false
            if ayar[AVSampleRateKey] == nil { ayar[AVSampleRateKey] = 48_000 }
            videoCikti.setOutputSettings(ayar.filter { destek.contains($0.key) }, for: a)
            sonSesBicimi = "\(bit) bit PCM"
        } else {
            if let v = varsayilanSes { videoCikti.setOutputSettings(v, for: a) }
            sonSesBicimi = "AAC"
        }
    }
}
