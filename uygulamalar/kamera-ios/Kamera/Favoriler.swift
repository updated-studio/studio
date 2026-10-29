import SwiftUI

/// Sabitlenenler (Fatih 29 Ekim, iOS 27 Kamera'daki gibi): sık kullanılan ayarlar görüntünün üstünde kısayol olarak durur.
/// Aç/kapa olanlar dokununca değişir; değer seçilenler yalnız kendi küçük panelini açar. En çok 6; Genel Ayarlar → Sabitlenenler'den
/// raptiyeyle eklenir, sürükleyerek sıralanır; menülerde basılı tutup "Sabitle" de olur.
/// Fatih'in iOS 27 ekran görüntüleri: üstte kısayollar (KisayolOge), "⋯" Denetimler ızgarası (DenetimDaire) ve sol üstte "Düzenle";
/// düzenlemede üstte ⊖ rozetli kısayollar, altta "KAMERA DENETİMLERİNİ EKLE", Vazgeç / Bitti, Temel Ayarlara Sıfırla (AnaEkran).
/// Değer satıra sığıyorsa merceklerin yerinde tek satır (FavoriSatir), sığmıyorsa küçük panel (FavoriPanel). Anahtar adları Android'le aynı (PARITE.md).
enum Favori: String, CaseIterable, Identifiable, Codable {
    case iso, enst, bd, ev, odak, cozunurluk, kodek, renk, sabitleme, stil, lut
    case zebra, falseColor, peaking, histogram, monokrom, flas, zamanlayici, kilavuz, terazi, yardimci, ses
    var id: String { rawValue }

    static let enCok = 6
    static let varsayilan: [Favori] = [.iso, .enst, .bd, .zebra]

    var ad: String {
        switch self {
        case .iso: return "ISO"
        case .enst: return "Enstantane / açı"
        case .bd: return "Beyaz denge"
        case .ev: return "Pozlama telafisi"
        case .odak: return "Odak"
        case .cozunurluk: return "Çözünürlük"
        case .kodek: return "Kodek"
        case .renk: return "SDR / HDR / Log"
        case .sabitleme: return "Sabitleme"
        case .stil: return "Stil"
        case .lut: return "LUT"
        case .zebra: return "Zebra"
        case .falseColor: return "False color"
        case .peaking: return "Odak vurgusu"
        case .histogram: return "Histogram"
        case .monokrom: return "Siyah-beyaz"
        case .flas: return "Flaş / fener"
        case .zamanlayici: return "Zamanlayıcı"
        case .kilavuz: return "Kılavuz"
        case .terazi: return "Terazi"
        case .yardimci: return "AI Kadraj"
        case .ses: return "Ses girişi"
        }
    }

    var simge: String {
        switch self {
        case .iso: return "camera.aperture"
        case .enst: return "timer"
        case .bd: return "thermometer.sun"
        case .ev: return "plusminus.circle"
        case .odak: return "scope"
        case .cozunurluk: return "square.resize"
        case .kodek: return "film"
        case .renk: return "sun.max"
        case .sabitleme: return "hand.raised"
        case .stil: return "camera.filters"
        case .lut: return "cube"
        case .zebra: return "line.diagonal"
        case .falseColor: return "paintpalette"
        case .peaking: return "viewfinder"
        case .histogram: return "chart.bar.xaxis"
        case .monokrom: return "circle.lefthalf.filled"
        case .flas: return "bolt"
        case .zamanlayici: return "timer.circle"
        case .kilavuz: return "squareshape.split.3x3"
        case .terazi: return "level"
        case .yardimci: return "sparkles"
        case .ses: return "mic"
        }
    }

    var renk: Color {
        switch self {
        case .iso: return .orange
        case .enst: return .yellow
        case .bd, .stil: return .pink
        case .ev, .odak: return .blue
        case .cozunurluk, .kodek, .renk, .sabitleme: return .indigo
        case .lut: return .purple
        case .zebra, .falseColor, .peaking, .histogram, .monokrom: return .green
        case .flas, .zamanlayici: return .brown
        case .kilavuz, .terazi, .yardimci: return .teal
        case .ses: return .gray
        }
    }

