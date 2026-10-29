import Accelerate
import CoreVideo
import Vision

/// Akıllı kompozisyon yardımcısı (Fatih'in fikri): kamera karesinde yüz, yoksa hayvan, insan ya da en belirgin nesne bulunur;
/// konu kutusu (0–1, y aşağı) geri verilir. Telefonun içinde çalışır (Apple Vision), saniyede ~5 kez. Android'de ML Kit.
/// Aynı karenin küçük kopyasıyla kompozisyon analizi (Analiz.swift) ve sahne önerisi için renk ortalaması da burada.
final class Asistan {
    struct Konu { var kutu: CGRect; var ad: String; var yuz: YuzBilgi?; var secili = false }

    /// Kullanıcının seçtiği konu (karede 0–1, y aşağı): bulunan adaylardan bu noktayı içeren ya da en yakın olan izlenir,
    /// nokta her karede konunun ortasına taşınır. ~2,5 sn bulunamazsa seçim düşer (`konuKayboldu`).
    var hedef: CGPoint? { didSet { kayipSecili = 0 } }
    var konuKayboldu: () -> Void = {}
    private var kayipSecili = 0

    var konuAcik = false
    var analizAcik = false
    var renkAcik = false
    /// Ana iş parçacığında çağrılır
    var konuSonuc: (Konu?) -> Void = { _ in }
    var analizSonuc: (AnalizSonuc) -> Void = { _ in }
    var renkSonuc: ([Float]) -> Void = { _ in }

    private let kuyruk = DispatchQueue(label: "tr.com.updated.kamera.asistan", qos: .userInitiated)
    private var mesgul = false, analizMesgul = false
    private var sonKonu = Date.distantPast, sonAnaliz = Date.distantPast, sonRenk = Date.distantPast
    private var kayip = 0

    /// Kare kuyruğunda her kare için (yönü ekranla aynı, BGRA)
    func kare(_ pb: CVPixelBuffer) {
        let s = Date()
        if konuAcik, !mesgul, s.timeIntervalSince(sonKonu) >= 0.18 {
            sonKonu = s; mesgul = true
            kuyruk.async { [weak self] in self?.konuBul(pb) }
        }
        let analiz = analizAcik && !analizMesgul && s.timeIntervalSince(sonAnaliz) >= 0.32
        let renk = renkAcik && s.timeIntervalSince(sonRenk) >= 0.5
        guard analiz || renk, let (p, w, h) = Asistan.kucult(pb, en: 256) else { return }
        if renk {
            sonRenk = s
            var r = 0, g = 0, b = 0, n = 0, i = 0
            while i + 2 < p.count { b += Int(p[i]); g += Int(p[i + 1]); r += Int(p[i + 2]); n += 1; i += 32 }
            if n > 0 { let o = [Float(r), Float(g), Float(b)].map { $0 / (255 * Float(n)) }; DispatchQueue.main.async { self.renkSonuc(o) } }
        }
        if analiz {
            sonAnaliz = s; analizMesgul = true
            let oran = Float(CVPixelBufferGetWidth(pb)) / Float(CVPixelBufferGetHeight(pb))
            kuyruk.async { [weak self] in
                let sonuc = GoruntuAnaliz.hesapla(p, w: w, h: h, oran: oran)
                DispatchQueue.main.async { self?.analizMesgul = false; self?.analizSonuc(sonuc) }
            }
        }
    }

