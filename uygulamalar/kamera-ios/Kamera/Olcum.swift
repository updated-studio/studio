import SwiftUI

/// Ölçümler (Android OlcumGorunum karşılığı): dalga formu (parlaklık), RGB parade, vektörskop, histogram.
/// Kaynak, monitörün her üç karede bir verdiği 256×144 BGRA kopyasıdır; hesap arka planda yapılır.
final class OlcumHesap: ObservableObject {
    enum Tur: String, CaseIterable, Identifiable {
        case dalga = "Dalga formu", parade = "RGB parade", vektor = "Vektörskop", histogram = "Histogram"
        var id: String { rawValue }
    }

    @Published private(set) var resimler: [Tur: CGImage] = [:]
    @Published var gorunen: [Tur] {
        didSet { UserDefaults.standard.set(gorunen.map(\.rawValue), forKey: anahtar) }
    }
    private let anahtar: String
    private let kuyruk = DispatchQueue(label: "tr.com.updated.olcum")
    private let kilit = NSLock()
    private var mesgul = false

    init(yalnizHistogram: Bool = false) {
        anahtar = yalnizHistogram ? "m.olcumKose" : "m.olcumTurleri"
        if yalnizHistogram { gorunen = [.histogram] } else {
            let s = (UserDefaults.standard.array(forKey: "m.olcumTurleri") as? [String])?.compactMap(Tur.init(rawValue:))
            gorunen = s ?? Tur.allCases
        }
    }

    /// Önceki hesap bitmediyse kare atlanır
    func kare(_ p: Data, _ w: Int, _ h: Int) {
        kilit.lock()
        if mesgul { kilit.unlock(); return }
        mesgul = true
        kilit.unlock()
        let turler = Set(gorunen)
        kuyruk.async {
            let r = OlcumHesap.hesapla([UInt8](p), w, h, turler)
            DispatchQueue.main.async { self.resimler = r }
            self.kilit.lock(); self.mesgul = false; self.kilit.unlock()
        }
    }

    /// ARGB tamsayılardan görüntü
    private static func resim(_ px: [UInt32], _ w: Int, _ h: Int) -> CGImage? {
        let veri = px.withUnsafeBufferPointer { Data(buffer: $0) }
        guard let s = CGDataProvider(data: veri as CFData) else { return nil }
        return CGImage(width: w, height: h, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: w * 4, space: CGColorSpaceCreateDeviceRGB(),
                       bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue),
                       provider: s, decode: nil, shouldInterpolate: true, intent: .defaultIntent)
    }

    private static func argb(_ r: Int, _ g: Int, _ b: Int) -> UInt32 {
        0xFF00_0000 | UInt32(min(255, r)) << 16 | UInt32(min(255, g)) << 8 | UInt32(min(255, b))
    }

    /// Bayt sırası: B, G, R, A
    static func hesapla(_ p: [UInt8], _ w: Int, _ h: Int, _ turler: Set<Tur>) -> [Tur: CGImage] {
        var sonuc: [Tur: CGImage] = [:]
        let H = 128
        if turler.contains(.dalga) || turler.contains(.parade) {
            var dalga = [Int](repeating: 0, count: w * H), par = [Int](repeating: 0, count: w * 3 * H)
            for y in 0..<h {
                for x in 0..<w {
                    let i = (y * w + x) * 4
                    let b = Int(p[i]), g = Int(p[i + 1]), r = Int(p[i + 2])
                    let l = Int(0.2126 * Double(r) + 0.7152 * Double(g) + 0.0722 * Double(b))
                    dalga[(H - 1 - l * (H - 1) / 255) * w + x] += 1
                    par[(H - 1 - r * (H - 1) / 255) * w * 3 + x] += 1
                    par[(H - 1 - g * (H - 1) / 255) * w * 3 + w + x] += 1
                    par[(H - 1 - b * (H - 1) / 255) * w * 3 + 2 * w + x] += 1
                }
            }
            if turler.contains(.dalga) {
                let px = dalga.map { n -> UInt32 in let v = min(255, n * 40); return argb(v / 3, v, v / 3) }
                sonuc[.dalga] = resim(px, w, H)
            }
            if turler.contains(.parade) {
                var px = [UInt32](repeating: 0, count: w * 3 * H)
                for i in 0..<px.count {
                    let x = i % (w * 3), v = min(255, par[i] * 40)
                    px[i] = x < w ? argb(v, v / 6, v / 6) : (x < 2 * w ? argb(v / 6, v, v / 6) : argb(v / 4, v / 4, v))
                }
                sonuc[.parade] = resim(px, w * 3, H)
            }
        }
        if turler.contains(.vektor) {
            let N = 160
            var v = [Int](repeating: 0, count: N * N)
            for i in 0..<(w * h) {
                let b = Double(p[i * 4]) / 255, g = Double(p[i * 4 + 1]) / 255, r = Double(p[i * 4 + 2]) / 255
                let y = 0.2126 * r + 0.7152 * g + 0.0722 * b
                let cb = (b - y) / 1.8556, cr = (r - y) / 1.5748
                let x = min(max(Int((cb + 0.5) * Double(N - 1)), 0), N - 1), yy = min(max(Int((0.5 - cr) * Double(N - 1)), 0), N - 1)
                v[yy * N + x] += 1
            }
            sonuc[.vektor] = resim(v.map { n in let k = min(255, n * 30); return argb(k / 2, k, k / 2) }, N, N)
        }
        if turler.contains(.histogram) {
            var hr = [Int](repeating: 0, count: 256), hg = hr, hb = hr, hl = hr
            for i in 0..<(w * h) {
                let b = Int(p[i * 4]), g = Int(p[i * 4 + 1]), r = Int(p[i * 4 + 2])
                hr[r] += 1; hg[g] += 1; hb[b] += 1
                hl[min(255, Int(0.2126 * Double(r) + 0.7152 * Double(g) + 0.0722 * Double(b)))] += 1
            }
            let enCok = max(1, hl.max() ?? 1)
            func boy(_ n: Int) -> Int { min(H, n * (H - 4) / enCok) }
            var px = [UInt32](repeating: 0, count: 256 * H)
            for x in 0..<256 {
                let br = boy(hr[x]), bg = boy(hg[x]), bb = boy(hb[x]), bl = boy(hl[x])
                for yy in 0..<H {
                    let d = H - yy
                    let l = d <= bl ? 90 : 0
                    px[yy * 256 + x] = argb((d <= br ? 160 : 0) + l, (d <= bg ? 160 : 0) + l, (d <= bb ? 160 : 0) + l)
                }
            }
            sonuc[.histogram] = resim(px, 256, H)
        }
        return sonuc
    }
}

