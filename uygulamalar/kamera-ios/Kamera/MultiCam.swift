import PhotosUI
import SwiftUI

// UpCam Studio Multi Cam arayüzü (Fatih 30 Ekim 03:12 "menü tasarımı çok vasat, komple elden geçir"; tasarım/upcam-studio, iPhone'da "Ninja" düzeni, Fatih 30 Ekim 08:24).
// Kamera uygulamasının dili: görüntü tam ekran, denetimler kenarlarda; tablo rakamları, yarı saydam siyah yüzey + yarım piksel hat;
// sarı yalnız seçili/elle değişen, kırmızı canlı ve kayıt, yeşil sıradaki. Kaynağa dokun → sıradaki (yeşil); sıradakine bir daha dokun ya da
// AUTO → seçili geçişle canlı; CUT → hemen canlı. Basılı tut → menü.

enum MC {
    static let kirmizi = Color(red: 1, green: 69 / 255, blue: 58 / 255)
    static let yesil = Color(red: 52 / 255, green: 199 / 255, blue: 89 / 255)
    static let tusZemin = Color.white.opacity(0.07)

    static func sure(_ s: TimeInterval) -> String {
        let t = Int(s)
        return String(format: "%02d:%02d:%02d", t / 3600, t / 60 % 60, t % 60)
    }

    static func saniye(_ s: Double) -> String {
        (s == s.rounded() ? String(format: "%.0f", s) : String(format: s * 4 == (s * 4).rounded() && s < 1 ? "%.2f" : "%.1f", s))
            .replacingOccurrences(of: ".", with: ",") + " sn"
    }
}

/// Kaynak küçük resmi: canlı kırmızı, sıradaki yeşil çerçeve; sol altta numara + ad
struct KaynakKutu: View {
    @ObservedObject var y: Yuva
    let no: Int
    let canli: Bool
    let sirada: Bool
    let kayitBasi: Date?
    var kucuk = false

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            Goruntu(gorunum: y.gorunum)
            if !y.bagli { ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity) }
            if y.kaydediyor, kayitBasi != nil {
                Circle().fill(MC.kirmizi).frame(width: 7, height: 7)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing).padding(7)
            }
            HStack(spacing: 5) {
                Text("\(no)").font(.system(size: kucuk ? 10 : 11, weight: .bold).monospacedDigit())
                    .foregroundStyle(sirada && !canli ? .black : .white)
                    .frame(width: kucuk ? 16 : 18, height: kucuk ? 16 : 18)
                    .background(RoundedRectangle(cornerRadius: 4, style: .continuous).fill(canli ? MC.kirmizi : (sirada ? MC.yesil : Color.black.opacity(0.55))))
                if !kucuk { Image(systemName: y.simge).font(.system(size: 9, weight: .semibold)) }
                Text(y.ad).font(.system(size: kucuk ? 10 : 11, weight: .semibold)).lineLimit(1)
            }
            .shadow(color: .black.opacity(0.8), radius: 2)
            .padding(6)
        }
        .aspectRatio(16 / 9, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous)
            .strokeBorder(canli ? MC.kirmizi : (sirada ? MC.yesil : Tema.hat), lineWidth: canli || sirada ? 2.5 : 0.5))
        .contentShape(Rectangle())
    }
}

/// Kaynağa dokunuş ve basılı tutma menüsü (iPhone ve iPad aynı)
struct KaynakDokunus: ViewModifier {
    @ObservedObject var m: Masa
    let y: Yuva

    func body(content: Content) -> some View {
        content
            .onTapGesture {
                if y.id == m.canli { return }
                if y.id == m.siradaki { m.gec(otomatik: true) } else { m.siradakiYap(y) }
            }
            .contextMenu {
                Button { m.canliYap(y) } label: { Label("Hemen canlıya al (CUT)", systemImage: "bolt") }
                Button { m.autoYap(y) } label: { Label("Geçişle canlıya al (AUTO)", systemImage: "wand.and.rays") }
                Button { m.siradakiYap(y) } label: { Label("Sıradaki yap", systemImage: "eye") }
                Button { m.dondur(y) } label: { Label("Döndür (90°)", systemImage: "rotate.right") }
                Button(role: .destructive) { m.kaldir(y) } label: { Label("Kaldır", systemImage: "trash") }
            }
    }
}

