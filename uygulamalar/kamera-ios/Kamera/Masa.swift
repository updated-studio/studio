import AVFoundation
import CoreImage
import Network
import Photos
import SwiftUI

/// Bir kaynağın ekrandaki görüntüsü: kareler doğrudan katmana gider (SwiftUI'den geçmez), dönüş katmanla yapılır
final class GoruntuGorunumu: UIView {
    let katman = AVSampleBufferDisplayLayer()
    /// Saat yönünde derece
    var dondur = 0 { didSet { if dondur != oldValue { setNeedsLayout() } } }

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .black
        clipsToBounds = true
        katman.videoGravity = .resizeAspect
        layer.addSublayer(katman)
    }

    required init?(coder: NSCoder) { fatalError("kullanılmaz") }

    override func layoutSubviews() {
        super.layoutSubviews()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        let yan = dondur % 180 != 0
        katman.bounds = CGRect(x: 0, y: 0, width: yan ? bounds.height : bounds.width, height: yan ? bounds.width : bounds.height)
        katman.position = CGPoint(x: bounds.midX, y: bounds.midY)
        katman.setAffineTransform(CGAffineTransform(rotationAngle: CGFloat(dondur) * .pi / 180))
        CATransaction.commit()
    }

    func goster(_ sb: CMSampleBuffer) {
        if katman.status == .failed { katman.flush() }
        katman.enqueue(sb)
    }

    func temizle() { DispatchQueue.main.async { self.katman.flushAndRemoveImage() } }
}

/// Kalıcı görüntü görünümünü SwiftUI düzenine yerleştirir (düzen değişince görünüm yeni yerine taşınır)
struct Goruntu: UIViewRepresentable {
    let gorunum: GoruntuGorunumu

    func makeUIView(context: Context) -> UIView {
        let k = UIView()
        k.backgroundColor = .black
        // Dokunuşlar SwiftUI'ye kalsın (dokun → canlı, basılı tut → menü)
        k.isUserInteractionEnabled = false
        return k
    }

    func updateUIView(_ k: UIView, context: Context) {
        guard gorunum.superview !== k else { return }
        gorunum.removeFromSuperview()
        gorunum.frame = k.bounds
        gorunum.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        k.addSubview(gorunum)
    }
}

/// Masadaki bir kaynak (Wi-Fi kamera ya da USB kamera)
final class Yuva: ObservableObject, Identifiable {
    let id = UUID()
    let ad: String
    let alici: WifiAlici?
    let usbKimlik: String?
    let gorunum = GoruntuGorunumu()
    @Published var bagli: Bool
    /// Kayıtta bu kaynağın kendi dosyası yazılıyor
    @Published var kaydediyor = false
    /// USB kaynağın seçilen biçimi (program kaydının boyutu için); Wi-Fi'da alıcıdan okunur
    var boyut: CMVideoDimensions?
    @Published var dondur = 0 {
        didSet { gorunum.dondur = dondur; kilit.lock(); _donus = dondur; kilit.unlock() }
    }
    private let kilit = NSLock()
    private var son: CVPixelBuffer?
    private var _donus = 0
    private var _canlida = false
    private var _sirada = false

    init(ad: String, alici: WifiAlici? = nil, usbKimlik: String? = nil) {
        self.ad = ad; self.alici = alici; self.usbKimlik = usbKimlik
        bagli = alici == nil
    }

    var wifi: Bool { alici != nil }
    var sonKare: CVPixelBuffer? { kilit.lock(); defer { kilit.unlock() }; return son }
    var donus: Int { kilit.lock(); defer { kilit.unlock() }; return _donus }
    var canlida: Bool {
        get { kilit.lock(); defer { kilit.unlock() }; return _canlida }
        set { kilit.lock(); _canlida = newValue; kilit.unlock() }
    }
    /// iPad masasında önizlemede (sıradaki) kaynak
    var sirada: Bool {
        get { kilit.lock(); defer { kilit.unlock() }; return _sirada }
        set { kilit.lock(); _sirada = newValue; kilit.unlock() }
    }
    func yeniKare(_ pb: CVPixelBuffer) { kilit.lock(); son = pb; kilit.unlock() }
}

/// Masa: en çok 4 kaynak (Wi-Fi kameralar + iPad'e USB ile takılı kameralar), canlı geçişi, tally, çoklu kayıt.
/// Kayıt: her kaynak kendi dosyasına (Wi-Fi akışı geldiği gibi, USB kaynağı HEVC) + program (canlıdaki görüntü, kesimli; en büyük kaynağın
/// boyutunda, 4K'ya kadar, HEVC) aynı anda; seçili SSD klasörüne "UPDATED Masa/<tarih saat>/", yoksa Fotoğraflar'a.
/// Android'deki MasaActivity ile aynı iş; Android telefonlar da bu masaya Wi-Fi kamera olarak bağlanır.
final class Masa: NSObject, ObservableObject {
    static let enCok = 4