    /// Dokununca hemen açılıp kapanan (panel açmayan)
    var anahtar: Bool {
        switch self {
        case .zebra, .falseColor, .peaking, .histogram, .monokrom, .flas, .zamanlayici, .terazi, .yardimci: return true
        default: return false
        }
    }
}

extension Kamera {
    func favoriAcKapa(_ f: Favori) {
        if let i = favoriler.firstIndex(of: f) { favoriler.remove(at: i); return }
        guard favoriler.count < Favori.enCok else { bildirim = "En çok \(Favori.enCok) ayar sabitlenebilir."; return }
        favoriler.append(f)
    }

    /// Kapsülde görünen değer ve "değişmiş mi" (sarı)
    func favoriDeger(_ f: Favori) -> (yazi: String, etkin: Bool) {
        switch f {
        case .iso: return (secilenIso.map { "\(Int($0))" } ?? "Oto", secilenIso != nil)
        case .enst: return (secilenEnst.map { enstGoster($0) } ?? "Oto", secilenEnst != nil)
        case .bd: return (bd.map { "\(Int($0))K" } ?? "Oto", bd != nil)
        case .ev: return (Cetvel.evYazi(ev), abs(ev) >= 0.05)
        case .odak: return (odakKonum == nil ? "Oto" : "MF", odakKonum != nil)
        case .cozunurluk: return (cozunurluk.components(separatedBy: " · ").prefix(2).joined(separator: " "), false)
        case .kodek: return (kodek.kisa, kodek.prores)
        case .renk: return (renkModu.kisa, renkModu != .sdr)
        case .sabitleme: return (sabitleme.ad, false)
        case .stil: return (stil.etkin ? (stil.hazir == .standart ? "Özel" : stil.hazir.ad) : "Kapalı", stil.etkin)
        case .lut: return (gosterge.lutAcik ? gosterge.lutAdi.replacingOccurrences(of: ".cube", with: "") : "Kapalı", gosterge.lutAcik)
        case .zebra: return ("", gosterge.zebra)
        case .falseColor: return ("", gosterge.falseColor)
        case .peaking: return ("", gosterge.peaking)
        case .histogram: return ("", histogram)
        case .monokrom: return ("", gosterge.monokrom)
        case .flas: return (["Kapalı", "Oto", "Açık", "Fener"][flas.rawValue], flas != .kapali)
        case .zamanlayici: return (zamanlayici == 0 ? "Kapalı" : "\(zamanlayici) sn", zamanlayici > 0)
        case .kilavuz: return (kompTur == .kapali ? "Kapalı" : kompTur.ad, kompTur != .kapali)
        case .terazi: return ("", teraziAcik)
        case .yardimci: return ("", asistanAcik)
        case .ses: return (etkinSesGirdi ?? "Mikrofon", harici)
        }
    }

    /// Aç/kapa türü favoriye dokununca
    func favoriDegistir(_ f: Favori) {
        switch f {
        case .zebra: gosterge.zebra.toggle()
        case .falseColor: gosterge.falseColor.toggle()
        case .peaking: gosterge.peaking.toggle()
        case .histogram: histogram.toggle()
        case .monokrom: gosterge.monokrom.toggle()
        case .flas: flasDegistir()
        case .zamanlayici: zamanlayici = zamanlayici == 0 ? 3 : (zamanlayici == 3 ? 10 : 0)
        case .terazi: teraziAcik.toggle()
        case .yardimci: asistanAcik.toggle()
        default: break
        }
    }
}

/// Okuma şeridinin altındaki sabitlenen ayar: küçük kapsül, değeri (ya da adı) yazar; elle değişmişse sarı
struct SabitKapsul: View {
    let f: Favori
    @ObservedObject var kamera: Kamera

