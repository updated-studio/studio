import AVFoundation
import SwiftUI

/// Tam ekran canlı görüntü; dokunulan noktaya odaklanır.
struct Onizleme: UIViewRepresentable {
    let oturum: AVCaptureSession
    /// Arayüz yönü (verilmezse pencereden okunur); döndürünce önizleme bağlantısı buna göre çevrilir
    var yonu: UIInterfaceOrientation? = nil
    /// (cihaz noktası, görünümde 0–1 nokta)
    var dokun: (CGPoint, CGPoint) -> Void
    /// Basılı tut (Apple Kamera gibi AE/AF kilidi): (cihaz noktası, görünümde 0–1 nokta)
    var kilit: ((CGPoint, CGPoint) -> Void)? = nil

    final class Gorunum: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var katman: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
        var dokun: ((CGPoint, CGPoint) -> Void)?
        var kilit: ((CGPoint, CGPoint) -> Void)?

        @objc func basiliTutuldu(_ g: UILongPressGestureRecognizer) {
            guard g.state == .began else { return }
            let p = g.location(in: self)
            let n = CGPoint(x: bounds.width > 0 ? p.x / bounds.width : 0.5, y: bounds.height > 0 ? p.y / bounds.height : 0.5)
            kilit?(katman.captureDevicePointConverted(fromLayerPoint: p), n)
        }

        @objc func dokunuldu(_ g: UITapGestureRecognizer) {
            let p = g.location(in: self)
            let n = CGPoint(x: bounds.width > 0 ? p.x / bounds.width : 0.5, y: bounds.height > 0 ? p.y / bounds.height : 0.5)
            dokun?(katman.captureDevicePointConverted(fromLayerPoint: p), n)
        }

        override func layoutSubviews() {
            super.layoutSubviews()
            guard let baglanti = katman.connection, baglanti.isVideoOrientationSupported else { return }
            baglanti.videoOrientation = Onizleme.yon(window?.windowScene?.interfaceOrientation ?? .portrait)
        }
    }

    static func yon(_ o: UIInterfaceOrientation) -> AVCaptureVideoOrientation {
        switch o {
        case .landscapeLeft: return .landscapeLeft
        case .landscapeRight: return .landscapeRight
        case .portraitUpsideDown: return .portraitUpsideDown
        default: return .portrait
        }
    }

    func makeUIView(context: Context) -> Gorunum {
        let v = Gorunum()
        v.backgroundColor = .black
        v.katman.session = oturum
        v.katman.videoGravity = .resizeAspectFill
        v.dokun = dokun
        v.kilit = kilit
        v.addGestureRecognizer(UITapGestureRecognizer(target: v, action: #selector(Gorunum.dokunuldu(_:))))
        let uzun = UILongPressGestureRecognizer(target: v, action: #selector(Gorunum.basiliTutuldu(_:)))
        uzun.minimumPressDuration = 0.6
        v.addGestureRecognizer(uzun)
        return v
    }

    func updateUIView(_ v: Gorunum, context: Context) {
        v.dokun = dokun
        v.kilit = kilit
        if let y = yonu, let b = v.katman.connection, b.isVideoOrientationSupported, b.videoOrientation != Onizleme.yon(y) {
            b.videoOrientation = Onizleme.yon(y)
        }
    }
}