/// Boş kaynak yeri: dokununca Kaynak ekle
struct BosKaynak: View {
    let no: Int
    var eylem: () -> Void

    var body: some View {
        Button(action: eylem) {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .strokeBorder(Color.white.opacity(0.16), style: StrokeStyle(lineWidth: 1, dash: [4, 4]))
                .aspectRatio(16 / 9, contentMode: .fit)
                .overlay(HStack(spacing: 5) { Image(systemName: "plus"); Text("Kaynak \(no)") }
                    .font(.system(size: 11, weight: .semibold)).foregroundStyle(Tema.ikincil))
        }
        .buttonStyle(.plain)
    }
}

/// Kayıt düğmesi (Kamera uygulamasıyla aynı): beyaz halka, kırmızı daire; kayıtta kare
struct McKayitDugmesi: View {
    @ObservedObject var m: Masa
    var boyut: CGFloat = 60

    var body: some View {
        Button { m.kayitDegistir() } label: {
            ZStack {
                Circle().strokeBorder(.white, lineWidth: 3).frame(width: boyut, height: boyut)
                RoundedRectangle(cornerRadius: m.kayitta ? 6 : boyut * 0.4, style: .continuous).fill(MC.kirmizi)
                    .frame(width: m.kayitta ? boyut * 0.38 : boyut * 0.78, height: m.kayitta ? boyut * 0.38 : boyut * 0.78)
            }
            .animation(.easeOut(duration: 0.15), value: m.kayitta)
        }
        .keyboardShortcut("r", modifiers: [])
        .accessibilityLabel(m.kayitta ? "Kaydı durdur" : "Kaydı başlat")
    }
}

/// CUT / AUTO düğmesi
struct GecisDugmesi: View {
    let ad: String
    var dolu = false
    var ilerleme: Double?
    var eylem: () -> Void

    var body: some View {
        Button(action: eylem) {
            Text(ad).font(.system(size: 11, weight: .bold)).tracking(0.8)
                .foregroundStyle(dolu ? .black : .white)
                .frame(width: 56, height: 34)
                .background(
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 9, style: .continuous).fill(dolu ? Color.white : Tema.koyu)
                        if let ilerleme {
                            RoundedRectangle(cornerRadius: 9, style: .continuous).fill(Tema.sari.opacity(0.45))
                                .frame(width: 56 * ilerleme)
                        }
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous).strokeBorder(dolu ? .white : Tema.hat, lineWidth: 0.5))
                )
        }
        .buttonStyle(.plain)
    }
}

/// Üst okuma şeridi: kayıt süresi, program biçimi, geçiş, SSD
struct OkumaSeridi: View {
    @ObservedObject var m: Masa

    var body: some View {
        HStack(spacing: 8) {
            if m.kayitta, let bas = m.kayitBasi {
                TimelineView(.periodic(from: bas, by: 1)) { an in
                    HStack(spacing: 6) {
                        Circle().fill(MC.kirmizi).frame(width: 7, height: 7)
                        Text(MC.sure(an.date.timeIntervalSince(bas))).font(.system(size: 13, weight: .semibold).monospacedDigit())
                    }
                    .padding(.horizontal, 10).frame(height: 30)
                    .yuzey(8)
                }
            }
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                oku(m.duzenAdet > 0 ? "4K" : "HD", m.duzenAdet > 0 ? "\(m.duzenAdet)'Lİ" : "TEK")
                oku(m.gecis.ad, MC.saniye(m.gecisSure).replacingOccurrences(of: " sn", with: "S"), sari: true)
                oku("\(m.yuvalar.count)", "KAYNAK")
                if let ad = m.klasor.ad { oku("SSD", m.klasor.takili ? (m.klasor.bosAlan.map { KayitKlasoru.boyutYazisi($0) } ?? ad) : "YOK") }
            }
            .padding(.horizontal, 12).frame(height: 30)
            .yuzey(8)
        }
    }

    private func oku(_ d: String, _ e: String, sari: Bool = false) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 2) {
            Text(d).font(Tema.deger).foregroundStyle(sari ? Tema.sari : .white)
            Text(e).font(Tema.etiket).tracking(0.6).foregroundStyle(Tema.ikincil)
        }
    }
}

/// Düzen seçici şerit: Oto · Tek · 2'li · 3'lü · 2×2 (+ PiP)
struct DuzenSeridi: View {
    @ObservedObject var m: Masa