    var body: some View {
        let d = kamera.favoriDeger(f)
        let yazi = d.yazi.isEmpty || d.yazi == "Kapalı" ? FavoriSatir.baslik(f).capitalized(with: Locale(identifier: "tr")) : d.yazi
        HStack(spacing: 4) {
            if d.yazi.isEmpty { Image(systemName: f.simge).font(.system(size: 10, weight: .semibold)) }
            Text(yazi).font(.system(size: 11, weight: .semibold).monospacedDigit()).tracking(0.3).lineLimit(1)
        }
        .foregroundStyle(d.etkin ? Tema.sari : Tema.ikincil)
        .padding(.horizontal, 9).frame(height: 24)
        .yuzey(12)
        .overlay(Capsule().strokeBorder(d.etkin ? Tema.sari.opacity(0.5) : .clear, lineWidth: 0.5))
    }
}

/// Üst satırdaki bir kısayol (Apple Kamera'daki gibi): aç/kapa olanlar simge, değer türleri ayarlanmışsa iki satır değer
struct KisayolOge: View {
    let f: Favori
    @ObservedObject var kamera: Kamera

    var body: some View {
        let d = kamera.favoriDeger(f)
        Group {
            if let iki = ikiSatir, d.etkin {
                VStack(spacing: 0) {
                    Text(iki.0).font(.system(size: 17, weight: .semibold, design: .rounded))
                    Text(iki.1).font(.system(size: 10, weight: .bold, design: .rounded))
                }
            } else {
                Image(systemName: f.simge).font(.system(size: 17, weight: .medium)).frame(height: 32)
            }
        }
        .foregroundStyle(d.etkin ? Tema.sari : .white)
        .frame(minWidth: 30)
    }

    private var ikiSatir: (String, String)? {
        let k = kamera
        switch f {
        case .iso: return k.secilenIso.map { ("\(Int($0))", "ISO") }
        case .enst: return k.secilenEnst.map { (k.enstGoster($0), k.mod == .video && k.enstAci ? "AÇI" : "S") }
        case .bd: return k.bd.map { ("\(Int($0))", "K") }
        case .ev: return (Cetvel.evYazi(k.ev), "EV")
        case .kodek: return (k.kodek.kisa, k.kodek.prores ? "PRORES" : "KODEK")
        case .renk: return (k.renkModu.kisa, "")
        default: return nil
        }
    }
}

/// "⋯" Denetimler ızgarasındaki daire (Apple Kamera: koyu daire + altında büyük harf etiket)
struct DenetimDaire: View {
    let f: Favori
    @ObservedObject var kamera: Kamera
    var kucuk = false
    var soluk = false

    var body: some View {
        let d = kamera.favoriDeger(f)
        let cap: CGFloat = kucuk ? 44 : 60
        VStack(spacing: kucuk ? 6 : 8) {
            ZStack {
                Circle().fill(Color.black.opacity(0.45))
                if let ic = icYazi {
                    VStack(spacing: 0) {
                        Text(ic.0).font(.system(size: kucuk ? 13 : 16, weight: .semibold, design: .rounded))
                        Text(ic.1).font(.system(size: kucuk ? 9 : 11, weight: .semibold, design: .rounded))
                    }
                } else {
                    Image(systemName: f.simge).font(.system(size: kucuk ? 17 : 22, weight: .regular))
                }
            }
            .frame(width: cap, height: cap)
            .foregroundStyle(d.etkin ? Tema.sari : .white)
            Text(FavoriSatir.baslik(f)).font(.system(size: kucuk ? 10 : 11, weight: .medium)).tracking(0.8)
                .lineLimit(1).minimumScaleFactor(0.7)
        }
        .opacity(soluk ? 0.4 : 1)
    }

    private var icYazi: (String, String)? {
        let k = kamera
        switch f {
        case .cozunurluk:
            let p = k.cozunurluk.components(separatedBy: " · ")
            return (p.first ?? "", p.dropFirst().first ?? "")
        case .ev: return (Cetvel.evYazi(k.ev), "EV")
        case .iso: return k.secilenIso.map { ("\(Int($0))", "ISO") }
        case .enst: return k.secilenEnst.map { (k.enstGoster($0), "S") }
        case .bd: return k.bd.map { ("\(Int($0))", "K") }
        case .kodek: return (k.kodek.kisa, "")
        case .renk: return (k.renkModu.kisa, "")
        default: return nil
        }
    }
}

