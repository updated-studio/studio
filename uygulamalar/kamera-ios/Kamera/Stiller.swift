import AVFoundation
import CoreImage
import SwiftUI
import UniformTypeIdentifiers

/// Stiller (Fatih 29 Ekim: "zahmetsizce nasıl renklendirecek?"): hazır stil + iOS Stilleri gibi pad (yatay soğuk ↔ sıcak, dikey ton) +
/// yoğunluk ve doygunluk. Stil, seçili LUT'la (ya da Log → Rec.709 ile) birleşip tek bir 3D LUT olur: ekranda çizici bunu kullanır,
/// "Kayda göm" açıksa aynı LUT fotoğrafa ve videoya da işlenir (RAW ve Log kaydı dokunulmaz kalmaz; seçen kullanıcıdır).
enum HazirStil: String, CaseIterable, Codable, Identifiable {
    case standart, sinematik, sicak, soguk, canli, siyahBeyaz
    // Film reçeteleri (Fatih 29 Ekim): sevilen film ve fotoğraf makinesi görünümlerinden esinli; marka adı kullanılmaz
    case lcKlasik, lcCanli, lcSB, klasikKrom, klasikNegatif, canliSlayt, sinemaYumusak, gumusSB, filmGorunumu, retro, vintage
    var id: String { rawValue }
    static let temel: [HazirStil] = [.standart, .sinematik, .sicak, .soguk, .canli, .siyahBeyaz]
    static let receteler: [HazirStil] = [.lcKlasik, .lcCanli, .lcSB, .klasikKrom, .klasikNegatif, .canliSlayt, .sinemaYumusak, .gumusSB, .filmGorunumu, .retro, .vintage]
    var recete: Bool { HazirStil.receteler.contains(self) }
    var ad: String {
        switch self {
        case .standart: return "Standart"
        case .sinematik: return "Sinematik"
        case .sicak: return "Sıcak"
        case .soguk: return "Soğuk"
        case .canli: return "Canlı"
        case .siyahBeyaz: return "S-B"
        case .lcKlasik: return "LC Klasik"
        case .lcCanli: return "LC Canlı"
        case .lcSB: return "LC S-B"
        case .klasikKrom: return "Klasik Krom"
        case .klasikNegatif: return "Klasik Negatif"
        case .canliSlayt: return "Canlı Slayt"
        case .sinemaYumusak: return "Sinema Yumuşak"
        case .gumusSB: return "Gümüş S-B"
        case .filmGorunumu: return "Film Görünümü"
        case .retro: return "Retro"
        case .vintage: return "Vintage"
        }
    }
    /// Tek satırlık açıklama (reçete listesinde)
    var aciklama: String {
        switch self {
        case .lcKlasik: return "Doğal, derin siyahlar, hafif sıcak"
        case .lcCanli: return "Sert kontrast, dolgun renk"
        case .lcSB: return "Yüksek kontrastlı siyah-beyaz"
        case .klasikKrom: return "Sakin renkler, sert gölgeler, belgesel"
        case .klasikNegatif: return "Camgöbeği gölge, sıcak ışık, sert ton"
        case .canliSlayt: return "Slayt film: çok doygun, parlak"
        case .sinemaYumusak: return "Düşük kontrast, az doygun, sinema"
        case .gumusSB: return "İnce tonlu, yumuşak siyah-beyaz"
        case .filmGorunumu: return "Sıcak ten, yumuşak, açık siyahlar"
        case .retro: return "70'ler: sarı-yeşil, soluk"
        case .vintage: return "Solmuş baskı, sıcak, düşük doygunluk"
        default: return ""
        }
    }
    /// Küçük önizleme kutusunun renkleri
    var renkler: [Color] {
        switch self {
        case .standart: return [Color(red: 0.79, green: 0.54, blue: 0.35), Color(red: 0.18, green: 0.23, blue: 0.29)]
        case .sinematik: return [Color(red: 0.85, green: 0.6, blue: 0.35), Color(red: 0.12, green: 0.25, blue: 0.27)]
        case .sicak: return [Color(red: 0.91, green: 0.66, blue: 0.42), Color(red: 0.35, green: 0.23, blue: 0.16)]
        case .soguk: return [Color(red: 0.6, green: 0.69, blue: 0.82), Color(red: 0.12, green: 0.16, blue: 0.23)]
        case .canli: return [Color(red: 1, green: 0.6, blue: 0.31), Color(red: 0.13, green: 0.29, blue: 0.48)]
        case .siyahBeyaz: return [Color(white: 0.67), Color(white: 0.13)]
        case .lcKlasik: return [Color(red: 0.86, green: 0.64, blue: 0.45), Color(red: 0.08, green: 0.1, blue: 0.12)]
        case .lcCanli: return [Color(red: 0.98, green: 0.55, blue: 0.25), Color(red: 0.05, green: 0.2, blue: 0.42)]
        case .lcSB: return [Color(white: 0.85), Color(white: 0.03)]
        case .klasikKrom: return [Color(red: 0.72, green: 0.66, blue: 0.56), Color(red: 0.16, green: 0.22, blue: 0.24)]
        case .klasikNegatif: return [Color(red: 0.9, green: 0.62, blue: 0.55), Color(red: 0.1, green: 0.27, blue: 0.29)]
        case .canliSlayt: return [Color(red: 1, green: 0.42, blue: 0.2), Color(red: 0.0, green: 0.32, blue: 0.55)]
        case .sinemaYumusak: return [Color(red: 0.7, green: 0.65, blue: 0.58), Color(red: 0.22, green: 0.27, blue: 0.29)]
        case .gumusSB: return [Color(white: 0.78), Color(white: 0.2)]
        case .filmGorunumu: return [Color(red: 0.95, green: 0.74, blue: 0.6), Color(red: 0.25, green: 0.22, blue: 0.24)]
        case .retro: return [Color(red: 0.88, green: 0.76, blue: 0.45), Color(red: 0.24, green: 0.28, blue: 0.2)]
        case .vintage: return [Color(red: 0.86, green: 0.74, blue: 0.62), Color(red: 0.32, green: 0.27, blue: 0.25)]
        }
    }
}

