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

/// Giriş: Masa ya da Monitör; son seçim hatırlanır ve açılışta doğrudan oraya girilir, geri düğmesi ("Menü") buraya döner
struct MasaKok: View {
    enum Ekran: String, Identifiable { case masa, monitor; var id: String { rawValue } }
    @State private var ekran: Ekran? = Ekran(rawValue: UserDefaults.standard.string(forKey: "masa.giris") ?? "")

    var body: some View {
        ZStack {
            Color(red: 27 / 255, green: 30 / 255, blue: 35 / 255).ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text("UPCAM STUDIO").font(.system(size: 34, weight: .heavy, design: .default).width(.condensed))
                    Text("Ne yapmak istiyorsun?").font(.subheadline).foregroundStyle(Tema.metin2).padding(.bottom, 14)
                    kart("rectangle.split.2x2.fill", Color(red: 52 / 255, green: 199 / 255, blue: 89 / 255), "Masa",
                         "Çok kamera: Wi-Fi'daki telefonlar, USB kameralar ve Luna tek ekranda; dokununca geçiş, her kaynak ve program SSD'ye kayıt.") { ac(.masa) }
                    kart("display", Color(red: 106 / 255, green: 152 / 255, blue: 248 / 255), "Monitör",
                         "Kamerayı izle: USB kamera, ağ yayını. Ölçümler, LUT, iki kaynak.") { ac(.monitor) }
                    Text("Çekim için Updated Camera uygulamasını kullan; telefonlar oradan Wi-Fi kamera olur.")
                        .font(.footnote).foregroundStyle(Tema.metin2).padding(.top, 8)
                }
                .padding(24)
                .frame(maxWidth: 520)
                .frame(maxWidth: .infinity)
            }
        }
        .foregroundStyle(.white)
        .fullScreenCover(item: $ekran) { e in
            switch e {
            case .masa: MasaEkran { ekran = nil }
            case .monitor: MonitorEkran { ekran = nil }
            }
        }
    }

    private func ac(_ e: Ekran) {
        UserDefaults.standard.set(e.rawValue, forKey: "masa.giris")
        ekran = e
    }

    private func kart(_ simge: String, _ renk: Color, _ baslik: String, _ aciklama: String, eylem: @escaping () -> Void) -> some View {
        Button(action: eylem) {
            VStack(alignment: .leading, spacing: 6) {
                Image(systemName: simge).font(.system(size: 28, weight: .semibold)).foregroundStyle(renk)
                Text(baslik).font(.system(size: 26, weight: .bold).width(.condensed)).foregroundStyle(.white).padding(.top, 4)
                Text(aciklama).font(.subheadline).foregroundStyle(Tema.metin2).multilineTextAlignment(.leading)
            }
            .padding(22)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 26).fill(Color(red: 46 / 255, green: 50 / 255, blue: 57 / 255).opacity(0.66)))
            .overlay(RoundedRectangle(cornerRadius: 26).stroke(Color.white.opacity(0.09), lineWidth: 1))
        }
    }
}
