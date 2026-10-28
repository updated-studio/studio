import AVFoundation
import MetalKit
import SwiftUI

/// Bir monitör bölmesinin çizicisi (Android MonitorGorunum karşılığı): kaynaktan gelen kare GPU'da araçlarla çizilir.
/// Ölçüm için her üç karede bir 256×144 kopya; kayıt için araçsız, LUT'suz (temiz) kare kaydediciye.
final class MonitorCizici: NSObject, MTKViewDelegate {
    static let olcumW = 256, olcumH = 144

    let gorunum: MTKView
    /// Ana iş parçacığından yazılır; çizim anında kopyası alınır
    var ayar = BolmeAyari() { didSet { if ayar.lutAdi != oldValue.lutAdi || ayar.lutAcik != oldValue.lutAcik { lutYenile() }; iste() } }
    var karsilastir = false { didSet { iste() } }
    /// Kaynağın kendi dönüşü (Wi-Fi kameranın duruşu); bölme ayarındaki dönüşe eklenir
    var kaynakDondur = 0 { didSet { if kaynakDondur != oldValue { iste() } } }
    private var toplamDondur: Int { (ayar.dondur + kaynakDondur) % 360 }
    /// true: görüntü ekranı doldurur (kenarlar kırpılır); kayıt hep tam kare
    var doldur = true { didSet { iste() } }
    /// Ölçüm kopyası (BGRA, 256×144); arka planda çağrılır
    var olcumGeri: ((Data, Int, Int) -> Void)?
    var kaydedici: MonitorKaydedici?
    /// Kaynağın boyutu (dönüşsüz) ve gelen kare sayısı
    private(set) var kaynakBoyut = CGSize(width: 1920, height: 1080)
    private(set) var gelenKare = 0

    private let aygit: MTLDevice?
    private let komut: MTLCommandQueue?
    private var boru: MTLRenderPipelineState?
    private var onbellek: CVMetalTextureCache?
    private var lutDoku: MTLTexture?
    private var lutBoyut: Float = 2
    private var olcumDoku: MTLTexture?
    private let kilit = NSLock()
    private var son: CVPixelBuffer?
    private var yeni = false
    private var cizimBekliyor = false
    private var kare = 0