struct Stil: Codable, Equatable {
    var hazir: HazirStil = .standart
    /// Pad: x −1 soğuk … +1 sıcak, y −1 koyu/sert … +1 açık/yumuşak
    var x: Float = 0
    var y: Float = 0
    /// 0…1
    var yogunluk: Float = 1
    /// −1…+1
    var doygunluk: Float = 0
    var kaydaGom = false

    /// Görüntüyü değiştiriyor mu
    var etkin: Bool {
        yogunluk > 0.01 && (hazir != .standart || abs(x) > 0.01 || abs(y) > 0.01 || abs(doygunluk) > 0.01)
    }

    var anahtar: String { "\(hazir.rawValue)|\(x)|\(y)|\(yogunluk)|\(doygunluk)" }

    /// Tek renge stil (0…1 görüntü renkleri)
    func uygula(_ r0: Float, _ g0: Float, _ b0: Float) -> (Float, Float, Float) {
        var r = r0, g = g0, b = b0
        func luma() -> Float { 0.2126 * r + 0.7152 * g + 0.0722 * b }
        func doy(_ k: Float) { let l = luma(); r = l + (r - l) * k; g = l + (g - l) * k; b = l + (b - l) * k }
        func egri(_ k: Float, kaldir: Float) {
            // Orta griye göre kontrast (k > 1 sert) ve gölge kaldırma
            func f(_ v: Float) -> Float { let s = 0.5 + (v - 0.5) * k; return s + kaldir * (1 - s) * (1 - s) * 0.5 }
            r = f(r); g = f(g); b = f(b)
        }
        func sicaklik(_ t: Float) { r *= 1 + 0.10 * t; g *= 1 + 0.02 * t; b *= 1 - 0.12 * t }
        // Reçeteler için: siyahları kaldırma (solma), gölge/ışık renk kaydırma, S eğrisi
        func sol(_ f: Float) { r = f + r * (1 - f); g = f + g * (1 - f); b = f + b * (1 - f) }
        func ayir(golge: (Float, Float, Float), isik: (Float, Float, Float)) {
            let l = luma(), gk = max(0, 1 - l * 2), ik = max(0, l * 2 - 1)
            r += golge.0 * gk + isik.0 * ik; g += golge.1 * gk + isik.1 * ik; b += golge.2 * gk + isik.2 * ik
        }
        func sEgri(_ k: Float) {
            // Yumuşak S: k > 0 kontrast artar (0,5 sabit kalır)
            func f(_ v: Float) -> Float { let c = min(max(v, 0), 1); return c + k * 2 * (c - 0.5) * c * (1 - c) }
            r = f(r); g = f(g); b = f(b)
        }
        func sb(_ kontrast: Float, kaldir: Float) { let l = luma(); r = l; g = l; b = l; egri(kontrast, kaldir: kaldir) }
        switch hazir {
        case .standart: break
        case .sinematik:
            // Turuncu-camgöbeği: gölgeler camgöbeğine, açık tonlar sıcağa; hafif yumuşak kontrast, az doygun
            let l = luma()
            let gol = max(0, 1 - l * 2), isik = max(0, l * 2 - 1)
            r += 0.06 * isik - 0.04 * gol; g += 0.01 * isik + 0.02 * gol; b += -0.05 * isik + 0.05 * gol
            egri(1.08, kaldir: 0.05); doy(0.88)
        case .sicak: sicaklik(0.6); doy(1.05)
        case .soguk: sicaklik(-0.6); doy(0.95)
        case .canli: egri(1.12, kaldir: 0); doy(1.3)
        case .siyahBeyaz: let l = luma(); r = l; g = l; b = l; egri(1.15, kaldir: 0)
        case .lcKlasik: sEgri(0.35); sicaklik(0.15); doy(0.92)
        case .lcCanli: sEgri(0.55); doy(1.28); sicaklik(0.1)
        case .lcSB: r = 0.3 * r + 0.59 * g + 0.11 * b; g = r; b = r; sEgri(0.8)
        case .klasikKrom: doy(0.72); egri(1.12, kaldir: 0); ayir(golge: (-0.01, 0.01, 0.025), isik: (0.015, 0.008, -0.01))
        case .klasikNegatif: egri(1.16, kaldir: 0); doy(0.82); ayir(golge: (-0.03, 0.015, 0.035), isik: (0.04, 0.0, 0.0))
        case .canliSlayt: sEgri(0.5); doy(1.45)
        case .sinemaYumusak: egri(0.86, kaldir: 0.06); doy(0.78); ayir(golge: (-0.01, 0.01, 0.02), isik: (0.01, 0.005, -0.005))
        case .gumusSB: sb(1.06, kaldir: 0.08); r += 0.008; b -= 0.008
        case .filmGorunumu: egri(0.92, kaldir: 0.04); sol(0.035); sicaklik(0.25); doy(0.9)
        case .retro: sicaklik(0.35); g += 0.02; ayir(golge: (-0.01, 0.025, -0.01), isik: (0.02, 0.015, -0.03)); sol(0.06); doy(0.8)
        case .vintage: sol(0.09); egri(0.88, kaldir: 0); sicaklik(0.3); doy(0.65)
        }
        if abs(x) > 0.001 { sicaklik(x) }
        if abs(y) > 0.001 { egri(1 - 0.3 * y, kaldir: max(0, y) * 0.3) }
        if abs(doygunluk) > 0.001, hazir != .siyahBeyaz { doy(1 + doygunluk) }
        let k = yogunluk
        return (min(max(r0 + (r - r0) * k, 0), 1), min(max(g0 + (g - g0) * k, 0), 1), min(max(b0 + (b - b0) * k, 0), 1))
    }

