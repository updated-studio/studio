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
    @Published var dondur = 0 {
        didSet { gorunum.dondur = dondur; kilit.lock(); _donus = dondur; kilit.unlock() }
    }
    private let kilit = NSLock()
    private var son: CVPixelBuffer?
    private var _donus = 0
    private var _canlida = false

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
    func yeniKare(_ pb: CVPixelBuffer) { kilit.lock(); son = pb; kilit.unlock() }
}

/// Masa: en çok 4 kaynak (Wi-Fi kameralar + iPad'e USB ile takılı kameralar), canlı geçişi, tally, 1920×1080 program kaydı.
/// Android'deki MasaActivity ile aynı iş; Android telefonlar da bu masaya Wi-Fi kamera olarak bağlanır.
final class Masa: NSObject, ObservableObject {
    static let enCok = 4
    static let kayitW = 1920, kayitH = 1080

    @Published var yuvalar: [Yuva] = []
    @Published var canli: UUID?
    @Published var kayitta = false
    @Published var kayitBasi: Date?
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
    private var yazici: AVAssetWriter?
    private var videoGirdi: AVAssetWriterInput?
    private var uyarlayici: AVAssetWriterInputPixelBufferAdaptor?
    private var sesGirdi: AVAssetWriterInput?
    private var ilkZaman: CMTime?
    private var sesBicimi: AudioStreamBasicDescription?
    private var zamanlayici: DispatchSourceTimer?
    private let ci = CIContext(options: [.cacheIntermediates: false])

    func ac() {
        UIApplication.shared.isIdleTimerDisabled = true
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

    func wifiEkle(_ ad: String, _ hedef: NWEndpoint) {
        guard !yuvalar.contains(where: { $0.ad == ad }) else { return }
        guard yuvalar.count < Masa.enCok else { bildirim = "En çok \(Masa.enCok) kaynak"; return }
        let a = WifiAlici(ad: ad, hedef: hedef)
        let y = Yuva(ad: ad, alici: a)
        a.kare = { [weak self, weak y] pb in
            guard let self, let y else { return }
            self.kareGeldi(y, pb)
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
        kilit.lock(); usbBaglar[ObjectIdentifier(c)] = UsbBag(yuva: y, girdi: g, cikti: c); kilit.unlock()
        return true
    }

    /// 1080p'yi geçmeyen en büyük biçim, en az 25 kare/sn
    private func bicimSec(_ d: AVCaptureDevice, coklu: Bool) {
        let uygun = d.formats.filter { f in
            let b = CMVideoFormatDescriptionGetDimensions(f.formatDescription)
            return b.width <= 1920 && b.height <= 1080 && (!coklu || f.isMultiCamSupported)
                && f.videoSupportedFrameRateRanges.contains { $0.maxFrameRate >= 25 }
        }
        guard let en = uygun.max(by: { CMVideoFormatDescriptionGetDimensions($0.formatDescription).width < CMVideoFormatDescriptionGetDimensions($1.formatDescription).width }),
              (try? d.lockForConfiguration()) != nil else { return }
        d.activeFormat = en
        d.unlockForConfiguration()
    }

    func kaldir(_ y: Yuva) {
        if let a = y.alici { a.tally(false); a.durdur(); kaldirilanlar.insert(y.ad) }
        if y.usbKimlik != nil {
            usbKuyruk.async {
                self.kilit.lock()
                let bag = self.usbBaglar.first(where: { $0.value.yuva === y })
                if let bag { self.usbBaglar[bag.key] = nil }
                self.kilit.unlock()
                guard let bag, let s = self.oturum else { return }
                s.beginConfiguration()
                s.removeOutput(bag.cikti)
                s.removeInput(bag.girdi)
                s.commitConfiguration()
            }
        }
        yuvalar.removeAll { $0 === y }
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

    func dondur(_ y: Yuva) {
        y.dondur = (y.dondur + 90) % 360
        programDonus()
    }

    private func programDonus() {
        if let y = yuvalar.first(where: { $0.id == canli }) { program.dondur = y.dondur }
    }

    private func kareGeldi(_ y: Yuva, _ pb: CVPixelBuffer) {
        y.yeniKare(pb)
        guard let sb = AgYayin.ornek(pb) else { return }
        y.gorunum.goster(sb)
        if y.canlida { program.goster(sb) }
    }

    // MARK: kayıt

    func kayitDegistir() { kayitta ? kayitBitir() : kayitBasla() }

    private func kayitBasla() {
        kayitta = true
        kayitBasi = Date()
        kayitKuyruk.async {
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("UPDATED-Masa-\(Int(Date().timeIntervalSince1970)).mov")
            guard let w = try? AVAssetWriter(outputURL: url, fileType: .mov) else { self.kayitHatasi("Kayıt başlamadı"); return }
            let v = AVAssetWriterInput(mediaType: .video, outputSettings: [
                AVVideoCodecKey: AVVideoCodecType.h264,
                AVVideoWidthKey: Masa.kayitW, AVVideoHeightKey: Masa.kayitH,
                AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 16_000_000, AVVideoMaxKeyFrameIntervalKey: 30,
                                                  AVVideoExpectedSourceFrameRateKey: 30] as [String: Any],
            ])
            v.expectsMediaDataInRealTime = true
            let u = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: v, sourcePixelBufferAttributes: [
                kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
                kCVPixelBufferWidthKey as String: Masa.kayitW, kCVPixelBufferHeightKey as String: Masa.kayitH,
                kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
            ])
            let kanal = min(Int(self.sesBicimi?.mChannelsPerFrame ?? 1), 2)
            let hiz = self.sesBicimi.map { $0.mSampleRate } ?? 48_000
            let a = AVAssetWriterInput(mediaType: .audio, outputSettings: [
                AVFormatIDKey: kAudioFormatMPEG4AAC, AVNumberOfChannelsKey: max(kanal, 1), AVSampleRateKey: hiz, AVEncoderBitRateKey: 128_000,
            ])
            a.expectsMediaDataInRealTime = true
            guard w.canAdd(v) else { self.kayitHatasi("Kayıt başlamadı"); return }
            w.add(v)
            if w.canAdd(a) { w.add(a); self.sesGirdi = a } else { self.sesGirdi = nil }
            self.yazici = w; self.videoGirdi = v; self.uyarlayici = u; self.ilkZaman = nil
            let t = DispatchSource.makeTimerSource(queue: self.kayitKuyruk)
            t.schedule(deadline: .now(), repeating: .nanoseconds(1_000_000_000 / 30), leeway: .milliseconds(2))
            t.setEventHandler { [weak self] in self?.kareYaz() }
            t.resume()
            self.zamanlayici = t
        }
    }

    private func kayitHatasi(_ m: String) {
        DispatchQueue.main.async { self.kayitta = false; self.kayitBasi = nil; self.bildirim = m }
    }

    /// Saniyede 30 kez: canlıdaki kaynağın son karesi 1920×1080'e sığdırılarak (kenarlar siyah) yazılır
    private func kareYaz() {
        kilit.lock(); let y = canliYuva; kilit.unlock()
        guard let w = yazici, let u = uyarlayici, let y, let pb = y.sonKare else { return }
        let t = CMClockGetTime(CMClockGetHostTimeClock())
        if w.status == .unknown {
            guard w.startWriting() else { return }
            w.startSession(atSourceTime: t)
            ilkZaman = t
        }
        guard w.status == .writing, u.assetWriterInput.isReadyForMoreMediaData, let havuz = u.pixelBufferPool else { return }
        var cikti: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, havuz, &cikti)
        guard let cikti else { return }
        ciz(pb, donus: y.donus, hedef: cikti)
        u.append(cikti, withPresentationTime: t)
    }