/// Simgeye dokununca merceklerin yerinde açılan tek satır (Apple Kamera BİÇİM satırı gibi). nil = satıra sığmayan ayar, panel açılır.
struct FavoriSatir: View {
    let f: Favori
    @ObservedObject var kamera: Kamera

    /// Izgaradaki büyük harf etiket (kısa)
    static func baslik(_ f: Favori) -> String {
        let kisa: String
        switch f {
        case .enst: kisa = "Enstantane"
        case .bd: kisa = "Beyaz denge"
        case .ev: kisa = "Pozlama"
        case .cozunurluk: kisa = "Biçim"
        case .renk: kisa = "Renk"
        case .peaking: kisa = "Odak vurgusu"
        case .flas: kisa = "Flaş"
        case .zamanlayici: kisa = "Sayaç"
        case .yardimci: kisa = "AI Kadraj"
        case .ses: kisa = "Ses"
        case .stil: kisa = "Stiller"
        default: kisa = f.ad
        }
        return kisa.uppercased(with: Locale(identifier: "tr"))
    }

    static func satirli(_ f: Favori) -> Bool {
        switch f {
        case .iso, .enst, .ev, .bd, .kodek, .renk, .sabitleme, .lut, .odak: return true
        default: return false
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(FavoriSatir.baslik(f)).font(.system(size: 11, weight: .semibold)).tracking(0.8).foregroundStyle(.white.opacity(0.75))
                Spacer()
                if let oto = otoYap {
                    Button("AUTO", action: oto).font(.system(size: 11, weight: .semibold)).foregroundStyle(otoSecili ? Tema.sari : .white.opacity(0.75))
                }
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 20) {
                    ForEach(Array(secenekler.enumerated()), id: \.offset) { _, s in
                        Button(action: s.2) {
                            HStack(spacing: 4) {
                                if s.1 { Circle().fill(Tema.sari).frame(width: 5, height: 5) }
                                Text(s.0).font(.system(size: 17, weight: .semibold, design: .rounded))
                            }
                            .foregroundStyle(s.1 ? Tema.sari : .white)
                            .frame(minHeight: 36)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .padding(.horizontal, 18)
        .shadow(color: .black.opacity(0.5), radius: 3)
    }

    private var otoSecili: Bool {
        switch f {
        case .iso: return kamera.secilenIso == nil
        case .enst: return kamera.secilenEnst == nil
        case .bd: return kamera.bd == nil
        case .ev: return abs(kamera.ev) < 0.05
        case .odak: return kamera.odakKonum == nil
        default: return false
        }
    }

    private var otoYap: (() -> Void)? {
        switch f {
        case .iso: return { kamera.isoSec(nil) }
        case .enst: return { kamera.enstSec(nil) }
        case .bd: return { kamera.bdSec(nil) }
        case .ev: return { kamera.evSec(0) }
        case .odak: return { kamera.odakSerbest() }
        default: return nil
        }
    }

    private var secenekler: [(String, Bool, () -> Void)] {
        let k = kamera
        switch f {
        case .iso:
            return k.isoDegerleri.map { i in ("\(Int(i))", k.secilenIso == i, { k.isoSec(i) }) }
        case .enst:
            let l = k.mod == .video ? k.videoEnstSecenekleri : (k.mod == .foto ? Cetvel.enstler : [])
            return l.map { e in (k.enstGoster(e), k.secilenEnst.map { abs($0 - e) < 1e-7 } ?? false, { k.enstSec(e) }) }
        case .ev:
            return stride(from: k.evAralik.lowerBound, through: k.evAralik.upperBound + 0.001, by: 1.0 / 3).map { v in
                let r = (v * 3).rounded() / 3
                return (Cetvel.evYazi(r), abs(k.ev - r) < 0.05, { k.evSec(r) })
            }
        case .bd:
            return Cetvel.bdler.compactMap { b in b.0.map { kel in (b.1, k.bd == kel, { k.bdSec(kel) }) } }
        case .odak:
            return [("Sonsuz", (k.odakKonum ?? 0) >= 0.99, { k.odakSec(1) }), ("Uzak", abs((k.odakKonum ?? -1) - 0.8) < 0.01, { k.odakSec(0.8) }),
                    ("Orta", abs((k.odakKonum ?? -1) - 0.5) < 0.01, { k.odakSec(0.5) }), ("Yakın", abs((k.odakKonum ?? -1) - 0.15) < 0.01, { k.odakSec(0.15) })]
        case .kodek:
            return Kodek.allCases.filter { k.kodekler.contains($0) }.map { c in (c.prores ? "ProRes \(c.kisa)" : c.kisa, k.kodek == c, { k.kodek = c }) }
        case .renk:
            return k.renkModlari.map { r in (r.kisa, k.renkModu == r, { k.renkModu = r }) }
        case .sabitleme:
            return k.sabitlemeler.map { s in (s.ad, k.sabitleme == s, { k.sabitleme = s }) }
        case .lut:
            return [("Kapalı", !k.gosterge.lutAcik, { k.gosterge.lutAcik = false })] + Lut.kitaplik().map(\.lastPathComponent).map { ad in
                (ad.replacingOccurrences(of: ".cube", with: ""), k.gosterge.lutAcik && k.gosterge.lutAdi == ad, { k.gosterge.lutAdi = ad; k.gosterge.lutAcik = true })
            }
        default: return []
        }
    }
}

/// Bir favorinin küçük paneli (yalnız o ayar)
struct FavoriPanel: View {
    let f: Favori
    @ObservedObject var kamera: Kamera

    var body: some View {
        switch f {
        case .iso:
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    Secenek(yazi: "AUTO", secili: kamera.secilenIso == nil) { kamera.isoSec(nil) }
                    ForEach(kamera.isoDegerleri, id: \.self) { i in
                        let baz = i == kamera.bazIso
                        Secenek(yazi: "\(Int(i))", alt: baz ? "baz" : nil, secili: kamera.secilenIso == i, baz: baz) { kamera.isoSec(i) }
                    }
                }
            }
        case .enst:
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    Secenek(yazi: "AUTO", secili: kamera.secilenEnst == nil) { kamera.enstSec(nil) }
                    ForEach(kamera.mod == .video ? kamera.videoEnstSecenekleri : (kamera.mod == .foto ? Cetvel.enstler : []), id: \.self) { e in
                        Secenek(yazi: kamera.enstGoster(e), secili: kamera.secilenEnst.map { abs($0 - e) < 1e-7 } ?? false) { kamera.enstSec(e) }
                    }
                }
            }
        case .bd, .ev, .odak: Cetvel(tur: f == .bd ? .bd : (f == .ev ? .poz : .odak), kamera: kamera)
        case .cozunurluk: BicimPanel(kamera: kamera)
        case .kodek, .renk, .sabitleme: KayitHizli(kamera: kamera)
        case .stil: StilPedi(kamera: kamera)
        case .lut, .zebra, .falseColor, .peaking, .histogram, .monokrom: GostergeMenu(kamera: kamera)
        case .kilavuz: KilavuzMenu(kamera: kamera)
        case .ses: SesHizli(kamera: kamera)
        case .flas, .zamanlayici, .terazi, .yardimci: EmptyView()
        }
    }
}