    /// Taban LUT (kullanıcının LUT'u ya da Log → Rec.709; yoksa nil) ardından stil: 33³ tek LUT
    func lut(taban: Lut?) -> Lut {
        let n = 33
        var v: [Float] = []
        v.reserveCapacity(n * n * n * 3)
        for bi in 0..<n { for gi in 0..<n { for ri in 0..<n {
            var c = (Float(ri) / Float(n - 1), Float(gi) / Float(n - 1), Float(bi) / Float(n - 1))
            if let taban { c = taban.ornekle(c.0, c.1, c.2) }
            let s = uygula(c.0, c.1, c.2)
            v.append(s.0); v.append(s.1); v.append(s.2)
        } } }
        return Lut(ad: "stil", boyut: n, veri: v)
    }
}

extension Lut {
    /// Üç doğrusal örnekleme (veri R en hızlı)
    func ornekle(_ r: Float, _ g: Float, _ b: Float) -> (Float, Float, Float) {
        let m = Float(boyut - 1)
        func bol(_ x: Float) -> (Int, Int, Float) {
            let p = min(max(x, 0), 1) * m
            let i = min(Int(p), boyut - 2)
            return (i, i + 1, p - Float(i))
        }
        let (r0, r1, fr) = bol(r), (g0, g1, fg) = bol(g), (b0, b1, fb) = bol(b)
        func al(_ ri: Int, _ gi: Int, _ bi: Int, _ k: Int) -> Float { veri[((bi * boyut + gi) * boyut + ri) * 3 + k] }
        func kanal(_ k: Int) -> Float {
            let c00 = al(r0, g0, b0, k) * (1 - fr) + al(r1, g0, b0, k) * fr
            let c10 = al(r0, g1, b0, k) * (1 - fr) + al(r1, g1, b0, k) * fr
            let c01 = al(r0, g0, b1, k) * (1 - fr) + al(r1, g0, b1, k) * fr
            let c11 = al(r0, g1, b1, k) * (1 - fr) + al(r1, g1, b1, k) * fr
            return (c00 * (1 - fg) + c10 * fg) * (1 - fb) + (c01 * (1 - fg) + c11 * fg) * fb
        }
        return (kanal(0), kanal(1), kanal(2))
    }

