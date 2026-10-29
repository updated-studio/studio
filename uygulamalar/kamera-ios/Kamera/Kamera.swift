import AVFoundation
import CoreMotion
import Photos
import UIKit

/// Kamera oturumu (Android KameraActivity + KameraKaynak karşılığı): modlar TIMELAPSE · VİDEO · FOTO · PRO MODLAR · PORTRE,
/// mercekler (0,5× / 1× / 2× / tele), flaş ve fener, pozlama / beyaz denge / odak cetvelleri, elle ISO + baz ISO, fotoğraf çözünürlüğü ve RAW,
/// video 720p/1080p/4K 30/60, timelapse, kompozisyon kılavuzu + akıllı yardımcı + terazi + sahne önerisi. Pro modlar KameraPro.swift'te.
/// Baz ISO: etkin biçimin en düşük ISO'su (Android'de SENSOR_INFO_SENSITIVITY_RANGE alt sınırı ile aynı mantık).
final class Kamera: NSObject, ObservableObject {
    enum Mod: String, CaseIterable {
        case timelapse = "TIMELAPSE", video = "VİDEO", foto = "FOTO", pro = "PRO MODLAR", portre = "PORTRE"
        var foto: Bool { self == .foto || self == .pro || self == .portre }
    }
    enum Lens { case ultra, genis, tele }
    enum Flas: Int { case kapali, oto, acik, fener }

    static let ud = UserDefaults.standard
    /// Enstantane listesinde BULB (deklanşöre yeniden basılana kadar)
    static let bulb: Double = 1e9

    @Published var izinVar = true
    @Published var mod: Mod = Mod(rawValue: Kamera.ud.string(forKey: "k.mod") ?? "") ?? .foto
    @Published var kayitta = false
    @Published var kayitBasi: Date?
    @Published var isoDegerleri: [Float] = []
    @Published var bazIso: Float = 0
    /// nil = otomatik
    @Published var secilenIso: Float?
    /// Elle enstantane (sn); nil = otomatik. Telefonun tek karede verebildiğinden uzunsa (ya da BULB) kareler birleştirilir
    @Published var secilenEnst: Double?
    /// Uzun pozlamada kareler nasıl birleşir (ortalama: ipeksi, toplam: aydınlat, enParlak: ışık izi)
    @Published var uzunYol = Birlestir(rawValue: Kamera.ud.string(forKey: "k.uzunYol") ?? "") ?? .ortalama {
        didSet { Kamera.ud.set(uzunYol.rawValue, forKey: "k.uzunYol"); kuyruk.async { self.normalUygula() } }
    }
    /// Üstteki biçim etiketi ("12 MP · JPEG", "4K · 30", "4K · 2 sn · 60× hızlı")
    @Published var cozunurluk = ""
    @Published var bildirim: String?
    @Published var onde = false
    // Pro modlar
    @Published var proMod: ProMod = ProMod(rawValue: Kamera.ud.string(forKey: "proMod") ?? "") ?? .samanyolu
    @Published var proAyar: ProAyar = (ProMod(rawValue: Kamera.ud.string(forKey: "proMod") ?? "") ?? .samanyolu).oku()
    /// Ortadaki büyük yazı: geri sayım, birleştirme ilerlemesi ("3", "Birleştiriliyor 12/90"), seri sayısı
    @Published var proIlerleme: String?
    @Published var proCalisiyor = false
    /// Her fotoğraf çekiminde artar (ekrandaki kısa kararma)
    @Published var cekimAni = 0
    /// Telefonun tek karede verebildiği en uzun enstantane (sn)
    @Published var enUzunEnst: Double = 1
    // Araç şeridi: pozlama telafisi, beyaz denge (Kelvin, nil = oto), odak (mercek konumu 0 yakın … 1 uzak, nil = oto)
    @Published var ev: Float = 0
    @Published var evAralik: ClosedRange<Float> = -2...2
    @Published var bd: Float?
    @Published var odakKonum: Float?
    @Published var elleOdakVar = true
    // Yakınlaştırma (görünen çarpan: 0,5× geniş açı, 1× ana, tele)
    @Published var zoom: CGFloat = 1
    @Published var zoomDuraklari: [CGFloat] = [1, 2]
    @Published var flas: Flas = .kapali
    @Published var flasVar = false
    @Published var sonResim: UIImage?
    // Fotoğraf
    @Published var fotoBoyutlari: [CMVideoDimensions] = []
    @Published var fotoBoyut: CMVideoDimensions?
    @Published var rawVar = false
    @Published var raw = Kamera.ud.bool(forKey: "k.raw") { didSet { Kamera.ud.set(raw, forKey: "k.raw"); yenidenKur() } }
    @Published var zamanlayici = Kamera.ud.integer(forKey: "k.zamanlayici") { didSet { Kamera.ud.set(zamanlayici, forKey: "k.zamanlayici") } }
    @Published var deklansorSesi = Kamera.ud.object(forKey: "k.deklansor") as? Bool ?? true { didSet { Kamera.ud.set(deklansorSesi, forKey: "k.deklansor") } }
    @Published var sesKapatilabilir = false
    // Video
    @Published var videoYukseklik = Kamera.ud.object(forKey: "k.videoH") as? Int ?? 2160 { didSet { Kamera.ud.set(videoYukseklik, forKey: "k.videoH"); yenidenKur() } }
    @Published var videoFps = Kamera.ud.object(forKey: "k.videoFps") as? Int ?? 30 { didSet { Kamera.ud.set(videoFps, forKey: "k.videoFps"); yenidenKur() } }
    @Published var videoSecenekleri: [Int] = [1080]
    @Published var fps60Var = false
    @Published var videoFpsler: [Int] = [30]
    // Genel ayarlar: kayıt biçimi, renk, sabitleme, enstantane gösterimi, ses (KayitAyarlari.swift)
    @Published var kodek = Kodek(rawValue: Kamera.ud.string(forKey: "k.kodek") ?? "") ?? .hevc { didSet { Kamera.ud.set(kodek.rawValue, forKey: "k.kodek"); bicimYaz(); kayitHazirla() } }
    @Published var renkModu = RenkModu(rawValue: Kamera.ud.string(forKey: "k.renk") ?? "") ?? .sdr { didSet { Kamera.ud.set(renkModu.rawValue, forKey: "k.renk"); yenidenKur() } }
    @Published var sabitleme = Sabitleme(rawValue: Kamera.ud.string(forKey: "k.sabit") ?? "") ?? .standart { didSet { Kamera.ud.set(sabitleme.rawValue, forKey: "k.sabit"); kayitHazirla() } }
    /// Video enstantanesi açı (180°) olarak mı gösterilsin
    @Published var enstAci = Kamera.ud.bool(forKey: "k.enstAci") { didSet { Kamera.ud.set(enstAci, forKey: "k.enstAci") } }
    @Published var sesBicimi = SesBicimi(rawValue: Kamera.ud.string(forKey: "k.ses") ?? "") ?? .oto { didSet { Kamera.ud.set(sesBicimi.rawValue, forKey: "k.ses"); kayitHazirla() } }
    /// Seçilen ses girişi (uid); nil = otomatik
    @Published var sesGirdi = Kamera.ud.string(forKey: "k.sesGirdi") { didSet { Kamera.ud.set(sesGirdi, forKey: "k.sesGirdi"); sesGirdisiUygula() } }
    @Published var sesGirdileri: [SesGirdi] = []
    @Published var etkinSesGirdi: String?
    @Published var harici = false
    @Published var kodekler: [Kodek] = [.hevc, .h264]
    @Published var renkModlari: [RenkModu] = [.sdr]
    @Published var sabitlemeler: [Sabitleme] = [.kapali, .standart]
    /// Beyaz denge tonu: yeşil (−) ↔ macenta (+)
    @Published var renkTon: Float = 0
    // Görüntü araçları (Gostergeler.swift): yalnız ekranda; Monitör'ün çizicisi
    @Published var gosterge: BolmeAyari = (try? JSONDecoder().decode(BolmeAyari.self, from: Kamera.ud.data(forKey: "k.gosterge") ?? Data())) ?? BolmeAyari() {
        didSet { if let d = try? JSONEncoder().encode(gosterge) { Kamera.ud.set(d, forKey: "k.gosterge") }; gostergeUygula() }
    }
    @Published var histogram = Kamera.ud.bool(forKey: "k.histogram") { didSet { Kamera.ud.set(histogram, forKey: "k.histogram"); gostergeUygula() } }
    @Published var logOnizleme = Kamera.ud.object(forKey: "k.logOnizleme") as? Bool ?? true { didSet { Kamera.ud.set(logOnizleme, forKey: "k.logOnizleme"); gostergeUygula() } }
    /// Stil (Stiller.swift): ekranda çizici, kayıtta da
    @Published var stil: Stil = (try? JSONDecoder().decode(Stil.self, from: Kamera.ud.data(forKey: "k.stil") ?? Data())) ?? Stil() {
        didSet { if let d = try? JSONEncoder().encode(stil) { Kamera.ud.set(d, forKey: "k.stil") }; if stil.anahtar != oldValue.anahtar { gostergeUygula() } }
    }
    /// Sabitlenen kısayollar (Favoriler.swift), sırasıyla; en çok 6
    @Published var favoriler: [Favori] = (try? JSONDecoder().decode([Favori].self, from: Kamera.ud.data(forKey: "k.favoriler") ?? Data())) ?? Favori.varsayilan {
        didSet { if let d = try? JSONEncoder().encode(favoriler) { Kamera.ud.set(d, forKey: "k.favoriler") } }
    }
    /// AI Kadraj düşünürken aday öneri ve sahne (aynı aday ~6 sn sürünce gösterilir; Fatih 29 Ekim: "saniyede 1 fikirle gelmesin")
    var aiAday: (tur: KompTur, yon: Int, bas: Date)?
    var sahneAday: (sahne: Sahne, bas: Date)?
    static let aiBekleme: TimeInterval = 6
    @Published var aiDusunuyor = false
    /// Çizici ekranda (kare çıkışı oturumda ve araç açık)
    @Published var gostergeGorunur = false
    /// Araç istendi ama iPhone bu modda kare çıkışına izin vermedi
    @Published var gostergeYok = false
    let cizici = MonitorCizici()
    let histo = OlcumHesap(yalnizHistogram: true)
    /// Kuyrukta yazılır, kare kuyruğunda okunur
    var araclarAcik = false
    var varsayilanSes: [String: Any]?
    var sonSesBicimi = ""
    /// Son uygulanan kayıt biçimi; aynıysa kayıt başında oturuma dokunulmaz
    var kayitImza = ""
    // Timelapse
    @Published var tlAralik = Kamera.ud.object(forKey: "k.tlAralik") as? Int ?? 2000 { didSet { Kamera.ud.set(tlAralik, forKey: "k.tlAralik"); bicimYaz() } }
    @Published var tlSure = Kamera.ud.integer(forKey: "k.tlSure") { didSet { Kamera.ud.set(tlSure, forKey: "k.tlSure") } }
    @Published var tlPozSabit = Kamera.ud.object(forKey: "k.tlPozSabit") as? Bool ?? true { didSet { Kamera.ud.set(tlPozSabit, forKey: "k.tlPozSabit") } }
    @Published var tlKare = 0
    // Kompozisyon, akıllı yardımcı, terazi, sahne önerisi
    @Published var kompTur = KompTur(rawValue: Kamera.ud.string(forKey: "k.komp") ?? "") ?? .kapali { didSet { Kamera.ud.set(kompTur.rawValue, forKey: "k.komp"); if kompTur != .kapali { sonKomp = kompTur } } }
    @Published var kompYon = Kamera.ud.integer(forKey: "k.kompYon") { didSet { Kamera.ud.set(kompYon, forKey: "k.kompYon") } }
    var sonKomp = KompTur(rawValue: Kamera.ud.string(forKey: "k.sonKomp") ?? "") ?? .spiral { didSet { Kamera.ud.set(sonKomp.rawValue, forKey: "k.sonKomp") } }
    /// AI Kadraj (konu algılama, yön tarifi, kompozisyon ve sahne önerisi); kapalıyken ekranda hiçbiri görünmez
    @Published var asistanAcik = Kamera.ud.bool(forKey: "k.aiKadraj") { didSet { Kamera.ud.set(asistanAcik, forKey: "k.aiKadraj"); yardimcilariAyarla() } }
    @Published var teraziAcik = Kamera.ud.bool(forKey: "k.terazi") { didSet { Kamera.ud.set(teraziAcik, forKey: "k.terazi"); yardimcilariAyarla() } }
    @Published var sahneOto = Kamera.ud.object(forKey: "k.sahneOto") as? Bool ?? true { didSet { Kamera.ud.set(sahneOto, forKey: "k.sahneOto"); yardimcilariAyarla() } }
    @Published var konu: CGRect?
    @Published var konuAdi = ""
    /// Kullanıcı dokunup konuyu seçti (Fatih 29 Ekim): AF-AE konuyu izler; uzun basınca ya da konu kaybolunca düşer
    @Published var konuSecili = false
    private var sonKonuOdak = Date.distantPast
    private var sonKonuNokta = CGPoint(x: -1, y: -1)
    @Published var analiz: AnalizSonuc?
    @Published var ipucu: String?
    @Published var kompOneri: (tur: KompTur, yon: Int)?
    @Published var sahneOnerisi: Sahne?
    @Published var egim: CGFloat?
    @Published var egimTaban: CGFloat = 0
    /// Ekrandaki görüntünün en/boy oranı (kompozisyon katmanı bununla hizalanır)
    @Published var goruntuOrani: CGFloat = 3.0 / 4

