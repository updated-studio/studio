import AVFoundation
import CoreImage

/// Stil/LUT'lu video kaydı: renk çekerken işlenir, kayıttan sonra bekleme olmaz (Fatih 29 Ekim gece: "LUT'u çekerken uygula").
/// Kare çıkışının BGRA kareleri GPU'da LUT'tan geçirilip kodlayıcıya (HEVC / H.264 / ProRes) verilir; ses AVCaptureAudioDataOutput'tan gelir.
/// Yalnız SDR'de kullanılır: HDR'de LUT kayıttan sonra işlenir (Stiller.videoyaGom), Apple Log kaydı özgün kalır.
final class CanliKaydedici {
    let url: URL
    private let kuyruk = DispatchQueue(label: "tr.com.updated.kamera.canlikayit")
    private let suzgec: CIFilter
    private let kodek: AVVideoCodecType
    private let fps: Int
    private let sesAyari: [String: Any]?
    private let ci = CIContext(options: [.cacheIntermediates: false, .workingColorSpace: CGColorSpace(name: CGColorSpace.sRGB)!])
    private let renkAlani = CGColorSpace(name: CGColorSpace.itur_709)!
    private var yazici: AVAssetWriter?
    private var video: AVAssetWriterInput?
    private var uyarlayici: AVAssetWriterInputPixelBufferAdaptor?
    private var ses: AVAssetWriterInput?
    private var bas: CMTime?
    private var sonPts = CMTime.negativeInfinity
    private var bitti = false
    private(set) var kareSayisi = 0
    private var dusen = 0
    var hata: String?

    /// - sesAyari: nil = ses yok; AAC ya da PCM çıkış ayarları (KayitAyarlari.sesAyari)
    /// - url: harici SSD'deki hedef; nil = geçici klasör (sonra Fotoğraflar'a)
    init(suzgec: CIFilter, kodek: AVVideoCodecType, fps: Int, sesAyari: [String: Any]?, url: URL? = nil) {
        self.url = url ?? FileManager.default.temporaryDirectory.appendingPathComponent("UPDATED-\(Int(Date().timeIntervalSince1970)).mov")
        self.suzgec = suzgec; self.kodek = kodek; self.fps = fps; self.sesAyari = sesAyari
    }

    /// Kare kuyruğundan: ilk karede yazıcı karenin boyutuyla açılır
    func kare(_ pb: CVPixelBuffer, pts: CMTime) {
        kuyruk.async { self.kareIc(pb, pts) }
    }

    func ses(_ sb: CMSampleBuffer) {
        kuyruk.async {
            guard !self.bitti, let a = self.ses, let bas = self.bas, a.isReadyForMoreMediaData,
                  CMSampleBufferGetPresentationTimeStamp(sb) >= bas else { return }
            a.append(sb)
        }
    }

    private func kareIc(_ pb: CVPixelBuffer, _ pts: CMTime) {
        guard !bitti else { return }
        if yazici == nil { ac(en: CVPixelBufferGetWidth(pb), boy: CVPixelBufferGetHeight(pb), ilk: pts) }
        guard let v = video, let u = uyarlayici, let havuz = u.pixelBufferPool, pts > sonPts else { return }
        guard v.isReadyForMoreMediaData else { dusen += 1; return }
        var cikti: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, havuz, &cikti)
        guard let cikti else { return }
        let g = CIImage(cvPixelBuffer: pb)
        suzgec.setValue(g, forKey: kCIInputImageKey)
        let son = suzgec.outputImage ?? g
        ci.render(son, to: cikti, bounds: g.extent, colorSpace: renkAlani)
        if u.append(cikti, withPresentationTime: pts) { kareSayisi += 1; sonPts = pts } else { hata = yazici?.error?.localizedDescription }
    }

    private func ac(en: Int, boy: Int, ilk: CMTime) {
        guard let y = try? AVAssetWriter(outputURL: url, fileType: .mov) else { bitti = true; hata = "Dosya açılamadı"; return }
        var ayar: [String: Any] = [AVVideoCodecKey: kodek, AVVideoWidthKey: en, AVVideoHeightKey: boy,
                                   AVVideoColorPropertiesKey: [AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
                                                               AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
                                                               AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2]]
        if kodek == .hevc || kodek == .h264 {
            // Apple Kamera'ya yakın: 4K60 HEVC ≈ 100 Mb/sn, 4K30 ≈ 50, 1080p30 ≈ 12; H.264 %50 daha yüksek
            var bit = Double(en * boy * fps) * 0.2
            if kodek == .h264 { bit *= 1.5 }
            ayar[AVVideoCompressionPropertiesKey] = [AVVideoAverageBitRateKey: Int(bit), AVVideoExpectedSourceFrameRateKey: fps,
                                                     AVVideoMaxKeyFrameIntervalKey: fps, AVVideoAllowFrameReorderingKey: true] as [String: Any]
        }
        let v = AVAssetWriterInput(mediaType: .video, outputSettings: ayar)
        v.expectsMediaDataInRealTime = true
        guard y.canAdd(v) else { bitti = true; hata = "Kodek açılamadı"; return }
        y.add(v)
        uyarlayici = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: v, sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferWidthKey as String: en, kCVPixelBufferHeightKey as String: boy,
            kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
        ])
        if let s = sesAyari {
            let a = AVAssetWriterInput(mediaType: .audio, outputSettings: s)
            a.expectsMediaDataInRealTime = true
            if y.canAdd(a) { y.add(a); ses = a }
        }
        guard y.startWriting() else { bitti = true; hata = y.error?.localizedDescription; return }
        y.startSession(atSourceTime: ilk)
        yazici = y; video = v; bas = ilk
    }

    /// Bitirir: dosya hazırsa url, yoksa nil (hata açıklaması `hata`)
    func bitir(_ sonra: @escaping (URL?) -> Void) {
        kuyruk.async {
            self.bitti = true
            guard let y = self.yazici, let v = self.video, self.kareSayisi > 0 else {
                self.yazici?.cancelWriting()
                if self.hata == nil { self.hata = "Görüntü gelmedi" }
                sonra(nil); return
            }
            v.markAsFinished(); self.ses?.markAsFinished()
            y.finishWriting {
                if y.status == .completed { sonra(self.url) } else { self.hata = y.error?.localizedDescription; sonra(nil) }
            }
        }
    }
}