/// Genel Ayarlar → Sabitlenenler (Apple listesi gibi): üstte sabitlenenler (sürükle sırala), altta diğerleri (raptiyeyle ekle)
struct FavoriDuzenle: View {
    @ObservedObject var kamera: Kamera

    var body: some View {
        List {
            Section {
                ForEach(kamera.favoriler) { f in satir(f, sabit: true) }
                    .onMove { kamera.favoriler.move(fromOffsets: $0, toOffset: $1) }
                    .onDelete { kamera.favoriler.remove(atOffsets: $0) }
                if kamera.favoriler.isEmpty { Text("Henüz sabitlenen yok").foregroundStyle(.secondary) }
            } header: { Text("Kamera ekranında · sürükleyerek sırala") } footer: { Text("En çok \(Favori.enCok) ayar. Yan tutuşta sol kenarda dikey sıralanır.") }
            Section {
                ForEach(Favori.allCases.filter { !kamera.favoriler.contains($0) }) { f in satir(f, sabit: false) }
            } header: { Text("Diğer özellikler") } footer: { Text("Menülerde bir ayara basılı tutup \"Sabitle\" de diyebilirsin.") }
        }
        .environment(\.editMode, .constant(.active))
        .navigationTitle("Sabitlenenler")
    }

    private func satir(_ f: Favori, sabit: Bool) -> some View {
        HStack(spacing: 12) {
            Image(systemName: f.simge).font(.system(size: 13, weight: .medium)).foregroundStyle(.white)
                .frame(width: 28, height: 28).background(RoundedRectangle(cornerRadius: 7, style: .continuous).fill(f.renk.gradient))
            Text(f.ad)
            Spacer()
            Button { withAnimation { kamera.favoriAcKapa(f) } } label: {
                Image(systemName: sabit ? "pin.fill" : "pin").foregroundStyle(sabit ? Tema.sari : .secondary)
            }
            .buttonStyle(.borderless)
            .disabled(!sabit && kamera.favoriler.count >= Favori.enCok)
        }
    }
}