    var body: some View {
        HStack(spacing: 2) {
            ForEach(Masa.Duzen.allCases) { d in
                Button { m.duzen = d } label: {
                    Text(d.ad).font(.system(size: 11.5, weight: .semibold))
                        .foregroundStyle(m.duzen == d ? .white : Tema.ikincil)
                        .padding(.horizontal, 11).frame(height: 28)
                        .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(m.duzen == d ? Color.white.opacity(0.16) : .clear))
                }
            }
            Rectangle().fill(Tema.hat).frame(width: 0.5, height: 16).padding(.horizontal, 4)
            Button { m.pip.toggle() } label: {
                Text("PiP").font(.system(size: 11.5, weight: .semibold))
                    .foregroundStyle(m.pip ? Tema.sari : Tema.ikincil)
                    .padding(.horizontal, 11).frame(height: 28)
                    .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(m.pip ? Tema.sari.opacity(0.14) : .clear))
            }
        }
        .buttonStyle(.plain)
        .padding(3)
        .yuzey(11)
    }
}

/// Bildirim satırı (3 sn)
struct McBildirim: View {
    @ObservedObject var m: Masa

    var body: some View {
        if let b = m.bildirim {
            Text(b).font(.system(size: 12, weight: .semibold)).lineLimit(2).multilineTextAlignment(.center)
                .padding(.horizontal, 12).padding(.vertical, 7)
                .yuzey(10)
                .task(id: b) {
                    try? await Task.sleep(nanoseconds: 3_000_000_000)
                    if m.bildirim == b { m.bildirim = nil }
                }
        }
    }
}

// MARK: - iPhone

/// iPhone Multi Cam, "Ninja" düzeni (Fatih 30 Ekim 08:24, tasarim/upcam-studio/2 · 2): üstte değer hücreleri (dokun → o ayar),
/// ortada program, altta kaynaklar ve araçlar. Dikeyde hücreler iki satır, kaynaklar 2×2.
struct MultiCamTelefon: View {
    @ObservedObject var m: Masa
    var kapat: () -> Void
    @Binding var kaynakAcik: Bool
    @State private var panelAcik = false
    @State private var klasorAcik = false

    private static let serit = Color(red: 10 / 255, green: 10 / 255, blue: 12 / 255).opacity(0.86)

    var body: some View {
        GeometryReader { g in
            if g.size.width > g.size.height { yatay } else { dikey }
        }
        .background(Color.black.ignoresSafeArea())
        .foregroundStyle(.white)
        .sheet(isPresented: $panelAcik) {
            NavigationStack {
                ScrollView { MultiCamPanel(m: m, telefon: true).padding(16) }
                    .navigationTitle("Multi Cam").navigationBarTitleDisplayMode(.inline)
                    .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Bitti") { panelAcik = false } } }
            }
            .presentationDetents([.medium, .large])
            .presentationBackground(.ultraThinMaterial)
            .preferredColorScheme(.dark)
        }
        .sheet(isPresented: $klasorAcik) { KlasorSecici { m.klasor.sec($0) }.ignoresSafeArea() }
        .onAppear { m.klasor.guncelle() }
    }

    // MARK: düzenler