    let oturum = AVCaptureSession()
    let kuyruk = DispatchQueue(label: "tr.com.updated.kamera")
    var cihaz: AVCaptureDevice?
    private var girdi: AVCaptureDeviceInput?
    let fotoCikti = AVCapturePhotoOutput()
    let videoCikti = AVCaptureMovieFileOutput()
    /// Kare kare görüntü (Pro birleştirme, timelapse, akıllı yardımcı; Wi-Fi kamera da `kareDinleyiciler` ile bağlanabilir). Yalnız gerektiğinde oturumda.
    let kareCikti = AVCaptureVideoDataOutput()
    let kareKuyruk = DispatchQueue(label: "tr.com.updated.kamera.kare")
    /// PORTRE: yüz bulma (pozlama ve odak yüze göre)
    private let yuzCikti = AVCaptureMetadataOutput()
    private var sonYuzOdak = Date.distantPast
    var kareDinleyiciler: [(CMSampleBuffer) -> Void] = []
    var birlestirici: Birlestirici?
    var birlestirmeHedef = 0
    var birlestirmeBitis: Date?
    var birlestirmeBas = Date()
    /// FOTO'da uzun pozlama sürüyor (kare çıkışı gerekli)
    var uzunSuruyor = false
    var seriZamanlayici: Timer?
    var seriSayi = 0
    var geriSayiyor = false
    private var lens: Lens = .genis
    var kuruldu = false
    private var tlYazici: TimelapseYazici?
    private let asistan = Asistan()
    private var sonYuz: YuzBilgi?
    private let ipucuSabit = IpucuSabitle()
    private var renkOrt: [Float] = [0, 0, 0]
    private let hareket = CMMotionManager()
    private var yercekimZ: Double = 0
    private var arayuzYonu: UIInterfaceOrientation = .portrait
    private var saat: Timer?
    /// RAW + JPEG: aynı çekimin parçaları bir araya gelince birlikte kaydedilir
    private var parcalar: [Int64: (islenmis: Data?, ham: Data?)] = [:]
    private let teleCarpani: CGFloat? = Kamera.teleBul()
    private let ultraVar = AVCaptureDevice.default(.builtInUltraWideCamera, for: .video, position: .back) != nil