    /// CoreImage renk küpü süzgeci (kayda gömmek için)
    func suzgec(renkAlani: CGColorSpace) -> CIFilter? {
        var rgba = [Float](repeating: 1, count: boyut * boyut * boyut * 4)
        for i in 0..<(boyut * boyut * boyut) {
            rgba[i * 4] = veri[i * 3]; rgba[i * 4 + 1] = veri[i * 3 + 1]; rgba[i * 4 + 2] = veri[i * 3 + 2]
        }
        let f = CIFilter(name: "CIColorCubeWithColorSpace")
        f?.setValue(boyut, forKey: "inputCubeDimension")
        f?.setValue(rgba.withUnsafeBufferPointer { Data(buffer: $0) }, forKey: "inputCubeData")
        f?.setValue(renkAlani, forKey: "inputColorSpace")
        return f
    }
}

extension Kamera {
    /// Ekrandaki ve (açıksa) kayda gömülen tek LUT: taban + stil. nil = renk değişmiyor
    func renkLutu() -> (anahtar: String, uret: () -> Lut)? {
        let g = gosterge, s = stil
        let tabanAdi = g.lutAcik ? g.lutAdi : (logDuzelt ? Lut.logAdi : "")
        guard s.etkin || !tabanAdi.isEmpty else { return nil }
        return ("\(tabanAdi)#\(s.etkin ? s.anahtar : "")", {
            let taban = tabanAdi.isEmpty ? nil : Lut.yukle(tabanAdi)
            return s.etkin ? s.lut(taban: taban) : (taban ?? Lut.bos)
        })
    }

    /// Kayda gömülecek mi (Stiller → "Kayda göm")
    var gom: Bool { stil.kaydaGom && renkLutu() != nil }