    @Published var yuvalar: [Yuva] = []
    @Published var canli: UUID?
    /// iPad masası: önizlemedeki (sıradaki) kaynak; KES ile canlıya geçer (ATEM'deki PREVIEW)
    @Published var siradaki: UUID?
    let onizleme = GoruntuGorunumu()
    @Published var kayitta = false
    @Published var kayitBasi: Date?
    /// Kayıttaki dosyalar, ör. "3 KAMERA + PROGRAM"
    @Published var kayitOzeti = ""
    let klasor = KayitKlasoru()
    /// Program düzeni (Fatih 29 Ekim gece: Masa kurgu masası gibi): Tek = canlı kaynak; 2/3/4'lü = kaynaklar 4K tuvale tam boyutuyla dizilir;
    /// Oto = kaynak sayısına göre. Kayıt sürerken değiştirilebilir; program dosyası bu düzeni yazar
    @Published var duzen = Duzen(rawValue: UserDefaults.standard.string(forKey: "masa.duzen") ?? "") ?? .oto {
        didSet { UserDefaults.standard.set(duzen.rawValue, forKey: "masa.duzen"); duzenDegisti() }
    }
    enum Duzen: String, CaseIterable, Identifiable {
        case oto, tek, ikili, uclu, dortlu
        var id: String { rawValue }
        var ad: String { switch self { case .oto: return "Oto"; case .tek: return "Tek"; case .ikili: return "2'li"; case .uclu: return "3'lü"; case .dortlu: return "2×2" } }
        /// Kaç kaynak dizilir (0 = tek, canlı)
        func adet(_ kaynak: Int) -> Int {
            switch self {
            case .oto: return kaynak >= 2 ? min(kaynak, 4) : 0
            case .tek: return 0
            case .ikili: return 2
            case .uclu: return 3
            case .dortlu: return 4
            }
        }
    }
    /// Düzenli program için tuval (3840×2160) ve kutular: 2'li yan yana ortada, 3'lü üstte iki altta ortada bir, 4'lü 2×2
    static let tuvalW: CGFloat = 3840, tuvalH: CGFloat = 2160
    static func kutular(_ adet: Int) -> [CGRect] {
        let w: CGFloat = 1920, h: CGFloat = 1080
        switch adet {
        case 2: return [CGRect(x: 0, y: 540, width: w, height: h), CGRect(x: 1920, y: 540, width: w, height: h)]
        case 3: return [CGRect(x: 0, y: 0, width: w, height: h), CGRect(x: 1920, y: 0, width: w, height: h), CGRect(x: 960, y: 1080, width: w, height: h)]
        default: return [CGRect(x: 0, y: 0, width: w, height: h), CGRect(x: 1920, y: 0, width: w, height: h),
                         CGRect(x: 0, y: 1080, width: w, height: h), CGRect(x: 1920, y: 1080, width: w, height: h)]
        }
    }
    /// Şu anki düzende dizilen kaynak sayısı (0 = tek)
    var duzenAdet: Int { duzen.adet(yuvalar.count) }
    private var duzenZamanlayici: DispatchSourceTimer?
    private var onizlemeHavuz: CVPixelBufferPool?
    /// Dizili düzendeki kaynaklar (kilit altında; kayıt kuyruğu okur)
    private var _duzenKaynaklar: [Yuva] = []
    /// Ekrandaki program monitörü için küçük tuval (1280×720); kayıt dosyası 4K
    @Published var bildirim: String?
    @Published var aglarIzni = true
    let program = GoruntuGorunumu()

    private let bulucu = KameraBulucu()
    /// Elle kaldırılan Wi-Fi kameraları kendiliğinden geri eklenmez
    private var kaldirilanlar = Set<String>()
    private var gozlemciler: [NSObjectProtocol] = []
    private let kilit = NSLock()
    private var canliYuva: Yuva?

    // USB kameralar ve mikrofon tek oturumda (iPad aynı anda tek oturum çalıştırır)
    private let usbKuyruk = DispatchQueue(label: "tr.com.updated.masa.usb")
    private let kareKuyruk = DispatchQueue(label: "tr.com.updated.masa.kare")
    private var oturum: AVCaptureSession?
    private struct UsbBag { let yuva: Yuva; let girdi: AVCaptureDeviceInput; let cikti: AVCaptureVideoDataOutput }
    private var usbBaglar: [ObjectIdentifier: UsbBag] = [:]

    // Kayıt (hepsi kayitKuyruk'ta)
    private let kayitKuyruk = DispatchQueue(label: "tr.com.updated.masa.kayit")
    private var oturumKaydi: KayitOturumu?
    private var sesBicimi: AudioStreamBasicDescription?
    private let ci = CIContext(options: [.cacheIntermediates: false])

