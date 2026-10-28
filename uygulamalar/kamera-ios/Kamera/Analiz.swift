import CoreGraphics
import Foundation

/// Görüntüde 0–1 arası nokta (x sağa, y aşağı)
struct N: Equatable { var x: CGFloat; var y: CGFloat }

/// Bulunan düz çizgi: uçları 0–1, açı derece (ekranda saat yönünün tersine, −90…90), güç = toplam kenar ağırlığındaki payı
struct Cizgi: Equatable {
    var a: N, b: N, aci: CGFloat, guc: CGFloat
    var ortaY: CGFloat { (a.y + b.y) / 2 }
}

/// Yüz ayrıntısı (portre ipuçları için): göz hizası (0–1) ve başın dönüşü (+ görüntünün sağına bakıyor)
struct YuzBilgi: Equatable { var gozY: CGFloat?; var donus: CGFloat }

/// Görüntü analizi sonucu: ufuk çizgisi, öncü (çapraz) çizgiler ve kaçış noktası, simetri (0–1), görsel ağırlık merkezi
struct AnalizSonuc: Equatable {
    var ufuk: Cizgi?
    var oncu: [Cizgi]
    var kacis: N?
    var simetri: CGFloat
    var agirlik: N
}

/// Kompozisyon analizi (telefonun içinde, modelsiz): küçük kopya (256 genişlik, BGRA) üzerinde kenar bulma (Sobel), düz çizgi
/// bulma (Hough), ayna farkı (simetri) ve kenar ağırlığı merkezi (denge). Android'deki Analiz.kt'nin birebir karşılığı.
enum GoruntuAnaliz {
    private static let aciAdim = 2 // derece
    private static let rhoSayi = 140

