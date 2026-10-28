import AVFoundation
import SwiftUI

/// Kamera ekranının Ayarlar paneli (Android KameraActivity.ayarlarAc ile aynı bölümler):
/// Fotoğraf · Video · Timelapse · Masa (çok kamera) · Yardımcılar · Uygulama
struct KameraAyarlar: View {
    @ObservedObject var kamera: Kamera
    var wifiKamera: () -> Void
    var masa: () -> Void
    @Environment(\.dismiss) private var kapat
    @State private var girisSor = UserDefaults.standard.string(forKey: "giris") == nil

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 6) {
                    baslik("FOTOĞRAF", "camera")
                    if !kamera.fotoBoyutlari.isEmpty {
                        secim("Fotoğraf çözünürlüğü", kamera.fotoBoyutlari.prefix(5).map { b in
                            (KameraAyarlar.mp(b), kamera.fotoBoyut.map { $0.width == b.width && $0.height == b.height } ?? false, { kamera.fotoBoyutSec(b) })
                        })
                    }
                    if kamera.rawVar { anahtar("RAW (DNG) da kaydet", $kamera.raw) }
                    secim("Zamanlayıcı", [0, 3, 10].map { z in (z == 0 ? "Kapalı" : "\(z) sn", kamera.zamanlayici == z, { kamera.zamanlayici = z }) })
                    if kamera.sesKapatilabilir {
                        anahtar("Deklanşör sesi", $kamera.deklansorSesi)
                    } else {
                        not("Deklanşör sesini iPhone kendisi çalar (sessiz düğmesine göre).")
                    }

                    baslik("VİDEO", "video")
                    secim("Çözünürlük", kamera.videoSecenekleri.map { h in (h >= 2160 ? "4K" : "\(h)p", kamera.videoYukseklik == h, { kamera.videoYukseklik = h }) })
                    if kamera.fps60Var {
                        secim("Kare hızı", [30, 60].map { f in ("\(f) fps", kamera.videoFps == f, { kamera.videoFps = f }) })
                    }

                    baslik("TIMELAPSE", "timer")
                    secim("Kare aralığı", Timelapse.araliklar.map { a in (Timelapse.aralikYazi(a), kamera.tlAralik == a, { kamera.tlAralik = a }) })
                    secim("Çekim süresi", Timelapse.sureler.map { s in (Timelapse.sureYazi(s), kamera.tlSure == s, { kamera.tlSure = s }) })
                    anahtar("Pozlamayı başta sabitle", $kamera.tlPozSabit)
                    not("Açıkken parlaklık kareden kareye oynamaz (titreme olmaz). Gün batımı gibi ışığın değiştiği çekimlerde kapat. Tripod kullan; ekran açık kalır.")

                    baslik("MASA (ÇOK KAMERA)", "dot.radiowaves.left.and.right")
                    satirDugme("Wi-Fi kamera ol", "wifi") { kapat(); wifiKamera() }
                    not("Bu telefonun görüntüsü aynı Wi-Fi'daki masaya gider; masa kendiliğinden bulur.")
                    satirDugme("Bu telefonu masa yap", "rectangle.split.2x2") { kapat(); masa() }

                    baslik("YARDIMCILAR", "wand.and.stars")
                    anahtar("Otomatik sahne önerisi", $kamera.sahneOto)
                    anahtar("Akıllı yardımcı (ibre)", $kamera.asistanAcik)
                    anahtar("Terazi", $kamera.teraziAcik)

                    baslik("UYGULAMA", "info.circle")
                    anahtar("Açılışta Kamera / Monitör sor", $girisSor)
                        .onChange(of: girisSor) { _, acik in
                            if acik { UserDefaults.standard.removeObject(forKey: "giris") } else { UserDefaults.standard.set("kamera", forKey: "giris") }
                        }
                    not("UPDATED Kamera \(KameraAyarlar.surum) · güncellemeler TestFlight'tan kendiliğinden gelir.")
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 24)
            }
            .navigationTitle("Ayarlar")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Tamam") { kapat() }.tint(Tema.vurgu) } }
        }
        .tint(Tema.vurgu)
        .presentationDetents([.fraction(0.62), .large])
        .presentationBackground(Color(red: 30 / 255, green: 33 / 255, blue: 38 / 255))
    }

    static var surum: String {
        let b = Bundle.main.infoDictionary
        return "\(b?["CFBundleShortVersionString"] as? String ?? "") (\(b?["CFBundleVersion"] as? String ?? ""))"
    }

    static func mp(_ b: CMVideoDimensions) -> String {
        let mp = Int((Double(b.width) * Double(b.height) / 1_000_000).rounded())
        let r = Double(max(b.width, b.height)) / Double(max(1, min(b.width, b.height)))
        let oran = abs(r - 4.0 / 3) < 0.03 ? "4:3" : (abs(r - 16.0 / 9) < 0.03 ? "16:9" : (abs(r - 1) < 0.03 ? "1:1" : String(format: "%.2f", r)))
        return "\(mp) MP · \(oran)"
    }

    private func baslik(_ t: String, _ simge: String) -> some View {
        Label(t, systemImage: simge).font(.caption.weight(.bold)).foregroundStyle(Tema.metin2).padding(.top, 16).padding(.bottom, 2)
    }

    private func not(_ t: String) -> some View { Text(t).font(.caption).foregroundStyle(Tema.metin2).fixedSize(horizontal: false, vertical: true) }

    private func anahtar(_ ad: String, _ deger: Binding<Bool>) -> some View {
        Toggle(ad, isOn: deger).font(.subheadline).padding(.vertical, 4)
    }

    private func satirDugme(_ ad: String, _ simge: String, eylem: @escaping () -> Void) -> some View {
        Button(action: eylem) { Label(ad, systemImage: simge).font(.subheadline.weight(.semibold)).padding(.vertical, 8) }
            .foregroundStyle(Color(red: 106 / 255, green: 152 / 255, blue: 248 / 255))
    }

    private func secim(_ ad: String, _ secenekler: [(String, Bool, () -> Void)]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(ad).font(.subheadline).padding(.top, 6)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(Array(secenekler.enumerated()), id: \.offset) { _, s in
                        Secenek(yazi: s.0, secili: s.1, sec: s.2)
                    }
                }
            }
        }
    }
}