    /// Süren kaydın dosyaları
    private final class KayitOturumu {
        let baslangic: CMTime           // ana saat (host): tüm dosyaların 0 anı
        let klasorUrl: URL?             // SSD'deki oturum klasörü; nil = geçici, sonra Fotoğraflar
        let erisim: URL?                // güvenlik kapsamı açılan kök
        let dizin: URL
        var program: DosyaYazici?
        var programBoyut = (w: 1920, h: 1080)
        var kaynaklar: [UUID: DosyaYazici] = [:]
        var kaynakUrl: [UUID: URL] = [:]
        /// Wi-Fi kaynağı: ilk yazılan paketin kamera zamanı ve o anki kayıt zamanı
        var wifiIlk: [UUID: (us: Int64, pts: CMTime)] = [:]
        var sonProgramPts = CMTime.negativeInfinity
        init(baslangic: CMTime, klasorUrl: URL?, erisim: URL?, dizin: URL) {
            self.baslangic = baslangic; self.klasorUrl = klasorUrl; self.erisim = erisim; self.dizin = dizin
        }
    }

    func ac() {
        UIApplication.shared.isIdleTimerDisabled = true
        duzenDegisti()
        bulucu.bulundu = { [weak self] ad, hedef in self?.wifiBulundu(ad, hedef) }
        bulucu.izinYok = { [weak self] in self?.aglarIzni = false }
        bulucu.baslat()
        let nc = NotificationCenter.default
        gozlemciler.append(nc.addObserver(forName: AVCaptureDevice.wasConnectedNotification, object: nil, queue: .main) { [weak self] _ in self?.usbTara() })
        gozlemciler.append(nc.addObserver(forName: AVCaptureDevice.wasDisconnectedNotification, object: nil, queue: .main) { [weak self] n in
            guard let self, let d = n.object as? AVCaptureDevice, let y = self.yuvalar.first(where: { $0.usbKimlik == d.uniqueID }) else { return }
            self.kaldir(y)
            self.bildirim = "\(d.localizedName) çıkarıldı"
        })
        Task {
            _ = await AVCaptureDevice.requestAccess(for: .video)
            _ = await AVCaptureDevice.requestAccess(for: .audio)
            usbKuyruk.async {
                self.oturumKur(coklu: AVCaptureMultiCamSession.isMultiCamSupported)
                DispatchQueue.main.async { self.usbTara() }
            }
        }
    }

    func kapat() {
        if kayitta { kayitBitir() }
        duzenZamanlayici?.cancel(); duzenZamanlayici = nil
        bulucu.durdur()
        gozlemciler.forEach { NotificationCenter.default.removeObserver($0) }
        gozlemciler = []
        for y in yuvalar { y.alici?.tally(false); y.alici?.durdur() }
        yuvalar = []
        canli = nil
        kilit.lock(); canliYuva = nil; kilit.unlock()
        usbKuyruk.async {
            self.oturum?.stopRunning()
            self.oturum = nil
            self.kilit.lock(); self.usbBaglar = [:]; self.kilit.unlock()
        }
        UIApplication.shared.isIdleTimerDisabled = false
    }

    // MARK: kaynaklar

    private func wifiBulundu(_ ad: String, _ hedef: NWEndpoint) {
        aglarIzni = true
        guard !kaldirilanlar.contains(ad) else { return }
        wifiEkle(ad, hedef)
    }

    /// Düzen ya da kaynak sayısı değişince: dizili düzende program monitörü ve kaydı zamanlayıcıyla (30 kare/sn) birleştirilir
    func duzenDegisti() {
        let adet = duzenAdet
        kilit.lock(); _duzenKaynaklar = Array(yuvalar.prefix(adet)); kilit.unlock()
        if adet == 0 {
            duzenZamanlayici?.cancel(); duzenZamanlayici = nil
            program.temizle()
            programDonus()
            return
        }
        program.dondur = 0
        guard duzenZamanlayici == nil else { return }
        let z = DispatchSource.makeTimerSource(queue: kayitKuyruk)
        z.schedule(deadline: .now(), repeating: .milliseconds(33), leeway: .milliseconds(3))
        z.setEventHandler { [weak self] in self?.duzenKaresi() }
        z.resume()
        duzenZamanlayici = z
    }