    /// Fotoğrafçılıkta alışılan ISO basamakları; cihazın aralığına göre süzülür
    static let basamaklar: [Float] = [25, 32, 40, 50, 64, 80, 100, 125, 160, 200, 250, 320, 400, 500, 640, 800,
                                      1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000, 6400, 8000, 10000, 12800]

    static func isoListesi(min: Float, max: Float) -> [Float] {
        let taban = min.rounded()
        return [taban] + basamaklar.filter { $0 > taban * 1.05 && $0 <= max }
    }

    // MARK: oturum

    func baslat() {
        Task {
            let kamera = await AVCaptureDevice.requestAccess(for: .video)
            _ = await AVCaptureDevice.requestAccess(for: .audio)
            await MainActor.run { self.izinVar = kamera }
            guard kamera else { return }
            kuyruk.async {
                if self.kuruldu { if !self.oturum.isRunning { self.oturum.startRunning() } } else { self.kur() }
            }
            await MainActor.run {
                self.yardimcilariAyarla()
                if self.saat == nil { self.saat = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in self?.tik() } }
            }
        }
    }

    func durdur() {
        if tlYazici != nil { tlBitir() }
        kuyruk.async { if self.oturum.isRunning { self.oturum.stopRunning() } }
        hareket.stopDeviceMotionUpdates()
        saat?.invalidate(); saat = nil
    }

    private func kur() {
        kuruldu = true
        oturum.beginConfiguration()
        oturum.sessionPreset = .photo
        sesOturumuKur()
        if let mik = AVCaptureDevice.default(for: .audio), let g = try? AVCaptureDeviceInput(device: mik), oturum.canAddInput(g) {
            oturum.addInput(g)
        }
        if oturum.canAddOutput(fotoCikti) { oturum.addOutput(fotoCikti); fotoCikti.maxPhotoQualityPrioritization = .quality }
        if oturum.canAddOutput(yuzCikti) { oturum.addOutput(yuzCikti); yuzCikti.setMetadataObjectsDelegate(self, queue: kuyruk) }
        kareCikti.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
        kareCikti.alwaysDiscardsLateVideoFrames = true
        kareCikti.setSampleBufferDelegate(self, queue: kareKuyruk)
        oturum.commitConfiguration()
        cihazSec(.genis, onde: false)
        oturum.startRunning()
        DispatchQueue.main.async { self.zoomDuraklariYaz() }
    }

    private func lensCihazi(_ l: Lens, onde: Bool) -> AVCaptureDevice? {
        if onde { return AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front) }
        switch l {
        case .ultra: return AVCaptureDevice.default(.builtInUltraWideCamera, for: .video, position: .back)
        case .tele: return AVCaptureDevice.default(.builtInTelephotoCamera, for: .video, position: .back)
        case .genis: return AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)
        }
    }

    /// Tele merceğin ana merceğe göre çarpanı (iPhone 15 Pro Max: 5×, 15 Pro: 3×); telefonun çoklu kamerasının geçiş noktalarından
    private static func teleBul() -> CGFloat? {
        guard AVCaptureDevice.default(.builtInTelephotoCamera, for: .video, position: .back) != nil else { return nil }
        if let t = AVCaptureDevice.default(.builtInTripleCamera, for: .video, position: .back) {
            let f = t.virtualDeviceSwitchOverVideoZoomFactors.map { CGFloat($0.doubleValue) }
            if f.count >= 2, f[0] > 0 { return (f[1] / f[0]).rounded() }
        }
        if let d = AVCaptureDevice.default(.builtInDualCamera, for: .video, position: .back), let f = d.virtualDeviceSwitchOverVideoZoomFactors.first {
            return CGFloat(f.doubleValue)
        }
        return 2
    }

    private func lensCarpani(_ l: Lens) -> CGFloat {
        switch l { case .ultra: return 0.5; case .genis: return 1; case .tele: return teleCarpani ?? 2 }
    }

    /// Kuyrukta
    private func cihazSec(_ l: Lens, onde yeniOnde: Bool) {
        guard let d = lensCihazi(l, onde: yeniOnde), let g = try? AVCaptureDeviceInput(device: d) else { return }
        oturum.beginConfiguration()
        if let eski = girdi { oturum.removeInput(eski) }
        if oturum.canAddInput(g) { oturum.addInput(g); girdi = g; cihaz = d; lens = yeniOnde ? .genis : l }
        presetUygula()
        oturum.commitConfiguration()
        let flasli = d.hasFlash || d.hasTorch
        DispatchQueue.main.async { self.onde = yeniOnde; self.flasVar = flasli }
        isoGuncelle()
    }

    /// Kuyrukta, yapılandırma içinde: moda göre biçim ve çıkışlar
    private func presetUygula() {
        guard let d = cihaz else { return }
        let videolu = mod == .video || mod == .timelapse
        if videolu {
            let fps = mod == .video ? videoFps : 30
            let renk = mod == .video ? renkModu : .sdr
            if let b = Kamera.videoBicimi(d, yukseklik: videoYukseklik, fps: fps, renk: renk) ?? Kamera.videoBicimi(d, yukseklik: videoYukseklik, fps: fps)
                ?? Kamera.videoBicimi(d, yukseklik: videoYukseklik, fps: 30) ?? Kamera.videoBicimi(d, yukseklik: 1080, fps: 30), (try? d.lockForConfiguration()) != nil {
                d.activeFormat = b
                let gercekFps = b.videoSupportedFrameRateRanges.contains { $0.maxFrameRate >= Double(fps) } ? fps : 30
                let sure = CMTime(value: 1, timescale: CMTimeScale(gercekFps))
                d.activeVideoMinFrameDuration = sure
                d.activeVideoMaxFrameDuration = sure
                d.unlockForConfiguration()
            } else {
                oturum.sessionPreset = oturum.canSetSessionPreset(.hd4K3840x2160) ? .hd4K3840x2160 : .high
            }
        } else if let b = Kamera.fotoBicimi(d), (try? d.lockForConfiguration()) != nil {
            // Apple Kamera gibi: önizleme/kare akışı küçük (≈1920×1440), fotoğraf tam çözünürlük. ".photo" hazır ayarı akışı 12 MP verir;
            // kare çıkışı (kompozisyon, sahne) her kareyi o boyutta dönüştürünce deklanşör takılıyordu.
            d.activeFormat = b
            let sure = CMTime(value: 1, timescale: 30)
            if b.videoSupportedFrameRateRanges.contains(where: { $0.maxFrameRate >= 30 }) { d.activeVideoMinFrameDuration = sure; d.activeVideoMaxFrameDuration = sure }
            d.unlockForConfiguration()
        } else {
            oturum.sessionPreset = .photo
        }
        renkAlaniUygula(d, video: videolu)
        // Video kaydı ve kare çıkışı aynı anda oturumda tutulmaz (iOS'ta ikisi birlikte güvenilir değil)
        if mod == .video {
            if !oturum.outputs.contains(videoCikti), oturum.canAddOutput(videoCikti) { oturum.addOutput(videoCikti) }
        } else if oturum.outputs.contains(videoCikti) { oturum.removeOutput(videoCikti) }
        // Kodek ve sabitleme şimdiden: kayıt başında oturum yeniden kurulursa ilk saniyede görüntü stilsiz/donuk kalıyordu
        kayitImza = ""
        if mod == .video { kayitBicimiUygula() }
        kareCiktiAyarla()
        yuzCikti.metadataObjectTypes = mod == .portre && yuzCikti.availableMetadataObjectTypes.contains(.face) ? [.face] : []

        // Fotoğraf çözünürlüğü ve RAW
        let boyutlar = d.activeFormat.supportedMaxPhotoDimensions.sorted { Int($0.width) * Int($0.height) > Int($1.width) * Int($1.height) }
        let kayitli = Kamera.ud.string(forKey: "k.foto")
        let secili = boyutlar.first { "\($0.width)x\($0.height)" == kayitli }
            ?? boyutlar.first { Int($0.width) * Int($0.height) <= 12_600_000 } ?? boyutlar.last
        if let s = secili { fotoCikti.maxPhotoDimensions = s }
        if fotoCikti.isAppleProRAWSupported { fotoCikti.isAppleProRAWEnabled = raw }
        // Art arda dokunuşlarda deklanşör beklemesin (iOS 17)
        if fotoCikti.isResponsiveCaptureSupported { fotoCikti.isResponsiveCaptureEnabled = true }
        if fotoCikti.isFastCapturePrioritizationSupported { fotoCikti.isFastCapturePrioritizationEnabled = true }
        let rawVarMi = !fotoCikti.availableRawPhotoPixelFormatTypes.isEmpty || fotoCikti.isAppleProRAWSupported
        var sessiz = false
        if #available(iOS 18.0, *) { sessiz = fotoCikti.isShutterSoundSuppressionSupported }
        let videoSec = [720, 1080, 2160].filter { Kamera.videoBicimi(d, yukseklik: $0, fps: 30) != nil }
        let fps60 = Kamera.videoBicimi(d, yukseklik: videoYukseklik, fps: 60) != nil
        let fpsler = [24, 25, 30, 60].filter { Kamera.videoBicimi(d, yukseklik: videoYukseklik, fps: $0) != nil }
        DispatchQueue.main.async {
            self.videoFpsler = fpsler.isEmpty ? [30] : fpsler
            self.fotoBoyutlari = boyutlar; self.fotoBoyut = secili; self.rawVar = rawVarMi; self.sesKapatilabilir = sessiz
            self.videoSecenekleri = videoSec.isEmpty ? [1080] : videoSec; self.fps60Var = fps60
        }
        oranYaz()
        bicimYaz()
    }

    /// Kare çıkışı yalnız gerektiğinde (her karenin dönüştürülmesi pil ve ısı demek)
    func kareCiktiAyarla() {
        let araclar = gostergeEtkin
        let gerekli = araclar || mod != .video && (mod == .pro || mod == .timelapse || uzunSuruyor || asistanAcik || !kareDinleyiciler.isEmpty)
        if gerekli, !oturum.outputs.contains(kareCikti), oturum.canAddOutput(kareCikti) { oturum.addOutput(kareCikti) }
        if !gerekli, oturum.outputs.contains(kareCikti) { oturum.removeOutput(kareCikti) }
        let var_ = oturum.outputs.contains(kareCikti)
        araclarAcik = araclar && var_
        let gorunur = araclarAcik, yok = araclar && !var_
        DispatchQueue.main.async { self.ciziciAyarla(); self.gostergeGorunur = gorunur; self.gostergeYok = yok }
        if let b = kareCikti.connection(with: .video) {
            if b.isVideoOrientationSupported { b.videoOrientation = Onizleme.yon(arayuzYonu) }
            if b.isVideoMirroringSupported { b.automaticallyAdjustsVideoMirroring = false; b.isVideoMirrored = cihaz?.position == .front }
        }
    }

    /// 16:9 video biçimi (SDR'de 8 bit tercih; HDR / Log için o renk alanını destekleyen 10 bit biçim); bulunamazsa nil
    /// Fotoğraf için: 4:3, akışı 1080-1512 satır, 30 fps, en büyük fotoğraf boyutu (eşitse tam aralık 420f)
    static func fotoBicimi(_ d: AVCaptureDevice) -> AVCaptureDevice.Format? {
        func foto(_ f: AVCaptureDevice.Format) -> Int { f.supportedMaxPhotoDimensions.map { Int($0.width) * Int($0.height) }.max() ?? 0 }
        let adaylar = d.formats.filter { f in
            let b = CMVideoFormatDescriptionGetDimensions(f.formatDescription)
            let tur = CMFormatDescriptionGetMediaSubType(f.formatDescription)
            return Int(b.width) * 3 == Int(b.height) * 4 && b.height >= 1080 && b.height <= 1512
                && (tur == kCVPixelFormatType_420YpCbCr8BiPlanarFullRange || tur == kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange)
                && f.videoSupportedFrameRateRanges.contains { $0.maxFrameRate >= 30 }
        }
        return adaylar.max { a, b in
            let fa = foto(a), fb = foto(b)
            if fa != fb { return fa < fb }
            let ta = CMFormatDescriptionGetMediaSubType(a.formatDescription) == kCVPixelFormatType_420YpCbCr8BiPlanarFullRange
            let tb = CMFormatDescriptionGetMediaSubType(b.formatDescription) == kCVPixelFormatType_420YpCbCr8BiPlanarFullRange
            return !ta && tb
        }
    }

    static func videoBicimi(_ d: AVCaptureDevice, yukseklik: Int, fps: Int, renk: RenkModu = .sdr) -> AVCaptureDevice.Format? {
        let adaylar = d.formats.filter { f in
            let b = CMVideoFormatDescriptionGetDimensions(f.formatDescription)
            return Int(b.height) == yukseklik && Int(b.width) * 9 == Int(b.height) * 16
                && f.videoSupportedFrameRateRanges.contains { $0.maxFrameRate >= Double(fps) }
        }
        switch renk {
        case .log: return adaylar.first { $0.supportedColorSpaces.contains(.appleLog) }
        case .hdr: return adaylar.first { $0.supportedColorSpaces.contains(.HLG_BT2020) }
        case .sdr: return adaylar.first { CMFormatDescriptionGetMediaSubType($0.formatDescription) == kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange } ?? adaylar.first
        }
    }

    /// Ayarlar değişince oturum yeniden kurulur
    func yenidenKur() {
        guard kuruldu, !kayitta else { return }
        kuyruk.async {
            self.oturum.beginConfiguration()
            self.presetUygula()
            self.oturum.commitConfiguration()
            self.isoGuncelle()
        }
    }

    private func oranYaz() {
        guard let d = cihaz else { return }
        let b = CMVideoFormatDescriptionGetDimensions(d.activeFormat.formatDescription)
        let w = CGFloat(max(b.width, b.height)), h = CGFloat(min(b.width, b.height))
        let dik = arayuzYonu.isPortrait
        DispatchQueue.main.async { self.goruntuOrani = dik ? h / w : w / h }
    }

    /// Üstteki biçim etiketi
    func bicimYaz() {
        let d = cihaz
        let b = d.map { CMVideoFormatDescriptionGetDimensions($0.activeFormat.formatDescription) }
        let video = b.map { max($0.width, $0.height) >= 3840 ? "4K" : "\(min($0.width, $0.height))p" } ?? ""
        let fps = d.map { Int((1 / $0.activeVideoMinFrameDuration.seconds).rounded()) } ?? 30
        let foto = fotoCikti.maxPhotoDimensions
        let mp = Int((Double(foto.width) * Double(foto.height) / 1_000_000).rounded())
        let yazi: String
        switch mod {
        case .video: yazi = "\(video) · \(fps)"
        case .timelapse: yazi = "\(video) · \(Timelapse.aralikYazi(tlAralik)) · \(Timelapse.hiz(tlAralik))× hızlı"
        default: yazi = "\(mp) MP · \(raw && rawVar ? "RAW" : "JPEG")"
        }
        DispatchQueue.main.async { self.cozunurluk = yazi }
    }

    private func isoGuncelle() {
        guard let d = cihaz else { return }
        let liste = Kamera.isoListesi(min: d.activeFormat.minISO, max: d.activeFormat.maxISO)
        let iso = secilenIso
        let enUzun = d.activeFormat.maxExposureDuration.seconds
        let ara = max(d.minExposureTargetBias, -3)...min(d.maxExposureTargetBias, 3)
        let elle = d.isLockingFocusWithCustomLensPositionSupported
        DispatchQueue.main.async {
            self.isoDegerleri = liste
            self.bazIso = liste.first ?? 0
            self.enUzunEnst = enUzun
            self.evAralik = ara
            self.elleOdakVar = elle
            if let iso, !liste.contains(iso) { self.secilenIso = nil }
        }
        if mod == .pro { proUygula() } else { normalUygula() }
    }

    func modDegistir(_ yeni: Mod) {
        guard !kayitta, !proCalisiyor, yeni != mod else { return }
        mod = yeni
        Kamera.ud.set(yeni.rawValue, forKey: "k.mod")
        sahneOnerisi = nil
        if konuSecili { konuSecili = false; asistan.hedef = nil }
        if yeni == .pro && !onde { mercekUygula() }
        if secilenEnst != nil { secilenEnst = nil }
        if yeni.foto, flas == .fener { flas = .kapali }
        if !yeni.foto, flas == .oto || flas == .acik { flas = .kapali }
        kuyruk.async {
            self.oturum.beginConfiguration()
            self.presetUygula()
            self.oturum.commitConfiguration()
            self.isoGuncelle()
        }
    }

    func cevir() {
        guard !kayitta, !proCalisiyor else { return }
        let yeni = !onde
        zoom = 1
        kuyruk.async { self.cihazSec(.genis, onde: yeni); DispatchQueue.main.async { self.zoomDuraklariYaz() } }
    }

    /// Ekran döndüğünde (kare çıkışı ve görüntü oranı ekranla aynı yöne)
    func yonGuncelle(_ y: UIInterfaceOrientation) {
        guard y != arayuzYonu, tlYazici == nil, !proCalisiyor else { return }
        arayuzYonu = y
        kuyruk.async {
            if let b = self.kareCikti.connection(with: .video), b.isVideoOrientationSupported { b.videoOrientation = Onizleme.yon(y) }
            self.oranYaz()
        }
    }

    // MARK: yakınlaştırma

    private func zoomDuraklariYaz() {
        var l: [CGFloat] = []
        if !onde && ultraVar { l.append(0.5) }
        l.append(1)
        if let t = teleCarpani, !onde { if t > 2.5 { l.append(2) }; l.append(t) } else { l.append(2) }
        zoomDuraklari = l
        if mod == .pro && !onde { mercekUygula() }
    }

    /// Görünen çarpana göre mercek seçilir (0,5× geniş açı, tele ve üstü tele mercek), aradaki kısım dijital
    func yakinlastir(_ istenen: CGFloat, moda: Bool = true) {
        guard !kayitta, !proCalisiyor else { return }
        let ust = max(10, (teleCarpani ?? 2) * 2)
        let etkin = min(max(istenen, onde || !ultraVar ? 1 : 0.5), ust)
        let yeniLens: Lens = onde ? .genis : (etkin < 1 ? .ultra : (teleCarpani.map { etkin >= $0 } == true ? .tele : .genis))
        zoom = etkin
        if moda, mod == .pro, proAyar.mercek.map({ abs(CGFloat($0) - etkin) > 0.01 }) ?? true {
            var a = proAyar; a.mercek = Double(etkin); proAyar = a; proMod.yaz(a)
        }
        kuyruk.async {
            if yeniLens != self.lens { self.cihazSec(yeniLens, onde: self.onde) }
            guard let d = self.cihaz, (try? d.lockForConfiguration()) != nil else { return }
            d.videoZoomFactor = min(max(etkin / self.lensCarpani(self.lens), 1), d.maxAvailableVideoZoomFactor)
            d.unlockForConfiguration()
        }
    }

    // MARK: pozlama, beyaz denge, odak (PRO dışındaki modlar)

    func isoSec(_ iso: Float?) { secilenIso = iso; kuyruk.async { self.normalUygula() } }
    func enstSec(_ e: Double?) { secilenEnst = e; kuyruk.async { self.normalUygula() } }
    /// Seçilen enstantane tek karede verilemiyor: kareler birleştirilecek
    var uzunPozlama: Bool { secilenEnst.map { $0 > enUzunEnst + 0.01 } ?? false }
    func evSec(_ v: Float) { ev = v; kuyruk.async { self.normalUygula() } }
    func bdSec(_ k: Float?) { bd = k; if k == nil { renkTon = 0 }; kuyruk.async { self.normalUygula() } }
    func odakSec(_ o: Float?) { odakKonum = o; kuyruk.async { self.normalUygula() } }

    func flasDegistir() {
        guard flasVar else { bildirim = "Bu kamerada flaş yok."; return }
        flas = mod.foto ? (flas == .kapali ? .oto : (flas == .oto ? .acik : .kapali)) : (flas == .fener ? .kapali : .fener)
        bildirim = ["Flaş kapalı", "Flaş: otomatik", "Flaş: açık", "Fener açık"][flas.rawValue]
        kuyruk.async { if self.mod != .pro { self.normalUygula() } else { self.fenerUygula() } }
    }

    private func fenerUygula() {
        guard let d = cihaz, d.hasTorch, (try? d.lockForConfiguration()) != nil else { return }
        let ac = flas == .fener && !mod.foto
        if d.isTorchModeSupported(ac ? .on : .off) { d.torchMode = ac ? .on : .off }
        d.unlockForConfiguration()
    }

    /// Kuyrukta: otomatik ya da cetvellerde seçilen değerler kameraya
    func normalUygula() {
        guard let d = cihaz, (try? d.lockForConfiguration()) != nil else { return }
        defer { d.unlockForConfiguration() }
        d.activeMaxExposureDuration = .invalid
        if secilenIso != nil || secilenEnst != nil {
            d.setExposureTargetBias(0)
            let bicim = d.activeFormat
            let enUzun = bicim.maxExposureDuration.seconds
            // Tek karenin süresi telefonun sınırında kalır; ortalama birleştirmede ISO aradaki fark kadar artar (parlaklık istenen süreninki olur)
            let istenen = secilenEnst ?? d.exposureDuration.seconds
            // VİDEO'da enstantane kare süresini aşamaz (açı en çok 360°)
            let tavan = mod == .video ? min(enUzun, 1 / Double(max(1, videoFps))) : enUzun
            let sure = min(max(istenen, bicim.minExposureDuration.seconds), tavan)
            let kazanc = mod == .foto && istenen < Kamera.bulb && uzunYol == .ortalama ? Float(max(1, istenen / sure)) : 1
            let iso = (secilenIso ?? d.iso * Float(d.exposureDuration.seconds / sure)) * kazanc
            d.setExposureModeCustom(duration: CMTime(seconds: sure, preferredTimescale: 1_000_000), iso: min(max(iso, bicim.minISO), bicim.maxISO))
        } else {
            if d.isExposureModeSupported(.continuousAutoExposure) { d.exposureMode = .continuousAutoExposure }
            d.setExposureTargetBias(min(max(ev, d.minExposureTargetBias), d.maxExposureTargetBias))
        }
        if let k = bd, d.isWhiteBalanceModeSupported(.locked) {
            var g = d.deviceWhiteBalanceGains(for: AVCaptureDevice.WhiteBalanceTemperatureAndTintValues(temperature: k, tint: renkTon))
            let ust = d.maxWhiteBalanceGain
            g.redGain = min(max(g.redGain, 1), ust); g.greenGain = min(max(g.greenGain, 1), ust); g.blueGain = min(max(g.blueGain, 1), ust)
            d.setWhiteBalanceModeLocked(with: g)
        } else if d.isWhiteBalanceModeSupported(.continuousAutoWhiteBalance) {
            d.whiteBalanceMode = .continuousAutoWhiteBalance
        }
        if let o = odakKonum, d.isLockingFocusWithCustomLensPositionSupported {
            d.setFocusModeLocked(lensPosition: min(max(o, 0), 1))
        } else if d.isFocusModeSupported(.continuousAutoFocus) {
            d.focusMode = .continuousAutoFocus
        }
        if d.hasTorch {
            let ac = flas == .fener && !mod.foto
            if d.isTorchModeSupported(ac ? .on : .off) { d.torchMode = ac ? .on : .off }
        }
    }

    func odakla(_ nokta: CGPoint) {
        kuyruk.async {
            guard let d = self.cihaz, (try? d.lockForConfiguration()) != nil else { return }
            let pro = self.mod == .pro
            let elleOdak = pro ? (self.proAyar.odak == .sonsuz || self.proAyar.odak == .iki) : self.odakKonum != nil
            if !elleOdak, d.isFocusPointOfInterestSupported {
                d.focusPointOfInterest = nokta
                d.focusMode = pro && self.proAyar.odak == .afc ? .continuousAutoFocus : .autoFocus
            }
            if !pro, self.secilenIso == nil, self.secilenEnst == nil, d.isExposurePointOfInterestSupported { d.exposurePointOfInterest = nokta; d.exposureMode = .continuousAutoExposure }
            d.unlockForConfiguration()
        }
    }

    /// AI Kadraj açıkken dokunuş: o noktadaki konu seçilir, AF-AE onu izler. Konu bulunamazsa düz odak
    func konuSec(_ kare: CGPoint, cihaz: CGPoint) {
        guard asistanAcik, (0...1).contains(kare.x), (0...1).contains(kare.y) else { odakla(cihaz); return }
        asistan.hedef = kare
        asistan.konuKayboldu = { [weak self] in
            guard let self, self.konuSecili else { return }
            self.konuSecili = false
            self.bildirim = "Konu kayboldu; otomatik odak"
        }
        konuSecili = true
        sonKonuNokta = CGPoint(x: -1, y: -1)
        odakla(cihaz)
        // 1,5 sn içinde konu bulunmazsa seçim düşer (düz odak kalır)
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            guard let self, self.konuSecili, self.konu == nil else { return }
            self.asistan.hedef = nil; self.konuSecili = false
            self.bildirim = "Orada konu bulunamadı"
        }
    }

    /// Kare koordinatı (ekran yönünde, 0–1, y aşağı) → cihaz odak noktası (sensör yönü)
    func cihazNoktasi(_ p: CGPoint) -> CGPoint {
        let fx = onde ? 1 - p.x : p.x, fy = p.y
        switch arayuzYonu {
        case .landscapeRight: return CGPoint(x: fx, y: fy)
        case .landscapeLeft: return CGPoint(x: 1 - fx, y: 1 - fy)
        case .portraitUpsideDown: return CGPoint(x: 1 - fy, y: fx)
        default: return CGPoint(x: fy, y: 1 - fx)
        }
    }

    /// Seçili konu hareket ettikçe odak ve pozlama noktası onu izler (0,3 sn'de bir, konu yerinden oynadıysa)
    private func konuyuIzle(_ k: CGRect) {
        let m = CGPoint(x: k.midX, y: k.midY)
        guard Date().timeIntervalSince(sonKonuOdak) > 0.3, hypot(m.x - sonKonuNokta.x, m.y - sonKonuNokta.y) > 0.02 else { return }
        sonKonuOdak = Date(); sonKonuNokta = m
        let nokta = cihazNoktasi(m)
        kuyruk.async {
            guard let d = self.cihaz, (try? d.lockForConfiguration()) != nil else { return }
            let pro = self.mod == .pro
            let elleOdak = pro ? (self.proAyar.odak == .sonsuz || self.proAyar.odak == .iki) : self.odakKonum != nil
            if !elleOdak, d.isFocusPointOfInterestSupported { d.focusPointOfInterest = nokta; d.focusMode = .continuousAutoFocus }
            if !pro, self.secilenIso == nil, self.secilenEnst == nil, d.isExposurePointOfInterestSupported { d.exposurePointOfInterest = nokta; d.exposureMode = .continuousAutoExposure }
            d.unlockForConfiguration()
        }
    }

    /// Uzun basınca: odak ve pozlama yeniden otomatik
    func odakSerbest() {
        odakKonum = nil
        if konuSecili { konuSecili = false; asistan.hedef = nil }
        kuyruk.async {
            guard let d = self.cihaz, (try? d.lockForConfiguration()) != nil else { return }
            if d.isFocusPointOfInterestSupported { d.focusPointOfInterest = CGPoint(x: 0.5, y: 0.5) }
            if d.isExposurePointOfInterestSupported { d.exposurePointOfInterest = CGPoint(x: 0.5, y: 0.5) }
            d.unlockForConfiguration()
            if self.mod == .pro { self.proUygula() } else { self.normalUygula() }
        }
        bildirim = "Otomatik odak"
    }

    // MARK: ayarlar

    func fotoBoyutSec(_ b: CMVideoDimensions) {
        Kamera.ud.set("\(b.width)x\(b.height)", forKey: "k.foto")
        fotoBoyut = b
        kuyruk.async { self.fotoCikti.maxPhotoDimensions = b; self.bicimYaz() }
    }

    // MARK: çekim

    func deklansor(yon: AVCaptureVideoOrientation) {
        switch mod {
        case .foto, .portre:
            if geriSayiyor { geriSayiyor = false; proIlerleme = nil; return }
            if uzunSuruyor { kareKuyruk.async { self.birlestirmeBitir() }; return }
            guard zamanlayici > 0 else { tekCek(yon: yon); return }
            geriSayiyor = true
            Task { @MainActor in
                for i in stride(from: zamanlayici, to: 0, by: -1) {
                    proIlerleme = "\(i)"
                    try? await Task.sleep(nanoseconds: 1_000_000_000)
                    if !geriSayiyor { proIlerleme = nil; return }
                }
                geriSayiyor = false
                proIlerleme = nil
                tekCek(yon: yon)
            }
        case .pro:
            proCek(yon: yon)
        case .video:
            if kayitta { kuyruk.async { self.videoCikti.stopRecording() }; return }
            kayitta = true
            kayitBasi = Date()
            kuyruk.async {
                // Yalnız değişen ayar yazılır: bağlantıya her dokunuş oturumu kısa süre durdurabiliyor
                if let b = self.videoCikti.connection(with: .video) {
                    if b.videoOrientation != yon { b.videoOrientation = yon }
                    let ayna = self.cihaz?.position == .front
                    if b.isVideoMirroringSupported, b.automaticallyAdjustsVideoMirroring || b.isVideoMirrored != ayna {
                        b.automaticallyAdjustsVideoMirroring = false; b.isVideoMirrored = ayna
                    }
                }
                self.kayitBicimiUygula()
                let url = FileManager.default.temporaryDirectory.appendingPathComponent("UPDATED-\(Int(Date().timeIntervalSince1970)).mov")
                self.videoCikti.startRecording(to: url, recordingDelegate: self)
            }
        case .timelapse:
            if tlYazici != nil { tlBitir() } else { tlBasla(yon: yon) }
        }
    }

    private func tekCek(yon: AVCaptureVideoOrientation) {
        if mod == .foto, uzunPozlama, let e = secilenEnst { uzunCek(e, yon: yon); return }
        kuyruk.async {
            self.fotoCikti.connection(with: .video)?.videoOrientation = yon
            self.fotoCek(hizli: false)
        }
    }

    /// Tek fotoğraf (seri çekimde hızlı); RAW açıksa RAW + JPEG
    func fotoCek(hizli: Bool) {
        let ayar: AVCapturePhotoSettings
        let rawTip = fotoCikti.availableRawPhotoPixelFormatTypes.first { AVCapturePhotoOutput.isAppleProRAWPixelFormat($0) }
            ?? fotoCikti.availableRawPhotoPixelFormatTypes.first
        if raw, !hizli, let rawTip {
            ayar = AVCapturePhotoSettings(rawPixelFormatType: rawTip, processedFormat: [AVVideoCodecKey: AVVideoCodecType.jpeg])
        } else {
            ayar = AVCapturePhotoSettings()
            ayar.photoQualityPrioritization = hizli ? .speed : .balanced
        }
        ayar.maxPhotoDimensions = fotoCikti.maxPhotoDimensions
        let f: AVCaptureDevice.FlashMode = flas == .oto ? .auto : (flas == .acik ? .on : .off)
        if mod != .pro, fotoCikti.supportedFlashModes.contains(f) { ayar.flashMode = f }
        if #available(iOS 18.0, *), !deklansorSesi, fotoCikti.isShutterSoundSuppressionSupported { ayar.isShutterSoundSuppressionEnabled = true }
        fotoCikti.capturePhoto(with: ayar, delegate: self)
    }

    /// FOTO'da 1 sn'yi aşan enstantane ya da BULB: telefonun en uzun pozlamasıyla art arda kareler alınıp tek fotoğrafta birleştirilir
    private func uzunCek(_ e: Double, yon: AVCaptureVideoOrientation) {
        uzunSuruyor = true
        proCalisiyor = true
        UIApplication.shared.isIdleTimerDisabled = true
        let bulb = e >= Kamera.bulb
        proIlerleme = bulb ? "BULB · bitirmek için deklanşör" : "0:00 / \(Kamera.saat(e))"
        let yol = uzunYol
        kuyruk.async {
            self.oturum.beginConfiguration()
            self.kareCiktiAyarla()
            self.oturum.commitConfiguration()
            self.kareKuyruk.async {
                self.kareCikti.connection(with: .video)?.videoOrientation = yon
                self.birlestirici = Birlestirici(yol)
                self.birlestirmeHedef = 0
                self.birlestirmeBas = Date()
                self.birlestirmeBitis = bulb ? .distantFuture : Date().addingTimeInterval(e)
            }
        }
    }

    /// Birleştirme bitince (kare kuyruğundan çağrılır): uzun pozlamanın kare çıkışı kalkar
    func uzunBitti() {
        guard uzunSuruyor else { return }
        uzunSuruyor = false
        kuyruk.async {
            self.oturum.beginConfiguration()
            self.kareCiktiAyarla()
            self.oturum.commitConfiguration()
        }
    }

    func kaydet(_ degisiklik: @escaping () -> Void, mesaj: String, kucuk: UIImage? = nil) {
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { durum in
            guard durum == .authorized || durum == .limited else {
                DispatchQueue.main.async { self.bildirim = "Fotoğraflar izni yok, Ayarlar'dan açılabilir." }
                return
            }
            PHPhotoLibrary.shared().performChanges(degisiklik) { tamam, _ in
                DispatchQueue.main.async {
                    self.bildirim = tamam ? mesaj : "Kaydedilemedi."
                    if tamam, let kucuk { self.sonResim = kucuk }
                }
            }
        }
    }

    static func kucukResim(_ veri: Data) -> UIImage? { UIImage(data: veri)?.preparingThumbnail(of: CGSize(width: 160, height: 160)) }

    static func kucukResim(video url: URL) -> UIImage? {
        let g = AVAssetImageGenerator(asset: AVURLAsset(url: url))
        g.appliesPreferredTrackTransform = true
        g.maximumSize = CGSize(width: 160, height: 160)
        return (try? g.copyCGImage(at: .zero, actualTime: nil)).map { UIImage(cgImage: $0) }
    }

    // MARK: timelapse

    private func tlBasla(yon: AVCaptureVideoOrientation) {
        let y = TimelapseYazici(aralikMs: tlAralik)
        kayitta = true
        kayitBasi = Date()
        tlKare = 0
        UIApplication.shared.isIdleTimerDisabled = true
        kareKuyruk.async {
            if let b = self.kareCikti.connection(with: .video), b.isVideoOrientationSupported { b.videoOrientation = yon }
            self.tlYazici = y
        }
        // Pozlama başta sabitlenir: parlaklık kareden kareye oynamaz (titreme olmaz)
        if tlPozSabit {
            kuyruk.asyncAfter(deadline: .now() + 0.3) {
                guard let d = self.cihaz, (try? d.lockForConfiguration()) != nil else { return }
                if d.isExposureModeSupported(.locked) { d.exposureMode = .locked }
                if d.isWhiteBalanceModeSupported(.locked) { d.whiteBalanceMode = .locked }
                d.unlockForConfiguration()
            }
        }
    }

    func tlBitir() {
        UIApplication.shared.isIdleTimerDisabled = false
        kareKuyruk.async {
            guard let y = self.tlYazici else { return }
            self.tlYazici = nil
            y.bitir { tamam in
                DispatchQueue.main.async {
                    self.kayitta = false; self.kayitBasi = nil
                    guard tamam else { self.bildirim = "Timelapse kaydedilemedi (hiç kare alınmadı)."; return }
                    let kucuk = Kamera.kucukResim(video: y.url)
                    self.kaydet({ PHAssetCreationRequest.forAsset().addResource(with: .video, fileURL: y.url, options: nil) },
                                mesaj: "Timelapse Fotoğraflar'a kaydedildi", kucuk: kucuk)
                }
            }
        }
        kuyruk.async { self.normalUygula() }
    }

    // MARK: döngü: kayıt süresi, timelapse sınırı, sahne önerisi

    private func tik() {
        if let y = tlYazici {
            tlKare = y.kareSayisi
            if tlSure > 0, let bas = kayitBasi, Date().timeIntervalSince(bas) >= Double(tlSure * 60) { tlBitir() }
        }
        sahneDenetle()
    }

    private func sahneDenetle() {
        guard sahneOto, asistanAcik, mod == .foto, !kayitta, let d = cihaz else { sahneOnerisi = nil; sahneAday = nil; return }
        let otoPoz = secilenIso == nil && d.exposureMode == .continuousAutoExposure
        let r = renkOrt
        let yuz = asistanAcik && konuAdi == "Yüz" && (konu.map { $0.width * $0.height } ?? 0) > 0.05
        let aday = Sahne.oner(isoSaniye: otoPoz ? d.iso * Float(d.exposureDuration.seconds) : nil, yukariBakiyor: yercekimZ > 0.5,
                              ortParlak: 0.2126 * r[0] + 0.7152 * r[1] + 0.0722 * r[2], kirmiziMavi: r[2] > 0.01 ? r[0] / r[2] : 1, buyukYuz: yuz)
        // Sahne de birkaç saniye aynı kalınca önerilir; gösterilen öneri yeni aday oturana kadar kalır
        guard let aday else { sahneAday = nil; if sahneOnerisi != nil { sahneOnerisi = nil }; return }
        if let a = sahneAday, a.sahne == aday {
            if Date().timeIntervalSince(a.bas) >= Kamera.aiBekleme, sahneOnerisi != aday { sahneOnerisi = aday }
        } else { sahneAday = (aday, Date()) }
    }

    func sahneUygula() {
        guard let o = sahneOnerisi else { return }
        sahneOnerisi = nil
        switch o {
        case .gece: modDegistir(.pro); proModSec(.geceSehir)
        case .samanyolu: modDegistir(.pro); proModSec(.samanyolu)
        case .portre: modDegistir(.portre)
        case .gunBatimi: ev = -0.7; bd = 6500; kuyruk.async { self.normalUygula() }; bildirim = "Gün batımı ayarları uygulandı"
        }
    }

    // MARK: kompozisyon yardımcıları

    func yardimcilariAyarla() {
        asistan.konuAcik = asistanAcik
        asistan.analizAcik = asistanAcik
        asistan.renkAcik = sahneOto && asistanAcik
        asistan.konuSonuc = { [weak self] k in self?.konuGeldi(k) }
        asistan.analizSonuc = { [weak self] a in self?.analiz = a; self?.ipucuGuncelle(); self?.aiDusun() }
        asistan.renkSonuc = { [weak self] r in self?.renkOrt = r }
        if !asistanAcik { ipucu = nil; kompOneri = nil; sahneOnerisi = nil; aiAday = nil; sahneAday = nil; aiDusunuyor = false; konu = nil; konuAdi = ""; analiz = nil; konuSecili = false; asistan.hedef = nil }
        if !teraziAcik { egim = nil }
        if (teraziAcik || sahneOto && asistanAcik), hareket.isDeviceMotionAvailable {
            if !hareket.isDeviceMotionActive {
                hareket.deviceMotionUpdateInterval = 1.0 / 20
                hareket.startDeviceMotionUpdates(to: .main) { [weak self] m, _ in if let m { self?.yercekim(m.gravity) } }
            }
        } else { hareket.stopDeviceMotionUpdates() }
        guard kuruldu else { return }
        kuyruk.async {
            self.oturum.beginConfiguration()
            self.kareCiktiAyarla()
            self.oturum.commitConfiguration()
        }
    }

    private func yercekim(_ g: CMAcceleration) {
        yercekimZ = g.z
        guard teraziAcik else { return }
        // Ufuk açısı (telefon dik tutulunca 0; Android'deki formülün iOS işaretleriyle karşılığı), ekranın kendi dönüşü düşülür
        var ufuk = atan2(-g.y, -g.x) * 180 / .pi - 90
        if ufuk <= -180 { ufuk += 360 }
        let taban = (ufuk / 90).rounded() * 90
        let ekran: Double
        switch arayuzYonu {
        case .landscapeRight: ekran = 90
        case .landscapeLeft: ekran = -90
        case .portraitUpsideDown: ekran = 180
        default: ekran = 0
        }
        egimTaban = CGFloat(taban - ekran)
        egim = CGFloat(ufuk - taban)
    }

    private func konuGeldi(_ k: Asistan.Konu?) {
        guard asistanAcik else { return }
        konu = k?.kutu
        konuAdi = k?.ad ?? ""
        sonYuz = k?.yuz
        if let k, k.secili, konuSecili { konuyuIzle(k.kutu) }
        aiDusun()
        ipucuGuncelle()
    }

    /// Yön tarifi: konu, yüz ve görüntü analizinden tek satır (titremesin diye sabitlenir)
    private func ipucuGuncelle() {
        guard asistanAcik, !kayitta else { ipucu = nil; return }
        let h = Kompozisyon.hedef(kompTur, yon: kompYon, oran: goruntuOrani, konu: konu, analiz: analiz)
        ipucu = ipucuSabit.ver(ipucuUret(konu: konu, konuAdi: konuAdi, yuz: konuAdi == "Yüz" ? sonYuz : nil, a: analiz, hedef: h?.nokta, hizalama: h?.hizalama ?? 0))
    }

    /// AI Kadraj: aynı kompozisyon önerisi ~6 sn sürünce tek öneri olarak gösterilir (dokununca uygulanır);
    /// kadraj zaten iyiyse öneri kalkar. Konu ya da çizgi yokken kılavuz kapalıysa üçte bir önerilir.
    func aiDusun() {
        guard asistanAcik, !kayitta, mod != .pro else { kompOneri = nil; aiAday = nil; if aiDusunuyor { aiDusunuyor = false }; return }
        let h = Kompozisyon.hedef(kompTur, yon: kompYon, oran: goruntuOrani, konu: konu, analiz: analiz)
        let o = Kompozisyon.oner(konu: konu, mevcut: kompTur, oran: goruntuOrani, analiz: analiz) ?? (kompTur == .kapali ? (.ucteBir, 0) : nil)
        if let o, (h?.hizalama ?? 0) <= 0.85, o.0 != kompTur || o.1 != kompYon {
            if let a = aiAday, a.tur == o.0, a.yon == o.1 {
                if Date().timeIntervalSince(a.bas) >= Kamera.aiBekleme, kompOneri?.tur != o.0 || kompOneri?.yon != o.1 { kompOneri = (tur: o.0, yon: o.1) }
            } else {
                aiAday = (o.0, o.1, Date())
            }
        } else {
            aiAday = nil
            if h?.tamam == true, kompOneri != nil { kompOneri = nil }
        }
        let d = aiAday != nil && kompOneri == nil
        if d != aiDusunuyor { aiDusunuyor = d }
    }

    func kompOneriUygula() {
        guard let o = kompOneri else { return }
        kompTur = o.tur; kompYon = o.yon; kompOneri = nil; aiAday = nil; aiDusunuyor = false
    }
}

