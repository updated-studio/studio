import SwiftUI

/// UpCam Studio (iPhone/iPad): Masa (çok kamera) + Monitör. Kamera uygulamasıyla aynı kaynak kümesi, ayrı paket kimliği (tr.com.UpCam.Studio).
/// Fatih 30 Ekim: "uygulamaları ayıracağım". Android karşılığı :masa-uygulama modülü.
@main
struct UpdatedMasaApp: App {
    var body: some Scene {
        WindowGroup {
            MasaKok()
                .preferredColorScheme(.dark)
                .statusBarHidden()
                .persistentSystemOverlays(.hidden)
        }
    }
}

/// Giriş (Fatih 30 Ekim 03:12, tasarim/upcam-studio/1 öneri A): ışık lekeli koyu açılış görseli, ortada simge ve UPCAM STUDIO;
/// ekranın alt yarısında iki kart, Monitör üstte, Multi Cam altta. Son kullanılan hatırlanır ("Açılışta doğrudan aç" isteğe bağlı).
struct MasaKok: View {
    enum Ekran: String, Identifiable { case masa, monitor; var id: String { rawValue } }
    @AppStorage("masa.giris") private var son = ""
    @AppStorage("masa.dogrudan") private var dogrudan = false
    @State private var ekran: Ekran?
    @State private var acildi = false

