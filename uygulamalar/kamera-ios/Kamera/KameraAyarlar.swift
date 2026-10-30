import AVFoundation
import SwiftUI

/// Genel Ayarlar (Fatih 29 Ekim, Final Cut Camera gibi): en üstte o modun ayarları. FOTO: çözünürlük · biçim (HEIF/JPEG/RAW) ·
/// zamanlayıcı; VİDEO: çözünürlük · kare hızı · Kayıt (kodek, SDR / HDR / Log, sabitleme) · Ses. Altında ortaklar, Masa, Uygulama
struct KameraAyarlar: View {
    @ObservedObject var kamera: Kamera
    var wifiKamera: () -> Void
    var vlog: () -> Void = {}
    var yardimAc: () -> Void = {}
    @Environment(\.dismiss) private var kapat

    var body: some View {
        NavigationStack {
            List {
                // Fatih 30 Ekim 13:33: ayarlar moda göre; fotoğrafta video ayarları (HDR/SDR, kodek, sabitleme, ses) görünmez
                if kamera.videoModu { videoBolum } else { fotoBolum }

                Section {
                    if kamera.videoModu {
                        NavigationLink { pozlama } label: { satir("plusminus.circle", .yellow, "Pozlama", kamera.enstAci ? "Açı" : "Süre") }
                    }
                    NavigationLink { renk } label: { satir("circle.lefthalf.filled", .pink, "Renk ve beyaz denge", kamera.bd.map { "\(Int($0))K" } ?? "Oto") }
                    NavigationLink { gostergeler } label: { satir("chart.bar", .green, "Göstergeler", kamera.gostergeEtkin ? "Açık" : (kamera.kompTur == .kapali ? "" : kamera.kompTur.ad)) }
                    NavigationLink { FavoriDuzenle(kamera: kamera) } label: { satir("pin", .yellow, "Sabitlenenler", "\(kamera.favoriler.count)") }
                }
                if kamera.mod == .video {
                    Section {
                        Button { kapat(); vlog() } label: { satir("person.crop.rectangle.stack", .orange, "Vlog (çift kamera)", "Arka + ön") }
                            .foregroundStyle(.white)
                    } footer: { Text("Arka ve ön kamera aynı anda; ön kamera köşede.") }
                }
                Section {
                    NavigationLink { masaBolum } label: { satir("rectangle.split.2x2", .teal, "Multi Cam'e bağlan", "") }
                    NavigationLink { uygulama } label: { satir("info.circle", .gray, "Uygulama", KameraAyarlar.surum) }
                    Button { kapat(); yardimAc() } label: { satir("questionmark.circle", .gray, "Ekrandaki açıklamalar", "") }
                        .foregroundStyle(.white)
                } footer: { Text(kamera.videoModu ? "Fotoğraf ayarları FOTO modunda görünür." : "Video ayarları VİDEO modunda görünür.") }
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
        .onChange(of: kamera.renkModu) { _, _ in kamera.secenekleriYaz() }
    }

    /// Fotoğraf modları: çözünürlük ve dosya biçimi en üstte, tek yerde
    @ViewBuilder private var fotoBolum: some View {
        Section {
            if !kamera.fotoBoyutlari.isEmpty {
                Picker("Çözünürlük", selection: Binding(get: { kamera.fotoBoyut.map { "\($0.width)x\($0.height)" } ?? "" },
                                                        set: { k in if let b = kamera.fotoBoyutlari.first(where: { "\($0.width)x\($0.height)" == k }) { kamera.fotoBoyutSec(b) } })) {
                    ForEach(kamera.fotoBoyutlari.map { "\($0.width)x\($0.height)" }, id: \.self) { k in
                        Text(kamera.fotoBoyutlari.first { "\($0.width)x\($0.height)" == k }.map(KameraAyarlar.mp) ?? k).tag(k)
                    }
                }
            }
            VStack(alignment: .leading, spacing: 8) {
                Text("Biçim")
                Picker("Biçim", selection: Binding(get: { kamera.fotoBicim }, set: { kamera.fotoBicim = $0 })) {
                    ForEach(kamera.fotoBicimleri) { f in Text(f.rawValue).tag(f) }
                }
                .pickerStyle(.segmented).labelsHidden()
            }
            .padding(.vertical, 4)
            if kamera.mod != .pro {
                Picker("Zamanlayıcı", selection: $kamera.zamanlayici) {
                    ForEach([0, 3, 10], id: \.self) { z in Text(z == 0 ? "Kapalı" : "\(z) sn").tag(z) }
                }
            }
            if kamera.sesKapatilabilir { Toggle("Deklanşör sesi", isOn: $kamera.deklansorSesi) }
        } header: { Text("Fotoğraf") } footer: {
            Text(kamera.fotoBicim.aciklama + (kamera.fotoBicim == .raw ? " (yanında \(kamera.heif ? "HEIF" : "JPEG") de kaydedilir)." : "."))
        }
    }

    /// Video modları: çözünürlük, kare hızı, kayıt (kodek · renk · sabitleme), ses
    @ViewBuilder private var videoBolum: some View {
        Section {
            Picker("Çözünürlük", selection: $kamera.videoYukseklik) {
                ForEach(kamera.videoSecenekleri, id: \.self) { h in Text(KameraAyarlar.cozYazi(h)).tag(h) }
            }
            if kamera.mod == .video {
                Picker("Kare hızı", selection: $kamera.videoFps) {
                    ForEach(kamera.videoFpsler, id: \.self) { f in Text("\(f) fps").tag(f) }
                }
                NavigationLink { kayit } label: { satir("record.circle", .orange, "Kayıt", "\(kamera.kodek.kisa) · \(kamera.renkModu.kisa)") }
                NavigationLink { ses } label: { satir("waveform", .red, "Ses", kamera.etkinSesGirdi ?? "Otomatik") }
            } else {
                NavigationLink { timelapse } label: { satir("timelapse", .purple, "Timelapse", Timelapse.aralikYazi(kamera.tlAralik)) }
            }
        } header: { Text("Video") } footer: { if kamera.mod == .video { Text(ozet) } }
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
                Text(kamera.mod == .video ? "ProRes seçilince kamera 10 bit 4:2:2 biçime geçer. Soluk olanları bu iPhone bu çözünürlük, kare hızı ve renkte kaydedemiyor. ProRes 4K 60 yalnız harici SSD'ye yazılır."
                                          : "ProRes seçenekleri VİDEO modundayken görünür.")
            }
            Section {
                Toggle("Harici SSD'ye kaydet", isOn: $kamera.ssdKayit).tint(Tema.sari)
                HStack {
                    Text("Durum")
                    Spacer()
                    if let ad = kamera.ssd.ad {
                        Text(kamera.ssd.bosAlan.map { "\(ad) · \(HariciDisk.boyutYazisi($0)) boş" } ?? ad).foregroundStyle(kamera.ssd.izin ? Color.secondary : Color.orange)
                    } else { Text("Takılı değil").foregroundStyle(.secondary) }
                }
                if kamera.ssd.takili, !kamera.ssd.izin { Text("Harici disk izni verilmedi; iPhone sorunca İzin Ver'e dokunun.").font(.footnote).foregroundStyle(.orange) }
            } header: { Text("Harici SSD") } footer: {
                Text("USB-C'ye takılı SSD'ye doğrudan kayıt (iPhone 15 Pro ve sonrası). Dosya SSD'de kalır, Fotoğraflar'a kopyalanmaz. ProRes 4K 60 ancak böyle kaydedilir; SSD yoksa HEVC'ye düşer.")
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

    private var gostergeler: some View {
        List {
            Section {
                GostergeMenu(kamera: kamera).listRowBackground(Color.clear)
            } header: { Text("Görüntü araçları") }
            Section("Kompozisyon") {
                Picker("Kılavuz", selection: $kamera.kompTur) {
                    ForEach(KompTur.allCases) { t in Text(t.ad).tag(t) }
                }
                Toggle("Terazi", isOn: $kamera.teraziAcik)
            }
            Section {
                Toggle("AI Kadraj", isOn: $kamera.asistanAcik)
                if kamera.asistanAcik { Toggle("Sahne önerileri (gece, portre…)", isOn: $kamera.sahneOto) }
            } footer: { Text("Konuyu bulur, yön tarif eder; sahneyi birkaç saniye inceleyip tek öneri getirir, dokununca uygulanır. Kadraj iyiyse çizgiler yeşil olur. Ekranda konuya dokununca o konu seçilir, odak ve pozlama onu izler; uzun basınca bırakır. Kapalıyken ekranda hiçbiri görünmez.") }
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
            } footer: { Text("Bu telefonun görüntüsü aynı Wi-Fi'daki UpCam Studio'ya (Multi Cam) kaynak olarak gider; kendiliğinden bulunur.") }
            Section {
                NavigationLink { Insta360Deneme() } label: { Label("Insta360 kamerayı dene (Wi-Fi)", systemImage: "camera.metering.center.weighted") }
            } footer: { Text("Luna, X ve GO serisi: telefon kameranın kendi Wi-Fi'ına bağlıyken canlı görüntüyü doğrudan alır. Deneme aşamasında.") }
            Section {
                EkranGonderDugme()
            } footer: { Text("Ekranda ne varsa masaya kaynak olarak gider. Kendi görüntü çıkışı olmayan kameralar (ör. Insta360 Luna Ultra) için: kameranın uygulamasını açıp önizlemeyi tam ekran yap, sonra buradan başlat. Durdurmak için üstteki kırmızı göstergeye dokun.") }
        }
        .navigationTitle("Multi Cam")
    }

    private var uygulama: some View {
        List {
            Section {
                LabeledContent("Sürüm", value: KameraAyarlar.surum)
            } footer: { Text("Multi Cam ve Monitör artık UpCam Studio uygulamasında. Güncellemeler TestFlight'tan kendiliğinden gelir.") }
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
    /// Menü satırı (Fatih 30 Ekim: renkli kutulu simgeler "saçma"): kameranın dili, tek renk ince simge, yarım piksel hatlı koyu kutu;
    /// renk yalnız değer elle değişmişse (sarı). `renk` parametresi eski çağrılar için durur, kullanılmaz.
    private func satir(_ simge: String, _ renk: Color, _ ad: String, _ deger: String) -> some View {
        HStack(spacing: 13) {
            Image(systemName: simge).font(.system(size: 14, weight: .regular)).foregroundStyle(.white.opacity(0.92))
                .frame(width: 30, height: 30)
                .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Color.white.opacity(0.07)))
                .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Tema.hat, lineWidth: 0.5))
            Text(ad).font(.system(size: 16))
            Spacer()
            Text(deger).font(.system(size: 15).monospacedDigit()).foregroundStyle(Tema.ikincil).lineLimit(1)
        }
        .padding(.vertical, 1)
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