    override init() {
        aygit = MTLCreateSystemDefaultDevice()
        komut = aygit?.makeCommandQueue()
        gorunum = MTKView(frame: .zero, device: aygit)
        super.init()
        gorunum.colorPixelFormat = .bgra8Unorm
        gorunum.clearColor = MTLClearColor(red: 0, green: 0, blue: 0, alpha: 1)
        gorunum.isPaused = true
        gorunum.enableSetNeedsDisplay = false
        gorunum.framebufferOnly = true
        gorunum.delegate = self
        gorunum.isUserInteractionEnabled = false
        guard let aygit else { return }
        if let kitap = aygit.makeDefaultLibrary() {
            let t = MTLRenderPipelineDescriptor()
            t.vertexFunction = kitap.makeFunction(name: "monitorKose")
            t.fragmentFunction = kitap.makeFunction(name: "monitorParca")
            t.colorAttachments[0].pixelFormat = .bgra8Unorm
            boru = try? aygit.makeRenderPipelineState(descriptor: t)
        }
        CVMetalTextureCacheCreate(kCFAllocatorDefault, nil, aygit, nil, &onbellek)
        lutDoku = Lut.bos.doku(aygit)
        let o = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .bgra8Unorm, width: Self.olcumW, height: Self.olcumH, mipmapped: false)
        o.usage = [.renderTarget, .shaderRead]
        o.storageMode = .shared
        olcumDoku = aygit.makeTexture(descriptor: o)
    }

    private func lutYenile() {
        guard let aygit else { return }
        let a = ayar
        DispatchQueue.global(qos: .userInitiated).async {
            let l = (a.lutAcik ? Lut.yukle(a.lutAdi) : nil) ?? Lut.bos
            let d = l.doku(aygit)
            DispatchQueue.main.async {
                self.lutDoku = d ?? self.lutDoku
                self.lutBoyut = Float(l.boyut)
                self.iste()
            }
        }
    }

    /// Kaynaktan yeni kare (BGRA); herhangi bir iş parçacığından
    func kare(_ pb: CVPixelBuffer) {
        kilit.lock()
        son = pb; yeni = true; gelenKare += 1
        kaynakBoyut = CGSize(width: CVPixelBufferGetWidth(pb), height: CVPixelBufferGetHeight(pb))
        let bekliyor = cizimBekliyor
        cizimBekliyor = true
        kilit.unlock()
        if !bekliyor { DispatchQueue.main.async { self.ciz() } }
    }

    /// Ayar değişince (kare gelmese de) yeniden çiz
    func iste() {
        kilit.lock(); let bekliyor = cizimBekliyor; cizimBekliyor = true; kilit.unlock()
        if !bekliyor { DispatchQueue.main.async { self.ciz() } }
    }

    func temizle() {
        kilit.lock(); son = nil; gelenKare = 0; kilit.unlock()
        iste()
    }

    private func ciz() {
        kilit.lock(); cizimBekliyor = false; kilit.unlock()
        gorunum.draw()
    }

    /// Dönüş ve anamorfik açmayla ekranda görünen boyut
    func gorunenBoyut() -> CGSize {
        let yan = toplamDondur % 180 != 0
        let w = yan ? kaynakBoyut.height : kaynakBoyut.width, h = yan ? kaynakBoyut.width : kaynakBoyut.height
        return CGSize(width: w * CGFloat(ayar.desqueeze), height: h)
    }

    /// Kayıt boyutu: dönüşlü, çift sayı
    func kayitBoyutu() -> (Int, Int) {
        let yan = toplamDondur % 180 != 0
        let w = Int(yan ? kaynakBoyut.height : kaynakBoyut.width), h = Int(yan ? kaynakBoyut.width : kaynakBoyut.height)
        return (w & ~1, h & ~1)
    }

    func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) { iste() }

    func draw(in view: MTKView) {
        guard let komut, let boru, let onbellek, let cb = komut.makeCommandBuffer() else { return }
        kilit.lock()
        let pb = son, kareYeni = yeni
        yeni = false
        kilit.unlock()
        let a = ayar
        var kaynakDoku: MTLTexture?
        if let pb {
            var cv: CVMetalTexture?
            CVMetalTextureCacheCreateTextureFromImage(kCFAllocatorDefault, onbellek, pb, nil, .bgra8Unorm,
                                                      CVPixelBufferGetWidth(pb), CVPixelBufferGetHeight(pb), 0, &cv)
            if let cv { kaynakDoku = CVMetalTextureGetTexture(cv) }
        }
        guard let rpd = view.currentRenderPassDescriptor, let cizim = view.currentDrawable else { return }
        rpd.colorAttachments[0].loadAction = .clear
        rpd.colorAttachments[0].clearColor = MTLClearColor(red: 0, green: 0, blue: 0, alpha: 1)
        if let e = cb.makeRenderCommandEncoder(descriptor: rpd) {
            if let kaynakDoku {
                e.setRenderPipelineState(boru)
                let gw = Double(view.drawableSize.width), gh = Double(view.drawableSize.height)
                let g = gorunenBoyut()
                if karsilastir {
                    gec(e, kaynakDoku, x: 0, y: 0, w: gw / 2, h: gh, kw: g.width, kh: g.height, ham: true, ayar: a)
                    gec(e, kaynakDoku, x: gw / 2, y: 0, w: gw / 2, h: gh, kw: g.width, kh: g.height, ham: false, ayar: a)
                } else {
                    gec(e, kaynakDoku, x: 0, y: 0, w: gw, h: gh, kw: g.width, kh: g.height, ham: false, ayar: a)
                }
            }
            e.endEncoding()
        }
        cb.present(cizim)

        // Ölçümler: üç karede bir, araçlar ve kılavuzlar kapalı (LUT açık: çıkışı ölçer)
        if kareYeni, kaynakDoku != nil { kare += 1 }
        if kareYeni, let kaynakDoku, let geri = olcumGeri, kare % 3 == 0, let od = olcumDoku {
            let p = MTLRenderPassDescriptor()
            p.colorAttachments[0].texture = od
            p.colorAttachments[0].loadAction = .clear
            p.colorAttachments[0].storeAction = .store
            if let e = cb.makeRenderCommandEncoder(descriptor: p) {
                e.setRenderPipelineState(boru)
                let g = gorunenBoyut()
                gec(e, kaynakDoku, x: 0, y: 0, w: Double(Self.olcumW), h: Double(Self.olcumH), kw: g.width, kh: g.height, ham: false, olcum: true, tam: true, ayar: a)
                e.endEncoding()
                cb.addCompletedHandler { _ in
                    var d = Data(count: Self.olcumW * Self.olcumH * 4)
                    d.withUnsafeMutableBytes { b in
                        od.getBytes(b.baseAddress!, bytesPerRow: Self.olcumW * 4, from: MTLRegionMake2D(0, 0, Self.olcumW, Self.olcumH), mipmapLevel: 0)
                    }
                    geri(d, Self.olcumW, Self.olcumH)
                }
            }
        }

        // Kayıt: temiz kare (araçsız, LUT'suz), dönüş/ayna uygulanmış, kayıt boyutuna sığdırılmış
        if kareYeni, let kaynakDoku, let k = kaydedici, let hedef = k.bosKare() {
            var cv: CVMetalTexture?
            CVMetalTextureCacheCreateTextureFromImage(kCFAllocatorDefault, onbellek, hedef, nil, .bgra8Unorm,
                                                      CVPixelBufferGetWidth(hedef), CVPixelBufferGetHeight(hedef), 0, &cv)
            if let cv, let hd = CVMetalTextureGetTexture(cv) {
                let p = MTLRenderPassDescriptor()
                p.colorAttachments[0].texture = hd
                p.colorAttachments[0].loadAction = .clear
                p.colorAttachments[0].clearColor = MTLClearColor(red: 0, green: 0, blue: 0, alpha: 1)
                p.colorAttachments[0].storeAction = .store
                if let e = cb.makeRenderCommandEncoder(descriptor: p) {
                    e.setRenderPipelineState(boru)
                    let g = gorunenBoyut()
                    gec(e, kaynakDoku, x: 0, y: 0, w: Double(hd.width), h: Double(hd.height), kw: g.width, kh: g.height, ham: true, olcum: true, sigdir: true, ayar: a)
                    e.endEncoding()
                    let zaman = CMClockGetTime(CMClockGetHostTimeClock())
                    cb.addCompletedHandler { _ in
                        _ = cv
                        k.ekle(hedef, zaman: zaman)
                    }
                }
            }
        }
        cb.commit()
    }

    /// Görüntüyü (kw:kh oranıyla) verilen alana yerleştirir; ham = araçsız ve LUT'suz, olcum = kılavuz/vurgu yok
    private func gec(_ e: MTLRenderCommandEncoder, _ doku: MTLTexture, x: Double, y: Double, w: Double, h: Double, kw: CGFloat, kh: CGFloat,
                     ham: Bool, olcum: Bool = false, tam: Bool = false, sigdir: Bool = false, ayar a: BolmeAyari) {
        var vx = x, vy = y, vw = w, vh = h
        if !tam {
            let oran = Double(kw / kh)
            if (w / h > oran) != (doldur && !sigdir) { vw = h * oran; vx = x + (w - vw) / 2 } else { vh = w / oran; vy = y + (h - vh) / 2 }
        }
        e.setViewport(MTLViewport(originX: vx, originY: vy, width: vw, height: vh, znear: 0, zfar: 1))
        // Görünmeyen bölüm dışarı taşmasın (karşılaştırmada iki yarı)
        e.setScissorRect(MTLScissorRect(x: Int(max(0, x)), y: Int(max(0, y)), width: max(1, Int(w)), height: max(1, Int(h))))
        let sade = olcum || a.temiz
        var u = GPUAyar()
        u.lutBoyut = lutBoyut
        u.lutAcik = !ham && a.lutAcik ? 1 : 0
        u.peaking = !ham && !sade && a.peaking ? 1 : 0
        u.peakEsik = a.peakEsik
        let r = BolmeAyari.peakRenkleri[min(max(a.peakRenk, 0), 3)]
        u.peakR = r.0; u.peakG = r.1; u.peakB = r.2
        u.zebra = !ham && !sade && a.zebra ? 1 : 0
        u.zebraEsik = a.zebraEsik
        u.sahte = !ham && !sade && a.falseColor ? 1 : 0
        u.mono = !ham && a.monokrom ? 1 : 0
        u.zoom = olcum ? 1 : a.zoom
        u.ayna = a.ayna ? 1 : 0
        u.cevir = a.cevir ? 1 : 0
        u.dondur = Int32((toplamDondur / 90) % 4)
        u.kilavuz = sade ? 0 : a.kilavuz
        u.izgara = !sade && a.izgara ? 1 : 0
        u.merkez = !sade && a.merkez ? 1 : 0
        u.guvenli = sade ? 0 : a.guvenli
        u.oran = Float(vw / vh)
        u.pikselX = 1 / Float(doku.width); u.pikselY = 1 / Float(doku.height)
        if toplamDondur % 180 != 0 { swap(&u.pikselX, &u.pikselY) }
        u.cikisX = Float(vw); u.cikisY = Float(vh)
        e.setFragmentTexture(doku, index: 0)
        e.setFragmentTexture(lutDoku, index: 1)
        e.setFragmentBytes(&u, length: MemoryLayout<GPUAyar>.stride, index: 0)
        e.drawPrimitives(type: .triangleStrip, vertexStart: 0, vertexCount: 4)
    }

    /// Ekran görüntüsü: araçlarla birlikte ekranda görünen (görünümün anlık görüntüsü)
    func ekranGoruntusu() -> UIImage? {
        kilit.lock(); let pb = son; kilit.unlock()
        guard let pb else { return nil }
        let g = CIImage(cvPixelBuffer: pb)
        guard let cg = CIContext().createCGImage(g, from: g.extent) else { return nil }
        let yon: UIImage.Orientation = [.up, .right, .down, .left][(toplamDondur / 90) % 4]
        return UIImage(cgImage: cg, scale: 1, orientation: yon)
    }
}

