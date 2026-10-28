import SwiftUI

/// Kompozisyon kılavuzları (Fatih'in fikri, 25 Ekim 2026): menüden seçilir, görüntünün üstüne çizilir. Android'deki Kompozisyon.kt ile aynı.
enum KompTur: String, CaseIterable, Identifiable {
    case kapali, ucteBir, phi, spiral, kosegen, ucgen, simetri, oncu
    var id: String { rawValue }
    var ad: String {
        switch self {
        case .kapali: return "Kapalı"
        case .ucteBir: return "Üçte bir"
        case .phi: return "Phi ızgarası"
        case .spiral: return "Altın spiral"
        case .kosegen: return "Köşegenler"
        case .ucgen: return "Altın üçgenler"
        case .simetri: return "Simetri"
        case .oncu: return "Öncü çizgi"
        }
    }
}

private let FI: CGFloat = 1.6180339

enum Kompozisyon {
    /// Her kılavuzun "güçlü noktaları" (0–1, görüntü alanına göre); yön: spiral/üçgen için 0–3 (yatay/dikey ayna)
    static func gucluNoktalar(_ t: KompTur, yon: Int, oran: CGFloat, analiz: AnalizSonuc? = nil) -> [N] {
        func c(_ x: CGFloat, _ y: CGFloat) -> N { N(x: yon & 1 == 1 ? 1 - x : x, y: yon & 2 == 2 ? 1 - y : y) }
        switch t {
        case .ucteBir: return [N(x: 1 / 3, y: 1 / 3), N(x: 2 / 3, y: 1 / 3), N(x: 1 / 3, y: 2 / 3), N(x: 2 / 3, y: 2 / 3)]
        case .phi: let a = 1 - 1 / FI, b = 1 / FI; return [N(x: a, y: a), N(x: b, y: a), N(x: a, y: b), N(x: b, y: b)]
        case .spiral: let g = spiralGozu(dikey: oran < 1); return [c(g.x, g.y)]
        case .ucgen: let (p1, p2) = ucgenAyaklari(oran); return [c(p1.x, p1.y), c(p2.x, p2.y)]
        case .kosegen: return [N(x: 0.5, y: 0.5), N(x: 0.25, y: 0.25), N(x: 0.75, y: 0.75), N(x: 0.25, y: 0.75), N(x: 0.75, y: 0.25)]
        case .simetri: return [N(x: 0.5, y: 0.5)]
        case .oncu: // görüntüde kaçış noktası bulunursa o kullanılır
            if let k = analiz?.kacis, (0...1).contains(k.x), (0...1).contains(k.y) { return [k] }
            return [N(x: 0.5, y: 0.42)]
        case .kapali: return []
        }
    }

    /// Altın spiral: dikdörtgen her adımda 1/φ oranında bölünür (sol, üst, sağ, alt…); her parçaya çeyrek elips yayı
    static func spiralParcalari(_ adim: Int = 10, dikey: Bool = false) -> [(CGRect, Int)] {
        // Dikey kadrajda ilk bölme yataydan (üst parça) başlar: spiral uzun kenar boyunca açılır
        var r = CGRect(x: 0, y: 0, width: 1, height: 1)
        var l: [(CGRect, Int)] = []
        for i in 0..<adim {
            let yon = (i + (dikey ? 1 : 0)) % 4
            let p: CGRect
            switch yon {
            case 0: let x = r.minX + r.width / FI; p = CGRect(x: r.minX, y: r.minY, width: x - r.minX, height: r.height); r = CGRect(x: x, y: r.minY, width: r.maxX - x, height: r.height)
            case 1: let y = r.minY + r.height / FI; p = CGRect(x: r.minX, y: r.minY, width: r.width, height: y - r.minY); r = CGRect(x: r.minX, y: y, width: r.width, height: r.maxY - y)
            case 2: let x = r.maxX - r.width / FI; p = CGRect(x: x, y: r.minY, width: r.maxX - x, height: r.height); r = CGRect(x: r.minX, y: r.minY, width: x - r.minX, height: r.height)
            default: let y = r.maxY - r.height / FI; p = CGRect(x: r.minX, y: y, width: r.width, height: r.maxY - y); r = CGRect(x: r.minX, y: r.minY, width: r.width, height: y - r.minY)
            }
            l.append((p, yon))
        }
        return l
    }