    private var yatay: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) { geri; hucreler }
                .frame(height: 46)
                .background(Self.serit)
                .overlay(alignment: .bottom) { Rectangle().fill(Tema.hat).frame(height: 0.5) }
            ZStack(alignment: .top) {
                program
                McBildirim(m: m).padding(.top, 8)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            HStack(spacing: 6) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) { kaynakHucreleri.frame(height: 58) }
                }
                araclar
            }
            .padding(.horizontal, 10).padding(.vertical, 7)
            .frame(height: 74)
            .background(Self.serit)
            .overlay(alignment: .top) { Rectangle().fill(Tema.hat).frame(height: 0.5) }
        }
    }

    private var dikey: some View {
        VStack(spacing: 0) {
            VStack(spacing: 0) {
                HStack(spacing: 0) { geri; hucre("KAYIT", kayit: true) { kayitDegeri }; hucre("CANLI") { Text(canliAdi) } }
                    .frame(height: 46)
                Rectangle().fill(Color.white.opacity(0.08)).frame(height: 0.5)
                HStack(spacing: 0) { gecisHucresi; duzenHucresi; ssdHucresi }
                    .frame(height: 46)
            }
            .background(Self.serit)
            .overlay(alignment: .bottom) { Rectangle().fill(Tema.hat).frame(height: 0.5) }
            ZStack(alignment: .top) {
                program.aspectRatio(16 / 9, contentMode: .fit)
                McBildirim(m: m).padding(.top, 8)
            }
            .overlay(alignment: .bottom) { Rectangle().fill(m.canli == nil ? .clear : MC.kirmizi).frame(height: 2) }
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) { kaynakHucreleri }
                .padding(12)
            Spacer(minLength: 0)
            HStack(spacing: 6) { araclar }
                .padding(.horizontal, 12).padding(.vertical, 10)
                .background(Self.serit)
                .overlay(alignment: .top) { Rectangle().fill(Tema.hat).frame(height: 0.5) }
        }
    }

    // MARK: üst hücreler

    private var hucreler: some View {
        HStack(spacing: 0) {
            hucre("KAYIT", kayit: true) { kayitDegeri }.frame(maxWidth: 124)
            hucre("CANLI") { Text(canliAdi) }
            gecisHucresi
            duzenHucresi
            hucre("PROGRAM") { Text(m.duzenAdet > 0 ? "4K" : "HD") }
            ssdHucresi
        }
    }

    private var canliAdi: String { m.yuvalar.first { $0.id == m.canli }?.ad ?? "—" }

    @ViewBuilder private var kayitDegeri: some View {
        if m.kayitta, let bas = m.kayitBasi {
            TimelineView(.periodic(from: bas, by: 1)) { an in Text("● " + MC.sure(an.date.timeIntervalSince(bas))) }
        } else {
            Text("HAZIR").foregroundStyle(Tema.ikincil)
        }
    }

    private var gecisHucresi: some View {
        Menu {
            Picker("Geçiş", selection: $m.gecis) { ForEach(Masa.Gecis.allCases) { Text($0.ad).tag($0) } }
            Picker("Süre", selection: $m.gecisSure) { ForEach(Masa.gecisSureleri, id: \.self) { Text(MC.saniye($0)).tag($0) } }
        } label: {
            hucre("GEÇİŞ") { Text("\(m.gecis.ad) \(MC.saniye(m.gecisSure).replacingOccurrences(of: " sn", with: ""))").foregroundStyle(Tema.sari) }
        }
    }

    private var duzenHucresi: some View {
        Menu {
            Picker("Düzen", selection: $m.duzen) { ForEach(Masa.Duzen.allCases) { Text($0.ad).tag($0) } }
            Toggle("PiP (resim içinde resim)", isOn: $m.pip)
        } label: {
            hucre("DÜZEN") { Text(m.duzen == .oto ? (m.duzenAdet == 0 ? "OTO · TEK" : "OTO · \(m.duzenAdet)") : m.duzen.ad.uppercased(with: Locale(identifier: "tr"))) + Text(m.pip ? " +PiP" : "").foregroundColor(Tema.sari) }
        }
    }

    private var ssdHucresi: some View {
        Button { klasorAcik = true } label: {
            hucre("SSD") {
                if let ad = m.klasor.ad {
                    Text(m.klasor.takili ? (m.klasor.bosAlan.map { KayitKlasoru.boyutYazisi($0) } ?? ad) : "YOK").foregroundStyle(m.klasor.takili ? .white : .orange)
                } else {
                    Text("SEÇ").foregroundStyle(Tema.ikincil)
                }
            }
        }
        .disabled(m.kayitta)
        .contextMenu { if m.klasor.ad != nil { Button(role: .destructive) { m.klasor.sil() } label: { Label("Klasörü kaldır (Fotoğraflar'a kaydet)", systemImage: "xmark") } } }
    }

    /// Ninja hücresi: küçük büyük harf etiket + yarı kalın değer; sağda ince ayraç
    private func hucre<V: View>(_ etiket: String, kayit: Bool = false, @ViewBuilder _ deger: () -> V) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(etiket).font(.system(size: 8.5, weight: .semibold)).tracking(1).foregroundStyle(.white.opacity(0.42))
            deger().font(.system(size: 14, weight: .semibold).monospacedDigit()).lineLimit(1).minimumScaleFactor(0.7)
                .foregroundStyle(kayit && m.kayitta ? MC.kirmizi : .white)
        }
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(kayit && m.kayitta ? MC.kirmizi.opacity(0.14) : .clear)
        .overlay(alignment: .trailing) { Rectangle().fill(Color.white.opacity(0.08)).frame(width: 0.5) }
        .contentShape(Rectangle())
    }

    private var geri: some View {
        Button(action: kapat) {
            Image(systemName: "chevron.left").font(.system(size: 15, weight: .semibold))
                .frame(width: 46).frame(maxHeight: .infinity)
                .overlay(alignment: .trailing) { Rectangle().fill(Color.white.opacity(0.08)).frame(width: 0.5) }
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(m.kayitta)
        .opacity(m.kayitta ? 0.35 : 1)
        .accessibilityLabel(Uygulama.geri)
    }

    // MARK: alt şerit

    /// Sağdaki araçlar: KATMAN (PiP/logo/alt yazı/FTB), MENÜ, CUT, AUTO, kayıt
    private var araclar: some View {
        HStack(spacing: 6) {
            arac("KATMAN", "square.3.layers.3d", secili: m.logoAcik || m.altYaziAcik || m.karartma || m.pip) { panelAcik = true }
            arac("FTB", "moon.fill", secili: m.karartma) { m.karartma.toggle() }
            Spacer(minLength: 0)
            arac("CUT", nil, dolu: true) { m.gec(otomatik: false) }
            arac("AUTO", nil, ilerleme: m.gecisIlerleme) { m.gec(otomatik: true) }
            McKayitDugmesi(m: m, boyut: 54).padding(.leading, 4)
        }
    }

    private func arac(_ ad: String, _ simge: String?, secili: Bool = false, dolu: Bool = false, ilerleme: Double? = nil, eylem: @escaping () -> Void) -> some View {
        Button(action: eylem) {
            VStack(spacing: 5) {
                if let simge { Image(systemName: simge).font(.system(size: 14, weight: .medium)) }
                Text(ad).font(.system(size: simge == nil ? 12 : 9, weight: .bold)).tracking(0.8)
            }
            .foregroundStyle(dolu ? .black : (secili ? Tema.sari : .white.opacity(0.85)))
            .frame(width: 56, height: 58)
            .background(
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 8, style: .continuous).fill(dolu ? Color.white : Color.white.opacity(0.04))
                    if let ilerleme { Rectangle().fill(Tema.sari.opacity(0.45)).frame(width: 56 * ilerleme) }
                }
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            )
            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(secili ? Tema.sari.opacity(0.5) : Tema.hat, lineWidth: 0.5))
        }
        .buttonStyle(.plain)
    }

    private var program: some View {
        ZStack {
            Goruntu(gorunum: m.program)
            if m.yuvalar.isEmpty {
                VStack(spacing: 8) {
                    Text("Kaynak yok").font(.headline)
                    Text("Bu telefonun kamerasını, aynı Wi-Fi'daki Updated Camera telefonlarını ya da aksiyon kameralarını ekle.")
                        .font(.footnote).foregroundStyle(Tema.ikincil).multilineTextAlignment(.center)
                    Button { kaynakAcik = true } label: {
                        Label("Kaynak ekle", systemImage: "plus").font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 16).frame(height: 36).yuzey(18)
                    }
                    .padding(.top, 4)
                }
                .padding(28).frame(maxWidth: 360)
            }
        }
    }

    @ViewBuilder private var kaynakHucreleri: some View {
        ForEach(0..<Masa.enCok, id: \.self) { i in
            if i < m.yuvalar.count {
                let y = m.yuvalar[i]
                KaynakKutu(y: y, no: i + 1, canli: y.id == m.canli, sirada: y.id == m.siradaki, kayitBasi: m.kayitBasi, kucuk: true)
                    .modifier(KaynakDokunus(m: m, y: y))
            } else if i == m.yuvalar.count {
                BosKaynak(no: i + 1) { kaynakAcik = true }
            }
        }
    }
}

