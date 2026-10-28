import SwiftUI

/// Açılır paneller: arkadaki düğmeler karışmasın diye neredeyse opak (Android "pano")
extension View {
    func pano() -> some View {
        padding(14)
            .background(RoundedRectangle(cornerRadius: 22).fill(Color(red: 30 / 255, green: 33 / 255, blue: 38 / 255)))
            .overlay(RoundedRectangle(cornerRadius: 22).stroke(Color.white.opacity(0.1), lineWidth: 1))
            .padding(.horizontal, 12)
    }
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
            .foregroundStyle(secili ? .black : (baz ? Tema.baz : .white))
            .padding(.horizontal, 12)
            .frame(minHeight: alt == nil ? 36 : 46)
            .background(RoundedRectangle(cornerRadius: 12).fill(secili ? (baz ? Tema.baz : Tema.vurgu) : Color.white.opacity(0.1)))
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
            Label(ad, systemImage: simge).font(.subheadline.weight(.semibold))
            Text(deger).font(Tema.mono).foregroundStyle(Tema.vurgu).padding(.leading, 6)
            Spacer()
            if let oto {
                Button("OTO", action: otoYap)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(oto ? .black : .white)
                    .padding(.horizontal, 14).frame(height: 30)
                    .background(Capsule().fill(oto ? Tema.vurgu : Color.white.opacity(0.14)))
            }
        }
    }

    private func not(_ t: String) -> some View { Text(t).font(.caption).foregroundStyle(Tema.metin2) }

    private var poz: some View {
        Group {
            baslik("Pozlama", "plusminus.circle", Cetvel.evYazi(kamera.ev), oto: abs(kamera.ev) < 0.05) { kamera.evSec(0) }
            if kamera.secilenIso == nil {
                Slider(value: Binding(get: { kamera.ev }, set: { kamera.evSec(($0 * 3).rounded() / 3) }), in: kamera.evAralik)
                    .tint(Tema.vurgu)
                not("Sola: daha karanlık · sağa: daha aydınlık")
            } else {
                not("Elle ISO seçiliyken pozlama telafisi kapalı.")
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
        }
    }

    private var beyaz: some View {
        Group {
            baslik("Beyaz denge", "thermometer.sun", Cetvel.bdler.first { $0.0 == kamera.bd }?.1 ?? "Oto", oto: nil)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(Array(Cetvel.bdler.enumerated()), id: \.offset) { _, b in
                        Secenek(yazi: b.1, alt: b.2, secili: kamera.bd == b.0) { kamera.bdSec(b.0) }
                    }
                }
            }
        }
    }

    private var odak: some View {
        Group {
            let deger = kamera.odakKonum.map { $0 >= 0.99 ? "Sonsuz" : "MF" } ?? "Oto"
            baslik("Odak", "scope", deger, oto: kamera.odakKonum == nil) { kamera.odakSerbest() }
            if kamera.elleOdakVar {
                // Android'deki gibi: sola uzak (sonsuz), sağa yakın; iOS'ta mercek konumu 1 uzak, 0 yakın
                Slider(value: Binding(get: { 1 - (kamera.odakKonum ?? 1) }, set: { kamera.odakSec(1 - $0) }), in: 0...1)
                    .tint(Tema.vurgu)
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
                            .overlay(RoundedRectangle(cornerRadius: 10).stroke(t == kamera.kompTur ? Tema.vurgu : Color.white.opacity(0.12), lineWidth: t == kamera.kompTur ? 2 : 1))
                            Text(t.ad).font(.system(size: 11)).lineLimit(1).minimumScaleFactor(0.7)
                                .foregroundStyle(t == kamera.kompTur ? Tema.vurgu : .white)
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
            Toggle("Akıllı yardımcı (ibre)", isOn: $kamera.asistanAcik)
            Toggle("Otomatik kılavuz önerisi", isOn: $kamera.oneriAcik)
            Toggle("Terazi", isOn: $kamera.teraziAcik)
        }
        .tint(Tema.vurgu)
        .font(.subheadline)
        .pano()
    }
}