    /// Fotoğrafa stil/LUT işler (HEIC ya da JPEG olarak yeniden yazar); olmazsa özgün veri
    func fotoyaGom(_ veri: Data) -> Data {
        guard gom, let r = renkLutu(), let resim = CIImage(data: veri, options: [.applyOrientationProperty: false]),
              let f = r.uret().suzgec(renkAlani: CGColorSpace(name: CGColorSpace.sRGB)!) else { return veri }
        f.setValue(resim, forKey: kCIInputImageKey)
        guard let cikti = f.outputImage else { return veri }
        let baglam = CIContext()
        let alan = resim.colorSpace ?? CGColorSpace(name: CGColorSpace.displayP3)!
        let son = cikti.settingProperties(resim.properties)
        if let h = baglam.heifRepresentation(of: son, format: .RGBA8, colorSpace: alan, options: [:]) { return h }
        return baglam.jpegRepresentation(of: son, colorSpace: alan, options: [:]) ?? veri
    }

    /// Videoya stil/LUT işler (yeniden kodlar); bitince yeni dosya, olmazsa özgün
    func videoyaGom(_ url: URL, bitti: @escaping (URL) -> Void) {
        guard gom, let r = renkLutu(), let f = r.uret().suzgec(renkAlani: CGColorSpace(name: CGColorSpace.itur_709)!) else { bitti(url); return }
        let varlik = AVURLAsset(url: url)
        Task {
            let kompozisyon: AVMutableVideoComposition
            do {
                kompozisyon = try await AVMutableVideoComposition.videoComposition(with: varlik) { istek in
                    let s = f.copy() as! CIFilter
                    s.setValue(istek.sourceImage.clampedToExtent(), forKey: kCIInputImageKey)
                    istek.finish(with: (s.outputImage ?? istek.sourceImage).cropped(to: istek.sourceImage.extent), context: nil)
                }
            } catch { bitti(url); return }
            // Yeniden kodlama HEVC (ProRes kaydı da HEVC'ye döner; özgün renkte ProRes için "Ekranda" seçilir)
            guard let disari = AVAssetExportSession(asset: varlik, presetName: AVAssetExportPresetHEVCHighestQuality) else { bitti(url); return }
            let hedef = FileManager.default.temporaryDirectory.appendingPathComponent("UPDATED-stil-\(Int(Date().timeIntervalSince1970)).mov")
            disari.videoComposition = kompozisyon
            disari.outputURL = hedef
            disari.outputFileType = .mov
            await MainActor.run { self.proIlerleme = "Stil işleniyor" }
            await disari.export()
            await MainActor.run { self.proIlerleme = nil }
            if disari.status == .completed { try? FileManager.default.removeItem(at: url); bitti(hedef) } else { bitti(url) }
        }
    }
}