    static func spiralGozu(dikey: Bool = false) -> N { let s = spiralParcalari(14, dikey: dikey).last!.0; return N(x: s.midX, y: s.midY) }

    /// Altın üçgen: sol üst–sağ alt köşegenine diğer iki köşeden dik inen çizgilerin ayakları (görüntü oranında, dik açı gerçek piksellerde)
    static func ucgenAyaklari(_ oran: CGFloat) -> (N, N) {
        func ayak(_ px: CGFloat, _ py: CGFloat) -> N {
            let dx = oran, dy: CGFloat = 1
            let t = (px * oran * dx + py * dy) / (dx * dx + dy * dy)
            return N(x: t * dx / oran, y: t * dy)
        }
        return (ayak(1, 0), ayak(0, 1))
    }

    /// Ekranda gösterilen güçlü noktalar (üçgende yöne göre aynalanmış ayaklar, öncüde kaçış noktası)
    static func noktalar(_ t: KompTur, yon: Int, oran: CGFloat, analiz: AnalizSonuc?) -> [N] {
        gucluNoktalar(t, yon: yon, oran: oran, analiz: analiz)
    }

    /// Konudan en yakın güçlü nokta: hedef, hizalama (0 uzak … 1 yerinde) ve yerinde mi
    static func hedef(_ t: KompTur, yon: Int, oran: CGFloat, konu: CGRect?, analiz: AnalizSonuc?) -> (nokta: N, hizalama: CGFloat, tamam: Bool)? {
        guard let k = konu else { return nil }
        let n = noktalar(t, yon: yon, oran: oran, analiz: analiz)
        guard !n.isEmpty else { return nil }
        func uzak(_ p: N) -> CGFloat { hypot((p.x - k.midX) * oran, p.y - k.midY) }
        let h = n.min { uzak($0) < uzak($1) }!
        let mesafe = uzak(h)
        return (h, min(max(1 - mesafe / 0.35, 0), 1), mesafe < 0.045)
    }

    /// Öneri: konuya en az hareketle uyan kılavuz (kapalı ve mevcut hariç)
    static func oner(konu: CGRect?, mevcut: KompTur, oran: CGFloat, analiz: AnalizSonuc?) -> (KompTur, Int)? {
        // Görüntünün kendisi: ayna gibi simetrik sahne → simetri; iki yandan gelen çizgiler bir noktada buluşuyorsa → öncü çizgi
        if let a = analiz, konu == nil || abs(konu!.midX - 0.5) < 0.12 {
            if a.simetri > 0.8 { return mevcut == .simetri ? nil : (.simetri, 0) }
            if a.kacis != nil && a.oncu.count >= 2 { return mevcut == .oncu ? nil : (.oncu, 0) }
        }
        guard let k = konu else { return nil }
        var adaylar: [(KompTur, Int, CGFloat)] = []
        for t in [KompTur.ucteBir, .phi, .spiral, .ucgen] {
            for y in (t == .spiral || t == .ucgen ? 0...3 : 0...0) {
                let n = gucluNoktalar(t, yon: y, oran: oran).map { hypot(($0.x - k.midX) * oran, $0.y - k.midY) }.min() ?? 9
                adaylar.append((t, y, n))
            }
        }
        // Konu ortadaysa ve iriyse simetri
        if abs(k.midX - 0.5) < 0.06 && k.width > 0.25 { return (.simetri, 0) }
        let en = adaylar.min { $0.2 < $1.2 }!
        return en.0 == mevcut ? nil : (en.0, en.1)
    }
}

