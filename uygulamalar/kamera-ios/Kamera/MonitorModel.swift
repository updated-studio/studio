import AVFoundation
import CoreMotion
import Network
import Photos
import SwiftUI

/// Monitör (Android MainActivity karşılığı): bir ya da iki bölme; kaynak telefon kamerası, iPad'e USB ile takılı kamera
/// (Sony USB yayını, HDMI→USB çevirici) ya da Wi-Fi kamera. Araçlar bölme başına; kayıt temiz görüntü + ses.
final class Monitor: NSObject, ObservableObject {
    enum Kip: String, CaseIterable, Identifiable {
        case tek = "Tek ekran", olcum = "Görüntü + ölçümler", karsilastir = "LUT karşılaştırma", iki = "İki kaynak"
        var id: String { rawValue }
    }
    enum Param: String { case fps, enstantane, diyafram, iso, wb, ev, odak }
    enum Sekme: String, CaseIterable, Identifiable {
        case kayit = "KAYIT", monitor = "MONİTÖR", kilavuz = "KILAVUZ", lut = "LUT", olcum = "ÖLÇÜM", ses = "SES", kaynak = "KAYNAK", kurulum = "KURULUM"
        var id: String { rawValue }
        var simge: String {
            switch self {
            case .kayit: return "record.circle"
            case .monitor: return "display"
            case .kilavuz: return "crop"
            case .lut: return "square.stack.3d.up"
            case .olcum: return "waveform.path.ecg"
            case .ses: return "speaker.wave.2"
            case .kaynak: return "arrow.left.arrow.right"
            case .kurulum: return "info.circle"
            }
        }
    }
    /// Bölmenin kaynağı (saklanır)
    enum Kaynak: Codable, Equatable {
        case cihaz(String)          // AVCaptureDevice.uniqueID
        case wifi(String, String?)  // ad, elle adres
    }
    struct WifiBulunan: Identifiable { let ad: String; let hedef: NWEndpoint; var id: String { ad } }

    // MARK: durum (ekran)
    @Published var kip: Kip = .tek
    @Published var etkin = 0
    @Published var ayarlar: [BolmeAyari] = [BolmeAyari(), BolmeAyari()] { didSet { ayarlariUygula() } }
    @Published var kamAyar = KameraAyari()
    @Published var kaynaklar: [Kaynak?] = [nil, nil]
    @Published var kaynakAdi = ["", ""]
    @Published var bagli = [false, false]
    @Published var kayitta = false
    @Published var kayitBasi: Date?
    @Published var bildirim: String?
    @Published var ses: (Float, Float) = (-90, -90)
    @Published var bulunanWifi: [WifiBulunan] = []
    @Published var egim: Double?
    @Published var sonKayit: UIImage?
    @Published var kalanYazi = ""

    // Saklanan tercihler (Android ile aynı varsayılanlar)
    @Published var hevc = UserDefaults.standard.bool(forKey: "m.hevc") { didSet { UserDefaults.standard.set(hevc, forKey: "m.hevc") } }
    @Published var mbps = (UserDefaults.standard.object(forKey: "m.mbps") as? Int) ?? 50 { didSet { UserDefaults.standard.set(mbps, forKey: "m.mbps") } }
    @Published var sesKayit = (UserDefaults.standard.object(forKey: "m.sesKayit") as? Bool) ?? true { didSet { UserDefaults.standard.set(sesKayit, forKey: "m.sesKayit") } }
    @Published var sesGosterge = (UserDefaults.standard.object(forKey: "m.sesGosterge") as? Bool) ?? true { didSet { UserDefaults.standard.set(sesGosterge, forKey: "m.sesGosterge") } }
    @Published var koseHisto = UserDefaults.standard.bool(forKey: "m.koseHisto") { didSet { UserDefaults.standard.set(koseHisto, forKey: "m.koseHisto"); olcumBagla() } }
    @Published var parlaklikTam = UserDefaults.standard.bool(forKey: "m.parlaklik") { didSet { UserDefaults.standard.set(parlaklikTam, forKey: "m.parlaklik"); parlaklik() } }
    @Published var teraziAcik = UserDefaults.standard.bool(forKey: "m.terazi") { didSet { UserDefaults.standard.set(teraziAcik, forKey: "m.terazi"); teraziKur() } }