/// Çiziciyi SwiftUI'ye yerleştirir
struct MonitorGorunum: UIViewRepresentable {
    let cizici: MonitorCizici

    func makeUIView(context: Context) -> UIView {
        let k = UIView()
        k.backgroundColor = .black
        k.isUserInteractionEnabled = false
        return k
    }

    func updateUIView(_ k: UIView, context: Context) {
        let v = cizici.gorunum
        guard v.superview !== k else { return }
        v.removeFromSuperview()
        v.frame = k.bounds
        v.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        k.addSubview(v)
    }
}

/// Monitör kaydı (Android Kaydedici karşılığı): temiz görüntü H.264/HEVC + ses (AAC), Fotoğraflar'a
final class MonitorKaydedici {
    let url: URL
    let genislik: Int, yukseklik: Int
    private let yazici: AVAssetWriter
    private let video: AVAssetWriterInput
    private let uyarlayici: AVAssetWriterInputPixelBufferAdaptor
    private let ses: AVAssetWriterInput?
    private let kuyruk = DispatchQueue(label: "tr.com.updated.monitor.kayit")
    private var basladi = false
    private var ilk: CMTime?
    private var bitti = false
    private(set) var kareSayisi = 0

    init(genislik: Int, yukseklik: Int, fps: Int, mbps: Int, hevc: Bool, sesBicimi: AudioStreamBasicDescription?) throws {
        self.genislik = genislik; self.yukseklik = yukseklik
        let tarih = DateFormatter()
        tarih.dateFormat = "yyyyMMdd_HHmmss"
        url = FileManager.default.temporaryDirectory.appendingPathComponent("UPDATED_\(tarih.string(from: Date())).mov")
        yazici = try AVAssetWriter(outputURL: url, fileType: .mov)
        video = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: hevc ? AVVideoCodecType.hevc : AVVideoCodecType.h264,
            AVVideoWidthKey: genislik, AVVideoHeightKey: yukseklik,
            AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: mbps * 1_000_000, AVVideoExpectedSourceFrameRateKey: fps,
                                              AVVideoMaxKeyFrameIntervalKey: fps] as [String: Any],
        ])
        video.expectsMediaDataInRealTime = true
        uyarlayici = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: video, sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferWidthKey as String: genislik, kCVPixelBufferHeightKey as String: yukseklik,
            kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
            kCVPixelBufferMetalCompatibilityKey as String: true,
        ])
        guard yazici.canAdd(video) else { throw NSError(domain: "kayit", code: 1, userInfo: [NSLocalizedDescriptionKey: "video girişi eklenemedi"]) }
        yazici.add(video)
        if let s = sesBicimi {
            let a = AVAssetWriterInput(mediaType: .audio, outputSettings: [
                AVFormatIDKey: kAudioFormatMPEG4AAC, AVNumberOfChannelsKey: max(1, min(2, Int(s.mChannelsPerFrame))),
                AVSampleRateKey: s.mSampleRate > 0 ? s.mSampleRate : 48_000, AVEncoderBitRateKey: 192_000,
            ])
            a.expectsMediaDataInRealTime = true
            if yazici.canAdd(a) { yazici.add(a); ses = a } else { ses = nil }
        } else { ses = nil }
    }

    /// Yazıcının havuzundan boş kare (yazma başlamadan havuz yoktur: ilk kare başlatır)
    func bosKare() -> CVPixelBuffer? {
        kuyruk.sync {
            guard !bitti else { return nil }
            if !basladi {
                basladi = true
                guard yazici.startWriting() else { return nil }
            }
            guard yazici.status == .writing, video.isReadyForMoreMediaData, let havuz = uyarlayici.pixelBufferPool else { return nil }
            var pb: CVPixelBuffer?
            CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, havuz, &pb)
            return pb
        }
    }

    func ekle(_ pb: CVPixelBuffer, zaman: CMTime) {
        kuyruk.async {
            guard !self.bitti, self.yazici.status == .writing else { return }
            if self.ilk == nil { self.ilk = zaman; self.yazici.startSession(atSourceTime: zaman) }
            if self.video.isReadyForMoreMediaData, self.uyarlayici.append(pb, withPresentationTime: zaman) { self.kareSayisi += 1 }
        }
    }

    func sesEkle(_ sb: CMSampleBuffer) {
        kuyruk.async {
            guard !self.bitti, let a = self.ses, let ilk = self.ilk, self.yazici.status == .writing, a.isReadyForMoreMediaData,
                  CMSampleBufferGetPresentationTimeStamp(sb) >= ilk else { return }
            a.append(sb)
        }
    }

    func bitir(_ tamam: @escaping (URL?) -> Void) {
        kuyruk.async {
            self.bitti = true
            guard self.yazici.status == .writing, self.kareSayisi > 0 else {
                if self.yazici.status == .writing { self.yazici.cancelWriting() }
                tamam(nil); return
            }
            self.video.markAsFinished(); self.ses?.markAsFinished()
            self.yazici.finishWriting { tamam(self.yazici.status == .completed ? self.url : nil) }
        }
    }
}