    /// p: BGRA satırlar üstten alta; oran: görüntünün gerçek en/boyu
    static func hesapla(_ p: [UInt8], w: Int, h: Int, oran: Float) -> AnalizSonuc {
        var L = [Float](repeating: 0, count: w * h)
        for y in 0..<h {
            for x in 0..<w {
                let i = (y * w + x) * 4
                L[y * w + x] = 0.0722 * Float(p[i]) + 0.7152 * Float(p[i + 1]) + 0.2126 * Float(p[i + 2])
            }
        }
        // Sobel; gerçek orana göre: yatay adım oran/w, dikey adım 1/h
        let olcek = (Float(w) / oran) / Float(h)
        var G = [Float](repeating: 0, count: w * h), GX = G, GY = G
        var toplamG: Double = 0, agX: Double = 0, agY: Double = 0
        for y in 1..<(h - 1) {
            for x in 1..<(w - 1) {
                func l(_ dx: Int, _ dy: Int) -> Float { L[(y + dy) * w + x + dx] }
                let gx = ((l(1, -1) + 2 * l(1, 0) + l(1, 1)) - (l(-1, -1) + 2 * l(-1, 0) + l(-1, 1))) * olcek
                let gy = (l(-1, 1) + 2 * l(0, 1) + l(1, 1)) - (l(-1, -1) + 2 * l(0, -1) + l(1, -1))
                let g = (gx * gx + gy * gy).squareRoot()
                G[y * w + x] = g; GX[y * w + x] = gx; GY[y * w + x] = gy
                toplamG += Double(g); agX += Double(g) * Double(x); agY += Double(g) * Double(y)
            }
        }
        let agirlik = toplamG > 0 ? N(x: CGFloat(agX / toplamG / Double(w - 1)), y: CGFloat(agY / toplamG / Double(h - 1))) : N(x: 0.5, y: 0.5)
        // Eşik: ortalamanın 2,5 katı (en az 24): yalnız belirgin kenarlar oy verir
        let ort = Float(toplamG / Double((w - 2) * (h - 2)))
        let esik = max(24, ort * 2.5)

        // Hough: θ 0..178 (çizginin normali), ρ = X cosθ + Y sinθ; X = x/w*oran, Y = y/h
        let nT = 180 / aciAdim, rMax = (oran * oran + 1).squareRoot()
        var acc = [Float](repeating: 0, count: nT * rhoSayi)
        let cosT = (0..<nT).map { Float(cos(Double($0 * aciAdim) * .pi / 180)) }
        let sinT = (0..<nT).map { Float(sin(Double($0 * aciAdim) * .pi / 180)) }
        var oyToplam: Float = 0
        var kenarlar: [Int] = []
        for y in 1..<(h - 1) {
            for x in 1..<(w - 1) {
                let g = G[y * w + x]
                if g < esik { continue }
                kenarlar.append(y * w + x)
                let X = Float(x) / Float(w - 1) * oran, Y = Float(y) / Float(h - 1)
                // Yalnız kenarın yönüne yakın açılara oy (gürültüyü azaltır): kenar normali = gradyan yönü
                var gt = Float(atan2(Double(GY[y * w + x]), Double(GX[y * w + x])) * 180 / .pi)
                gt = (gt + 360).truncatingRemainder(dividingBy: 180)
                oyToplam += g
                for t in 0..<nT {
                    let fark = abs((Float(t * aciAdim) - gt + 270).truncatingRemainder(dividingBy: 180) - 90)
                    if fark > 12 { continue }
                    let rho = X * cosT[t] + Y * sinT[t]
                    let ri = min(max(Int((rho + rMax) / (2 * rMax) * Float(rhoSayi - 1)), 0), rhoSayi - 1)
                    acc[t * rhoSayi + ri] += g
                }
            }
        }
        // Tepe noktaları (çevresinin en büyüğü)
        struct Tepe { let t: Int, r: Int; let oy: Float }
        var tepeler: [Tepe] = []
        for t in 0..<nT {
            for r in 0..<rhoSayi {
                let v = acc[t * rhoSayi + r]
                if v <= 0 { continue }
                var enBuyuk = true
                dis: for dt in -3...3 {
                    for dr in -4...4 {
                        if dt == 0 && dr == 0 { continue }
                        let tt = (t + dt + nT) % nT, rr = r + dr
                        if rr < 0 || rr >= rhoSayi { continue }
                        if acc[tt * rhoSayi + rr] > v { enBuyuk = false; break dis }
                    }
                }
                if enBuyuk { tepeler.append(Tepe(t: t, r: r, oy: v)) }
            }
        }
        tepeler.sort { $0.oy > $1.oy }

        func cizgi(_ tp: Tepe) -> Cizgi? {
            let th = Double(tp.t * aciAdim) * .pi / 180
            var c = Float(cos(th)), s = Float(sin(th))
            var rho = Float(tp.r) / Float(rhoSayi - 1) * 2 * rMax - rMax
            // İnceltme: çizgiye yakın kenar noktalarına en küçük kareler (Hough'un 2°'lik adımından daha hassas açı)
            var sw: Double = 0, mx: Double = 0, my: Double = 0
            var yakin: [Int] = []
            for i in kenarlar {
                let X = Float(i % w) / Float(w - 1) * oran, Y = Float(i / w) / Float(h - 1)
                if abs(X * c + Y * s - rho) < 0.025 { yakin.append(i); let g = Double(G[i]); sw += g; mx += g * Double(X); my += g * Double(Y) }
            }
            if sw > 0 && yakin.count > 8 {
                mx /= sw; my /= sw
                var sxx: Double = 0, syy: Double = 0, sxy: Double = 0
                for i in yakin {
                    let g = Double(G[i])
                    let dx = Double(Float(i % w) / Float(w - 1) * oran) - mx, dy = Double(Float(i / w) / Float(h - 1)) - my
                    sxx += g * dx * dx; syy += g * dy * dy; sxy += g * dx * dy
                }
                let yonA = 0.5 * atan2(2 * sxy, sxx - syy) // ana doğrultu
                c = Float(-sin(yonA)); s = Float(cos(yonA)) // normal
                rho = Float(mx) * c + Float(my) * s
            }
            // Dikdörtgenle ([0,oran]×[0,1]) kesişim
            var pts: [(Float, Float)] = []
            if abs(s) > 1e-4 { for X in [0, oran] { let Y = (rho - X * c) / s; if Y >= 0 && Y <= 1 { pts.append((X, Y)) } } }
            if abs(c) > 1e-4 { for Y: Float in [0, 1] { let X = (rho - Y * s) / c; if X >= 0 && X <= oran { pts.append((X, Y)) } } }
            guard pts.count >= 2 else { return nil }
            let a = pts[0]
            let b = pts.max { hypot($0.0 - a.0, $0.1 - a.1) < hypot($1.0 - a.0, $1.1 - a.1) }!
            // Doğrultu (ekranda y aşağı): (−s, c); saat yönünün tersine açı
            var aci = Float(atan2(Double(-c), Double(-s)) * 180 / .pi)
            while aci > 90 { aci -= 180 }
            while aci <= -90 { aci += 180 }
            return Cizgi(a: N(x: CGFloat(a.0 / oran), y: CGFloat(a.1)), b: N(x: CGFloat(b.0 / oran), y: CGFloat(b.1)),
                         aci: CGFloat(aci), guc: CGFloat(oyToplam > 0 ? tp.oy / oyToplam : 0))
        }
        let cizgiler = tepeler.prefix(10).compactMap { cizgi($0) }
        // Ufuk: en güçlü yataya yakın (±15°), görüntüyü boydan boya geçen çizgi
        let ufuk = cizgiler.filter { abs($0.aci) <= 15 && $0.guc >= 0.05 && abs($0.b.x - $0.a.x) > 0.8 }.max { $0.guc < $1.guc }
        // Öncü çizgiler: çapraz (20–70°) ve güçlü
        let oncu = Array(cizgiler.filter { abs($0.aci) >= 20 && abs($0.aci) <= 70 && $0.guc >= 0.035 }.prefix(4))
        var kacis: N?
        if let sol = oncu.filter({ $0.aci > 0 }).max(by: { $0.guc < $1.guc }), let sag = oncu.filter({ $0.aci < 0 }).max(by: { $0.guc < $1.guc }),
           let k = kesisim(sol, sag, oran: CGFloat(oran)), k.x >= -0.1, k.x <= 1.1, k.y >= -0.1, k.y <= 1.1 {
            kacis = k
        }

        // Simetri: dikey eksene göre ayna farkı, sahnenin kendi kontrastına oranla
        var fark: Double = 0, kontrast: Double = 0
        let ortL = Double(L.reduce(0, +)) / Double(L.count)
        for y in 0..<h {
            for x in 0..<(w / 2) {
                let a = Double(L[y * w + x]), b = Double(L[y * w + w - 1 - x])
                fark += abs(a - b); kontrast += abs(a - ortL) + abs(b - ortL)
            }
        }
        let simetri = kontrast > 1 ? CGFloat(min(max(1 - fark / kontrast, 0), 1)) : 0
        return AnalizSonuc(ufuk: ufuk, oncu: oncu, kacis: kacis, simetri: simetri, agirlik: agirlik)
    }

