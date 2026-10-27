import Accelerate
import CoreImage
import CoreVideo
import UIKit

/// Kare birleştirme (Android'deki Sahne.Birlestir ile aynı iki yol):
/// ortalama = kumlanma azalır, su ipeksi akar (uzun pozlama taklidi); enParlak = ışık izleri üst üste biner (yıldız izi, farlar, havai fişek).
/// Kareler BGRA gelir; toplam Float dizide tutulur (12 MP'de ~200 MB olmasın diye büyük kareler yarıya indirilir).
final class Birlestirici {
    let yol: Birlestir
    private(set) var sayi = 0
    private var gen = 0, yuk = 0
    private var toplam: [Float] = []
    private var gecici: [Float] = []
    private let ci = CIContext()
    private let enBuyuk = 4096

    init(_ yol: Birlestir) { self.yol = yol }

    func ekle(_ kare: CVPixelBuffer) {
        var ham = CIImage(cvPixelBuffer: kare)
        let uzun = max(ham.extent.width, ham.extent.height)
        if uzun > CGFloat(enBuyuk) {
            let o = CGFloat(enBuyuk) / uzun
            ham = ham.transformed(by: CGAffineTransform(scaleX: o, y: o))
        }
        let w = Int(ham.extent.width.rounded(.down)), h = Int(ham.extent.height.rounded(.down))
        guard w > 0, h > 0 else { return }
        var bayt = [UInt8](repeating: 0, count: w * h * 4)
        ci.render(ham, toBitmap: &bayt, rowBytes: w * 4, bounds: CGRect(x: ham.extent.minX, y: ham.extent.minY, width: CGFloat(w), height: CGFloat(h)),
                  format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB))
        if sayi == 0 || w != gen || h != yuk {
            gen = w; yuk = h; sayi = 0
            toplam = [Float](repeating: 0, count: w * h * 4)
            gecici = toplam
        }
        let n = vDSP_Length(bayt.count)
        vDSP_vfltu8(bayt, 1, &gecici, 1, n)
        let yol = self.yol
        gecici.withUnsafeBufferPointer { g in
            toplam.withUnsafeMutableBufferPointer { t in
                switch yol {
                case .ortalama: vDSP_vadd(t.baseAddress!, 1, g.baseAddress!, 1, t.baseAddress!, 1, n)
                case .enParlak: vDSP_vmax(t.baseAddress!, 1, g.baseAddress!, 1, t.baseAddress!, 1, n)
                }
            }
        }
        sayi += 1
    }

    /// Birleşmiş görüntü (yön: kayıttaki gibi)
    func sonuc(yon: UIImage.Orientation) -> UIImage? {
        guard sayi > 0 else { return nil }
        var olcek: Float = yol == .ortalama ? 1 / Float(sayi) : 1
        var cikti = [Float](repeating: 0, count: toplam.count)
        vDSP_vsmul(toplam, 1, &olcek, &cikti, 1, vDSP_Length(toplam.count))
        var alt: Float = 0, ust: Float = 255
        cikti.withUnsafeMutableBufferPointer { c in
            vDSP_vclip(c.baseAddress!, 1, &alt, &ust, c.baseAddress!, 1, vDSP_Length(c.count))
        }
        var bayt = [UInt8](repeating: 0, count: cikti.count)
        vDSP_vfixu8(cikti, 1, &bayt, 1, vDSP_Length(cikti.count))
        // Saydamlık kanalı tam opak
        for i in stride(from: 3, to: bayt.count, by: 4) { bayt[i] = 255 }
        guard let saglayici = CGDataProvider(data: Data(bayt) as CFData),
              let cg = CGImage(width: gen, height: yuk, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: gen * 4,
                               space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue),
                               provider: saglayici, decode: nil, shouldInterpolate: false, intent: .defaultIntent) else { return nil }
        return UIImage(cgImage: cg, scale: 1, orientation: yon)
    }
}
