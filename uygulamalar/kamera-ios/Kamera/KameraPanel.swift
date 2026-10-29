import SwiftUI

/// Açılır panellerin içi
extension View {
    /// Zemini AnaEkran'daki cam pano verir (başlık ve ✕ ile)
    func pano() -> some View { padding(.horizontal, 4) }
}

/// Seçenek kapsülü (seçili turuncu)
struct Secenek: View {
    let yazi: String
    var alt: String? = nil
    let secili: Bool
    var baz = false
    let sec: () -> Void

    var body: some View {
        Button(action: sec) {
            VStack(spacing: 0) {
                Text(yazi).font(.subheadline.weight(.semibold))
                if let alt { Text(alt).font(.system(size: 10, weight: .medium)).opacity(0.7) }
            }
            .foregroundStyle(secili ? (baz ? Tema.baz : Tema.sari) : (baz ? Tema.baz : .white.opacity(0.85)))
            .padding(.horizontal, 12)
            .frame(minHeight: alt == nil ? 34 : 44)
            .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(Color.white.opacity(secili ? 0.12 : 0.07)))
            .overlay(RoundedRectangle(cornerRadius: 11, style: .continuous).strokeBorder(secili ? (baz ? Tema.baz : Tema.sari).opacity(0.55) : Tema.hat, lineWidth: 0.5))
        }
    }
}

/// Araç şeridinin cetvelleri (Final Cut Camera gibi alttan): pozlama (EV + elle ISO), beyaz denge, odak
struct Cetvel: View {
    enum Tur { case poz, bd, odak }
    let tur: Tur
    @ObservedObject var kamera: Kamera

    static let bdler: [(Float?, String, String?)] = [(nil, "Oto", nil), (3200, "3200K", "Ampul"), (4000, "4000K", "Floresan"),
                                                     (5600, "5600K", "Gün ışığı"), (6500, "6500K", "Bulutlu"), (7500, "7500K", "Gölge")]

    static func tonYazi(_ t: Float) -> String { abs(t) < 1 ? "" : String(format: " %@%d", t < 0 ? "Y" : "M", Int(abs(t))) }