/// Ölçüm paneli: seçili ölçümler ızgarada, başlıklı; dalga ve parade'de %25'lik çizgiler, vektörskopta ten çizgisi
struct OlcumPaneli: View {
    @ObservedObject var o: OlcumHesap

    var body: some View {
        GeometryReader { g in
            let turler = o.gorunen
            let sutun = turler.count > 1 && g.size.width > g.size.height * 0.9 ? 2 : 1
            let satir = max(1, (turler.count + sutun - 1) / sutun)
            let kw = g.size.width / CGFloat(sutun), kh = g.size.height / CGFloat(satir)
            ZStack(alignment: .topLeading) {
                Color(red: 12 / 255, green: 13 / 255, blue: 16 / 255)
                ForEach(Array(turler.enumerated()), id: \.element) { i, t in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(t.rawValue).font(.caption2.weight(.semibold)).foregroundStyle(.white.opacity(0.8))
                        olcumKutusu(t)
                    }
                    .padding(6)
                    .frame(width: kw, height: kh)
                    .offset(x: CGFloat(i % sutun) * kw, y: CGFloat(i / sutun) * kh)
                }
            }
        }
    }

    @ViewBuilder private func olcumKutusu(_ t: OlcumHesap.Tur) -> some View {
        ZStack {
            Color(red: 18 / 255, green: 20 / 255, blue: 24 / 255)
            if let r = o.resimler[t] {
                if t == .vektor {
                    Image(decorative: r, scale: 1).resizable().interpolation(.medium).aspectRatio(1, contentMode: .fit)
                        .overlay(VektorCizgileri())
                } else {
                    Image(decorative: r, scale: 1).resizable().interpolation(.medium)
                        .overlay(ceyrekCizgiler)
                }
            }
        }
    }

    private var ceyrekCizgiler: some View {
        GeometryReader { g in
            Path { p in
                for k in 0...4 {
                    let y = g.size.height - g.size.height * CGFloat(k) / 4
                    p.move(to: CGPoint(x: 0, y: y)); p.addLine(to: CGPoint(x: g.size.width, y: y))
                }
            }
            .stroke(Color.white.opacity(0.27), lineWidth: 1)
        }
    }
}

private struct VektorCizgileri: View {
    var body: some View {
        GeometryReader { g in
            let c = CGPoint(x: g.size.width / 2, y: g.size.height / 2), r = g.size.width / 2
            Path { p in
                p.move(to: CGPoint(x: c.x, y: 0)); p.addLine(to: CGPoint(x: c.x, y: g.size.height))
                p.move(to: CGPoint(x: 0, y: c.y)); p.addLine(to: CGPoint(x: g.size.width, y: c.y))
            }
            .stroke(Color.white.opacity(0.27), lineWidth: 1)
            // Ten çizgisi (yaklaşık 123°)
            Path { p in
                let a = 123.0 * Double.pi / 180
                p.move(to: c); p.addLine(to: CGPoint(x: c.x + r * CGFloat(cos(a)), y: c.y - r * CGFloat(sin(a))))
            }
            .stroke(Color(red: 1, green: 0.7, blue: 0.47).opacity(0.63), lineWidth: 1)
        }
    }
}

/// Alt şeritteki küçük histogram (görüntünün üstünde, yarı saydam)
struct KoseHistogram: View {
    @ObservedObject var o: OlcumHesap

    var body: some View {
        ZStack {
            Color.black.opacity(0.43)
            if let r = o.resimler[.histogram] {
                Image(decorative: r, scale: 1).resizable().opacity(0.86).padding(4)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 4))
    }
}