/// Renk grubu → Stiller: hazır stiller, pad, yoğunluk, doygunluk, Ekranda / Kayda göm
struct StilPedi: View {
    @ObservedObject var kamera: Kamera

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            sira("TEMEL", HazirStil.temel)
            sira("FİLM REÇETELERİ", HazirStil.receteler)
            HStack(alignment: .top, spacing: 14) {
                VStack(spacing: 4) {
                    pad.frame(width: 140, height: 140)
                    HStack { Text("soğuk"); Spacer(); Text("ton ↕"); Spacer(); Text("sıcak") }
                        .font(.system(size: 10)).foregroundStyle(.white.opacity(0.6)).frame(width: 140)
                }
                VStack(alignment: .leading, spacing: 10) {
                    kaydirici("Yoğunluk", "\(Int(kamera.stil.yogunluk * 100))", deger: Binding(get: { kamera.stil.yogunluk }, set: { kamera.stil.yogunluk = $0 }), 0...1)
                    kaydirici("Doygunluk", String(format: "%+d", Int(kamera.stil.doygunluk * 100)), deger: Binding(get: { kamera.stil.doygunluk }, set: { kamera.stil.doygunluk = $0 }), -1...1)
                    Text("Uygula").font(.system(size: 11)).foregroundStyle(.white.opacity(0.75))
                    Picker("", selection: Binding(get: { kamera.stil.kaydaGom }, set: { kamera.stil.kaydaGom = $0 })) {
                        Text("Ekranda").tag(false)
                        Text("Kayda göm").tag(true)
                    }
                    .pickerStyle(.segmented)
                }
            }
            Text(kamera.stil.kaydaGom ? "Fotoğraf ve video bu renkle kaydedilir. Video kayıttan sonra işlenir ve HEVC olarak yazılır." : "Yalnız ekranda; kayıt özgün renkte kalır.")
                .font(.caption).foregroundStyle(Tema.metin2)
        }
        .pano()
    }

    /// Bir sıra stil kutusu; reçeteye basılı tutunca üst şeride sabitlenir (tek dokunuşla açılır)
    private func sira(_ baslik: String, _ liste: [HazirStil]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(baslik).font(.system(size: 11, weight: .semibold)).tracking(0.6).foregroundStyle(.white.opacity(0.55))
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(liste) { h in
                        let secili = kamera.stil.hazir == h
                        Button { kamera.stil.hazir = secili && h != .standart ? .standart : h } label: {
                            VStack(spacing: 4) {
                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                    .fill(LinearGradient(colors: h.renkler, startPoint: .topLeading, endPoint: .bottomTrailing))
                                    .frame(width: 56, height: 44)
                                    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(secili ? Tema.sari : .clear, lineWidth: 1.5))
                                Text(h.ad).font(.system(size: 11, weight: .medium)).lineLimit(1).fixedSize()
                                    .foregroundStyle(secili ? Tema.sari : .white.opacity(0.85))
                            }
                        }
                        .buttonStyle(.plain)
                        .contextMenu {
                            if !h.aciklama.isEmpty { Text(h.aciklama) }
                            Button { kamera.stil.hazir = h; if !kamera.favoriler.contains(.stil) { kamera.favoriAcKapa(.stil) } } label: {
                                Label("Seç ve üst şeride sabitle", systemImage: "pin")
                            }
                        }
                    }
                }
            }
        }
    }

    /// Dokun ya da sürükle; çift dokunuş ortaya döner
    private var pad: some View {
        GeometryReader { g in
            let w = g.size.width, h = g.size.height
            ZStack {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(LinearGradient(colors: [Color(white: 0.85), Color(white: 0.4), Color(white: 0.07)], startPoint: .top, endPoint: .bottom))
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(LinearGradient(colors: [Color(red: 0.3, green: 0.58, blue: 1).opacity(0.55), .clear, Color(red: 1, green: 0.58, blue: 0.24).opacity(0.6)], startPoint: .leading, endPoint: .trailing))
                Rectangle().fill(Color.white.opacity(0.25)).frame(width: 1)
                Rectangle().fill(Color.white.opacity(0.25)).frame(height: 1)
                Circle().fill(Tema.sari).frame(width: 20, height: 20)
                    .overlay(Circle().stroke(.white, lineWidth: 2.5))
                    .shadow(color: .black.opacity(0.6), radius: 3)
                    .position(x: CGFloat(kamera.stil.x + 1) / 2 * w, y: CGFloat(1 - kamera.stil.y) / 2 * h)
            }
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0).onChanged { d in
                kamera.stil.x = Float(min(max(d.location.x / w * 2 - 1, -1), 1))
                kamera.stil.y = Float(min(max(1 - d.location.y / h * 2, -1), 1))
            })
            .simultaneousGesture(TapGesture(count: 2).onEnded { kamera.stil.x = 0; kamera.stil.y = 0 })
        }
    }

    private func kaydirici(_ ad: String, _ yazi: String, deger: Binding<Float>, _ aralik: ClosedRange<Float>) -> some View {
        VStack(spacing: 2) {
            HStack { Text(ad); Spacer(); Text(yazi).monospacedDigit() }.font(.system(size: 11)).foregroundStyle(.white.opacity(0.75))
            Slider(value: deger, in: aralik).tint(Tema.sari)
        }
    }
}