    var body: some View {
        GeometryReader { g in
            let ipad = g.size.width > 600
            ZStack {
                Acilis(canli: acildi)
                VStack(spacing: 0) {
                    Spacer(minLength: 0)
                    VStack(spacing: 0) {
                        Image("Simge").resizable().interpolation(.high)
                            .frame(width: ipad ? 112 : 92, height: ipad ? 112 : 92)
                            .clipShape(RoundedRectangle(cornerRadius: (ipad ? 112 : 92) * 0.2237, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: (ipad ? 112 : 92) * 0.2237, style: .continuous).strokeBorder(Color.white.opacity(0.12), lineWidth: 0.5))
                            .shadow(color: .black.opacity(0.7), radius: 24, y: 14)
                        Text("UPCAM STUDIO")
                            .font(.system(size: ipad ? 50 : 40, weight: .black).width(.compressed))
                            .tracking(ipad ? 2.4 : 1.8)
                            .padding(.top, 22)
                        Text("Çok kameralı çekim, monitör ve kayıt")
                            .font(.system(size: ipad ? 16 : 14)).foregroundStyle(Tema.ikincil).padding(.top, 8)
                    }
                    .multilineTextAlignment(.center)
                    .opacity(acildi ? 1 : 0).offset(y: acildi ? 0 : 8)
                    Spacer(minLength: 0)
                    VStack(spacing: 12) {
                        GirisKarti(tur: .monitor, baslik: "Monitör", alt: "Tek kamerayı izle · ölç · kaydet", ipad: ipad) { ac(.monitor) }
                        GirisKarti(tur: .masa, baslik: "Multi Cam", alt: "4 kameraya kadar geçiş ve ayrı kayıt", ipad: ipad) { ac(.masa) }
                    }
                    .frame(maxWidth: 560)
                    .padding(.horizontal, 18)
                    .opacity(acildi ? 1 : 0).offset(y: acildi ? 0 : 16)
                    altSatir.padding(.top, 22).padding(.bottom, ipad ? 60 : 24)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .foregroundStyle(.white)
        .onAppear {
            withAnimation(.easeOut(duration: 0.6)) { acildi = true }
            if dogrudan, let e = Ekran(rawValue: son) { ekran = e }
        }
        .fullScreenCover(item: $ekran) { e in
            switch e {
            case .masa: MasaEkran { ekran = nil }
            case .monitor: MonitorEkran { ekran = nil }
            }
        }
    }

    @ViewBuilder private var altSatir: some View {
        if let e = Ekran(rawValue: son) {
            Button { dogrudan.toggle() } label: {
                HStack(spacing: 6) {
                    Text("Son kullanılan:").foregroundStyle(Tema.metin3)
                    Text(e == .masa ? "Multi Cam" : "Monitör").foregroundStyle(Tema.ikincil)
                    Text("·").foregroundStyle(Tema.metin3)
                    Image(systemName: dogrudan ? "checkmark.circle.fill" : "circle").foregroundStyle(dogrudan ? Tema.sari : Tema.metin3)
                    Text("açılışta doğrudan aç").foregroundStyle(dogrudan ? Tema.ikincil : Tema.metin3)
                }
                .font(.system(size: 12, weight: .medium))
            }
            .buttonStyle(.plain)
        } else {
            Text("Updated Stüdyo").font(.system(size: 12, weight: .medium)).foregroundStyle(Tema.metin3)
        }
    }

    private func ac(_ e: Ekran) {
        son = e.rawValue
        ekran = e
    }
}

/// Açılış görseli: koyu zemin, sıcak ve soğuk stüdyo ışığı lekeleri (çok yavaş kayar), kenar karartması
private struct Acilis: View {
    var canli: Bool
    @State private var kay = false

    var body: some View {
        GeometryReader { g in
            let w = g.size.width, h = g.size.height
            ZStack {
                LinearGradient(colors: [Color(red: 0.07, green: 0.07, blue: 0.086), Color(red: 0.04, green: 0.04, blue: 0.047), Color(red: 0.02, green: 0.02, blue: 0.024)],
                               startPoint: .top, endPoint: .bottom)
                RadialGradient(colors: [Color(red: 1, green: 0.59, blue: 0.27).opacity(0.22), .clear], center: UnitPoint(x: 0.5, y: 0.3), startRadius: 0, endRadius: w * 0.7)
                RadialGradient(colors: [Color(red: 0.31, green: 0.47, blue: 1).opacity(0.18), .clear], center: UnitPoint(x: 0.15, y: 0.06), startRadius: 0, endRadius: w * 0.8)
                leke(Color(red: 1, green: 0.67, blue: 0.35).opacity(0.10), w * 0.18, x: w * 0.18, y: h * 0.14)
                leke(Color(red: 0.35, green: 0.5, blue: 1).opacity(0.10), w * 0.28, x: w * 0.86, y: h * 0.12)
                leke(Color(red: 1, green: 0.84, blue: 0.04).opacity(0.07), w * 0.12, x: w * 0.7, y: h * 0.42)
                leke(Color(red: 1, green: 0.47, blue: 0.24).opacity(0.06), w * 0.3, x: w * 0.04, y: h * 0.48)
                RadialGradient(colors: [.clear, .black.opacity(0.55)], center: .center, startRadius: min(w, h) * 0.45, endRadius: max(w, h) * 0.8)
            }
            .ignoresSafeArea()
            .onAppear { withAnimation(.easeInOut(duration: 14).repeatForever(autoreverses: true)) { kay = true } }
        }
        .ignoresSafeArea()
    }

    private func leke(_ renk: Color, _ cap: CGFloat, x: CGFloat, y: CGFloat) -> some View {
        Circle().fill(renk).frame(width: cap, height: cap).blur(radius: 2)
            .position(x: x + (kay ? cap * 0.08 : -cap * 0.08), y: y + (kay ? -cap * 0.05 : cap * 0.05))
    }
}

/// Giriş kartı: canlı görüntü önizlemesi gibi duran zemin, solda başlık, sağ altta ok
private struct GirisKarti: View {
    let tur: MasaKok.Ekran
    let baslik: String
    let alt: String
    let ipad: Bool
    var eylem: () -> Void

    var body: some View {
        Button(action: eylem) {
            ZStack(alignment: .bottomLeading) {
                zemin
                LinearGradient(colors: [.black.opacity(0.78), .black.opacity(0.35), .black.opacity(0.08)], startPoint: .leading, endPoint: .trailing)
                if tur == .masa { mini4.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing).padding(14) }
                VStack(alignment: .leading, spacing: 3) {
                    Text(baslik).font(.system(size: ipad ? 26 : 21, weight: .bold)).tracking(-0.4)
                    Text(alt).font(.system(size: ipad ? 14 : 12.5)).foregroundStyle(Tema.ikincil)
                }
                .padding(.horizontal, 18).padding(.bottom, 16)
                Image(systemName: "chevron.right").font(.system(size: 12, weight: .bold))
                    .frame(width: 30, height: 30).background(Circle().fill(Color.white.opacity(0.14)))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing).padding(16)
            }
            .frame(height: ipad ? 168 : 132)
            .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).strokeBorder(Tema.hat, lineWidth: 0.5))
            .contentShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        }
        .buttonStyle(KartBasma())
    }

    @ViewBuilder private var zemin: some View {
        if tur == .monitor { GirisSahnesi(sicak: true) } else { Color(white: 0.04) }
    }

    private var mini4: some View {
        let w: CGFloat = ipad ? 210 : 132, h = w * 9 / 16
        return VStack(spacing: 3) {
            HStack(spacing: 3) { kutu(true, .red); kutu(false, .green) }
            HStack(spacing: 3) { kutu(nil, nil); kutu(nil, nil, gunes: true) }
        }
        .frame(width: w, height: h)
    }

    private func kutu(_ sicak: Bool?, _ tally: Color?, gunes: Bool = false) -> some View {
        ZStack {
            if gunes {
                LinearGradient(colors: [Color(red: 0.3, green: 0.42, blue: 0.55), Color(red: 0.75, green: 0.54, blue: 0.38), Color(red: 0.16, green: 0.12, blue: 0.1)], startPoint: .top, endPoint: .bottom)
            } else if let sicak { GirisSahnesi(sicak: sicak) } else {
                RadialGradient(colors: [Color(red: 1, green: 0.9, blue: 0.78).opacity(0.5), Color(red: 0.17, green: 0.13, blue: 0.1)], center: .center, startRadius: 0, endRadius: 50)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 5, style: .continuous).strokeBorder(tally == .red ? MC.kirmizi : (tally == .green ? MC.yesil : .clear), lineWidth: 1.5))
    }
}