    func wifiEkle(_ ad: String, _ hedef: NWEndpoint) {
        guard !yuvalar.contains(where: { $0.ad == ad }) else { return }
        guard yuvalar.count < Masa.enCok else { bildirim = "En çok \(Masa.enCok) kaynak"; return }
        let a = WifiAlici(ad: ad, hedef: hedef)
        let y = Yuva(ad: ad, alici: a)
        a.kare = { [weak self, weak y] pb in
            guard let self, let y else { return }
            self.kareGeldi(y, pb)
        }
        a.ornekGeldi = { [weak self, weak y] sb, us, anahtar in
            guard let self, let y, self.kayitta else { return }
            self.kayitKuyruk.async { self.wifiOrnegi(y, sb, us, anahtar) }
        }
        a.yonDegisti = { [weak self, weak y] d in
            DispatchQueue.main.async {
                guard let y else { return }
                y.dondur = d
                self?.programDonus()
            }
        }
        a.durum = { [weak y] b in
            DispatchQueue.main.async {
                y?.bagli = b
                if !b { y?.gorunum.temizle() }
            }
        }
        yuvalar.append(y)
        a.baslat()
        if canli == nil { canliYap(y) } else { a.tally(false) }
        duzenDegisti()
    }

    /// Elle adresle ekleme (Bonjour engelli ağlarda): "192.168.1.20" ya da "192.168.1.20:47800"
    func adresleEkle(_ yazi: String) {
        let p = yazi.trimmingCharacters(in: .whitespaces).split(separator: ":")
        guard let host = p.first, !host.isEmpty else { return }
        let kapi = p.count > 1 ? UInt16(p[1]) ?? AgYayin.kapi : AgYayin.kapi
        let ad = String(host)
        kaldirilanlar.remove(ad)
        wifiEkle(ad, .hostPort(host: NWEndpoint.Host(ad), port: NWEndpoint.Port(rawValue: kapi)!))
    }

    func usbTara() {
        let ds = AVCaptureDevice.DiscoverySession(deviceTypes: [.external], mediaType: .video, position: .unspecified)
        for d in ds.devices where !yuvalar.contains(where: { $0.usbKimlik == d.uniqueID }) { usbEkle(d) }
    }

    private func usbEkle(_ d: AVCaptureDevice) {
        guard yuvalar.count < Masa.enCok else { bildirim = "En çok \(Masa.enCok) kaynak"; return }
        let y = Yuva(ad: d.localizedName, usbKimlik: d.uniqueID)
        yuvalar.append(y)
        if canli == nil { canliYap(y) }
        duzenDegisti()
        usbKuyruk.async {
            var tamam = self.usbBagla(d, y)
            // Çok kameralı oturum bu kamerayı almadıysa ve başka USB kamera yoksa düz oturumla bir daha dene
            if !tamam, self.oturum is AVCaptureMultiCamSession, self.usbBosMu {
                self.oturumKur(coklu: false)
                tamam = self.usbBagla(d, y)
            }
            if tamam {
                if self.oturum?.isRunning == false { self.oturum?.startRunning() }
            } else {
                DispatchQueue.main.async {
                    self.kaldir(y)
                    self.bildirim = "\(d.localizedName) açılamadı — bu iPad aynı anda bu kadar USB kamerayı açamıyor olabilir"
                }
            }
        }
    }

    private var usbBosMu: Bool { kilit.lock(); defer { kilit.unlock() }; return usbBaglar.isEmpty }

    /// Mikrofonlu boş oturum; USB kameralar sonradan eklenir (usbKuyruk)
    private func oturumKur(coklu: Bool) {
        oturum?.stopRunning()
        let s: AVCaptureSession = coklu ? AVCaptureMultiCamSession() : AVCaptureSession()
        s.beginConfiguration()
        if let m = AVCaptureDevice.default(for: .audio), let g = try? AVCaptureDeviceInput(device: m), s.canAddInput(g) {
            s.addInputWithNoConnections(g)
            let ses = AVCaptureAudioDataOutput()
            if s.canAddOutput(ses) {
                s.addOutputWithNoConnections(ses)
                ses.setSampleBufferDelegate(self, queue: kayitKuyruk)
                if let port = g.ports.first(where: { $0.mediaType == .audio }) {
                    let b = AVCaptureConnection(inputPorts: [port], output: ses)
                    if s.canAddConnection(b) { s.addConnection(b) }
                }
            }
        }
        s.commitConfiguration()
        oturum = s
        s.startRunning()
    }