// MARK: - Denetim paneli (iPad sağ sütun, iPhone ⋯ sayfası)

/// Başlık altında gruplanmış denetimler, önem sırasıyla: Geçiş, Katmanlar, Düzen, Kayıt
struct MultiCamPanel: View {
    @ObservedObject var m: Masa
    var telefon = false
    @State private var logoSecimi: PhotosPickerItem?
    @State private var yaziAcik = false

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            grup("GEÇİŞ") {
                HStack(spacing: 6) {
                    ForEach(Masa.Gecis.allCases) { t in tus(t.ad, secili: m.gecis == t) { m.gecis = t } }
                }
                HStack(spacing: 6) {
                    ForEach(Masa.gecisSureleri, id: \.self) { s in
                        tus(MC.saniye(s).replacingOccurrences(of: " sn", with: ""), secili: abs(m.gecisSure - s) < 0.01, kucuk: true) { m.gecisSure = s }
                    }
                    Text("sn").font(.system(size: 10, weight: .semibold)).foregroundStyle(Tema.ikincil)
                }
                if !telefon {
                    HStack(spacing: 10) {
                        tus("CUT", dolu: true) { m.gec(otomatik: false) }.frame(width: 76).keyboardShortcut(.space, modifiers: [])
                        tus("AUTO", secili: m.gecisIlerleme != nil) { m.gec(otomatik: true) }.frame(width: 76).keyboardShortcut(.return, modifiers: [])
                        Capsule().fill(Color.white.opacity(0.1)).frame(height: 5)
                            .overlay(alignment: .leading) {
                                GeometryReader { g in Capsule().fill(Tema.sari).frame(width: g.size.width * (m.gecisIlerleme ?? 0)) }
                            }
                    }
                }
            }
            grup("KATMANLAR") {
                HStack(spacing: 6) {
                    tus("PiP", secili: m.pip) { m.pip.toggle() }
                    tus("LOGO", secili: m.logoAcik) { m.logoAcik.toggle() }
                    tus("ALT YAZI", secili: m.altYaziAcik) { if m.altYaziBaslik.isEmpty { yaziAcik = true } else { m.altYaziAcik.toggle() } }
                    tus("FTB", secili: m.karartma, kirmizi: m.karartma) { m.karartma.toggle() }
                }
                HStack(spacing: 14) {
                    PhotosPicker(selection: $logoSecimi, matching: .images) {
                        Label(m.logo == nil ? "Logo seç" : "Logoyu değiştir", systemImage: "photo").font(.system(size: 12, weight: .semibold))
                    }
                    Button { yaziAcik.toggle() } label: { Label("Alt yazıyı düzenle", systemImage: "character.cursor.ibeam").font(.system(size: 12, weight: .semibold)) }
                }
                .foregroundStyle(Tema.ikincil)
                if yaziAcik {
                    VStack(spacing: 8) {
                        TextField("Başlık (ör. konuğun adı)", text: $m.altYaziBaslik).textFieldStyle(.roundedBorder)
                        TextField("Alt satır (ör. unvanı)", text: $m.altYaziAlt).textFieldStyle(.roundedBorder)
                        Button("Göster") { m.altYaziAcik = !m.altYaziBaslik.isEmpty; yaziAcik = false }
                            .font(.system(size: 13, weight: .semibold)).disabled(m.altYaziBaslik.isEmpty)
                    }
                }
                Text("PiP: sıradaki kaynak sağ altta küçük. FTB: program siyaha iner. Katmanlar yalnız program kaydına girer; kaynak dosyaları temiz kalır.")
                    .font(.system(size: 11)).foregroundStyle(Tema.metin3)
            }
            grup("DÜZEN") {
                HStack(spacing: 6) {
                    ForEach(Masa.Duzen.allCases) { d in tus(d.ad, secili: m.duzen == d) { m.duzen = d } }
                }
                Text("2'li, 3'lü ve 2×2'de kaynaklar 4K program tuvaline tam boyutuyla dizilir.").font(.system(size: 11)).foregroundStyle(Tema.metin3)
            }
            grup("KAYIT") {
                SsdCipi(k: m.klasor, kilitli: m.kayitta)
                Text("Her kaynak kendi dosyasına, program ayrı dosyaya, aynı anda. SSD seçili değilse Fotoğraflar'a.")
                    .font(.system(size: 11)).foregroundStyle(Tema.metin3)
            }
        }
        .onChange(of: logoSecimi) { _, yeni in
            guard let yeni else { return }
            Task {
                if let d = try? await yeni.loadTransferable(type: Data.self), let r = UIImage(data: d) {
                    await MainActor.run { m.logo = r; m.logoAcik = true }
                }
            }
        }
    }

    private func grup<C: View>(_ ad: String, @ViewBuilder _ icerik: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            Text(ad).bolumBasligi()
            icerik()
        }
    }

    private func tus(_ ad: String, secili: Bool = false, dolu: Bool = false, kirmizi: Bool = false, kucuk: Bool = false, eylem: @escaping () -> Void) -> some View {
        Button(action: eylem) {
            Text(ad).font(.system(size: kucuk ? 11 : 11.5, weight: .bold)).tracking(0.4).lineLimit(1).minimumScaleFactor(0.8)
                .foregroundStyle(kirmizi ? .white : (dolu ? .black : (secili ? Tema.sari : Tema.ikincil)))
                .frame(maxWidth: .infinity).frame(height: kucuk ? 32 : 40)
                .background(RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .fill(kirmizi ? MC.kirmizi : (dolu ? Color.white : (secili ? Tema.sari.opacity(0.15) : MC.tusZemin))))
                .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .strokeBorder(kirmizi || dolu ? .clear : (secili ? Tema.sari.opacity(0.5) : Tema.hat), lineWidth: 0.5))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Kaynak ekle

/// Kameranı seç, bağlantıyı biz kuralım: bu cihazın kameraları, aksiyon / 360 kameralar (adım adım), Updated Camera telefonları, USB
struct KaynakEkleSayfasi: View {
    @ObservedObject var m: Masa
    var kapat: () -> Void
    @State private var adres = ""

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(m.telefonKameralari, id: \.on) { k in
                        satir(k.on ? "person.crop.square" : "camera", k.on ? "Ön kamera" : "Arka kamera",
                              k.on ? "Konuşan kişi için · ayrı dosya" : "Bu cihaz · ayrı dosya, diğerleriyle aynı anda") {
                            if k.ekli { Text("Ekli").font(.system(size: 13, weight: .semibold)).foregroundStyle(Tema.ikincil) } else {
                                Button("Ekle") { m.telefonKamerasiEkle(on: k.on); kapat() }.font(.system(size: 14, weight: .semibold)).foregroundStyle(MC.yesil)
                            }
                        }
                    }
                } header: { Text("BU CİHAZ") }
                Section {
                    ForEach(HariciKamera.hepsi) { k in
                        NavigationLink { HariciKameraRehberi(k: k, m: m, kapat: kapat) } label: {
                            satir(k.simge, k.ad, k.alt) {
                                HStack(spacing: 4) { ForEach(k.yollar, id: \.self) { yol($0) } }
                            }
                        }
                    }
                } header: { Text("AKSİYON VE 360 KAMERALAR") }
                Section {
                    satir("iphone", "Updated Camera yüklü telefon", m.aglarIzni ? "Aynı Wi-Fi'da kendiliğinden gelir" : "Yerel ağ izni kapalı: Ayarlar → UpCam Studio → Yerel Ağ") {
                        Text("\(m.yuvalar.filter(\.wifi).count) bağlı").font(.system(size: 12, weight: .semibold)).foregroundStyle(Tema.ikincil)
                    }
                    HStack {
                        TextField("Adresle ekle (ör. 192.168.1.20)", text: $adres)
                            .keyboardType(.numbersAndPunctuation).autocorrectionDisabled().textInputAutocapitalization(.never)
                        Button("Ekle") { m.adresleEkle(adres); adres = ""; kapat() }
                            .disabled(adres.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                    .font(.system(size: 14))
                    satir("cable.connector", "USB kamera / yakalama kartı", UIDevice.current.userInterfaceIdiom == .pad ? "Takınca kendiliğinden eklenir" : "iPhone USB kamera kabul etmez; iPad'de çalışır") {
                        Button("Ara") { m.usbTara(); kapat() }.font(.system(size: 14, weight: .semibold))
                    }
                } header: { Text("DİĞER") }
            }
            .scrollContentBackground(.hidden)
            .background(Color(white: 0.05))
            .navigationTitle("Kaynak ekle")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Kapat", action: kapat) } }
        }
        .preferredColorScheme(.dark)
    }

    private func satir<S: View>(_ simge: String, _ ad: String, _ alt: String, @ViewBuilder sag: () -> S) -> some View {
        HStack(spacing: 13) {
            Image(systemName: simge).font(.system(size: 15, weight: .medium))
                .frame(width: 34, height: 34)
                .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(Color.white.opacity(0.08)))
            VStack(alignment: .leading, spacing: 2) {
                Text(ad).font(.system(size: 15, weight: .semibold))
                Text(alt).font(.system(size: 12)).foregroundStyle(Tema.ikincil).lineLimit(2)
            }
            Spacer(minLength: 8)
            sag()
        }
        .padding(.vertical, 2)
    }

    private func yol(_ y: String) -> some View {
        Text(y).font(.system(size: 9.5, weight: .semibold)).tracking(0.5).foregroundStyle(Tema.ikincil)
            .padding(.horizontal, 7).padding(.vertical, 3)
            .overlay(Capsule().strokeBorder(Tema.hat, lineWidth: 0.5))
    }
}