/// Basılı tutunca açılan hızlı menü (Fatih 29 Ekim: "haptic touch gibi basınca duyarlı alt menüler"): ayarın en çok kullanılan
/// 4-6 değeri, "Ayrıntılı…" ile tam panel, altta Sabitle / Sabitlemeyi kaldır. Üst şeritteki kapsüllerde ve Denetimler dairelerinde.
struct HizliMenu: View {
    let f: Favori
    @ObservedObject var kamera: Kamera
    var ayrinti: (() -> Void)?

    var body: some View {
        Group {
            switch f {
            case .bd:
                ForEach(Array(Cetvel.bdler.enumerated()), id: \.offset) { _, b in
                    secenek(b.2.map { "\(b.1) · \($0)" } ?? b.1, secili: kamera.bd == b.0) { kamera.bdSec(b.0) }
                }
            case .iso:
                secenek("Oto", secili: kamera.secilenIso == nil) { kamera.isoSec(nil) }
                ForEach(isoSecenekleri, id: \.self) { i in secenek("ISO \(Int(i))", secili: kamera.secilenIso == i) { kamera.isoSec(i) } }
            case .enst:
                secenek("Oto", secili: kamera.secilenEnst == nil) { kamera.enstSec(nil) }
                ForEach(enstSecenekleri, id: \.self) { e in secenek(kamera.enstGoster(e), secili: kamera.secilenEnst == e) { kamera.enstSec(e) } }
            case .ev:
                ForEach([-1, -0.5, 0, 0.5, 1] as [Float], id: \.self) { v in secenek(Cetvel.evYazi(v), secili: abs(kamera.ev - v) < 0.05) { kamera.evSec(v) } }
            case .odak:
                secenek("Otomatik", secili: kamera.odakKonum == nil) { kamera.odakSec(nil) }
                secenek("Sonsuz", secili: kamera.odakKonum.map { $0 >= 0.99 } ?? false) { kamera.odakSec(1) }
            case .kodek:
                ForEach(kamera.kodekler) { k in secenek(k.ad, secili: kamera.kodek == k) { kamera.kodek = k } }
            case .renk:
                ForEach(kamera.renkModlari) { r in secenek(r.ad, secili: kamera.renkModu == r) { kamera.renkModu = r } }
            case .sabitleme:
                ForEach(kamera.sabitlemeler) { m in secenek(m.ad, secili: kamera.sabitleme == m) { kamera.sabitleme = m } }
            case .stil:
                ForEach(HazirStil.temel) { h in secenek(h.ad, secili: kamera.stil.hazir == h) { kamera.stil.hazir = h } }
                Menu("Film reçeteleri") {
                    ForEach(HazirStil.receteler) { h in secenek(h.ad, secili: kamera.stil.hazir == h) { kamera.stil.hazir = h } }
                }
            case .lut:
                secenek("Kapalı", secili: !kamera.gosterge.lutAcik) { kamera.gosterge.lutAcik = false }
                ForEach(Lut.kitaplik().map(\.lastPathComponent), id: \.self) { ad in
                    secenek(ad.replacingOccurrences(of: ".cube", with: ""), secili: kamera.gosterge.lutAcik && kamera.gosterge.lutAdi == ad) {
                        kamera.gosterge.lutAdi = ad; kamera.gosterge.lutAcik = true
                    }
                }
            case .flas:
                ForEach(Array(["Kapalı", "Oto", "Açık", "Fener"].enumerated()), id: \.offset) { i, ad in
                    secenek(ad, secili: kamera.flas.rawValue == i) { var n = 0; while kamera.flas.rawValue != i, n < 4 { kamera.flasDegistir(); n += 1 } }
                }
            case .zamanlayici:
                ForEach([0, 3, 10], id: \.self) { sn in secenek(sn == 0 ? "Kapalı" : "\(sn) sn", secili: kamera.zamanlayici == sn) { kamera.zamanlayici = sn } }
            case .kilavuz:
                ForEach(KompTur.allCases) { t in secenek(t.ad, secili: kamera.kompTur == t) { kamera.kompTur = t } }
            case .zebra, .falseColor, .peaking, .histogram, .monokrom, .terazi, .yardimci:
                let acik = kamera.favoriDeger(f).etkin
                Button { kamera.favoriDegistir(f) } label: { Label(acik ? "Kapat" : "Aç", systemImage: acik ? "xmark.circle" : "checkmark.circle") }
            case .cozunurluk, .ses:
                EmptyView()
            }
            if let ayrinti, f != .zebra, f != .falseColor, f != .peaking, f != .histogram, f != .monokrom, f != .terazi, f != .yardimci {
                Divider()
                Button(action: ayrinti) { Label("Ayrıntılı…", systemImage: "slider.horizontal.3") }
            }
            Divider()
            Button { kamera.favoriAcKapa(f) } label: {
                kamera.favoriler.contains(f) ? Label("Sabitlemeyi kaldır", systemImage: "pin.slash") : Label("Üst şeride sabitle", systemImage: "pin")
            }
        }
    }