/// Stüdyo ışığında konuşan kişi silüeti (yalnız giriş kartlarında süs)
private struct GirisSahnesi: View {
    let sicak: Bool

    var body: some View {
        GeometryReader { g in
            let w = g.size.width, h = g.size.height
            ZStack {
                LinearGradient(colors: sicak ? [Color(red: 0.165, green: 0.137, blue: 0.13), Color(red: 0.08, green: 0.067, blue: 0.06)]
                               : [Color(red: 0.106, green: 0.137, blue: 0.2), Color(red: 0.047, green: 0.06, blue: 0.08)], startPoint: .top, endPoint: .bottom)
                RadialGradient(colors: [(sicak ? Color(red: 1, green: 0.69, blue: 0.43) : Color(red: 0.47, green: 0.67, blue: 1)).opacity(0.5), .clear],
                               center: UnitPoint(x: sicak ? 0.3 : 0.7, y: 0.4), startRadius: 0, endRadius: w * 0.55)
                Circle().fill(RadialGradient(colors: sicak ? [Color(red: 0.42, green: 0.32, blue: 0.26), Color(red: 0.16, green: 0.12, blue: 0.1)]
                                             : [Color(red: 0.31, green: 0.38, blue: 0.5), Color(red: 0.1, green: 0.12, blue: 0.19)],
                                             center: UnitPoint(x: 0.4, y: 0.35), startRadius: 0, endRadius: h * 0.2))
                    .frame(width: h * 0.3, height: h * 0.3).position(x: w * 0.74, y: h * 0.42)
                Capsule().fill(LinearGradient(colors: [Color(white: 0.17), Color(white: 0.08)], startPoint: .top, endPoint: .bottom))
                    .frame(width: h * 0.95, height: h * 0.7).position(x: w * 0.74, y: h * 1.0)
            }
        }
    }
}

private struct KartBasma: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.scaleEffect(configuration.isPressed ? 0.98 : 1).opacity(configuration.isPressed ? 0.85 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}