    static func evYazi(_ e: Float) -> String { abs(e) < 0.05 ? "±0" : String(format: "%+.1f", e).replacingOccurrences(of: ".", with: ",") }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            switch tur {
            case .poz: poz
            case .bd: beyaz
            case .odak: odak
            }
        }
        .pano()
    }

    private func baslik(_ ad: String, _ simge: String, _ deger: String, oto: Bool?, otoYap: @escaping () -> Void = {}) -> some View {
        HStack {
            Label(ad, systemImage: simge).font(.system(size: 13, weight: .semibold))
            Text(deger).font(Tema.deger).foregroundStyle(oto == true ? Tema.ikincil : Tema.sari).padding(.leading, 6)
            Spacer()
            if let oto {
                Button("OTO", action: otoYap)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(oto ? Tema.sari : .white.opacity(0.85))
                    .padding(.horizontal, 12).frame(height: 26)
                    .background(Capsule().fill(Color.white.opacity(oto ? 0.12 : 0.07)).overlay(Capsule().strokeBorder(oto ? Tema.sari.opacity(0.55) : Tema.hat, lineWidth: 0.5)))
            }
        }
    }

    private func not(_ t: String) -> some View { Text(t).font(.system(size: 11)).foregroundStyle(Tema.ikincil) }

    private var poz: some View {
        Group {
            baslik("Pozlama", "plusminus.circle", Cetvel.evYazi(kamera.ev), oto: abs(kamera.ev) < 0.05) { kamera.evSec(0) }
            if kamera.secilenIso == nil && kamera.secilenEnst == nil {
                Slider(value: Binding(get: { kamera.ev }, set: { kamera.evSec(($0 * 3).rounded() / 3) }), in: kamera.evAralik)
                    .tint(Tema.sari)
                not("Sola: daha karanlık · sağa: daha aydınlık")
            } else {
                not("Elle ISO ya da enstantane seçiliyken pozlama telafisi kapalı.")
            }
            Text("ISO").font(.caption.weight(.bold)).foregroundStyle(Tema.metin2).padding(.top, 4)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    Secenek(yazi: "AUTO", secili: kamera.secilenIso == nil) { kamera.isoSec(nil) }
                    ForEach(kamera.isoDegerleri, id: \.self) { i in
                        let baz = i == kamera.bazIso
                        Secenek(yazi: "\(Int(i))", alt: baz ? "baz" : nil, secili: kamera.secilenIso == i, baz: baz) { kamera.isoSec(i) }
                    }
                }
            }
            if kamera.mod == .foto { uzun }
            if kamera.mod == .video { videoEnst }
        }
    }

    /// VİDEO'da enstantane: süre (1/50) ya da açı (180°); Genel Ayarlar → Pozlama'dan ya da buradan değişir
    @ViewBuilder private var videoEnst: some View {
        HStack {
            Text(kamera.enstAci ? "ENSTANTANE AÇISI" : "ENSTANTANE").font(.caption.weight(.bold)).foregroundStyle(Tema.metin2)
            Spacer()
            Picker("", selection: Binding(get: { kamera.enstAci }, set: { kamera.enstAci = $0; kamera.enstSec(nil) })) {
                Text("Süre").tag(false)
                Text("Açı").tag(true)
            }
            .pickerStyle(.segmented).frame(width: 120)
        }
        .padding(.top, 4)
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                Secenek(yazi: "AUTO", secili: kamera.secilenEnst == nil) { kamera.enstSec(nil) }
                ForEach(kamera.videoEnstSecenekleri, id: \.self) { e in
                    let kural = abs(e * Double(kamera.videoFps) - 0.5) < 0.001
                    Secenek(yazi: kamera.enstGoster(e), alt: kural ? "doğal" : nil, secili: kamera.secilenEnst.map { abs($0 - e) < 1e-7 } ?? false) { kamera.enstSec(e) }
                }
            }
        }
        not("180° (kare hızının iki katı) hareketi en doğal gösterir. Işık çoksa ND filtre kullan.")
    }

    /// FOTO'da enstantane: telefonun tek karede verebildiğinden uzunsa (ve BULB) kareler art arda alınıp birleştirilir
    static let enstler: [Double] = [1.0 / 1000, 1.0 / 250, 1.0 / 60, 1.0 / 15, 1.0 / 4, 1.0 / 2, 1, 2, 4, 8, 15, 30, Kamera.bulb]

    @ViewBuilder private var uzun: some View {
        Text("ENSTANTANE").font(.caption.weight(.bold)).foregroundStyle(Tema.metin2).padding(.top, 4)
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                Secenek(yazi: "AUTO", secili: kamera.secilenEnst == nil) { kamera.enstSec(nil) }
                ForEach(Cetvel.enstler, id: \.self) { e in
                    let birlesik = e > kamera.enUzunEnst + 0.01
                    Secenek(yazi: e >= Kamera.bulb ? "BULB" : ProMod.enstYazi(e), alt: birlesik ? "birleşik" : nil, secili: kamera.secilenEnst == e) { kamera.enstSec(e) }
                }
            }
        }
        if kamera.uzunPozlama {
            Text("BİRLEŞTİRME").font(.caption.weight(.bold)).foregroundStyle(Tema.metin2).padding(.top, 4)
            HStack(spacing: 6) {
                Secenek(yazi: "İpeksi", alt: "su, bulut akar", secili: kamera.uzunYol == .ortalama) { kamera.uzunYol = .ortalama }
                Secenek(yazi: "Aydınlat", alt: "karanlık sahne", secili: kamera.uzunYol == .toplam) { kamera.uzunYol = .toplam }
                Secenek(yazi: "Işık izi", alt: "far, yıldız", secili: kamera.uzunYol == .enParlak) { kamera.uzunYol = .enParlak }
            }
            not("iPhone tek kareyi en fazla \(ProMod.enstYazi(kamera.enUzunEnst)) açabiliyor. Seçtiğin süre boyunca kareler art arda alınıp tek fotoğrafta birleşir; BULB'da deklanşöre yeniden basınca biter. Telefonu sabitle (tripod).")
        }
    }

    private var beyaz: some View {
        Group {
            baslik("Beyaz denge", "thermometer.sun", kamera.bd.map { "\(Int($0))K" + Cetvel.tonYazi(kamera.renkTon) } ?? "Oto", oto: kamera.bd == nil) { kamera.bdSec(nil) }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(Array(Cetvel.bdler.enumerated()), id: \.offset) { _, b in
                        Secenek(yazi: b.1, alt: b.2, secili: kamera.bd == b.0) { kamera.bdSec(b.0) }
                    }
                }
            }
            // Kelvin: sürükleyerek 50K adımla; sola sıcak (turuncu), sağa soğuk (mavi) ışık için
            HStack(spacing: 10) {
                Text("K").font(.caption.weight(.bold)).foregroundStyle(Tema.metin2).frame(width: 18)
                Slider(value: Binding(get: { kamera.bd ?? kamera.mevcutKelvin }, set: { kamera.bdSec(($0 / 50).rounded() * 50) }), in: 2500...10000)
                    .tint(LinearGradient(colors: [.orange, .white, .blue], startPoint: .leading, endPoint: .trailing))
            }
            TonCubugu(deger: kamera.renkTon) { kamera.tonSec($0) }
            not("K: ışığın sıcaklığı · Ton: sola yeşil, sağa macenta (floresan ve LED'deki yeşili giderir). Ortaya çift dokun: sıfır.")
        }
    }

    private var odak: some View {
        Group {
            let deger = kamera.odakKonum.map { $0 >= 0.99 ? "Sonsuz" : "MF" } ?? "Oto"
            baslik("Odak", "scope", deger, oto: kamera.odakKonum == nil) { kamera.odakSerbest() }
            if kamera.elleOdakVar {
                // Android'deki gibi: sola uzak (sonsuz), sağa yakın; iOS'ta mercek konumu 1 uzak, 0 yakın
                Slider(value: Binding(get: { 1 - (kamera.odakKonum ?? 1) }, set: { kamera.odakSec(1 - $0) }), in: 0...1)
                    .tint(Tema.sari)
                not("Sola: uzak (sonsuz) · sağa: yakın. Ekrana dokunmak da odaklar.")
            } else {
                not("Bu kamerada el ile odak yok; ekrana dokunarak odakla.")
            }
        }
    }
}