    let ciziciler = [MonitorCizici(), MonitorCizici()]
    let olcum = OlcumHesap()
    let kose = OlcumHesap(yalnizHistogram: true)

    // MARK: iç
    private let oturumKuyrugu = DispatchQueue(label: "tr.com.updated.monitor.oturum")
    private let kareKuyrugu = DispatchQueue(label: "tr.com.updated.monitor.kare")
    private let sesKuyrugu = DispatchQueue(label: "tr.com.updated.monitor.ses")
    private var oturum: AVCaptureSession?
    private var sesCikti: AVCaptureAudioDataOutput?
    private let kilit = NSLock()
    private var ciktiBolme: [ObjectIdentifier: Int] = [:]
    private var cihazlar: [AVCaptureDevice?] = [nil, nil]
    private var donusler: [AVCaptureDevice.RotationCoordinator?] = [nil, nil]
    private var donusGozleri: [NSKeyValueObservation?] = [nil, nil]
    private var baglantilar: [AVCaptureConnection?] = [nil, nil]
    private var wifi: [WifiAlici?] = [nil, nil]
    private let bulucu = KameraBulucu()
    private var sesBicimi: AudioStreamBasicDescription?
    private var kaydedici: MonitorKaydedici?
    private var zamanlayici: Timer?
    private let hareket = CMMotionManager()
    private var eskiParlaklik: CGFloat?
    private var acik = false

    override init() {
        super.init()
        kip = Kip(rawValue: UserDefaults.standard.string(forKey: "m.kip") ?? "") ?? .tek
        for i in 0..<2 {
            if let a = Saklama.oku("m.ayar\(i)", BolmeAyari.self) { ayarlar[i] = a }
            kaynaklar[i] = Saklama.oku("m.kaynak\(i)", Kaynak.self)
        }
    }

    // MARK: yaşam döngüsü