    private func konuBul(_ pb: CVPixelBuffer) {
        if let h = hedef { konuIzle(pb, hedef: h); return }
        let yuzIstek = VNDetectFaceLandmarksRequest()
        let hayvanIstek = VNRecognizeAnimalsRequest()
        let insanIstek = VNDetectHumanRectanglesRequest()
        let belirgin = VNGenerateObjectnessBasedSaliencyImageRequest()
        let el = VNImageRequestHandler(cvPixelBuffer: pb, orientation: .up)
        var bulunan: Konu?
        if (try? el.perform([yuzIstek])) != nil, let f = yuzIstek.results?.max(by: { Asistan.alan($0.boundingBox) < Asistan.alan($1.boundingBox) }) {
            let k = Asistan.ustten(f.boundingBox)
            // Göz hizası (iki gözün ortalaması) ve başın dönüşü: portre ipuçları
            var gozY: CGFloat?
            let gozler = [f.landmarks?.leftEye, f.landmarks?.rightEye].compactMap { $0 }
            if !gozler.isEmpty {
                let ort = gozler.map { g in g.normalizedPoints.map { CGFloat($0.y) }.reduce(0, +) / CGFloat(max(1, g.pointCount)) }.reduce(0, +) / CGFloat(gozler.count)
                gozY = 1 - (f.boundingBox.minY + ort * f.boundingBox.height)
            }
            let donus = CGFloat(f.yaw?.doubleValue ?? 0) * 180 / .pi
            bulunan = Konu(kutu: k, ad: "Yüz", yuz: YuzBilgi(gozY: gozY, donus: donus))
        } else if (try? el.perform([hayvanIstek])) != nil, let a = hayvanIstek.results?.max(by: { Asistan.alan($0.boundingBox) < Asistan.alan($1.boundingBox) }) {
            let ad = a.labels.first?.identifier == VNAnimalIdentifier.cat.rawValue ? "Kedi" : (a.labels.first?.identifier == VNAnimalIdentifier.dog.rawValue ? "Köpek" : "Hayvan")
            bulunan = Konu(kutu: Asistan.ustten(a.boundingBox), ad: ad, yuz: nil)
        } else if (try? el.perform([insanIstek])) != nil, let i = insanIstek.results?.max(by: { Asistan.alan($0.boundingBox) < Asistan.alan($1.boundingBox) }) {
            bulunan = Konu(kutu: Asistan.ustten(i.boundingBox), ad: "İnsan", yuz: nil)
        } else if (try? el.perform([belirgin])) != nil, let o = (belirgin.results?.first?.salientObjects ?? []).max(by: { Asistan.alan($0.boundingBox) < Asistan.alan($1.boundingBox) }),
                  Asistan.alan(o.boundingBox) < 0.7 {
            bulunan = Konu(kutu: Asistan.ustten(o.boundingBox), ad: "Konu", yuz: nil)
        }
        DispatchQueue.main.async {
            self.mesgul = false
            // Konu birkaç kare kaybolunca kutu silinir (titreme olmasın)
            if let b = bulunan { self.kayip = 0; self.konuSonuc(b) } else { self.kayip += 1; if self.kayip >= 4 { self.konuSonuc(nil) } }
        }
    }

    /// Seçili konu: tüm algılayıcılar birlikte çalışır, hedefe en yakın aday seçilir
    private func konuIzle(_ pb: CVPixelBuffer, hedef h: CGPoint) {
        let yuzIstek = VNDetectFaceLandmarksRequest(), hayvanIstek = VNRecognizeAnimalsRequest()
        let insanIstek = VNDetectHumanRectanglesRequest(), belirgin = VNGenerateObjectnessBasedSaliencyImageRequest()
        let el = VNImageRequestHandler(cvPixelBuffer: pb, orientation: .up)
        try? el.perform([yuzIstek, hayvanIstek, insanIstek, belirgin])
        var adaylar: [Konu] = []
        for f in yuzIstek.results ?? [] {
            var gozY: CGFloat?
            let gozler = [f.landmarks?.leftEye, f.landmarks?.rightEye].compactMap { $0 }
            if !gozler.isEmpty {
                let ort = gozler.map { g in g.normalizedPoints.map { CGFloat($0.y) }.reduce(0, +) / CGFloat(max(1, g.pointCount)) }.reduce(0, +) / CGFloat(gozler.count)
                gozY = 1 - (f.boundingBox.minY + ort * f.boundingBox.height)
            }
            adaylar.append(Konu(kutu: Asistan.ustten(f.boundingBox), ad: "Yüz", yuz: YuzBilgi(gozY: gozY, donus: CGFloat(f.yaw?.doubleValue ?? 0) * 180 / .pi), secili: true))
        }
        for a in hayvanIstek.results ?? [] {
            let ad = a.labels.first?.identifier == VNAnimalIdentifier.cat.rawValue ? "Kedi" : (a.labels.first?.identifier == VNAnimalIdentifier.dog.rawValue ? "Köpek" : "Hayvan")
            adaylar.append(Konu(kutu: Asistan.ustten(a.boundingBox), ad: ad, yuz: nil, secili: true))
        }
        for i in insanIstek.results ?? [] { adaylar.append(Konu(kutu: Asistan.ustten(i.boundingBox), ad: "İnsan", yuz: nil, secili: true)) }
        for o in belirgin.results?.first?.salientObjects ?? [] where Asistan.alan(o.boundingBox) < 0.7 {
            adaylar.append(Konu(kutu: Asistan.ustten(o.boundingBox), ad: "Konu", yuz: nil, secili: true))
        }
        // Hedefi içeren en küçük kutu (yüz, insanın içinde: yüz kazanır); yoksa ortası 0,2'den yakın olan
        let iceren = adaylar.filter { $0.kutu.insetBy(dx: -0.02, dy: -0.02).contains(h) }.min { Asistan.alan($0.kutu) < Asistan.alan($1.kutu) }
        let yakin = adaylar.min { hypot($0.kutu.midX - h.x, $0.kutu.midY - h.y) < hypot($1.kutu.midX - h.x, $1.kutu.midY - h.y) }
        let secim = iceren ?? yakin.flatMap { hypot($0.kutu.midX - h.x, $0.kutu.midY - h.y) < 0.2 ? $0 : nil }
        DispatchQueue.main.async {
            self.mesgul = false
            guard self.hedef != nil else { return }
            if let k = secim {
                self.hedef = CGPoint(x: k.kutu.midX, y: k.kutu.midY)
                self.konuSonuc(k)
            } else {
                self.kayipSecili += 1
                if self.kayipSecili >= 12 { self.hedef = nil; self.konuSonuc(nil); self.konuKayboldu() }
            }
        }
    }

