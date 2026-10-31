import UIKit

/// Kirli mercek / ışık dağılması uyarısı (Fatih 31 Ekim (10)). Çekilen fotoğrafın küçük kopyasına bakılır:
/// siyahlar kalkmış, kontrast düşük ve sahne aydınlıksa görüntü puslu demektir (parmak izi, toz ya da karşıdan gelen ışık).
/// Arka arkaya iki puslu fotoğrafta uyarır, en çok 15 dakikada bir; Genel Ayarlar → Fotoğraf'tan kapanır.
enum MercekUyari {
    static let aralik: TimeInterval = 15 * 60

    /// 160 px küçük resimden parlaklık yüzdelikleri
    static func puslu(_ r: UIImage) -> Bool {
        guard let cg = r.cgImage else { return false }
        let w = cg.width, h = cg.height
        guard w >= 16, h >= 16 else { return false }
        var px = [UInt8](repeating: 0, count: w * h * 4)
        let tamam: Bool = px.withUnsafeMutableBytes { tampon in
            guard let ctx = CGContext(data: tampon.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                                      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
            return true
        }
        guard tamam else { return false }
        var l = [Int]()
        l.reserveCapacity(w * h)
        var top = 0
        for i in stride(from: 0, to: px.count, by: 4) {
            let y = (Int(px[i]) * 54 + Int(px[i + 1]) * 183 + Int(px[i + 2]) * 19) >> 8
            l.append(y); top += y
        }
        l.sort()
        let p2 = l[l.count * 2 / 100], p98 = l[l.count * 98 / 100], ort = top / l.count
        return p2 > 48 && p98 - p2 < 125 && ort > 95
    }
}

extension Kamera {
    /// Fotoğraf kaydedildikten sonra (arka planda) çağrılır
    func mercekDenetle(_ kucuk: UIImage?) {
        guard mercekUyari, let kucuk else { return }
        DispatchQueue.global(qos: .utility).async {
            let p = MercekUyari.puslu(kucuk)
            DispatchQueue.main.async {
                guard p else { self.pusSayac = 0; return }
                self.pusSayac += 1
                guard self.pusSayac >= 2, Date().timeIntervalSince(self.sonMercekUyari) > MercekUyari.aralik else { return }
                self.pusSayac = 0
                self.sonMercekUyari = Date()
                UINotificationFeedbackGenerator().notificationOccurred(.warning)
                self.bildirim = "Görüntü puslu: merceği silin ya da ışığı kesin"
            }
        }
    }
}
