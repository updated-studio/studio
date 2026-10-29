import CoreMedia
import ReplayKit
import UIKit

/// Ekranı Masa'ya gönder (ReplayKit yayın uzantısı). Telefonun ekranı, Wi-Fi kamera ile aynı dille (AgYayin) masaya kaynak olarak gider.
/// Kullanım: kendi Wi-Fi'ı olmayan kameralar (ör. Insta360 Luna Ultra) — üreticinin uygulaması açık durur, onun önizlemesi masaya gelir.
/// Uzantının bellek sınırı ~50 MB: kareler yalnız masa bağlıyken kodlanır, kodlayıcı ekranın kendi boyutunda açılır.
final class YayinIsleyici: RPBroadcastSampleHandler {
    private var verici: YayinVerici?
    private let ad = "Ekran · \(UIDevice.current.name)"

    override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {}

    override func broadcastFinished() {
        verici?.durdur()
        verici = nil
    }

    override func processSampleBuffer(_ sb: CMSampleBuffer, with tur: RPSampleBufferType) {
        guard tur == .video, let pb = CMSampleBufferGetImageBuffer(sb) else { return }
        if verici == nil {
            // H.264 çift boyut ister
            let w = Int32(CVPixelBufferGetWidth(pb)) & ~1, h = Int32(CVPixelBufferGetHeight(pb)) & ~1
            let v = YayinVerici(ad: ad, genislik: w, yukseklik: h, mbps: 8)
            do { try v.baslat() } catch {
                finishBroadcastWithError(NSError(domain: "tr.com.updated", code: 1, userInfo: [NSLocalizedDescriptionKey: "Kodlayıcı açılamadı"]))
                return
            }
            verici = v
        }
        guard let v = verici else { return }
        // Ekran karesi telefonun dik duruşundadır; uygulama yan dönünce ReplayKit hangi yöne çevrileceğini söyler
        if let y = CMGetAttachment(sb, key: RPVideoSampleOrientationKey as CFString, attachmentModeOut: nil) as? NSNumber,
           let o = CGImagePropertyOrientation(rawValue: y.uint32Value) {
            switch o {
            case .left: v.yonAyarla(90)
            case .right: v.yonAyarla(270)
            case .down: v.yonAyarla(180)
            default: v.yonAyarla(0)
            }
        }
        v.kuyruk.async { v.kodla(sb) }
    }
}