/// Görüntünün üstündeki kompozisyon katmanı: kılavuz çizgileri, güçlü noktalar; akıllı yardımcı açıksa konu kutusu, konudan en yakın
/// güçlü noktaya ok, altta ibre (konu yerine oturunca yeşil), yön tarifi ve terazi (ufuk düzse yeşil). Dokunma almaz.
struct KompozisyonKatman: View {
    var tur: KompTur
    var yon: Int
    /// Görüntünün ekrandaki dikdörtgeni (katmanın kendi koordinatında)
    var alan: CGRect
    var asistan = false
    var konu: CGRect?
    var konuAdi = ""
    var analiz: AnalizSonuc?
    var ipucu: String?
    /// derece; nil = terazi kapalı. Çizginin ekrandaki açısı = taban + eğim
    var egim: CGFloat?
    var egimTaban: CGFloat = 0
    /// Menüdeki küçük önizlemeler için ince çizgi
    var kucuk = false

    static let yesil = Color(red: 60 / 255, green: 220 / 255, blue: 110 / 255)
    static let sari = Color(red: 1, green: 196 / 255, blue: 0)

    var body: some View {
        Canvas { c, _ in ciz(&c) }
            .allowsHitTesting(false)
    }

    private func ciz(_ c: inout GraphicsContext) {
        let r = alan
        guard r.width > 0, r.height > 0 else { return }
        func P(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: r.minX + x * r.width, y: r.minY + y * r.height) }
        func yx(_ x: CGFloat) -> CGFloat { yon & 1 == 1 ? 1 - x : x }
        func yy(_ y: CGFloat) -> CGFloat { yon & 2 == 2 ? 1 - y : y }
        let kalin: CGFloat = kucuk ? 1 : 1.3, inceK: CGFloat = kucuk ? 0.7 : 0.9
        let beyaz = Color.white.opacity(0.8), soluk = Color.white.opacity(0.5)
        var g = c
        if !kucuk { g.addFilter(.shadow(color: .black.opacity(0.6), radius: 1.5)) }
        func cizgi(_ a: CGPoint, _ b: CGPoint, ince: Bool = false, renk: Color? = nil, en: CGFloat? = nil, kesik: [CGFloat] = []) {
            var p = Path(); p.move(to: a); p.addLine(to: b)
            g.stroke(p, with: .color(renk ?? (ince ? soluk : beyaz)), style: StrokeStyle(lineWidth: en ?? (ince ? inceK : kalin), lineCap: .round, dash: kesik))
        }
        let oran = r.width / r.height
        switch tur {
        case .ucteBir:
            for k in [1.0 / 3, 2.0 / 3] { cizgi(P(k, 0), P(k, 1)); cizgi(P(0, k), P(1, k)) }
        case .phi:
            for k in [1 - 1 / FI, 1 / FI] { cizgi(P(k, 0), P(k, 1)); cizgi(P(0, k), P(1, k)) }
        case .spiral:
            var yol = Path()
            for (p, yonP) in Kompozisyon.spiralParcalari(10, dikey: r.width < r.height) {
                let x0 = min(yx(p.minX), yx(p.maxX)), x1 = max(yx(p.minX), yx(p.maxX))
                let y0 = min(yy(p.minY), yy(p.maxY)), y1 = max(yy(p.minY), yy(p.maxY))
                g.stroke(Path(CGRect(origin: P(x0, y0), size: CGSize(width: (x1 - x0) * r.width, height: (y1 - y0) * r.height))), with: .color(soluk), lineWidth: inceK)
                // Çeyrek yay: merkez parçanın bir köşesi (sol parça → sağ alt, üst → sol alt, sağ → sol üst, alt → sağ üst)
                let (mx, my, bas): (CGFloat, CGFloat, CGFloat) = {
                    switch yonP {
                    case 0: return (p.maxX, p.maxY, 180)
                    case 1: return (p.minX, p.maxY, 270)
                    case 2: return (p.minX, p.minY, 0)
                    default: return (p.maxX, p.minY, 90)
                    }
                }()
                for s in 0...16 {
                    let a = (bas + 90 * CGFloat(s) / 16) * .pi / 180
                    let nk = P(yx(mx + p.width * cos(a)), yy(my + p.height * sin(a)))
                    if s == 0 && yol.isEmpty { yol.move(to: nk) } else { yol.addLine(to: nk) }
                }
            }
            g.stroke(yol, with: .color(beyaz), lineWidth: kalin)
        case .kosegen:
            cizgi(P(0, 0), P(1, 1)); cizgi(P(1, 0), P(0, 1))
            cizgi(P(0.5, 0), P(0, 0.5), ince: true); cizgi(P(0.5, 0), P(1, 0.5), ince: true)
            cizgi(P(0, 0.5), P(0.5, 1), ince: true); cizgi(P(1, 0.5), P(0.5, 1), ince: true)
        case .ucgen:
            let (a1, a2) = Kompozisyon.ucgenAyaklari(oran)
            cizgi(P(yx(0), yy(0)), P(yx(1), yy(1)))
            cizgi(P(yx(1), yy(0)), P(yx(a1.x), yy(a1.y))); cizgi(P(yx(0), yy(1)), P(yx(a2.x), yy(a2.y)))
        case .simetri:
            cizgi(P(0.5, 0), P(0.5, 1)); cizgi(P(0, 0.5), P(1, 0.5))
            cizgi(P(0, 0), P(1, 1), ince: true, kesik: [6, 6]); cizgi(P(1, 0), P(0, 1), ince: true, kesik: [6, 6])
        case .oncu:
            // Alt köşelerden ve alt üçte birlerden kaçış noktasına (bulunduysa görüntüdekine)
            let k = Kompozisyon.gucluNoktalar(.oncu, yon: 0, oran: oran, analiz: analiz)[0]
            for (x, y) in [(0.0, 1.0), (1.0, 1.0), (0.0, 2.0 / 3), (1.0, 2.0 / 3)] { cizgi(P(x, y), P(k.x, k.y), ince: y != 1) }
        case .kapali: break
        }
        let noktalar = Kompozisyon.noktalar(tur, yon: yon, oran: oran, analiz: analiz)
        let nr: CGFloat = kucuk ? 2 : 3.5
        for n in noktalar { let p = P(n.x, n.y); g.fill(Path(ellipseIn: CGRect(x: p.x - nr, y: p.y - nr, width: nr * 2, height: nr * 2)), with: .color(.white.opacity(0.86))) }
        if kucuk { return }