    private func ciz(_ pb: CVPixelBuffer, donus: Int, hedef: CVPixelBuffer) {
        var g = CIImage(cvPixelBuffer: pb)
        switch donus {
        case 90: g = g.oriented(.right)
        case 180: g = g.oriented(.down)
        case 270: g = g.oriented(.left)
        default: break
        }
        let e = g.extent
        let W = CGFloat(Masa.kayitW), H = CGFloat(Masa.kayitH)
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
        guard let w = yazici, w.status == .writing, let a = sesGirdi, a.isReadyForMoreMediaData, let ilk = ilkZaman,
              CMSampleBufferGetPresentationTimeStamp(sb) >= ilk else { return }
        a.append(sb)
    }

    private func kayitBitir() {
        kayitta = false
        kayitBasi = nil
        kayitKuyruk.async {
            self.zamanlayici?.cancel(); self.zamanlayici = nil
            guard let w = self.yazici else { return }
            self.yazici = nil; self.uyarlayici = nil
            let v = self.videoGirdi, a = self.sesGirdi
            self.videoGirdi = nil; self.sesGirdi = nil
            guard w.status == .writing else {
                w.cancelWriting()
                DispatchQueue.main.async { self.bildirim = "Kayıt boş: canlıda görüntü yoktu" }
                return
            }
            v?.markAsFinished(); a?.markAsFinished()
            w.finishWriting { self.fotograflaraKaydet(w.outputURL) }
        }
    }

    private func fotograflaraKaydet(_ url: URL) {
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { durum in
            guard durum == .authorized || durum == .limited else {
                DispatchQueue.main.async { self.bildirim = "Fotoğraflar izni yok, Ayarlar'dan açılabilir." }
                return
            }
            PHPhotoLibrary.shared().performChanges({ PHAssetCreationRequest.forAsset().addResource(with: .video, fileURL: url, options: nil) }) { tamam, _ in
                DispatchQueue.main.async { self.bildirim = tamam ? "Masa kaydı Fotoğraflar'a kaydedildi" : "Kaydedilemedi." }
                try? FileManager.default.removeItem(at: url)
            }
        }
    }
}

extension Masa: AVCaptureVideoDataOutputSampleBufferDelegate, AVCaptureAudioDataOutputSampleBufferDelegate {
    func captureOutput(_ output: AVCaptureOutput, didOutput sb: CMSampleBuffer, from connection: AVCaptureConnection) {
        if output is AVCaptureAudioDataOutput { sesGeldi(sb); return }
        kilit.lock(); let y = usbBaglar[ObjectIdentifier(output)]?.yuva; kilit.unlock()
        guard let y, let pb = CMSampleBufferGetImageBuffer(sb) else { return }
        kareGeldi(y, pb)
    }
}
