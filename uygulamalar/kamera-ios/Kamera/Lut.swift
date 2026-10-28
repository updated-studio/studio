import Foundation
import Metal

/// .cube LUT dosyası (Adobe/Resolve biçimi, 3D) — Android Lut.kt ile aynı okuma. Boyut en fazla 65; veri R en hızlı değişecek sırayla.
struct Lut {
    let ad: String
    let boyut: Int
    let veri: [Float]

    enum Hata: LocalizedError {
        case birBoyutlu, boyutYok, eksik(Int, Int)
        var errorDescription: String? {
            switch self {
            case .birBoyutlu: return "1D LUT desteklenmiyor; 3D .cube dosyası seç."
            case .boyutYok: return "LUT boyutu okunamadı (LUT_3D_SIZE)."
            case let .eksik(a, b): return "LUT verisi eksik: \(a) / \(b) satır."
            }
        }
    }

    static func oku(ad: String, metin: String) throws -> Lut {
        var boyut = 0
        var en: [Float] = [0, 0, 0], ust: [Float] = [1, 1, 1]
        var degerler: [Float] = []
        degerler.reserveCapacity(33 * 33 * 33 * 3)
        for ham in metin.split(whereSeparator: \.isNewline) {
            let s = ham.trimmingCharacters(in: .whitespaces)
            if s.isEmpty || s.hasPrefix("#") { continue }
            let p = s.split(whereSeparator: { $0 == " " || $0 == "\t" }).map(String.init)
            guard let ilk = p.first else { continue }
            switch ilk.uppercased() {
            case "LUT_3D_SIZE": boyut = Int(p.count > 1 ? p[1] : "") ?? 0
            case "LUT_1D_SIZE": throw Hata.birBoyutlu
            case "DOMAIN_MIN": if p.count >= 4 { en = p[1...3].map { Float($0) ?? 0 } }
            case "DOMAIN_MAX": if p.count >= 4 { ust = p[1...3].map { Float($0) ?? 1 } }
            default:
                if ilk.first?.isLetter == true { continue } // TITLE vb.
                if p.count >= 3, let r = Float(p[0]), let g = Float(p[1]), let b = Float(p[2]) {
                    degerler.append((r - en[0]) / (ust[0] - en[0]))
                    degerler.append((g - en[1]) / (ust[1] - en[1]))
                    degerler.append((b - en[2]) / (ust[2] - en[2]))
                }
            }
        }
        guard (2...65).contains(boyut) else { throw Hata.boyutYok }
        guard degerler.count == boyut * boyut * boyut * 3 else { throw Hata.eksik(degerler.count / 3, boyut * boyut * boyut) }
        return Lut(ad: ad, boyut: boyut, veri: degerler)
    }

    /// Boş (etkisiz) 2×2×2 LUT
    static let bos = Lut(ad: "", boyut: 2, veri: [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1])

    /// 3D doku (RGBA 16 bit kayan nokta: her GPU'da süzülebilir)
    func doku(_ aygit: MTLDevice) -> MTLTexture? {
        let t = MTLTextureDescriptor()
        t.textureType = .type3D
        t.pixelFormat = .rgba16Float
        t.width = boyut; t.height = boyut; t.depth = boyut
        t.usage = .shaderRead
        guard let d = aygit.makeTexture(descriptor: t) else { return nil }
        let n = boyut * boyut * boyut
        var yarim = [UInt16](repeating: 0, count: n * 4)
        for i in 0..<n {
            yarim[i * 4] = Lut.yarimKesir(veri[i * 3])
            yarim[i * 4 + 1] = Lut.yarimKesir(veri[i * 3 + 1])
            yarim[i * 4 + 2] = Lut.yarimKesir(veri[i * 3 + 2])
            yarim[i * 4 + 3] = 0x3C00
        }
        yarim.withUnsafeBytes { b in
            d.replace(region: MTLRegionMake3D(0, 0, 0, boyut, boyut, boyut), mipmapLevel: 0, slice: 0, withBytes: b.baseAddress!,
                      bytesPerRow: boyut * 8, bytesPerImage: boyut * boyut * 8)
        }
        return d
    }

    /// 32 bit kayan noktadan 16 bite (Float16 türü her mimaride yok)
    static func yarimKesir(_ f: Float) -> UInt16 {
        let b = f.bitPattern
        let isaret = UInt16((b >> 16) & 0x8000)
        var us = Int((b >> 23) & 0xFF) - 127 + 15
        var kesir = b & 0x7FFFFF
        if us <= 0 {
            if us < -10 { return isaret }
            kesir = (kesir | 0x800000) >> UInt32(1 - us)
            return isaret | UInt16(kesir >> 13)
        }
        if us >= 31 { return isaret | 0x7C00 }
        kesir += 0x1000
        if kesir & 0x800000 != 0 { kesir = 0; us += 1; if us >= 31 { return isaret | 0x7C00 } }
        return isaret | UInt16(us << 10) | UInt16(kesir >> 13)
    }

    /// Uygulamanın LUT kitaplığı (Belgeler/LUT)
    static var klasor: URL {
        let k = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("LUT", isDirectory: true)
        try? FileManager.default.createDirectory(at: k, withIntermediateDirectories: true)
        return k
    }

    static func kitaplik() -> [URL] {
        ((try? FileManager.default.contentsOfDirectory(at: klasor, includingPropertiesForKeys: nil)) ?? [])
            .filter { $0.pathExtension.lowercased() == "cube" }
            .sorted { $0.lastPathComponent.lowercased() < $1.lastPathComponent.lowercased() }
    }

    static func yukle(_ ad: String) -> Lut? {
        guard !ad.isEmpty, let m = try? String(contentsOf: klasor.appendingPathComponent(ad), encoding: .utf8) else { return nil }
        return try? oku(ad: ad, metin: m)
    }
}
