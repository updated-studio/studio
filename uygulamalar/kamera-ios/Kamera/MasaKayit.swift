import AVFoundation
import SwiftUI
import UniformTypeIdentifiers

/// Masa kayıt klasörü (harici SSD ya da Dosyalar'daki bir klasör): bir kez seçilir, güvenlik kapsamlı yer imi olarak saklanır.
/// Seçili klasör yoksa ya da SSD takılı değilse kayıt cihaz hafızasına yapılıp Fotoğraflar'a gider.
final class KayitKlasoru: ObservableObject {
    static let anahtar = "masa.klasor"
    /// Seçili klasör (SSD) adı; nil = seçilmemiş
    @Published private(set) var ad: String?
    /// Klasör şu an erişilebilir mi (SSD takılı mı)
    @Published private(set) var takili = false
    @Published private(set) var bosAlan: Int64?
    private(set) var url: URL?

    init() { yukle() }

    func yukle() {
        guard let d = UserDefaults.standard.data(forKey: KayitKlasoru.anahtar) else { url = nil; ad = nil; takili = false; bosAlan = nil; return }
        var bayat = false
        guard let u = try? URL(resolvingBookmarkData: d, options: [], relativeTo: nil, bookmarkDataIsStale: &bayat) else { sil(); return }
        if bayat, u.startAccessingSecurityScopedResource() {
            if let y = try? u.bookmarkData() { UserDefaults.standard.set(y, forKey: KayitKlasoru.anahtar) }
            u.stopAccessingSecurityScopedResource()
        }
        url = u
        ad = u.lastPathComponent
        guncelle()
    }

    func sec(_ u: URL) {
        guard u.startAccessingSecurityScopedResource() else { return }
        defer { u.stopAccessingSecurityScopedResource() }
        guard let d = try? u.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil) else { return }
        UserDefaults.standard.set(d, forKey: KayitKlasoru.anahtar)
        yukle()
    }

    func sil() {
        UserDefaults.standard.removeObject(forKey: KayitKlasoru.anahtar)
        url = nil; ad = nil; takili = false; bosAlan = nil
    }

    /// Takılı mı, ne kadar boş yer var (bölüm adı varsa klasör adı yerine o gösterilir)
    func guncelle() {
        guard let u = url else { return }
        let erisim = u.startAccessingSecurityScopedResource()
        defer { if erisim { u.stopAccessingSecurityScopedResource() } }
        var klasor: ObjCBool = false
        let var_ = FileManager.default.fileExists(atPath: u.path, isDirectory: &klasor) && klasor.boolValue
        takili = var_
        let v = try? u.resourceValues(forKeys: [.volumeNameKey, .volumeAvailableCapacityForImportantUsageKey, .volumeIsRemovableKey, .volumeIsEjectableKey])
        if var_, let bolum = v?.volumeName, (v?.volumeIsRemovable ?? false) || (v?.volumeIsEjectable ?? false) { ad = bolum }
        bosAlan = var_ ? v?.volumeAvailableCapacityForImportantUsage : nil
    }

    static func boyutYazisi(_ b: Int64) -> String {
        let f = ByteCountFormatter()
        f.countStyle = .file; f.allowedUnits = [.useGB, .useTB]
        return f.string(fromByteCount: b)
    }
}

/// Dosyalar'dan klasör seçtirir (SSD'deki klasör dahil)
struct KlasorSecici: UIViewControllerRepresentable {
    var secildi: (URL) -> Void

    func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
        let p = UIDocumentPickerViewController(forOpeningContentTypes: [.folder])
        p.delegate = context.coordinator
        p.shouldShowFileExtensions = false
        return p
    }

    func updateUIViewController(_ v: UIDocumentPickerViewController, context: Context) {}
    func makeCoordinator() -> Koordinator { Koordinator(secildi) }

    final class Koordinator: NSObject, UIDocumentPickerDelegate {
        let secildi: (URL) -> Void
        init(_ s: @escaping (URL) -> Void) { secildi = s }
        func documentPicker(_ c: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) { urls.first.map(secildi) }
    }
}

/// Tek MP4 yazıcısı. İki tür: Wi-Fi kaynağı için sıkıştırılmış kareler geldiği gibi yazılır (yeniden kodlama yok, kalite kaybı yok);
/// USB kaynağı ve program için HEVC kodlanır. Tüm dosyalarda 0 anı masadaki aynı kayıt başlangıcıdır (kurguda üst üste oturur).
final class DosyaYazici {
    enum Tur {
        case gectigiGibi(CMFormatDescription)
        case kodla(w: Int, h: Int, fps: Int, bgra: Bool)
    }

    let url: URL
    let tur: Tur
    private let yazici: AVAssetWriter
    private let girdi: AVAssetWriterInput
    private let uyarlayici: AVAssetWriterInputPixelBufferAdaptor?
    private var sesGirdi: AVAssetWriterInput?
    private var sonPts = CMTime.negativeInfinity
    private var anahtarBekle = true
    private(set) var kare = 0
    var hata: String?

