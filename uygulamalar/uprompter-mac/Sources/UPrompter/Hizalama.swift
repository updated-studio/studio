import Foundation

/// Metni prompter parçalarına ayırır: kelimeler, [köşeli parantez] işaretleri, okunmayan noktalama.
struct Parca {
    enum Tur { case kelime, isaret, duz }
    let tur: Tur
    let metin: String
    let paragrafBasi: Bool
}

struct Ayrisim {
    var kimlik = UUID()
    var parcalar: [Parca]
    /// Yalnız kelimelerin sadeleştirilmiş hâli; sırası parcalar içindeki kelimelerle aynı.
    var tokenlar: [String]

    static let bos = Ayrisim(parcalar: [], tokenlar: [])

    private static let desen = try! NSRegularExpression(pattern: "\\[[^\\]]*\\]|[^\\s\\[]+")

    static func ayir(_ govde: String) -> Ayrisim {
        var paragraflar: [String] = []
        var simdiki: [String] = []
        for satir in govde.replacingOccurrences(of: "\r", with: "").components(separatedBy: "\n") {
            if satir.trimmingCharacters(in: .whitespaces).isEmpty {
                if !simdiki.isEmpty { paragraflar.append(simdiki.joined(separator: " ")); simdiki = [] }
            } else {
                simdiki.append(satir)
            }
        }
        if !simdiki.isEmpty { paragraflar.append(simdiki.joined(separator: " ")) }

        var parcalar: [Parca] = []
        var tokenlar: [String] = []
        for p in paragraflar {
            let ns = p as NSString
            var ilk = true
            for m in desen.matches(in: p, range: NSRange(location: 0, length: ns.length)) {
                let s = ns.substring(with: m.range)
                if s.hasPrefix("[") {
                    let ic = String(s.dropFirst().dropLast()).trimmingCharacters(in: .whitespaces)
                    parcalar.append(Parca(tur: .isaret, metin: ic.isEmpty ? "…" : ic, paragrafBasi: ilk))
                } else {
                    let n = Hizalama.norm(s)
                    if n.isEmpty {
                        parcalar.append(Parca(tur: .duz, metin: s, paragrafBasi: ilk))
                    } else {
                        parcalar.append(Parca(tur: .kelime, metin: s, paragrafBasi: ilk))
                        tokenlar.append(n)
                    }
                }
                ilk = false
            }
        }
        return Ayrisim(parcalar: parcalar, tokenlar: tokenlar)
    }
}

/// Söylenen kelimeleri metindeki kelimelerle eşleştirir (tarayıcı denemesindeki algoritmanın aynısı).
enum Hizalama {
    private static let katla: [Character: Character] = [
        "ç": "c", "ğ": "g", "ı": "i", "ö": "o", "ş": "s", "ü": "u", "â": "a", "î": "i", "û": "u",
    ]
    private static let tr = Locale(identifier: "tr_TR")

    static func norm(_ s: String) -> String {
        var sonuc = ""
        for c in s.lowercased(with: tr) {
            let k = katla[c] ?? c
            if k.isLetter || k.isNumber { sonuc.append(k) }
        }
        return sonuc
    }

    static func benzer(_ a: String, _ b: String) -> Bool {
        if a == b { return true }
        let x = Array(a.unicodeScalars), y = Array(b.unicodeScalars)
        let k = min(x.count, y.count)
        if k < 4 { return false }
        var i = 0
        while i < k && x[i] == y[i] { i += 1 }
        // Türkçe ekler: izlenimleri / izlenimlerini
        if i >= max(4, Int((Double(k) * 0.7).rounded(.up))) { return true }
        if k >= 5 && abs(x.count - y.count) <= 1 && lev(x, y) <= 1 { return true }
        return false
    }

    static func lev(_ a: [Unicode.Scalar], _ b: [Unicode.Scalar]) -> Int {
        if a.isEmpty { return b.count }
        if b.isEmpty { return a.count }
        var d = Array(0...b.count)
        for i in 1...a.count {
            var onceki = d[0]
            d[0] = i
            for j in 1...b.count {
                let t = d[j]
                d[j] = min(d[j] + 1, d[j - 1] + 1, onceki + (a[i - 1] == b[j - 1] ? 0 : 1))
                onceki = t
            }
        }
        return d[b.count]
    }

    /// `taban` konumundan başlayarak söylenenleri (ilk `atla` tanesi hariç) metinde ileri doğru arar.
    static func hizala(_ soylenen: [String], tokenlar: [String], taban: Int, atla: Int) -> Int {
        var p = taban
        var i = max(0, atla)
        while i < soylenen.count {
            let w = norm(soylenen[i])
            i += 1
            if w.isEmpty { continue }
            let pencere = w.count <= 3 ? 3 : 10
            var j = p
            let son = min(p + pencere, tokenlar.count)
            while j < son {
                if benzer(w, tokenlar[j]) { p = j + 1; break }
                j += 1
            }
        }
        return p
    }
}