        // Analiz: ufuk (mavi kesikli) ve öncü çizgiler (turuncu, ince)
        if asistan, let an = analiz {
            if let u = an.ufuk { cizgi(P(u.a.x, u.a.y), P(u.b.x, u.b.y), renk: Color(red: 106 / 255, green: 152 / 255, blue: 248 / 255).opacity(0.8), en: 1.5, kesik: [9, 6]) }
            if tur == .oncu { for l in an.oncu { cizgi(P(l.a.x, l.a.y), P(l.b.x, l.b.y), renk: Tema.vurgu.opacity(0.67), en: 1.5) } }
        }
        // Akıllı yardımcı: konudan en yakın güçlü noktaya ok + ibre
        if asistan, let k = konu, let h = Kompozisyon.hedef(tur, yon: yon, oran: oran, konu: k, analiz: analiz) {
            let renk = h.tamam ? Self.yesil : (h.hizalama > 0.6 ? Self.sari : .white)
            let kutu = CGRect(origin: P(k.minX, k.minY), size: CGSize(width: k.width * r.width, height: k.height * r.height))
            g.stroke(Path(kutu), with: .color(renk), lineWidth: 1.5)
            let hp = P(h.nokta.x, h.nokta.y)
            if !h.tamam {
                let sp = P(k.midX, k.midY)
                var ok = Path(); ok.move(to: sp); ok.addLine(to: hp)
                let aci = atan2(hp.y - sp.y, hp.x - sp.x), u: CGFloat = 13
                ok.move(to: hp); ok.addLine(to: CGPoint(x: hp.x - u * cos(aci - 0.5), y: hp.y - u * sin(aci - 0.5)))
                ok.move(to: hp); ok.addLine(to: CGPoint(x: hp.x - u * cos(aci + 0.5), y: hp.y - u * sin(aci + 0.5)))
                g.stroke(ok, with: .color(renk), style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
            }
            g.stroke(Path(ellipseIn: CGRect(x: hp.x - 8, y: hp.y - 8, width: 16, height: 16)), with: .color(renk), lineWidth: 2)
            ibre(&g, r, h.hizalama, h.tamam)
            if !konuAdi.isEmpty {
                g.draw(Text(konuAdi).font(.caption.weight(.bold)).foregroundColor(.white), at: CGPoint(x: kutu.minX, y: kutu.minY - 4), anchor: .bottomLeading)
            }
        }
        // Terazi: ufuk çizgisi, düzse yeşil
        if let e = egim {
            let duz = abs(e) < 1, uz = min(r.width, r.height) * 0.28
            let m = CGPoint(x: r.midX, y: r.midY), a = -(e + egimTaban) * .pi / 180
            let renk = duz ? Self.yesil : Color.white
            cizgi(CGPoint(x: m.x - uz * cos(a), y: m.y - uz * sin(a)), CGPoint(x: m.x + uz * cos(a), y: m.y + uz * sin(a)), renk: renk, en: 2)
            let yan = duz ? Self.yesil : Color.white.opacity(0.6)
            cizgi(CGPoint(x: m.x - uz - 15, y: m.y), CGPoint(x: m.x - uz - 5, y: m.y), renk: yan, en: 2)
            cizgi(CGPoint(x: m.x + uz + 5, y: m.y), CGPoint(x: m.x + uz + 15, y: m.y), renk: yan, en: 2)
            g.draw(Text(String(format: "%.1f°", e).replacingOccurrences(of: ".", with: ",")).font(.caption.weight(.bold)).foregroundColor(renk),
                   at: CGPoint(x: m.x + uz + 20, y: m.y), anchor: .leading)
        }
    }