    func ac() {
        guard !acik else { return }
        acik = true
        UIApplication.shared.isIdleTimerDisabled = true
        parlaklik()
        bulucu.bulundu = { [weak self] ad, hedef in
            guard let self, !self.bulunanWifi.contains(where: { $0.ad == ad }) else { return }
            self.bulunanWifi.append(WifiBulunan(ad: ad, hedef: hedef))
            // Saklı kaynak bu kameraysa ve henüz bağlı değilse bağlan
            for i in 0..<self.bolmeSayisi { if case .wifi(let a, let adres) = self.kaynaklar[i], adres == nil, a == ad, self.wifi[i] == nil { self.wifiAc(i, ad: ad, hedef: hedef) } }
        }
        bulucu.baslat()
        zamanlayici = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in self?.tik() }
        teraziKur()
        Task {
            _ = await AVCaptureDevice.requestAccess(for: .video)
            _ = await AVCaptureDevice.requestAccess(for: .audio)
            await MainActor.run { self.kur() }
        }
    }

    func kapat() {
        guard acik else { return }
        acik = false
        if kayitta { kayitDugmesi() }
        bulucu.durdur()
        zamanlayici?.invalidate(); zamanlayici = nil
        hareket.stopDeviceMotionUpdates()
        for i in 0..<2 { wifi[i]?.durdur(); wifi[i] = nil; donusGozleri[i] = nil; donusler[i] = nil }
        oturumKuyrugu.async { self.oturum?.stopRunning(); self.oturum = nil }
        UIApplication.shared.isIdleTimerDisabled = false
        if let e = eskiParlaklik { UIScreen.main.brightness = e; eskiParlaklik = nil }
    }

    var bolmeSayisi: Int { kip == .iki ? 2 : 1 }

    func kipSec(_ k: Kip) {
        guard !kayitta else { bildirim = "Kayıt sürerken görünüm değişmez."; return }
        kip = k
        UserDefaults.standard.set(k.rawValue, forKey: "m.kip")
        etkin = 0
        kur()
    }

    /// Kaynakları baştan kurar (Android kur())
    func kur() {
        guard acik else { return }
        for i in 0..<2 { wifi[i]?.durdur(); wifi[i] = nil; bagli[i] = false; ciziciler[i].temizle(); ciziciler[i].kaynakDondur = 0 }
        ciziciler[0].karsilastir = kip == .karsilastir
        ciziciler[1].karsilastir = false
        var istenen: [Int: AVCaptureDevice] = [:]
        for i in 0..<bolmeSayisi {
            switch kaynaklar[i] {
            case .wifi(let ad, let adres):
                if let adres { wifiAc(i, ad: ad, hedef: Monitor.adresHedef(adres)) }
                else if let b = bulunanWifi.first(where: { $0.ad == ad }) { wifiAc(i, ad: ad, hedef: b.hedef) }
                else { kaynakAdi[i] = ad + " (aranıyor)" }
            case .cihaz(let id):
                if let d = AVCaptureDevice(uniqueID: id) { istenen[i] = d } else if i == 0, let d = Monitor.varsayilanCihaz() { istenen[i] = d }
            case nil:
                if i == 0, let d = Monitor.varsayilanCihaz() { istenen[i] = d }
            }
        }
        for (i, d) in istenen { kaynakAdi[i] = Monitor.cihazAdi(d) }
        kamAyar = istenen[etkin].map { Saklama.oku("m.kam.\($0.uniqueID)", KameraAyari.self) ?? KameraAyari() } ?? KameraAyari()
        ayarlariUygula()
        olcumBagla()
        let kamAyarlari = istenen.mapValues { Saklama.oku("m.kam.\($0.uniqueID)", KameraAyari.self) ?? KameraAyari() }
        oturumKuyrugu.async { self.oturumKur(istenen, kamAyarlari) }
    }

    /// Önce USB (iPad), yoksa arka geniş kamera
    static func varsayilanCihaz() -> AVCaptureDevice? {
        AVCaptureDevice.DiscoverySession(deviceTypes: [.external], mediaType: .video, position: .unspecified).devices.first
            ?? AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)
    }

    static func cihazListesi() -> [AVCaptureDevice] {
        AVCaptureDevice.DiscoverySession(deviceTypes: [.external, .builtInWideAngleCamera, .builtInUltraWideCamera, .builtInTelephotoCamera],
                                         mediaType: .video, position: .unspecified).devices
    }

    static func cihazAdi(_ d: AVCaptureDevice) -> String {
        if d.deviceType == .external { return "USB görüntü: \(d.localizedName)" }
        let yer = d.position == .front ? "Ön kamera" : "Arka kamera"
        switch d.deviceType {
        case .builtInUltraWideCamera: return "\(yer) · ultra geniş (0,5x)"
        case .builtInTelephotoCamera: return "\(yer) · tele"
        default: return "\(yer) · geniş (1x)"
        }
    }

    static func adresHedef(_ yazi: String) -> NWEndpoint {
        let p = yazi.trimmingCharacters(in: .whitespaces).split(separator: ":")
        let kapi = p.count > 1 ? UInt16(p[1]) ?? AgYayin.kapi : AgYayin.kapi
        return .hostPort(host: NWEndpoint.Host(String(p.first ?? "")), port: NWEndpoint.Port(rawValue: kapi)!)
    }

    // MARK: kaynak seçimi (KAYNAK sekmesi)

    func cihazSec(_ d: AVCaptureDevice) {
        guard !kayitta else { bildirim = "Önce kaydı durdur."; return }
        kaynaklar[etkin] = .cihaz(d.uniqueID)
        Saklama.yaz("m.kaynak\(etkin)", kaynaklar[etkin])
        kur()
    }

    func wifiSec(_ ad: String, adres: String? = nil) {
        guard !kayitta else { bildirim = "Önce kaydı durdur."; return }
        kaynaklar[etkin] = .wifi(ad, adres)
        Saklama.yaz("m.kaynak\(etkin)", kaynaklar[etkin])
        kur()
    }

    private func wifiAc(_ i: Int, ad: String, hedef: NWEndpoint) {
        wifi[i]?.durdur()
        let a = WifiAlici(ad: ad, hedef: hedef, bicim: kCVPixelFormatType_32BGRA)
        let c = ciziciler[i]
        a.kare = { pb in c.kare(pb) }
        a.yonDegisti = { d in DispatchQueue.main.async { c.kaynakDondur = d } }
        a.durum = { [weak self] b in DispatchQueue.main.async { if i < 2 { self?.bagli[i] = b } } }
        wifi[i] = a
        kaynakAdi[i] = "Wi-Fi: \(ad)"
        a.baslat()
    }

    var etkinCihaz: AVCaptureDevice? { cihazlar[etkin] }
    /// El ile ayarlanabilen telefon kamerası mı (USB ve Wi-Fi'da ayarlar kameranın kendisinden)
    var kontrolVar: Bool { etkinCihaz.map { $0.deviceType != .external } ?? false }

    // MARK: kamera oturumu (oturumKuyrugu)

    private func oturumKur(_ istenen: [Int: AVCaptureDevice], _ kamAyarlari: [Int: KameraAyari]) {
        oturum?.stopRunning()
        let coklu = istenen.count > 1 && AVCaptureMultiCamSession.isMultiCamSupported
        let s: AVCaptureSession = coklu ? AVCaptureMultiCamSession() : AVCaptureSession()
        var yeniCikti: [ObjectIdentifier: Int] = [:]
        var yeniCihaz: [AVCaptureDevice?] = [nil, nil]
        var yeniBag: [AVCaptureConnection?] = [nil, nil]
        var acilmayan: [String] = []
        s.beginConfiguration()
        for (i, d) in istenen.sorted(by: { $0.key < $1.key }) {
            guard let g = try? AVCaptureDeviceInput(device: d), s.canAddInput(g) else { acilmayan.append(Monitor.cihazAdi(d)); continue }
            s.addInputWithNoConnections(g)
            let c = AVCaptureVideoDataOutput()
            c.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
            c.alwaysDiscardsLateVideoFrames = true
            guard s.canAddOutput(c), let port = g.ports.first(where: { $0.mediaType == .video }) else { s.removeInput(g); acilmayan.append(Monitor.cihazAdi(d)); continue }
            s.addOutputWithNoConnections(c)
            let b = AVCaptureConnection(inputPorts: [port], output: c)
            guard s.canAddConnection(b) else { s.removeOutput(c); s.removeInput(g); acilmayan.append(Monitor.cihazAdi(d)); continue }
            s.addConnection(b)
            bicimUygula(d, kamAyarlari[i] ?? KameraAyari(), coklu: coklu)
            if b.isVideoStabilizationSupported { b.preferredVideoStabilizationMode = (kamAyarlari[i]?.sabitleme ?? true) ? .standard : .off }
            c.setSampleBufferDelegate(self, queue: kareKuyrugu)
            yeniCikti[ObjectIdentifier(c)] = i
            yeniCihaz[i] = d
            yeniBag[i] = b
        }
        if let m = AVCaptureDevice.default(for: .audio), let g = try? AVCaptureDeviceInput(device: m), s.canAddInput(g) {
            s.addInputWithNoConnections(g)
            let o = AVCaptureAudioDataOutput()
            if s.canAddOutput(o) {
                s.addOutputWithNoConnections(o)
                if let port = g.ports.first(where: { $0.mediaType == .audio }) {
                    let b = AVCaptureConnection(inputPorts: [port], output: o)
                    if s.canAddConnection(b) { s.addConnection(b) }
                }
                o.setSampleBufferDelegate(self, queue: sesKuyrugu)
                sesCikti = o
            }
        }
        s.commitConfiguration()
        for (i, d) in istenen where yeniCihaz[i] != nil { kameraUygula(d, kamAyarlari[i] ?? KameraAyari()) }
        kilit.lock(); ciktiBolme = yeniCikti; kilit.unlock()
        oturum = s
        s.startRunning()
        DispatchQueue.main.async {
            self.cihazlar = yeniCihaz
            self.baglantilar = yeniBag
            for i in 0..<2 {
                self.donusGozleri[i] = nil; self.donusler[i] = nil
                if let d = yeniCihaz[i] { self.bagli[i] = true; self.donusKur(i, d) }
            }
            if !acilmayan.isEmpty { self.bildirim = "Açılamadı: " + acilmayan.joined(separator: ", ") + (coklu || istenen.count < 2 ? "" : " (bu cihaz aynı anda iki kamerayı açamıyor)") }
            self.objectWillChange.send()
        }
    }

    /// Görüntü hep dik gelsin: cihazın duruşuna göre bağlantı döndürülür (iOS 17 dönüş eşgüdümcüsü)
    private func donusKur(_ i: Int, _ d: AVCaptureDevice) {
        let k = AVCaptureDevice.RotationCoordinator(device: d, previewLayer: nil)
        donusler[i] = k
        let uygula: (CGFloat) -> Void = { [weak self] aci in
            self?.oturumKuyrugu.async {
                guard let b = self?.baglantilar[i], b.isVideoRotationAngleSupported(aci) else { return }
                b.videoRotationAngle = aci
            }
        }
        uygula(k.videoRotationAngleForHorizonLevelCapture)
        donusGozleri[i] = k.observe(\.videoRotationAngleForHorizonLevelCapture, options: [.new]) { k, _ in
            uygula(k.videoRotationAngleForHorizonLevelCapture)
        }
    }

    /// Çözünürlük ve kare hızına uyan biçim
    private func bicimUygula(_ d: AVCaptureDevice, _ a: KameraAyari, coklu: Bool) {
        let hedef = (a.boyut ?? "1920x1080").split(separator: "x").compactMap { Int32($0) }
        let hw = hedef.first ?? 1920, hh = hedef.count > 1 ? hedef[1] : 1080
        let fps = Double(a.fps ?? 30)
        let uygun = d.formats.filter { f in
            let b = CMVideoFormatDescriptionGetDimensions(f.formatDescription)
            return (!coklu || f.isMultiCamSupported) && b.width == hw && b.height == hh
        }
        let secilen = uygun.first { f in f.videoSupportedFrameRateRanges.contains { $0.maxFrameRate >= fps && $0.minFrameRate <= fps } }
            ?? uygun.first
            ?? Monitor.enYakinBicim(d, coklu: coklu)
        guard let secilen, (try? d.lockForConfiguration()) != nil else { return }
        d.activeFormat = secilen
        d.unlockForConfiguration()
    }

    /// USB kaynakta ya da istenen çözünürlük yoksa: 1080p'yi geçmeyen en büyük biçim
    private static func enYakinBicim(_ d: AVCaptureDevice, coklu: Bool) -> AVCaptureDevice.Format? {
        d.formats.filter { f in
            let b = CMVideoFormatDescriptionGetDimensions(f.formatDescription)
            return b.width <= 1920 && b.height <= 1080 && (!coklu || f.isMultiCamSupported)
        }.max { CMVideoFormatDescriptionGetDimensions($0.formatDescription).width < CMVideoFormatDescriptionGetDimensions($1.formatDescription).width }
    }

    /// Kare hızı, pozlama, beyaz dengesi, odak
    private func kameraUygula(_ d: AVCaptureDevice, _ a: KameraAyari) {
        guard d.deviceType != .external, (try? d.lockForConfiguration()) != nil else { return }
        defer { d.unlockForConfiguration() }
        let f = d.activeFormat
        if let fps = a.fps, f.videoSupportedFrameRateRanges.contains(where: { $0.maxFrameRate >= Double(fps) && $0.minFrameRate <= Double(fps) }) {
            d.activeVideoMinFrameDuration = CMTime(value: 1, timescale: CMTimeScale(fps))
            d.activeVideoMaxFrameDuration = CMTime(value: 1, timescale: CMTimeScale(fps))
        } else {
            d.activeVideoMinFrameDuration = .invalid
            d.activeVideoMaxFrameDuration = .invalid
        }
        if a.enstantane != nil || a.iso != nil, d.isExposureModeSupported(.custom) {
            var sure = AVCaptureDevice.currentExposureDuration
            if let e = a.enstantane {
                let t = CMTime(seconds: e, preferredTimescale: 1_000_000)
                sure = CMTimeMaximum(f.minExposureDuration, CMTimeMinimum(f.maxExposureDuration, t))
            }
            let iso = a.iso.map { min(max($0, f.minISO), f.maxISO) } ?? AVCaptureDevice.currentISO
            d.setExposureModeCustom(duration: sure, iso: iso)
        } else if d.isExposureModeSupported(.continuousAutoExposure) {
            d.exposureMode = .continuousAutoExposure
        }
        d.setExposureTargetBias(min(max(a.ev, d.minExposureTargetBias), d.maxExposureTargetBias))
        if let k = a.kelvin, d.isLockingWhiteBalanceWithCustomDeviceGainsSupported {
            var g = d.deviceWhiteBalanceGains(for: AVCaptureDevice.WhiteBalanceTemperatureAndTintValues(temperature: Float(k), tint: 0))
            let m = d.maxWhiteBalanceGain
            g.redGain = min(max(g.redGain, 1), m); g.greenGain = min(max(g.greenGain, 1), m); g.blueGain = min(max(g.blueGain, 1), m)
            d.setWhiteBalanceModeLocked(with: g)
        } else if d.isWhiteBalanceModeSupported(.continuousAutoWhiteBalance) {
            d.whiteBalanceMode = .continuousAutoWhiteBalance
        }
        if let o = a.odak, d.isLockingFocusWithCustomLensPositionSupported {
            d.setFocusModeLocked(lensPosition: min(max(1 - o, 0), 1))
        } else if d.isFocusModeSupported(.continuousAutoFocus) {
            d.focusMode = .continuousAutoFocus
        }
    }

    /// Kamera ayarı değişti (üst şerit): uygula ve sakla
    func kamAyarDegisti(oturumYenile: Bool = false) {
        guard let d = etkinCihaz else { return }
        Saklama.yaz("m.kam.\(d.uniqueID)", kamAyar)
        if oturumYenile {
            guard !kayitta else { bildirim = "Kayıt sürerken çözünürlük ve kare hızı değişmez."; return }
            kur()
            return
        }
        let a = kamAyar
        oturumKuyrugu.async { self.kameraUygula(d, a) }
    }

    // MARK: kamera yetenekleri (seçenek listeleri)

    var boyutlar: [String] {
        guard let d = etkinCihaz else { return [] }
        let hepsi = Set(d.formats.map { f -> String in
            let b = CMVideoFormatDescriptionGetDimensions(f.formatDescription); return "\(b.width)x\(b.height)"
        })
        return ["1280x720", "1920x1080", "3840x2160"].filter { hepsi.contains($0) }
    }

    var fpsler: [Int] {
        guard let d = etkinCihaz else { return [] }
        let b = CMVideoFormatDescriptionGetDimensions(d.activeFormat.formatDescription)
        let ust = d.formats.filter { CMVideoFormatDescriptionGetDimensions($0.formatDescription).width == b.width }
            .flatMap { $0.videoSupportedFrameRateRanges }.map { $0.maxFrameRate }.max() ?? 30
        return [24, 25, 30, 48, 50, 60, 120, 240].filter { Double($0) <= ust }
    }

    var isoAraligi: ClosedRange<Float>? {
        guard kontrolVar, let f = etkinCihaz?.activeFormat else { return nil }
        return f.minISO...f.maxISO
    }

    var enstantaneAraligi: ClosedRange<Double>? {
        guard kontrolVar, let f = etkinCihaz?.activeFormat else { return nil }
        return f.minExposureDuration.seconds...f.maxExposureDuration.seconds
    }

    var diyafram: Float? { kontrolVar ? etkinCihaz?.lensAperture : nil }
    var evAraligi: ClosedRange<Float>? { guard kontrolVar, let d = etkinCihaz else { return nil }; return d.minExposureTargetBias...d.maxExposureTargetBias }
    var elleOdak: Bool { kontrolVar && (etkinCihaz?.isLockingFocusWithCustomLensPositionSupported ?? false) }

    // MARK: araçlar

    private func ayarlariUygula() {
        for i in 0..<2 {
            if ciziciler[i].ayar != ayarlar[i] { ciziciler[i].ayar = ayarlar[i] }
            Saklama.yaz("m.ayar\(i)", ayarlar[i])
        }
    }

    func olcumBagla() {
        for (i, c) in ciziciler.enumerated() {
            if i == etkin && (kip == .olcum || koseHisto) {
                let o = kip == .olcum ? olcum : nil, k = koseHisto ? kose : nil
                c.olcumGeri = { d, w, h in o?.kare(d, w, h); k?.kare(d, w, h) }
            } else {
                c.olcumGeri = nil
            }
        }
    }

    func etkinYap(_ i: Int) {
        guard i != etkin, i < bolmeSayisi else { return }
        etkin = i
        kamAyar = cihazlar[i].map { Saklama.oku("m.kam.\($0.uniqueID)", KameraAyari.self) ?? KameraAyari() } ?? KameraAyari()
        olcumBagla()
    }

    private func parlaklik() {
        guard acik else { return }
        if parlaklikTam {
            if eskiParlaklik == nil { eskiParlaklik = UIScreen.main.brightness }
            UIScreen.main.brightness = 1
        } else if let e = eskiParlaklik {
            UIScreen.main.brightness = e; eskiParlaklik = nil
        }
    }

    private func teraziKur() {
        guard acik, teraziAcik, hareket.isDeviceMotionAvailable else {
            hareket.stopDeviceMotionUpdates(); egim = nil; return
        }
        hareket.deviceMotionUpdateInterval = 1.0 / 20
        hareket.startDeviceMotionUpdates(to: .main) { [weak self] m, _ in
            guard let self, let g = m?.gravity else { return }
            // Ekran yatay da olabilir: telefonun duruşuna göre ufuk açısı
            let aci = atan2(g.x, -g.y) * 180 / .pi
            let taban: Double
            switch UIApplication.shared.connectedScenes.compactMap({ ($0 as? UIWindowScene)?.interfaceOrientation }).first ?? .portrait {
            case .landscapeRight: taban = 90
            case .landscapeLeft: taban = -90
            case .portraitUpsideDown: taban = 180
            default: taban = 0
            }
            var e = aci - taban
            while e > 180 { e -= 360 }
            while e < -180 { e += 360 }
            self.egim = abs(g.z) > 0.9 ? nil : e
        }
    }

    // MARK: döngü: ses, kalan süre

    private var sonSaniye = 0
    private func tik() {
        if sesGosterge, let k = sesCikti?.connections.first {
            let kanallar = k.audioChannels
            let a = kanallar.first.map { max($0.averagePowerLevel, -90) } ?? -90
            let b = kanallar.count > 1 ? max(kanallar[1].averagePowerLevel, -90) : a
            ses = (a, b)
        }
        let sn = Int(Date().timeIntervalSince1970)
        if sn != sonSaniye {
            sonSaniye = sn
            let bos = (try? URL(fileURLWithPath: NSHomeDirectory()).resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]))?.volumeAvailableCapacityForImportantUsage ?? 0
            let saniye = Int(bos) / max(1, mbps * 1_000_000 / 8)
            UIDevice.current.isBatteryMonitoringEnabled = true
            let pil = max(0, Int(UIDevice.current.batteryLevel * 100))
            kalanYazi = "\(saniye / 3600)sa \(saniye / 60 % 60)dk · pil %\(pil)"
        }
    }

    // MARK: kayıt

    func kayitDugmesi() {
        let c = ciziciler[etkin]
        if let k = kaydedici {
            kaydedici = nil
            c.kaydedici = nil
            kayitta = false
            kayitBasi = nil
            k.bitir { url in
                guard let url else { DispatchQueue.main.async { self.bildirim = "Kayıt kaydedilemedi (çok kısa olabilir)." }; return }
                self.fotograflaraKaydet(url)
            }
            return
        }
        guard c.gelenKare > 0 else { bildirim = "Kaynaktan görüntü gelmiyor; kayıt başlamadı."; return }
        let (w, h) = c.kayitBoyutu()
        let kamera = kontrolVar
        let fps = kamera ? (kamAyar.fps ?? 30) : 30
        // Bit hızı: telefon kamerasında ayardaki değer; USB ve Wi-Fi'da kaynağın boyutuna göre sınırlı (Android ile aynı)
        let hiz = kamera ? mbps : min(mbps, max(6, Int(Double(w * h * fps) * 0.4 / 1e6)))
        do {
            let k = try MonitorKaydedici(genislik: w, yukseklik: h, fps: fps, mbps: hiz, hevc: hevc, sesBicimi: sesKayit ? sesBicimi : nil)
            kaydedici = k
            c.kaydedici = k
            kayitta = true
            kayitBasi = Date()
            bildirim = "Kayıt başladı · \(w)×\(h) · \(hevc ? "H.265" : "H.264") \(hiz) Mb/sn"
        } catch {
            bildirim = "Kayıt başlamadı: \(error.localizedDescription)"
        }
    }

    private func fotograflaraKaydet(_ url: URL) {
        let gorsel = MonitorEkranResmi.kucuk(url)
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { durum in
            guard durum == .authorized || durum == .limited else {
                DispatchQueue.main.async { self.bildirim = "Fotoğraflar izni yok, Ayarlar'dan açılabilir." }
                return
            }
            PHPhotoLibrary.shared().performChanges({ PHAssetCreationRequest.forAsset().addResource(with: .video, fileURL: url, options: nil) }) { tamam, _ in
                DispatchQueue.main.async {
                    self.bildirim = tamam ? "Kayıt Fotoğraflar'da" : "Kayıt kaydedilemedi."
                    if tamam { self.sonKayit = gorsel }
                }
                try? FileManager.default.removeItem(at: url)
            }
        }
    }

    func ekranGoruntusu() {
        guard let g = ciziciler[etkin].ekranGoruntusu() else { bildirim = "Görüntü yok."; return }
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { durum in
            guard durum == .authorized || durum == .limited else { return }
            PHPhotoLibrary.shared().performChanges({ PHAssetChangeRequest.creationRequestForAsset(from: g) }) { tamam, _ in
                DispatchQueue.main.async { self.bildirim = tamam ? "Ekran görüntüsü Fotoğraflar'da" : "Kaydedilemedi."; if tamam { self.sonKayit = g } }
            }
        }
    }
}

