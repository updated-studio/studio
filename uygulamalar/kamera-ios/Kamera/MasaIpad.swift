import SwiftUI

/// iPad Multi Cam (ATEM düzeni, tasarim/upcam-studio/3): solda büyük CANLI (program), altında kaynaklar; sağ sütunda SIRADAKİ monitörü,
/// başlık altında gruplu denetimler (Geçiş, Katmanlar, Düzen, Kayıt) ve kayıt düğmesi. Dikeyde panel altta.
/// Kaynağa dokun → sıradaki; bir daha dokun / AUTO → geçişle canlı; CUT → hemen. Klavye: 1–4 sıradaki, boşluk CUT, ↩ AUTO, R kayıt.
struct MasaIpad: View {
    @ObservedObject var m: Masa
    var kapat: () -> Void
    @Binding var kaynakAcik: Bool

    var body: some View {
        GeometryReader { g in
            let yatay = g.size.width > g.size.height
            VStack(spacing: 0) {
                ustCubuk.padding(.horizontal, 18).frame(height: 52)
                Rectangle().fill(Tema.hat).frame(height: 0.5)
                if yatay {
                    HStack(spacing: 0) {
                        VStack(spacing: 10) { programMonitoru; kaynaklar; Spacer(minLength: 0) }.padding(12)
                        Rectangle().fill(Tema.hat).frame(width: 0.5)
                        VStack(spacing: 14) {
                            siradakiMonitoru
                            ScrollView(showsIndicators: false) { MultiCamPanel(m: m) }
                            kayit
                        }
                        .padding(16)
                        .frame(width: 320)
                    }
                } else {
                    VStack(spacing: 10) {
                        programMonitoru
                        kaynaklar
                        HStack(alignment: .top, spacing: 16) {
                            VStack(spacing: 12) { siradakiMonitoru; kayit; Spacer(minLength: 0) }.frame(width: 300)
                            ScrollView(showsIndicators: false) { MultiCamPanel(m: m) }
                        }
                        .padding(.top, 6)
                    }
                    .padding(14)
                }
            }
        }
        .background(Color(white: 0.03).ignoresSafeArea())
        .foregroundStyle(.white)
        .background(klavye)
    }

    private func yuva(_ id: UUID?) -> Yuva? { m.yuvalar.first { $0.id == id } }

    // MARK: üst

    private var ustCubuk: some View {
        ZStack {
            HStack(spacing: 12) {
                Button(action: kapat) { HStack(spacing: 4) { Image(systemName: "chevron.left"); Text(Uygulama.geri) }.font(.system(size: 15, weight: .medium)) }
                    .disabled(m.kayitta).opacity(m.kayitta ? 0.4 : 1)
                OkumaSeridi(m: m)
                Spacer()
                McBildirim(m: m).frame(maxWidth: 360)
                Button { kaynakAcik = true } label: {
                    Label("Kaynak ekle", systemImage: "plus").font(.system(size: 13, weight: .semibold))
                        .padding(.horizontal, 14).frame(height: 32).yuzey(16)
                }
            }
            Text("MULTI CAM").font(.system(size: 15, weight: .heavy).width(.condensed)).tracking(1.5)
                .allowsHitTesting(false)
        }
    }

    // MARK: monitörler