extension Kamera: AVCapturePhotoCaptureDelegate {
    /// Çekim anı: ekran Apple Kamera gibi bir an kararır (dokunuşun alındığı görülsün)
    func photoOutput(_ output: AVCapturePhotoOutput, willCapturePhotoFor resolvedSettings: AVCaptureResolvedPhotoSettings) {
        DispatchQueue.main.async { self.cekimAni += 1 }
    }

    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        guard error == nil, let veri = photo.fileDataRepresentation() else { return }
        let id = photo.resolvedSettings.uniqueID
        var p = parcalar[id] ?? (nil, nil)
        if photo.isRawPhoto { p.ham = veri } else { p.islenmis = veri }
        parcalar[id] = p
    }

    func photoOutput(_ output: AVCapturePhotoOutput, didFinishCaptureFor resolvedSettings: AVCaptureResolvedPhotoSettings, error: Error?) {
        guard let p = parcalar.removeValue(forKey: resolvedSettings.uniqueID), let ana = p.islenmis ?? p.ham else {
            if error != nil { DispatchQueue.main.async { self.bildirim = "Fotoğraf çekilemedi." } }
            return
        }
        let gomulu = p.islenmis.map { fotoyaGom($0) } ?? ana
        let kucuk = p.islenmis.flatMap { Kamera.kucukResim($0) }
        let mesaj = mod == .pro && proMod.seri ? (seriSayi > 1 ? "\(seriSayi) kare çekildi" : "Fotoğraf kaydedildi") : (p.ham != nil ? "Fotoğraf kaydedildi (RAW + JPEG)" : "Fotoğraf kaydedildi")
        kaydet({
            let istek = PHAssetCreationRequest.forAsset()
            istek.addResource(with: .photo, data: gomulu, options: nil)
            if p.islenmis != nil, let ham = p.ham {
                let s = PHAssetResourceCreationOptions()
                s.originalFilename = "UPDATED-\(Int(Date().timeIntervalSince1970)).dng"
                istek.addResource(with: .alternatePhoto, data: ham, options: s)
            }
        }, mesaj: mesaj, kucuk: kucuk)
    }
}

