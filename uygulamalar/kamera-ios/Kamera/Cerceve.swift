import SwiftUI

/// Kesik çizgili kadraj çerçeveleri (Fatih 30 Ekim 10:41: "open gate kılavuz çizgileri, yalnız video modlarında"):
/// aynı çekimden kırpılacak oranlar görüntünün üstünde; birden çok oran birlikte açılabilir. Kayda girmez, yalnız ekranda.
enum CerceveOrani: String, CaseIterable, Identifiable, Codable {
    case dikey = "9:16", dortBes = "4:5", kare = "1:1", dortUc = "4:3", yatay = "16:9", sinema = "1.85:1", genis = "2.39:1", guvenli = "Güvenli"
    var id: String { rawValue }
    var ad: String { self == .guvenli ? "Güvenli alan" : rawValue.replacingOccurrences(of: ".", with: ",") }
    /// Genişlik / yükseklik (güvenli alan: nil, karenin %90'ı)
    var oran: CGFloat? {
        switch self {
        case .dikey: return 9 / 16
        case .dortBes: return 4 / 5
        case .kare: return 1
        case .dortUc: return 4 / 3
        case .yatay: return 16 / 9
        case .sinema: return 1.85
        case .genis: return 2.39
        case .guvenli: return nil
        }
    }

    /// Görüntü dikdörtgeninin ortasına oturan çerçeve; görüntüyle aynı oransa nil (çizilecek bir şey yok)
    func alan(_ a: CGRect) -> CGRect? {
        guard a.width > 0, a.height > 0 else { return nil }
        guard let r = oran else { return a.insetBy(dx: a.width * 0.05, dy: a.height * 0.05) }
        let ao = a.width / a.height
        if abs(ao - r) / r < 0.02 { return nil }
        let w = r > ao ? a.width : a.height * r
        let h = r > ao ? a.width / r : a.height
        return CGRect(x: a.midX - w / 2, y: a.midY - h / 2, width: w, height: h)
    }
}

struct CerceveKatman: View {
    let oranlar: [CerceveOrani]
    let alan: CGRect

    var body: some View {
        ZStack(alignment: .topLeading) {
            ForEach(oranlar) { o in
                if let r = o.alan(alan) {
                    Path { $0.addRect(r) }
                        .stroke(Color.white.opacity(0.82), style: StrokeStyle(lineWidth: 1, dash: [6, 4]))
                        .shadow(color: .black.opacity(0.5), radius: 1)
                    Text(o.ad).font(.system(size: 9, weight: .semibold).monospacedDigit()).tracking(0.5)
                        .foregroundStyle(Color.white.opacity(0.85)).shadow(color: .black.opacity(0.7), radius: 1.5)
                        .position(x: r.minX + 6 + CGFloat(o.ad.count) * 2.6, y: r.minY + 9)
                }
            }
        }
        .allowsHitTesting(false)
    }
}

/// Çerçeve seçimi (panel): çoklu seçim, küçük önizlemeli
struct CerceveMenu: View {
    @ObservedObject var kamera: Kamera

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 4), spacing: 10) {
                ForEach(CerceveOrani.allCases) { o in
                    let secili = kamera.cerceveler.contains(o)
                    Button { withAnimation(.snappy(duration: 0.2)) { kamera.cerceveDegistir(o) } } label: {
                        VStack(spacing: 5) {
                            GeometryReader { g in
                                let a = CGRect(origin: .zero, size: g.size).insetBy(dx: 4, dy: 4)
                                ZStack {
                                    RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Color.white.opacity(0.06))
                                    if let r = o.alan(a) ?? (o.oran.map { _ in a }) {
                                        Path { $0.addRect(r) }.stroke(secili ? Tema.sari : Color.white.opacity(0.7), style: StrokeStyle(lineWidth: 1, dash: [3, 2]))
                                    }
                                }
                            }
                            .aspectRatio(16 / 9, contentMode: .fit)
                            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(secili ? Tema.sari : Tema.hat, lineWidth: secili ? 1.5 : 0.5))
                            Text(o.ad).font(.system(size: 11, weight: .medium)).lineLimit(1).minimumScaleFactor(0.7)
                                .foregroundStyle(secili ? Tema.sari : .white)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
            if !kamera.cerceveler.isEmpty {
                Button("Hepsini kapat") { withAnimation(.snappy(duration: 0.2)) { kamera.cerceveler = [] } }
                    .font(.system(size: 13, weight: .semibold)).foregroundStyle(Tema.ikincil)
            }
            Text("Yalnız video modlarında, yalnız ekranda görünür.").font(.system(size: 11)).foregroundStyle(Tema.metin3)
        }
    }
}

extension Kamera {
    func cerceveDegistir(_ o: CerceveOrani) {
        if let i = cerceveler.firstIndex(of: o) { cerceveler.remove(at: i) } else { cerceveler.append(o) }
    }
    /// Video modlarında mı (çerçeveler ve video ayarları yalnız orada)
    var videoModu: Bool { mod == .video || mod == .timelapse }
}