    private var programMonitoru: some View {
        let y = yuva(m.canli)
        return ZStack(alignment: .topLeading) {
            Goruntu(gorunum: m.program)
            if m.yuvalar.isEmpty {
                VStack(spacing: 10) {
                    Text("Kaynak yok").font(.title3.weight(.semibold))
                    Text("Bu iPad'in kamerasını, USB kameraları, Insta360 Luna'yı ya da aynı Wi-Fi'daki Updated Camera telefonlarını ekle.")
                        .font(.subheadline).foregroundStyle(Tema.ikincil).multilineTextAlignment(.center)
                    Button { kaynakAcik = true } label: { Label("Kaynak ekle", systemImage: "plus").font(.subheadline.weight(.semibold)).padding(.horizontal, 18).frame(height: 38).yuzey(19) }
                }
                .padding(40).frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            if let y {
                etiket("CANLI · \(y.ad)", MC.kirmizi, yazi: .white).padding(10)
            }
        }
        .aspectRatio(16 / 9, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(y == nil ? Tema.hat : MC.kirmizi, lineWidth: y == nil ? 0.5 : 2.5))
    }

    private var siradakiMonitoru: some View {
        let y = yuva(m.siradaki)
        return ZStack(alignment: .topLeading) {
            Goruntu(gorunum: m.onizleme)
            if y == nil {
                Text("Bir kaynağa dokun, burada hazırlanır").font(.footnote).foregroundStyle(Tema.ikincil).multilineTextAlignment(.center)
                    .padding(16).frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let y {
                etiket("SIRADAKİ · \(y.ad)", MC.yesil, yazi: .black).padding(8)
            }
        }
        .aspectRatio(16 / 9, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(y == nil ? Tema.hat : MC.yesil, lineWidth: y == nil ? 0.5 : 2))
    }

    private func etiket(_ t: String, _ renk: Color, yazi: Color) -> some View {
        Text(t).font(.system(size: 10.5, weight: .bold)).tracking(0.8).lineLimit(1).foregroundStyle(yazi)
            .padding(.horizontal, 8).padding(.vertical, 4)
            .background(RoundedRectangle(cornerRadius: 5, style: .continuous).fill(renk))
    }

    // MARK: kaynaklar

    private var kaynaklar: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 4), spacing: 10) {
            ForEach(0..<Masa.enCok, id: \.self) { i in
                if i < m.yuvalar.count {
                    let y = m.yuvalar[i]
                    KaynakKutu(y: y, no: i + 1, canli: y.id == m.canli, sirada: y.id == m.siradaki, kayitBasi: m.kayitBasi)
                        .modifier(KaynakDokunus(m: m, y: y))
                } else {
                    BosKaynak(no: i + 1) { kaynakAcik = true }
                }
            }
        }
    }

    private var kayit: some View {
        HStack(spacing: 14) {
            McKayitDugmesi(m: m, boyut: 58)
            VStack(alignment: .leading, spacing: 2) {
                if m.kayitta, let bas = m.kayitBasi {
                    TimelineView(.periodic(from: bas, by: 1)) { an in
                        Text(MC.sure(an.date.timeIntervalSince(bas))).font(.system(size: 17, weight: .semibold).monospacedDigit()).foregroundStyle(MC.kirmizi)
                    }
                    Text(m.kayitOzeti).font(.system(size: 11, weight: .semibold)).tracking(0.4).foregroundStyle(Tema.ikincil)
                } else {
                    Text("\(m.yuvalar.count) kaynak + program").font(.system(size: 14, weight: .semibold))
                    Text("Her kamera ayrı dosya · HEVC").font(.system(size: 11.5)).foregroundStyle(Tema.ikincil)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.top, 10)
        .overlay(alignment: .top) { Rectangle().fill(Tema.hat).frame(height: 0.5) }
    }

    /// Klavye kısayolları: 1–4 sıradaki
    private var klavye: some View {
        HStack {
            ForEach(0..<Masa.enCok, id: \.self) { i in
                Button("") { if i < m.yuvalar.count { m.siradakiYap(m.yuvalar[i]) } }
                    .keyboardShortcut(KeyEquivalent(Character("\(i + 1)")), modifiers: [])
            }
        }
        .opacity(0).allowsHitTesting(false)
    }

    static func sure(_ s: TimeInterval) -> String { MC.sure(s) }
}

/// Kaynak hücresinin köşesinde: bu kaynağın kendi dosyası yazılıyor
struct KayitRozeti: View {
    let bas: Date

    var body: some View {
        TimelineView(.periodic(from: bas, by: 1)) { an in
            HStack(spacing: 5) {
                Circle().fill(Color.red).frame(width: 7, height: 7)
                Text(MasaIpad.sure(an.date.timeIntervalSince(bas))).font(.system(size: 11, weight: .semibold).monospacedDigit())
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 7).padding(.vertical, 4)
            .background(Capsule().fill(Color.black.opacity(0.6)))
        }
    }
}

/// Üst şeritte kayıt klasörü (SSD): adı ve boş alanı; dokununca Dosyalar'dan klasör seçilir, basılı tutunca kaldırılır
struct SsdCipi: View {
    @ObservedObject var k: KayitKlasoru
    var kilitli: Bool
    @State private var secimAcik = false

    var body: some View {
        Button { secimAcik = true } label: {
            HStack(spacing: 6) {
                Image(systemName: k.ad == nil ? "externaldrive.badge.plus" : (k.takili ? "externaldrive.fill" : "externaldrive.badge.xmark"))
                if let ad = k.ad {
                    Text(ad).lineLimit(1)
                    if k.takili, let b = k.bosAlan {
                        Text("· \(KayitKlasoru.boyutYazisi(b)) boş").foregroundStyle(Tema.metin2)
                    } else if !k.takili {
                        Text("· takılı değil").foregroundStyle(.orange)
                    }
                } else {
                    Text("SSD / klasör seç")
                }
            }
            .font(.footnote.weight(.semibold))
            .padding(.horizontal, 12).frame(height: 32)
            .yuzey(9)
        }
        .disabled(kilitli)
        .contextMenu {
            if k.ad != nil { Button(role: .destructive) { k.sil() } label: { Label("Klasörü kaldır (Fotoğraflar'a kaydet)", systemImage: "xmark") } }
        }
        .sheet(isPresented: $secimAcik) { KlasorSecici { k.sec($0) }.ignoresSafeArea() }
        .onAppear { k.guncelle() }
        .accessibilityLabel("Kayıt klasörü")
    }
}

/// Program düzeni: Oto · Tek · 2'li · 3'lü · 2×2 (dizili düzende program 4K tuvaldir, kaynaklar tam boyutuyla oturur)
struct DuzenSecici: View {
    @ObservedObject var m: Masa

    var body: some View {
        Menu {
            Picker("Düzen", selection: $m.duzen) { ForEach(Masa.Duzen.allCases) { Text($0.ad).tag($0) } }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: m.duzenAdet == 0 ? "rectangle" : "square.grid.2x2")
                Text(m.duzen == .oto ? "Oto · \(m.duzenAdet == 0 ? "Tek" : "\(m.duzenAdet) kaynak")" : m.duzen.ad)
            }
            .font(.footnote.weight(.semibold))
            .padding(.horizontal, 12).frame(height: 32)
            .yuzey(9)
        }
        .accessibilityLabel("Program düzeni")
    }
}
