import AVFoundation

/// Timelapse (hızlandırılmış çekim): her `aralik`ta bir kare alınır, video `fps` hızında oynar (Android Timelapse.kt ile aynı).
/// Örnek: 2 sn aralık, 30 fps → 1 dakikalık çekim 2 saniyelik video olur (60 kat hızlı).
/// Zaman damgası gerçek saatten değil kare sırasından gelir, böylece kare arası ne kadar uzun olursa olsun video akıcı oynar.
enum Timelapse {
    static let fps: Int32 = 30
    /// Mod şeridinin üstündeki hızlı seçim (ms)
    static let hizli: [Int] = [1000, 2000, 5000, 10_000, 30_000]
    /// Ayarlardaki tam liste (ms)
    static let araliklar: [Int] = [500, 1000, 2000, 3000, 5000, 10_000, 30_000, 60_000]
    /// Çekim süresi sınırı (dakika); 0 = durdurana kadar
    static let sureler: [Int] = [0, 10, 30, 60, 120]

    /// Kaç kat hızlı oynar
    static func hiz(_ aralikMs: Int) -> Int { aralikMs * Int(fps) / 1000 }
    /// Çekilen kare sayısından video süresi (ms)
    static func videoMs(_ kare: Int) -> Int { kare * 1000 / Int(fps) }

    static func aralikYazi(_ ms: Int) -> String {
        if ms % 60_000 == 0 { return "\(ms / 60_000) dk" }
        if ms % 1000 == 0 { return "\(ms / 1000) sn" }
        return String(format: "%.1f sn", Double(ms) / 1000).replacingOccurrences(of: ".", with: ",")
    }
    static func sureYazi(_ dk: Int) -> String { dk == 0 ? "Sınırsız" : (dk % 60 == 0 ? "\(dk / 60) sa" : "\(dk) dk") }
}

/// Timelapse videosunu yazar: kare kuyruğundan gelen görüntülerden her aralıkta biri, sıra numarasıyla damgalanır. Ses yok.
final class TimelapseYazici {
    let url: URL
    private let aralik: TimeInterval
    private var yazici: AVAssetWriter?
    private var girdi: AVAssetWriterInput?
    private var uyarlayici: AVAssetWriterInputPixelBufferAdaptor?
    private var sonKare = Date.distantPast
    private(set) var kareSayisi = 0
    private var bitti = false

    init(aralikMs: Int) {
        url = FileManager.default.temporaryDirectory.appendingPathComponent("UPDATED-\(Int(Date().timeIntervalSince1970))-timelapse.mov")
        aralik = Double(aralikMs) / 1000
    }

    /// Kare kuyruğunda çağrılır; ilk karede yazıcı karenin boyutuyla açılır
    func kare(_ pb: CVPixelBuffer) {
        guard !bitti, Date().timeIntervalSince(sonKare) >= aralik else { return }
        if yazici == nil { ac(en: CVPixelBufferGetWidth(pb), boy: CVPixelBufferGetHeight(pb)) }
        guard let g = girdi, let u = uyarlayici, g.isReadyForMoreMediaData else { return }
        if u.append(pb, withPresentationTime: CMTime(value: CMTimeValue(kareSayisi), timescale: Timelapse.fps)) {
            kareSayisi += 1
            sonKare = Date()
        }
    }

    private func ac(en: Int, boy: Int) {
        guard let y = try? AVAssetWriter(outputURL: url, fileType: .mov) else { bitti = true; return }
        let uzun = max(en, boy)
        let bit = uzun >= 3840 ? 50_000_000 : (uzun >= 1920 ? 24_000_000 : 12_000_000)
        let ayar: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.hevc, AVVideoWidthKey: en, AVVideoHeightKey: boy,
            AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: bit, AVVideoExpectedSourceFrameRateKey: Int(Timelapse.fps)],
        ]
        let g = AVAssetWriterInput(mediaType: .video, outputSettings: ayar)
        g.expectsMediaDataInRealTime = true
        guard y.canAdd(g) else { bitti = true; return }
        y.add(g)
        uyarlayici = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: g, sourcePixelBufferAttributes: nil)
        guard y.startWriting() else { bitti = true; return }
        y.startSession(atSourceTime: .zero)
        yazici = y; girdi = g
    }

    /// Kare kuyruğunda çağrılır; bitince (en az bir kare varsa) true
    func bitir(_ sonra: @escaping (Bool) -> Void) {
        bitti = true
        guard let y = yazici, let g = girdi, kareSayisi > 0 else { yazici?.cancelWriting(); sonra(false); return }
        g.markAsFinished()
        y.endSession(atSourceTime: CMTime(value: CMTimeValue(kareSayisi), timescale: Timelapse.fps))
        y.finishWriting { sonra(y.status == .completed) }
    }
}