    private static func kesisim(_ a: Cizgi, _ b: Cizgi, oran: CGFloat) -> N? {
        let x1 = a.a.x * oran, y1 = a.a.y, x2 = a.b.x * oran, y2 = a.b.y
        let x3 = b.a.x * oran, y3 = b.a.y, x4 = b.b.x * oran, y4 = b.b.y
        let d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
        if abs(d) < 1e-6 { return nil }
        let px = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / d
        let py = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / d
        return N(x: px / oran, y: py)
    }
}

/// Tek satırlık yön tarifi (en önemlisi): konu kesiliyor mu, boyutu, portrede göz hizası ve bakış yönü, ufuk eğikliği ve yeri,
/// kılavuza oturma, kadraj dengesi. Konuyu kadrajda sağa almak için telefon sola çevrilir (tarif telefona göre).
func ipucuUret(konu: CGRect?, konuAdi: String, yuz: YuzBilgi?, a: AnalizSonuc?, hedef: N?, hizalama: CGFloat) -> String? {
    func yatay(_ dx: CGFloat) -> String { dx > 0 ? "sola" : "sağa" }                    // konu sağa gitmeli → telefon sola
    func dikey(_ dy: CGFloat) -> String { dy > 0 ? "yukarı kaldır" : "aşağı indir" }    // konu aşağı gitmeli → telefon yukarı
    if let k = konu {
        let alan = k.width * k.height, pay: CGFloat = 0.015
        let sol = k.minX < pay, sag = k.maxX > 1 - pay, ust = k.minY < pay, alt = k.maxY > 1 - pay
        if alan < 0.6 {
            if (sol && sag) || (ust && alt) { return "Konu kadraja sığmıyor: biraz uzaklaş" }
            if konuAdi == "Yüz" && ust { return "Baş kesiliyor: telefonu biraz yukarı kaldır" }
            if sol || sag { return "Konu kenarda kesiliyor: telefonu biraz \(sol ? "sola" : "sağa") çevir" }
            if ust || alt { return "Konu kenarda kesiliyor: telefonu biraz \(ust ? "yukarı kaldır" : "aşağı indir")" }
        }
        if alan < 0.006 { return "Konu çok küçük: biraz yaklaş" }
        if alan > 0.6 { return "Çok yakın: biraz uzaklaş" }
        if let yuz, konuAdi == "Yüz" {
            if let g = yuz.gozY, k.height > 0.1, abs(g - 1 / 3) > 0.07 { return "Gözleri üst üçte bire getir: telefonu biraz \(g > 1 / 3 ? "aşağı indir" : "yukarı kaldır")" }
            if yuz.donus > 20 && k.midX > 0.55 { return "Baktığı yöne boşluk bırak: telefonu biraz sağa çevir" }
            if yuz.donus < -20 && k.midX < 0.45 { return "Baktığı yöne boşluk bırak: telefonu biraz sola çevir" }
        }
    }
    if let u = a?.ufuk {
        if abs(u.aci) >= 0.7 && abs(u.aci) <= 12 { return String(format: "Ufuk %.1f° eğik: telefonu düzelt", abs(u.aci)).replacingOccurrences(of: ".", with: ",") }
        if (konu == nil || konu!.width * konu!.height < 0.05) && u.ortaY >= 0.42 && u.ortaY <= 0.58 {
            return u.ortaY < 0.5 ? "Ufku üst üçte bire al: telefonu biraz aşağı indir" : "Ufku alt üçte bire al: telefonu biraz yukarı kaldır"
        }
    }
    if let k = konu, let hedef, hizalama < 0.85 {
        let dx = hedef.x - k.midX, dy = hedef.y - k.midY
        return abs(dx) >= abs(dy) ? "Telefonu biraz \(yatay(dx)) çevir" : "Telefonu biraz \(dikey(dy))"
    }
    if konu == nil, let a, abs(a.agirlik.x - 0.5) > 0.18 {
        return a.agirlik.x > 0.5 ? "Kadraj sağa yüklü: telefonu biraz sağa çevir" : "Kadraj sola yüklü: telefonu biraz sola çevir"
    }
    return nil
}

/// İpucu titremesin: yeni ipucu en az 1,2 sn göründükten sonra değişir; kaybolması için 0,8 sn yokluk gerekir
final class IpucuSabitle {
    private var gosterilen: String?
    private var zaman = Date.distantPast
    private var yokSaydi: Date?

    func ver(_ yeni: String?) -> String? {
        let s = Date()
        if yeni == gosterilen { yokSaydi = nil; return gosterilen }
        guard let yeni else {
            if yokSaydi == nil { yokSaydi = s }
            if s.timeIntervalSince(yokSaydi!) > 0.8 { gosterilen = nil; zaman = s }
            return gosterilen
        }
        if gosterilen == nil || s.timeIntervalSince(zaman) > 1.2 { gosterilen = yeni; zaman = s }
        return gosterilen
    }
}