/// Bağlanabilen aksiyon / 360 kameralar ve bağlantı yolları (Fatih 30 Ekim: Luna, Ace Pro 2, GO Ultra, Osmo Pocket 4/4P…)
struct HariciKamera: Identifiable {
    let id: String
    let ad: String
    let alt: String
    let simge: String
    let yollar: [String]
    let adimlar: [String]

    static let hepsi: [HariciKamera] = [
        HariciKamera(id: "luna", ad: "Insta360 Luna", alt: "Kameranın kendi Wi-Fi'ı", simge: "circle.circle", yollar: ["WI-FI"], adimlar: [
            "Luna'yı aç; kamera kendi Wi-Fi ağını yayınlar.",
            "Bu cihazın Ayarlar → Wi-Fi bölümünden Luna'nın ağına bağlan (şifre kameranın ekranında ya da kutusunda).",
            "Buraya dön ve Bağlan'a dokun; kamera ekranında izin sorarsa onayla.",
            "Not: Luna'nın ağındayken aynı anda yalnız bu cihazın kamerası ve USB kameralar eklenebilir; Wi-Fi telefonlar başka ağda kalır.",
        ]),
        HariciKamera(id: "ace", ad: "Ace Pro 2 · GO Ultra", alt: "Insta360 · USB web kamerası", simge: "camera.aperture", yollar: ["USB"], adimlar: [
            "Kamerada USB modunu Web kamerası (UVC) yap: Ayarlar → USB → Web kamerası.",
            "Kamerayı USB-C kabloyla iPad'e tak (iPhone USB kamera kabul etmez).",
            "Kamera kendiliğinden kaynak olarak eklenir; eklenmezse aşağıdaki Ara'ya dokun.",
            "Kablosuz bağlantı (kameranın uygulamasından canlı yayın) sonraki sürümde.",
        ]),
        HariciKamera(id: "osmo", ad: "Osmo Pocket 4 · 4P · Action", alt: "DJI · USB web kamerası", simge: "camera.metering.center.weighted", yollar: ["USB"], adimlar: [
            "Kamerayı USB-C kabloyla iPad'e tak.",
            "Kameranın ekranında bağlantı türü sorulursa Web kamerası'nı seç.",
            "Kamera kendiliğinden kaynak olarak eklenir; eklenmezse aşağıdaki Ara'ya dokun.",
            "Kablosuz bağlantı (DJI Mimo'dan canlı yayın) sonraki sürümde.",
        ]),
        HariciKamera(id: "gopro", ad: "GoPro", alt: "USB web kamerası", simge: "video", yollar: ["USB"], adimlar: [
            "Kamerada Tercihler → Bağlantılar → USB bağlantısı → GoPro Connect / Web kamerası'nı seç.",
            "Kamerayı USB-C kabloyla iPad'e tak; kaynak kendiliğinden eklenir.",
        ]),
    ]
}

/// Seçilen kameranın adım adım bağlantı rehberi
struct HariciKameraRehberi: View {
    let k: HariciKamera
    @ObservedObject var m: Masa
    var kapat: () -> Void

    var body: some View {
        List {
            Section {
                ForEach(Array(k.adimlar.enumerated()), id: \.offset) { i, a in
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        Text("\(i + 1)").font(.system(size: 13, weight: .bold).monospacedDigit()).foregroundStyle(Tema.sari).frame(width: 18)
                        Text(a).font(.system(size: 14))
                    }
                    .padding(.vertical, 3)
                }
            }
            Section {
                if k.id == "luna" {
                    Button { m.lunaEkle(); kapat() } label: { Label("Bağlan", systemImage: "wifi").font(.system(size: 15, weight: .semibold)) }
                } else {
                    Button { m.usbTara(); kapat() } label: { Label("USB kameraları ara", systemImage: "cable.connector").font(.system(size: 15, weight: .semibold)) }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color(white: 0.05))
        .navigationTitle(k.ad)
        .navigationBarTitleDisplayMode(.inline)
    }
}
