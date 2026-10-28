import AVFoundation
import SwiftUI

/// Tam ekran canlı görüntü; dokunulan noktaya odaklanır.
struct Onizleme: UIViewRepresentable {
    let oturum: AVCaptureSession
    var dokun: (CGPoint) -> Void

    final class Gorunum: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var katman: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
        var dokun: ((CGPoint) -> Void)?

        @objc func dokunuldu(_ g: UITapGestureRecognizer) {
            dokun?(katman.captureDevicePointConverted(fromLayerPoint: g.location(in: self)))
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
        v.katman.videoGravity = .resizeAspect
        v.dokun = dokun
        v.addGestureRecognizer(UITapGestureRecognizer(target: v, action: #selector(Gorunum.dokunuldu(_:))))
        return v
    }

    func updateUIView(_ v: Gorunum, context: Context) { v.dokun = dokun }
}