    init?(url: URL, tur: Tur, ses: AudioStreamBasicDescription? = nil) {
        guard let w = try? AVAssetWriter(outputURL: url, fileType: .mp4) else { return nil }
        self.url = url; self.tur = tur; yazici = w
        switch tur {
        case let .gectigiGibi(f):
            girdi = AVAssetWriterInput(mediaType: .video, outputSettings: nil, sourceFormatHint: f)
            uyarlayici = nil
        case let .kodla(wd, ht, fps, bgra):
            // HEVC ≈ 0,12 bit/piksel (4K60 ≈ 60, 4K30 ≈ 30 Mbit/sn; en az 16)
            let mbps = max(16, Int(Double(wd * ht * fps) * 0.12 / 1_000_000))
            girdi = AVAssetWriterInput(mediaType: .video, outputSettings: [
                AVVideoCodecKey: AVVideoCodecType.hevc,
                AVVideoWidthKey: wd, AVVideoHeightKey: ht,
                AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: mbps * 1_000_000, AVVideoMaxKeyFrameIntervalKey: fps,
                                                  AVVideoExpectedSourceFrameRateKey: fps, AVVideoAllowFrameReorderingKey: false] as [String: Any],
            ])
            uyarlayici = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: girdi, sourcePixelBufferAttributes: [
                kCVPixelBufferPixelFormatTypeKey as String: bgra ? kCVPixelFormatType_32BGRA : kCVPixelFormatType_420YpCbCr8BiPlanarFullRange,
                kCVPixelBufferWidthKey as String: wd, kCVPixelBufferHeightKey as String: ht,
                kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
            ])
        }
        girdi.expectsMediaDataInRealTime = true
        guard w.canAdd(girdi) else { return nil }
        w.add(girdi)
        if let ses {
            let a = AVAssetWriterInput(mediaType: .audio, outputSettings: [
                AVFormatIDKey: kAudioFormatMPEG4AAC, AVNumberOfChannelsKey: max(min(Int(ses.mChannelsPerFrame), 2), 1),
                AVSampleRateKey: ses.mSampleRate, AVEncoderBitRateKey: 192_000,
            ])
            a.expectsMediaDataInRealTime = true
            if w.canAdd(a) { w.add(a); sesGirdi = a }
        }
        guard w.startWriting() else { hata = w.error?.localizedDescription; return nil }
        w.startSession(atSourceTime: .zero)
    }

    var havuz: CVPixelBufferPool? { uyarlayici?.pixelBufferPool }

    /// Wi-Fi kaynağı: sıkıştırılmış örnek, kayıt başına göre zamanla. Anahtar kareyle başlar; arada kare düşerse sonraki anahtara kadar bekler
    func ekle(ornek: CMSampleBuffer, pts: CMTime, anahtar: Bool) {
        guard yazici.status == .writing else { return }
        if anahtarBekle { guard anahtar else { return }; anahtarBekle = false }
        guard pts > sonPts else { return }
        guard girdi.isReadyForMoreMediaData else { anahtarBekle = true; return }
        var zaman = CMSampleTimingInfo(duration: .invalid, presentationTimeStamp: pts, decodeTimeStamp: .invalid)
        var kopya: CMSampleBuffer?
        guard CMSampleBufferCreateCopyWithNewTiming(allocator: kCFAllocatorDefault, sampleBuffer: ornek, sampleTimingEntryCount: 1,
                                                    sampleTimingArray: &zaman, sampleBufferOut: &kopya) == noErr, let kopya else { return }
        if let ekler = CMSampleBufferGetSampleAttachmentsArray(kopya, createIfNecessary: true), CFArrayGetCount(ekler) > 0 {
            let e = unsafeBitCast(CFArrayGetValueAtIndex(ekler, 0), to: CFMutableDictionary.self)
            CFDictionarySetValue(e, Unmanaged.passUnretained(kCMSampleAttachmentKey_NotSync).toOpaque(),
                                 Unmanaged.passUnretained(anahtar ? kCFBooleanFalse : kCFBooleanTrue).toOpaque())
        }
        if girdi.append(kopya) { sonPts = pts; kare += 1 } else { hata = yazici.error?.localizedDescription }
    }

    /// USB kaynağı ya da program: ham kare, kodlanır
    func ekle(kare pb: CVPixelBuffer, pts: CMTime) {
        guard yazici.status == .writing, let u = uyarlayici, pts > sonPts, girdi.isReadyForMoreMediaData else { return }
        if u.append(pb, withPresentationTime: pts) { sonPts = pts; kare += 1 } else { hata = yazici.error?.localizedDescription }
    }

    func ekle(ses sb: CMSampleBuffer, pts: CMTime) {
        guard yazici.status == .writing, let a = sesGirdi, a.isReadyForMoreMediaData, pts >= .zero else { return }
        var zaman = CMSampleTimingInfo(duration: CMSampleBufferGetDuration(sb), presentationTimeStamp: pts, decodeTimeStamp: .invalid)
        var kopya: CMSampleBuffer?
        guard CMSampleBufferCreateCopyWithNewTiming(allocator: kCFAllocatorDefault, sampleBuffer: sb, sampleTimingEntryCount: 1,
                                                    sampleTimingArray: &zaman, sampleBufferOut: &kopya) == noErr, let kopya else { return }
        a.append(kopya)
    }

    /// Bitirir; hiç kare yazılmadıysa dosya silinir ve false döner
    func bitir(_ tamam: @escaping (Bool) -> Void) {
        guard yazici.status == .writing, kare > 0 else {
            yazici.cancelWriting()
            try? FileManager.default.removeItem(at: url)
            tamam(false); return
        }
        girdi.markAsFinished(); sesGirdi?.markAsFinished()
        yazici.finishWriting { [yazici] in tamam(yazici.status == .completed) }
    }
}