/// Kılavuz menüsü: ayarlara gitmeden kılavuz, yön, yardımcı, öneri, terazi
struct KilavuzMenu: View {
    @ObservedObject var kamera: Kamera

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("KOMPOZİSYON KILAVUZU", systemImage: "squareshape.split.3x3").font(.caption.weight(.bold)).foregroundStyle(Tema.metin2)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 4), spacing: 8) {
                ForEach(KompTur.allCases) { t in
                    Button { kamera.kompTur = t } label: {
                        VStack(spacing: 4) {
                            ZStack {
                                RoundedRectangle(cornerRadius: 10).fill(Color(red: 58 / 255, green: 64 / 255, blue: 73 / 255))
                                if t != .kapali {
                                    GeometryReader { g in
                                        KompozisyonKatman(tur: t, yon: kamera.kompYon, alan: CGRect(origin: .zero, size: g.size), kucuk: true)
                                    }
                                }
                            }
                            .frame(height: 50)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                            .overlay(RoundedRectangle(cornerRadius: 10).stroke(t == kamera.kompTur ? Tema.sari : Color.white.opacity(0.12), lineWidth: t == kamera.kompTur ? 2 : 1))
                            Text(t.ad).font(.system(size: 11)).lineLimit(1).minimumScaleFactor(0.7)
                                .foregroundStyle(t == kamera.kompTur ? Tema.sari : .white)
                        }
                    }
                }
            }
            if kamera.kompTur == .spiral || kamera.kompTur == .ucgen {
                HStack(spacing: 8) {
                    Text("Yön").font(.subheadline).foregroundStyle(Tema.metin2)
                    ForEach(Array(["↘", "↙", "↗", "↖"].enumerated()), id: \.offset) { i, ok in
                        Secenek(yazi: ok, secili: kamera.kompYon == i) { kamera.kompYon = i }
                    }
                }
            }
            Divider().overlay(Color.white.opacity(0.1))
            Toggle(isOn: $kamera.asistanAcik) { Label("AI Kadraj", systemImage: "sparkles") }
            Toggle("Terazi", isOn: $kamera.teraziAcik)
        }
        .tint(Tema.sari)
        .font(.subheadline)
        .pano()
    }
}