    private func usbBagla(_ d: AVCaptureDevice, _ y: Yuva) -> Bool {
        guard let s = oturum, let g = try? AVCaptureDeviceInput(device: d) else { return false }
        let coklu = s is AVCaptureMultiCamSession
        bicimSec(d, coklu: coklu)
        s.beginConfiguration()
        defer { s.commitConfiguration() }
        guard s.canAddInput(g) else { return false }
        s.addInputWithNoConnections(g)
        let c = AVCaptureVideoDataOutput()
        c.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange]
        c.alwaysDiscardsLateVideoFrames = true
        guard s.canAddOutput(c), let port = g.ports.first(where: { $0.mediaType == .video }) else { s.removeInput(g); return false }
        s.addOutputWithNoConnections(c)
        let b = AVCaptureConnection(inputPorts: [port], output: c)
        guard s.canAddConnection(b) else { s.removeOutput(c); s.removeInput(g); return false }
        s.addConnection(b)
        if !coklu { bicimSec(d, coklu: false) }
        if let m = s as? AVCaptureMultiCamSession, m.hardwareCost > 1 {
            s.removeConnection(b); s.removeOutput(c); s.removeInput(g); return false
        }
        c.setSampleBufferDelegate(self, queue: kareKuyruk)
        y.boyut = CMVideoFormatDescriptionGetDimensions(d.activeFormat.formatDescription)
        kilit.lock(); usbBaglar[ObjectIdentifier(c)] = UsbBag(yuva: y, girdi: g, cikti: c); kilit.unlock()
        return true
    }

    /// En büyük biçim (tek USB kamerada 4K'ya, çok kamerada 1080p'ye kadar), en az 25 kare/sn; aynı boyutta 60 kare/sn veren öne
    private func bicimSec(_ d: AVCaptureDevice, coklu: Bool) {
        let enW: Int32 = coklu ? 1920 : 3840, enH: Int32 = coklu ? 1080 : 2160
        let uygun = d.formats.filter { f in
            let b = CMVideoFormatDescriptionGetDimensions(f.formatDescription)
            return b.width <= enW && b.height <= enH && (!coklu || f.isMultiCamSupported)
                && f.videoSupportedFrameRateRanges.contains { $0.maxFrameRate >= 25 }
        }
        func puan(_ f: AVCaptureDevice.Format) -> Int {
            let b = CMVideoFormatDescriptionGetDimensions(f.formatDescription)
            let hiz = f.videoSupportedFrameRateRanges.map(\.maxFrameRate).max() ?? 0
            return Int(b.width) * Int(b.height) * 4 + (hiz >= 60 ? 3 : hiz >= 50 ? 2 : 1)
        }
        guard let en = uygun.max(by: { puan($0) < puan($1) }), (try? d.lockForConfiguration()) != nil else { return }
        d.activeFormat = en
        if let a = en.videoSupportedFrameRateRanges.first(where: { $0.maxFrameRate >= 60 }) {
            d.activeVideoMinFrameDuration = a.minFrameDuration; d.activeVideoMaxFrameDuration = a.minFrameDuration
        }
        d.unlockForConfiguration()
    }

    func kaldir(_ y: Yuva) {
        if kayitta, y.id == canli { bildirim = "Kayıt sürerken canlıdaki kaynak kaldırılamaz"; return }
        if let a = y.alici { a.tally(false); a.durdur(); kaldirilanlar.insert(y.ad) }
        if y.usbKimlik != nil {
            usbKuyruk.async {
                self.kilit.lock()
                let bag = self.usbBaglar.first(where: { $0.value.yuva === y })
                if let bag { self.usbBaglar[bag.key] = nil }
                self.kilit.unlock()
                guard let bag, let s = self.oturum else { return }
                s.beginConfiguration()
                s.removeOutput(bag.value.cikti)
                s.removeInput(bag.value.girdi)
                s.commitConfiguration()
            }
        }
        yuvalar.removeAll { $0 === y }
        duzenDegisti()
        if canli == y.id {
            if let ilk = yuvalar.first { canliYap(ilk) } else {
                canli = nil
                kilit.lock(); canliYuva = nil; kilit.unlock()
                program.temizle()
            }
        }
    }

    func canliYap(_ y: Yuva) {
        canli = y.id
        for k in yuvalar { k.canlida = k === y; k.alici?.tally(k === y) }
        kilit.lock(); canliYuva = y; kilit.unlock()
        program.temizle()
        programDonus()
    }

    func siradakiYap(_ y: Yuva) {
        siradaki = y.id
        for k in yuvalar { k.sirada = k === y }
        onizleme.temizle()
        onizleme.dondur = y.dondur
    }

    /// KES: önizlemedeki kaynak canlıya, canlıdaki önizlemeye
    func kes() {
        guard let s = yuvalar.first(where: { $0.id == siradaki }) else { return }
        let eski = yuvalar.first { $0.id == canli }
        canliYap(s)
        if let eski { siradakiYap(eski) } else { siradaki = nil; s.sirada = false; onizleme.temizle() }
    }

    func dondur(_ y: Yuva) {
        y.dondur = (y.dondur + 90) % 360
        programDonus()
        if y.id == siradaki { onizleme.dondur = y.dondur }
    }

    private func programDonus() {
        guard duzenAdet == 0 else { return }
        if let y = yuvalar.first(where: { $0.id == canli }) { program.dondur = y.dondur }
    }

    /// Dizili düzen (kayitKuyruk, 30 kare/sn): kaynakların son kareleri tuvale; ekrana 1280×720, kayda 3840×2160
    private func duzenKaresi() {
        kilit.lock(); let kaynaklar = _duzenKaynaklar; kilit.unlock()
        let adet = kaynaklar.count
        guard adet > 0 else { return }
        let kutular = Masa.kutular(adet)
        // Ekrandaki program monitörü
        if onizlemeHavuz == nil {
            CVPixelBufferPoolCreate(kCFAllocatorDefault, nil, [kCVPixelBufferPixelFormatTypeKey: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey: 1280,
                                                                 kCVPixelBufferHeightKey: 720, kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary, &onizlemeHavuz)
        }
        if let havuz = onizlemeHavuz {
            var pb: CVPixelBuffer?
            CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, havuz, &pb)
            if let pb {
                duzenCiz(kaynaklar, kutular, hedef: pb, olcek: 1 / 3)
                if let sb = AgYayin.ornek(pb) { program.goster(sb) }
            }
        }
        // Kayıt
        guard let o = oturumKaydi, let p = o.program, let havuz = p.havuz else { return }
        let pts = CMTimeSubtract(CMClockGetTime(CMClockGetHostTimeClock()), o.baslangic)
        guard pts > o.sonProgramPts else { return }
        var cikti: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, havuz, &cikti)
        guard let cikti else { return }
        duzenCiz(kaynaklar, kutular, hedef: cikti, olcek: CGFloat(o.programBoyut.w) / Masa.tuvalW)
        p.ekle(kare: cikti, pts: pts)
        o.sonProgramPts = pts
    }

    private func duzenCiz(_ kaynaklar: [Yuva], _ kutular: [CGRect], hedef: CVPixelBuffer, olcek: CGFloat) {
        let W = CGFloat(CVPixelBufferGetWidth(hedef)), H = CGFloat(CVPixelBufferGetHeight(hedef))
        var tuval = CIImage(color: .black).cropped(to: CGRect(x: 0, y: 0, width: W, height: H))
        for (i, y) in kaynaklar.enumerated() where i < kutular.count {
            guard let pb = y.sonKare else { continue }
            var g = CIImage(cvPixelBuffer: pb)
            switch y.donus {
            case 90: g = g.oriented(.right)
            case 180: g = g.oriented(.down)
            case 270: g = g.oriented(.left)
            default: break
            }
            // Core Image'da y aşağıdan yukarı: kutu dikeyde ters çevrilir
            let k = kutular[i]
            let kutu = CGRect(x: k.minX * olcek, y: (Masa.tuvalH - k.maxY) * olcek, width: k.width * olcek, height: k.height * olcek)
            let e = g.extent
            let s = min(kutu.width / e.width, kutu.height / e.height)
            g = g.transformed(by: CGAffineTransform(translationX: -e.minX, y: -e.minY))
                .transformed(by: CGAffineTransform(scaleX: s, y: s))
                .transformed(by: CGAffineTransform(translationX: kutu.minX + (kutu.width - e.width * s) / 2, y: kutu.minY + (kutu.height - e.height * s) / 2))
            tuval = g.composited(over: tuval)
        }
        ci.render(tuval, to: hedef)
    }

    private func kareGeldi(_ y: Yuva, _ pb: CVPixelBuffer, usb: Bool = false) {
        y.yeniKare(pb)
        if kayitta {
            let t = CMClockGetTime(CMClockGetHostTimeClock())
            let canli = y.canlida
            let dizili = duzenZamanlayici != nil
            kayitKuyruk.async {
                if usb { self.usbKaresi(y, pb, t) }
                if canli, !dizili { self.programKaresi(y, pb, t) }
            }
        }
        guard let sb = AgYayin.ornek(pb) else { return }
        y.gorunum.goster(sb)
        if y.canlida, duzenZamanlayici == nil { program.goster(sb) }
        if y.sirada { onizleme.goster(sb) }
    }

    // MARK: kayıt

    func kayitDegistir() { kayitta ? kayitBitir() : kayitBasla() }

    private static func dosyaAdi(_ s: String) -> String {
        String(s.map { "/:\\\\?*\"<>|".contains($0) ? "-" : $0 }).trimmingCharacters(in: .whitespaces)
    }

    private func kayitBasla() {
        guard !yuvalar.isEmpty else { bildirim = "Kaynak yok"; return }
        klasor.guncelle()
        // Oturum klasörü: SSD'de "UPDATED Masa/<tarih saat>/", yoksa geçici (sonra Fotoğraflar)
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd HH-mm-ss"; f.locale = Locale(identifier: "en_US_POSIX")
        let damga = f.string(from: Date())
        var erisim: URL?
        var dizin: URL
        var ssd = false
        if klasor.takili, let kok = klasor.url, kok.startAccessingSecurityScopedResource() {
            erisim = kok
            dizin = kok.appendingPathComponent("UPDATED Masa", isDirectory: true).appendingPathComponent(damga, isDirectory: true)
            if (try? FileManager.default.createDirectory(at: dizin, withIntermediateDirectories: true)) != nil { ssd = true } else {
                kok.stopAccessingSecurityScopedResource(); erisim = nil
                dizin = FileManager.default.temporaryDirectory.appendingPathComponent("masa-\(damga)", isDirectory: true)
                try? FileManager.default.createDirectory(at: dizin, withIntermediateDirectories: true)
                bildirim = "SSD'ye yazılamadı, cihaza kaydediliyor"
            }
        } else {
            dizin = FileManager.default.temporaryDirectory.appendingPathComponent("masa-\(damga)", isDirectory: true)
            try? FileManager.default.createDirectory(at: dizin, withIntermediateDirectories: true)
            if klasor.ad != nil { bildirim = "SSD takılı değil, cihaza kaydediliyor" }
        }
        // Program boyutu: dizili düzende 4K tuval; tek'te en büyük kaynak (4K USB kamera varsa 4K), yatay
        var w = 1920, h = 1080
        if duzenAdet > 0 { w = Int(Masa.tuvalW); h = Int(Masa.tuvalH) }
        for y in yuvalar where duzenAdet == 0 {
            if y.wifi, let b = y.alici?.boyut { y.boyut = b }
            if let b = y.boyut {
                let bw = Int(max(b.width, b.height)), bh = Int(min(b.width, b.height))
                if bw * bh > w * h { w = bw; h = bh }
            }
        }
        let bas = CMClockGetTime(CMClockGetHostTimeClock())
        let o = KayitOturumu(baslangic: bas, klasorUrl: ssd ? dizin : nil, erisim: erisim, dizin: dizin)
        o.programBoyut = (w, h)
        for (i, y) in yuvalar.enumerated() {
            o.kaynakUrl[y.id] = dizin.appendingPathComponent("\(i + 1) - \(Masa.dosyaAdi(y.ad)).mp4")
            y.alici?.anahtarIste()
            y.kaydediyor = true
        }
        kayitta = true
        kayitBasi = Date()
        kayitOzeti = "\(yuvalar.count) KAMERA + PROGRAM\(duzenAdet > 0 ? " 4K" : "")"
        let yuvalarSimdi = yuvalar
        let ses = sesBicimi
        kayitKuyruk.async {
            o.program = DosyaYazici(url: dizin.appendingPathComponent("Program.mp4"), tur: .kodla(w: w, h: h, fps: self.duzenZamanlayici != nil ? 30 : 60, bgra: true), ses: ses)
            // USB kaynakların yazıcıları hemen; Wi-Fi'ninki ilk anahtar kareyle (biçim o zaman belli)
            for y in yuvalarSimdi where !y.wifi {
                guard let b = y.boyut, let u = o.kaynakUrl[y.id] else { continue }
                o.kaynaklar[y.id] = DosyaYazici(url: u, tur: .kodla(w: Int(b.width), h: Int(b.height), fps: 60, bgra: false))
            }
            self.oturumKaydi = o
            if o.program == nil { DispatchQueue.main.async { self.bildirim = "Program kaydı başlamadı" } }
        }
    }

    /// Wi-Fi kaynağının sıkıştırılmış karesi (kayitKuyruk): dosyaya olduğu gibi
    private func wifiOrnegi(_ y: Yuva, _ sb: CMSampleBuffer, _ us: Int64, _ anahtar: Bool) {
        guard let o = oturumKaydi, let u = o.kaynakUrl[y.id] else { return }
        let simdi = CMTimeSubtract(CMClockGetTime(CMClockGetHostTimeClock()), o.baslangic)
        if o.kaynaklar[y.id] == nil {
            guard anahtar, let f = CMSampleBufferGetFormatDescription(sb) else { return }
            o.kaynaklar[y.id] = DosyaYazici(url: u, tur: .gectigiGibi(f))
            o.wifiIlk[y.id] = (us, simdi)
        }
        guard let d = o.kaynaklar[y.id], let ilk = o.wifiIlk[y.id] else { return }
        // Zaman: kameranın saatiyle ilerler, 0 anı masanın kayıt başlangıcı
        let pts = CMTimeAdd(ilk.pts, CMTime(value: us - ilk.us, timescale: 1_000_000))
        d.ekle(ornek: sb, pts: pts, anahtar: anahtar)
    }

    /// USB kaynağının ham karesi (kayitKuyruk): kendi dosyasına kodlanır
    private func usbKaresi(_ y: Yuva, _ pb: CVPixelBuffer, _ t: CMTime) {
        guard let o = oturumKaydi, let d = o.kaynaklar[y.id] else { return }
        d.ekle(kare: pb, pts: CMTimeSubtract(t, o.baslangic))
    }

    /// Canlıdaki kaynağın karesi (kayitKuyruk): program tuvaline sığdırılıp (kenarlar siyah) yazılır; kare hızı kaynağın hızıdır
    private func programKaresi(_ y: Yuva, _ pb: CVPixelBuffer, _ t: CMTime) {
        guard let o = oturumKaydi, let p = o.program, let havuz = p.havuz else { return }
        let pts = CMTimeSubtract(t, o.baslangic)
        guard pts > o.sonProgramPts else { return }
        var cikti: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, havuz, &cikti)
        guard let cikti else { return }
        ciz(pb, donus: y.donus, hedef: cikti, w: CGFloat(o.programBoyut.w), h: CGFloat(o.programBoyut.h))
        p.ekle(kare: cikti, pts: pts)
        o.sonProgramPts = pts
    }

    private func ciz(_ pb: CVPixelBuffer, donus: Int, hedef: CVPixelBuffer, w W: CGFloat, h H: CGFloat) {
        var g = CIImage(cvPixelBuffer: pb)
        switch donus {
        case 90: g = g.oriented(.right)
        case 180: g = g.oriented(.down)
        case 270: g = g.oriented(.left)
        default: break
        }
        let e = g.extent
        let olcek = min(W / e.width, H / e.height)
        g = g.transformed(by: CGAffineTransform(translationX: -e.minX, y: -e.minY))
            .transformed(by: CGAffineTransform(scaleX: olcek, y: olcek))
            .transformed(by: CGAffineTransform(translationX: (W - e.width * olcek) / 2, y: (H - e.height * olcek) / 2))
        let siyah = CIImage(color: .black).cropped(to: CGRect(x: 0, y: 0, width: W, height: H))
        ci.render(g.composited(over: siyah), to: hedef)
    }

    private func sesGeldi(_ sb: CMSampleBuffer) {
        if sesBicimi == nil, let f = CMSampleBufferGetFormatDescription(sb), let a = CMAudioFormatDescriptionGetStreamBasicDescription(f) {
            sesBicimi = a.pointee
        }
        guard let o = oturumKaydi, let p = o.program else { return }
        p.ekle(ses: sb, pts: CMTimeSubtract(CMSampleBufferGetPresentationTimeStamp(sb), o.baslangic))
    }

    private func kayitBitir() {
        kayitta = false
        kayitBasi = nil
        kayitOzeti = ""
        for y in yuvalar { y.kaydediyor = false }
        kayitKuyruk.async {
            guard let o = self.oturumKaydi else { return }
            self.oturumKaydi = nil
            let yazicilar = [o.program].compactMap { $0 } + o.kaynaklar.values
            let grup = DispatchGroup()
            var tamamlanan: [URL] = []
            let kilit = NSLock()
            for d in yazicilar {
                grup.enter()
                d.bitir { ok in
                    if ok { kilit.lock(); tamamlanan.append(d.url); kilit.unlock() }
                    grup.leave()
                }
            }
            grup.notify(queue: self.kayitKuyruk) {
                o.erisim?.stopAccessingSecurityScopedResource()
                guard !tamamlanan.isEmpty else {
                    try? FileManager.default.removeItem(at: o.dizin)
                    DispatchQueue.main.async { self.bildirim = "Kayıt boş: görüntü gelmedi" }
                    return
                }
                if o.klasorUrl != nil {
                    DispatchQueue.main.async {
                        self.klasor.guncelle()
                        self.bildirim = "\(tamamlanan.count) dosya SSD'de: UPDATED Masa/\(o.dizin.lastPathComponent)"
                    }
                } else {
                    self.fotograflaraKaydet(tamamlanan, dizin: o.dizin)
                }
            }
        }
    }

    private func fotograflaraKaydet(_ urller: [URL], dizin: URL) {
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { durum in
            guard durum == .authorized || durum == .limited else {
                DispatchQueue.main.async { self.bildirim = "Fotoğraflar izni yok, Ayarlar'dan açılabilir." }
                return
            }
            PHPhotoLibrary.shared().performChanges({
                for u in urller { PHAssetCreationRequest.forAsset().addResource(with: .video, fileURL: u, options: nil) }
            }) { tamam, _ in
                DispatchQueue.main.async { self.bildirim = tamam ? "\(urller.count) dosya Fotoğraflar'a kaydedildi (SSD seçilirse oraya yazılır)" : "Kaydedilemedi." }
                try? FileManager.default.removeItem(at: dizin)
            }
        }
    }
}

extension Masa: AVCaptureVideoDataOutputSampleBufferDelegate, AVCaptureAudioDataOutputSampleBufferDelegate {
    func captureOutput(_ output: AVCaptureOutput, didOutput sb: CMSampleBuffer, from connection: AVCaptureConnection) {
        if output is AVCaptureAudioDataOutput { sesGeldi(sb); return }
        kilit.lock(); let y = usbBaglar[ObjectIdentifier(output)]?.yuva; kilit.unlock()
        guard let y, let pb = CMSampleBufferGetImageBuffer(sb) else { return }
        kareGeldi(y, pb, usb: true)
    }
}