extension Monitor: AVCaptureVideoDataOutputSampleBufferDelegate, AVCaptureAudioDataOutputSampleBufferDelegate {
    func captureOutput(_ output: AVCaptureOutput, didOutput sb: CMSampleBuffer, from connection: AVCaptureConnection) {
        if output is AVCaptureAudioDataOutput {
            if sesBicimi == nil, let f = CMSampleBufferGetFormatDescription(sb), let a = CMAudioFormatDescriptionGetStreamBasicDescription(f) { sesBicimi = a.pointee }
            kaydedici?.sesEkle(sb)
            return
        }
        kilit.lock(); let i = ciktiBolme[ObjectIdentifier(output)]; kilit.unlock()
        guard let i, let pb = CMSampleBufferGetImageBuffer(sb) else { return }
        ciziciler[i].kare(pb)
    }
}

/// Kayıt bitince küçük resim (sağ sütundaki son çekim)
enum MonitorEkranResmi {
    static func kucuk(_ url: URL) -> UIImage? {
        let u = AVAssetImageGenerator(asset: AVURLAsset(url: url))
        u.appliesPreferredTrackTransform = true
        u.maximumSize = CGSize(width: 240, height: 160)
        guard let cg = try? u.copyCGImage(at: .zero, actualTime: nil) else { return nil }
        return UIImage(cgImage: cg)
    }
}