/// Beyaz denge tonu (Fatih 29 Ekim): yeşil ↔ macenta kaydırıcı, iki yanda − / +, ortada sıfır çentiği; çift dokunuş sıfırlar
struct TonCubugu: View {
    let deger: Float
    let degistir: (Float) -> Void
    private static let yesil = Color(red: 48/255, green: 209/255, blue: 88/255)
    private static let macenta = Color(red: 1, green: 55/255, blue: 210/255)

    var body: some View {
        HStack(spacing: 10) {
            adim("minus", -5)
            GeometryReader { g in
                let w = g.size.width, x = CGFloat((deger + 100) / 200) * w
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(LinearGradient(colors: [Self.yesil, .white.opacity(0.35), Self.macenta], startPoint: .leading, endPoint: .trailing))
                        .frame(height: 5)
                    Rectangle().fill(.white.opacity(0.8)).frame(width: 1.5, height: 12).offset(x: w / 2 - 0.75)
                    Circle().fill(.white)
                        .overlay(Circle().fill(renk).padding(7))
                        .frame(width: 24, height: 24)
                        .shadow(color: .black.opacity(0.35), radius: 3, y: 1)
                        .offset(x: x - 12)
                }
                .frame(height: 28)
                .contentShape(Rectangle())
                .gesture(DragGesture(minimumDistance: 0).onChanged { d in
                    let t = Float(min(max(d.location.x / w, 0), 1)) * 200 - 100
                    ayarla(abs(t) < 3 ? 0 : (t / 2).rounded() * 2)
                })
                .onTapGesture(count: 2) { ayarla(0) }
            }
            .frame(height: 28)
            adim("plus", 5)
            Text(yazi).font(.system(size: 13, weight: .semibold).monospacedDigit())
                .foregroundStyle(deger == 0 ? Tema.metin2 : .white).frame(width: 34, alignment: .trailing)
        }
    }

    private var yazi: String { abs(deger) < 1 ? "0" : "\(deger < 0 ? "Y" : "M")\(Int(abs(deger)))" }
    private var renk: Color { abs(deger) < 1 ? .white : (deger < 0 ? Self.yesil : Self.macenta).opacity(Double(min(abs(deger) / 60, 1))) }

    private func adim(_ simge: String, _ d: Float) -> some View {
        Button { ayarla(min(max(deger + d, -100), 100)) } label: {
            Image(systemName: simge).font(.system(size: 12, weight: .bold))
                .frame(width: 28, height: 28).background(Circle().fill(Color(white: 0.47).opacity(0.36)))
        }
        .buttonStyle(.plain).foregroundStyle(.white)
    }

    private func ayarla(_ t: Float) {
        guard t != deger else { return }
        if (t == 0) != (deger == 0) || abs(t).truncatingRemainder(dividingBy: 50) == 0 { UISelectionFeedbackGenerator().selectionChanged() }
        degistir(t)
    }
}