    private func secenek(_ ad: String, secili: Bool, _ eylem: @escaping () -> Void) -> some View {
        Button(action: eylem) { if secili { Label(ad, systemImage: "checkmark") } else { Text(ad) } }
    }

    /// ISO listesinden 5 adım (baz, 200, 400, 800, 1600 gibi)
    private var isoSecenekleri: [Float] {
        let l = kamera.isoDegerleri
        guard l.count > 5 else { return l }
        let hedef: [Float] = [l[0], 200, 400, 800, 1600, 3200]
        return Array(Set(hedef.compactMap { h in l.min { abs($0 - h) < abs($1 - h) } })).sorted()
    }

    private var enstSecenekleri: [Double] {
        kamera.mod == .video ? [1.0 / 1000, 1.0 / 250, 1.0 / 100, 1.0 / 50, 1.0 / 25] : [1.0 / 1000, 1.0 / 250, 1.0 / 60, 1.0 / 15, 1.0 / 4]
    }
}

extension View {
    /// Basılı tutunca hızlı menü (HizliMenu) + Sabitle / Sabitlemeyi kaldır
    func sabitlenebilir(_ f: Favori, _ kamera: Kamera, ayrinti: (() -> Void)? = nil) -> some View {
        contextMenu { HizliMenu(f: f, kamera: kamera, ayrinti: ayrinti) }
    }
}