    /// Alt ortada yarım daire ibre: 0 = uzak, 1 = tam yerinde (yeşil)
    private func ibre(_ g: inout GraphicsContext, _ r: CGRect, _ v: CGFloat, _ tamam: Bool) {
        let rr = min(r.width, r.height) * 0.11, m = CGPoint(x: r.midX, y: r.maxY - 11)
        func yay(_ bas: Double, _ son: Double, _ renk: Color) {
            var p = Path(); p.addArc(center: m, radius: rr, startAngle: .degrees(bas), endAngle: .degrees(son), clockwise: false)
            g.stroke(p, with: .color(renk), style: StrokeStyle(lineWidth: 5, lineCap: .round))
        }
        yay(180, 360, .black.opacity(0.47))
        yay(180, 240, Color(red: 230 / 255, green: 60 / 255, blue: 50 / 255)); yay(240, 300, Self.sari); yay(300, 360, Self.yesil)
        let a = (180 + 180 * v) * .pi / 180, renk = tamam ? Self.yesil : Color.white
        var p = Path(); p.move(to: m); p.addLine(to: CGPoint(x: m.x + rr * 0.95 * cos(a), y: m.y + rr * 0.95 * sin(a)))
        g.stroke(p, with: .color(renk), style: StrokeStyle(lineWidth: 3, lineCap: .round))
        g.fill(Path(ellipseIn: CGRect(x: m.x - 4, y: m.y - 4, width: 8, height: 8)), with: .color(renk))
        if tamam { g.draw(Text("YERİNDE").font(.caption.weight(.heavy)).foregroundColor(Self.yesil), at: CGPoint(x: m.x, y: m.y - rr - 8), anchor: .bottom) }
    }
}
