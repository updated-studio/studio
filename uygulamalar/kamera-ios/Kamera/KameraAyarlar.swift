import AVFoundation
import SwiftUI

/// Genel Ayarlar (Fatih 29 Ekim, Final Cut Camera gibi): en üstte çözünürlük, altında tek dokunuşla açılan bölümler:
/// Kayıt (kodek, SDR / HDR / Log, sabitleme) · Pozlama · Fotoğraf · Ses · Göstergeler · Timelapse · Masa · Uygulama
struct KameraAyarlar: View {
    @ObservedObject var kamera: Kamera
    var wifiKamera: () -> Void
    var masa: () -> Void
    @Environment(\.dismiss) private var kapat
    @State private var girisSor = UserDefaults.standard.string(forKey: "giris") == nil

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Picker("Video", selection: $kamera.videoYukseklik) {
                        ForEach(kamera.videoSecenekleri, id: \.self) { h in Text(KameraAyarlar.cozYazi(h)).tag(h) }
                    }
                    Picker("Kare hızı", selection: $kamera.videoFps) {
                        ForEach(kamera.videoFpsler, id: \.self) { f in Text("\(f) fps").tag(f) }
                    }
                    if !kamera.fotoBoyutlari.isEmpty {
                        Picker("Fotoğraf", selection: Binding(get: { kamera.fotoBoyut.map { "\($0.width)x\($0.height)" } ?? "" },
                                                              set: { k in if let b = kamera.fotoBoyutlari.first(where: { "\($0.width)x\($0.height)" == k }) { kamera.fotoBoyutSec(b) } })) {
                            ForEach(kamera.fotoBoyutlari.prefix(5).map { "\($0.width)x\($0.height)" }, id: \.self) { k in
                                Text(kamera.fotoBoyutlari.first { "\($0.width)x\($0.height)" == k }.map(KameraAyarlar.mp) ?? k).tag(k)
                            }
                        }
                    }
                } header: { Text("Çözünürlük") } footer: { Text(ozet) }

                Section {
                    NavigationLink { kayit } label: { satir("film", .orange, "Kayıt", "\(kamera.kodek.kisa) · \(kamera.renkModu.kisa)") }
                    NavigationLink { pozlama } label: { satir("plusminus.circle", .yellow, "Pozlama", kamera.enstAci ? "Açı" : "Süre") }
                    NavigationLink { renk } label: { satir("thermometer.sun", .pink, "Renk ve beyaz denge", kamera.bd.map { "\(Int($0))K" } ?? "Oto") }
                    NavigationLink { ses } label: { satir("mic", .red, "Ses", kamera.etkinSesGirdi ?? "Otomatik") }
                    NavigationLink { fotograf } label: { satir("camera", .blue, "Fotoğraf", kamera.raw && kamera.rawVar ? "RAW" : "JPEG") }
                    NavigationLink { gostergeler } label: { satir("chart.bar.xaxis", .green, "Göstergeler", kamera.gostergeEtkin ? "Açık" : (kamera.kompTur == .kapali ? "" : kamera.kompTur.ad)) }
                    NavigationLink { timelapse } label: { satir("timer", .purple, "Timelapse", Timelapse.aralikYazi(kamera.tlAralik)) }
                }
                Section {
                    NavigationLink { masaBolum } label: { satir("rectangle.split.2x2", .teal, "Masa (çok kamera)", "") }
                    NavigationLink { uygulama } label: { satir("info.circle", .gray, "Uygulama", KameraAyarlar.surum) }
                }
            }
            .navigationTitle("Genel Ayarlar")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Tamam") { kapat() }.fontWeight(.semibold) } }
        }
        .tint(Tema.sari)
        .preferredColorScheme(.dark)
        .presentationDetents([.large])
        .disabled(kamera.kayitta)
        .onAppear { kamera.secenekleriYaz() }
        .onChange(of: kamera.videoYukseklik) { _, _ in kamera.secenekleriYaz() }
        .onChange(of: kamera.videoFps) { _, _ in kamera.secenekleriYaz() }
    }

    private var ozet: String {
        var p = ["\(KameraAyarlar.cozYazi(kamera.videoYukseklik)) \(kamera.videoFps)", kamera.kodek.kisa, kamera.renkModu.kisa]
        if kamera.harici { p.append("harici mikrofon") }
        return "Video kaydı: " + p.joined(separator: " · ")
    }

    // MARK: bölümler

    private var kayit: some View {
        List {
            Section {
                ForEach(Kodek.allCases) { k in
                    secimSatiri(k.ad, k.aciklama, secili: kamera.kodek == k, destek: kamera.kodekler.contains(k)) { kamera.kodek = k }
                }
            } header: { Text("Kodek") } footer: {
                Text(kamera.mod == .video ? "Soluk olanları bu iPhone bu çözünürlük ve kare hızında kaydedemiyor. ProRes 4K 60 için iPhone'a harici SSD gerekebilir."
                                          : "ProRes seçenekleri VİDEO modundayken görünür.")
            }
            Section {
                ForEach(RenkModu.allCases) { r in
                    secimSatiri(r.ad, r.aciklama, secili: kamera.renkModu == r, destek: kamera.renkModlari.contains(r)) { kamera.renkModu = r }
                }
            } header: { Text("Renk") } footer: { Text("Log görüntü kayıtta soluktur; kurguda LUT ile renklendirilir. Log ve HDR çoğu iPhone'da 10 bit biçim ister.") }
            Section("Sabitleme") {
                ForEach(Sabitleme.allCases) { s in
                    secimSatiri(s.ad, s.aciklama, secili: kamera.sabitleme == s, destek: kamera.sabitlemeler.contains(s)) { kamera.sabitleme = s }
                }
            }
        }
        .navigationTitle("Kayıt")
    }

    private var pozlama: some View {
        List {
            Section {
                Picker("Enstantane gösterimi", selection: $kamera.enstAci) {
                    Text("Süre (1/50)").tag(false)
                    Text("Açı (180°)").tag(true)
                }
                .pickerStyle(.inline).labelsHidden()
            } header: { Text("Video enstantanesi") } footer: {
                Text("Sinema kameralarındaki gibi açı: 180° kare hızının iki katı süre demek (\(kamera.videoFps) fps'te 1/\(kamera.videoFps * 2)). Değer, kamera ekranında Pozlama'dan seçilir.")
            }
        }
        .navigationTitle("Pozlama")
    }

    private var renk: some View {
        List {
            Section {
                Cetvel(tur: .bd, kamera: kamera).listRowBackground(Color.clear)
            } footer: { Text("Kamera ekranındaki beyaz denge düğmesi de aynı ayarları açar.") }
        }
        .navigationTitle("Renk")
    }

    private var ses: some View {
        List {
            Section {
                secimSatiri("Otomatik", "Takılan harici mikrofon kendiliğinden seçilir", secili: kamera.sesGirdi == nil, destek: true) { kamera.sesGirdi = nil }
                ForEach(kamera.sesGirdileri) { g in
                    secimSatiri(g.ad, g.harici ? "Harici" : "iPhone", secili: kamera.sesGirdi == g.id, destek: true) { kamera.sesGirdi = g.id }
                }
            } header: { Text("Giriş") } footer: { Text("Şu an kaydeden: \(kamera.etkinSesGirdi ?? "—")") }
            Section {
                ForEach(SesBicimi.allCases) { b in
                    secimSatiri(b.ad, b.aciklama, secili: kamera.sesBicimi == b, destek: true) { kamera.sesBicimi = b }
                }
            } header: { Text("Biçim") } footer: { Text("PCM ses .mov dosyasına sıkıştırmasız yazılır; dosya biraz büyür.") }
        }
        .navigationTitle("Ses")
        .onAppear { kamera.sesGirdileriYaz() }
    }

    private var fotograf: some View {
        List {
            if kamera.rawVar { Toggle("RAW (DNG) da kaydet", isOn: $kamera.raw) }
            Picker("Zamanlayıcı", selection: $kamera.zamanlayici) {
                ForEach([0, 3, 10], id: \.self) { z in Text(z == 0 ? "Kapalı" : "\(z) sn").tag(z) }
            }
            if kamera.sesKapatilabilir {
                Toggle("Deklanşör sesi", isOn: $kamera.deklansorSesi)
            } else {
                Text("Deklanşör sesini iPhone kendisi çalar (sessiz düğmesine göre).").font(.footnote).foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Fotoğraf")
    }

    private var gostergeler: some View {
        List {
            Section {
                GostergeMenu(kamera: kamera).listRowBackground(Color.clear)
            } header: { Text("Görüntü araçları") }
            Section("Kompozisyon") {
                Picker("Kılavuz", selection: $kamera.kompTur) {
                    ForEach(KompTur.allCases) { t in Text(t.ad).tag(t) }
                }
                Toggle("Otomatik kılavuz önerisi", isOn: $kamera.oneriAcik)
            }
            Section("Yardımcılar") {
                Toggle("Terazi", isOn: $kamera.teraziAcik)
                Toggle("Akıllı yardımcı (ibre)", isOn: $kamera.asistanAcik)
                Toggle("Otomatik sahne önerisi", isOn: $kamera.sahneOto)
            }
        }
        .navigationTitle("Göstergeler")
    }

    private var timelapse: some View {
        List {
            Picker("Kare aralığı", selection: $kamera.tlAralik) {
                ForEach(Timelapse.araliklar, id: \.self) { a in Text(Timelapse.aralikYazi(a)).tag(a) }
            }
            Picker("Çekim süresi", selection: $kamera.tlSure) {
                ForEach(Timelapse.sureler, id: \.self) { s in Text(Timelapse.sureYazi(s)).tag(s) }
            }
            Section {
                Toggle("Pozlamayı başta sabitle", isOn: $kamera.tlPozSabit)
            } footer: { Text("Açıkken parlaklık kareden kareye oynamaz (titreme olmaz). Gün batımı gibi ışığın değiştiği çekimlerde kapat.") }
        }
        .navigationTitle("Timelapse")
    }

    private var masaBolum: some View {
        List {
            Section {
                Button { kapat(); wifiKamera() } label: { Label("Wi-Fi kamera ol", systemImage: "wifi") }
            } footer: { Text("Bu telefonun görüntüsü aynı Wi-Fi'daki masaya gider; masa kendiliğinden bulur.") }
            Button { kapat(); masa() } label: { Label("Bu cihazı masa yap", systemImage: "rectangle.split.2x2") }
        }
        .navigationTitle("Masa")
    }

    private var uygulama: some View {
        List {
            Section {
                Toggle("Açılışta Kamera / Monitör / Masa sor", isOn: $girisSor)
                    .onChange(of: girisSor) { _, acik in
                        if acik { UserDefaults.standard.removeObject(forKey: "giris") } else { UserDefaults.standard.set("kamera", forKey: "giris") }
                    }
            } footer: { Text("UPDATED Kamera \(KameraAyarlar.surum) · güncellemeler TestFlight'tan kendiliğinden gelir.") }
        }
        .navigationTitle("Uygulama")
    }

    // MARK: parçalar

    static var surum: String {
        let b = Bundle.main.infoDictionary
        return "\(b?["CFBundleShortVersionString"] as? String ?? "") (\(b?["CFBundleVersion"] as? String ?? ""))"
    }

    static func cozYazi(_ h: Int) -> String { h >= 2160 ? "4K" : (h >= 1080 ? "HD 1080p" : "\(h)p") }

    static func mp(_ b: CMVideoDimensions) -> String {
        let mp = Int((Double(b.width) * Double(b.height) / 1_000_000).rounded())
        let r = Double(max(b.width, b.height)) / Double(max(1, min(b.width, b.height)))
        let oran = abs(r - 4.0 / 3) < 0.03 ? "4:3" : (abs(r - 16.0 / 9) < 0.03 ? "16:9" : (abs(r - 1) < 0.03 ? "1:1" : String(format: "%.2f", r)))
        return "\(mp) MP · \(oran)"
    }

    /// Ayarlar uygulamasındaki gibi: renkli kare simge, ad, sağda o anki değer
    private func satir(_ simge: String, _ renk: Color, _ ad: String, _ deger: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: simge).font(.system(size: 14, weight: .medium)).foregroundStyle(.white)
                .frame(width: 28, height: 28).background(RoundedRectangle(cornerRadius: 7, style: .continuous).fill(renk.gradient))
            Text(ad)
            Spacer()
            Text(deger).foregroundStyle(.secondary).lineLimit(1)
        }
    }

    /// Tek seçimli satır: ad, altında kısa açıklama, seçiliyse ✓; desteklenmiyorsa soluk
    private func secimSatiri(_ ad: String, _ aciklama: String, secili: Bool, destek: Bool, sec: @escaping () -> Void) -> some View {
        Button(action: sec) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(ad).foregroundStyle(.primary)
                    Text(aciklama).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                if secili { Image(systemName: "checkmark").fontWeight(.semibold).foregroundStyle(Tema.sari) }
            }
            .contentShape(Rectangle())
        }
        .disabled(!destek)
        .opacity(destek ? 1 : 0.4)
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
                         "Çok kamera: Wi-Fi'daki telefonlar ve iPad'e takılan USB kameralar tek ekranda; dokununca geçiş, kayıt.") { bitir(.masa, "masa") }
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