/// Açılış: Kamera mı Monitör mü Masa mı (uygulama baştan açılınca bir kez; Android girisGoster ile aynı)
struct GirisEkran: View {
    /// Bu süreçte soruldu mu (uygulama tamamen kapanınca sıfırlanır)
    static var soruldu = false
    var sec: (AnaEkran.Ekran?) -> Void
    @State private var hatirla = false

    var body: some View {
        ZStack {
            Color(red: 27 / 255, green: 30 / 255, blue: 35 / 255).ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text("UPDATED").font(.system(size: 34, weight: .heavy, design: .default).width(.condensed))
                    Text("Ne yapmak istiyorsun?").font(.subheadline).foregroundStyle(Tema.metin2).padding(.bottom, 14)
                    kart("camera.fill", Tema.vurgu, "Kamera", "Fotoğraf, video, timelapse; gece, ışık izi, Samanyolu PRO modlarda.") { bitir(nil, "kamera") }
                    kart("display", Color(red: 106 / 255, green: 152 / 255, blue: 248 / 255), "Monitör",
                         "Kamerayı izle: iPhone kamerası, iPad'de USB, ağ yayını. Ölçümler, LUT, iki kaynak.") { bitir(.monitor, "monitor") }
                    kart("rectangle.split.2x2.fill", Color(red: 52 / 255, green: 199 / 255, blue: 89 / 255), "Masa",
                         "Çok kamera: Wi-Fi'daki telefonlar ve iPad'e takılan USB kameralar tek ekranda; dokununca geçiş, kayıt.") { bitir(.masa, nil) }
                    Toggle("Seçimimi hatırla (ayarlardan değişir)", isOn: $hatirla).font(.subheadline).foregroundStyle(Tema.metin2).tint(Tema.vurgu)
                }
                .padding(24)
                .frame(maxWidth: 520)
                .frame(maxWidth: .infinity)
            }
        }
    }

    private func bitir(_ e: AnaEkran.Ekran?, _ ad: String?) {
        GirisEkran.soruldu = true
        if hatirla, let ad { UserDefaults.standard.set(ad, forKey: "giris") }
        sec(e)
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