    private static func alan(_ r: CGRect) -> CGFloat { r.width * r.height }
    /// Vision'ın alttan üste koordinatı → üstten alta, 0–1 içinde
    private static func ustten(_ r: CGRect) -> CGRect {
        CGRect(x: r.minX, y: 1 - r.maxY, width: r.width, height: r.height).intersection(CGRect(x: 0, y: 0, width: 1, height: 1))
    }

    /// BGRA karenin küçük kopyası (en `en` piksel genişlik, oran korunur)
    static func kucult(_ pb: CVPixelBuffer, en: Int) -> ([UInt8], Int, Int)? {
        guard CVPixelBufferGetPixelFormatType(pb) == kCVPixelFormatType_32BGRA else { return nil }
        CVPixelBufferLockBaseAddress(pb, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pb, .readOnly) }
        guard let taban = CVPixelBufferGetBaseAddress(pb) else { return nil }
        let W = CVPixelBufferGetWidth(pb), H = CVPixelBufferGetHeight(pb)
        let w = min(en, W), h = max(8, Int((Double(H) * Double(w) / Double(W)).rounded()))
        var kaynak = vImage_Buffer(data: taban, height: vImagePixelCount(H), width: vImagePixelCount(W), rowBytes: CVPixelBufferGetBytesPerRow(pb))
        var cikti = [UInt8](repeating: 0, count: w * h * 4)
        let hata = cikti.withUnsafeMutableBytes { p -> vImage_Error in
            var hedef = vImage_Buffer(data: p.baseAddress, height: vImagePixelCount(h), width: vImagePixelCount(w), rowBytes: w * 4)
            return vImageScale_ARGB8888(&kaynak, &hedef, nil, vImage_Flags(kvImageNoFlags))
        }
        return hata == kvImageNoError ? (cikti, w, h) : nil
    }
}

/// Sahneler (Android Sahne.kt): otomatik sahne önerisi. Telefon uzun pozlamayı veremiyorsa PRO MODLAR'daki birleştirme kullanılır.
enum Sahne: String, Equatable {
    case samanyolu, gece, gunBatimi, portre
    var ad: String {
        switch self {
        case .samanyolu: return "Samanyolu"
        case .gece: return "Gece"
        case .gunBatimi: return "Gün batımı"
        case .portre: return "Portre"
        }
    }

    /// Ölçümlere göre sahne önerir; emin değilse nil. Eşikler: gün ışığı ≈ 0,1 · iç mekân ≈ 10 · gece ≥ 60 (ISO × saniye)
    static func oner(isoSaniye: Float?, yukariBakiyor: Bool, ortParlak: Float, kirmiziMavi: Float, buyukYuz: Bool) -> Sahne? {
        guard let e = isoSaniye else { return nil }
        if e >= 60 && yukariBakiyor { return .samanyolu }
        if e >= 60 { return .gece }
        if buyukYuz { return .portre }
        if e < 20 && kirmiziMavi > 1.35 && ortParlak >= 0.15 && ortParlak <= 0.7 { return .gunBatimi }
        return nil
    }
}