extension Kamera: AVCaptureFileOutputRecordingDelegate {
    func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo url: URL, from connections: [AVCaptureConnection], error: Error?) {
        DispatchQueue.main.async { self.kayitta = false; self.kayitBasi = nil }
        videoyaGom(url) { url in
            let kucuk = Kamera.kucukResim(video: url)
            self.kaydet({ PHAssetCreationRequest.forAsset().addResource(with: .video, fileURL: url, options: nil) }, mesaj: "Video kaydedildi", kucuk: kucuk)
        }
    }
}

extension Kamera: AVCaptureVideoDataOutputSampleBufferDelegate {
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        for d in kareDinleyiciler { d(sampleBuffer) }
        guard let kare = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        if araclarAcik { cizici.kare(kare) }
        tlYazici?.kare(kare)
        asistan.kare(kare)
        birlestirmeKaresi(kare)
    }
}

extension Kamera: AVCaptureMetadataOutputObjectsDelegate {
    /// PORTRE: en büyük yüze odak ve pozlama (kuyrukta, saniyede en çok iki kez)
    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard mod == .portre, !konuSecili, Date().timeIntervalSince(sonYuzOdak) > 0.5,
              let y = metadataObjects.filter({ $0.type == .face }).max(by: { $0.bounds.width * $0.bounds.height < $1.bounds.width * $1.bounds.height }),
              let d = cihaz, (try? d.lockForConfiguration()) != nil else { return }
        sonYuzOdak = Date()
        let m = CGPoint(x: y.bounds.midX, y: y.bounds.midY)
        if odakKonum == nil, d.isFocusPointOfInterestSupported { d.focusPointOfInterest = m; d.focusMode = .continuousAutoFocus }
        if secilenIso == nil, d.isExposurePointOfInterestSupported { d.exposurePointOfInterest = m; d.exposureMode = .continuousAutoExposure }
        d.unlockForConfiguration()
    }
}
