import AVFoundation
import SwiftUI

/// Vlog (Fatih 30 Ekim): arka ve ön kamera aynı anda; ön kamera köşede (PiP), dikey 9:16. Kamera'nın alt şeridinde bir mod
/// (10:41 "fotoğraf video olan yere"); kalite Kamera'nın video ayarlarından. Çıktı: yalnız final ya da üç dosya (arka, ön, final).
/// Harici disk takılınca nereye kaydedileceği açılır bildirimle sorulur (ana ekranda klasör düğmesi yok).
struct VlogEkran: View {
    /// Alt şeritten başka bir mod seçildi
    var modSec: (Kamera.Mod) -> Void
    @StateObject private var m = Masa(vlog: true, dikey: true)
    @StateObject private var disk = HariciDisk()
    @State private var diskSor = false
    @State private var klasorAcik = false

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            Goruntu(gorunum: m.program).ignoresSafeArea()
            VStack(spacing: 0) {
                LinearGradient(colors: [.black.opacity(0.55), .clear], startPoint: .top, endPoint: .bottom).frame(height: 130)
                Spacer(minLength: 0)
                LinearGradient(colors: [.clear, .black.opacity(0.65)], startPoint: .top, endPoint: .bottom).frame(height: 260)
            }
            .ignoresSafeArea()
            .allowsHitTesting(false)
            VStack(spacing: 0) {
                ustSerit.frame(height: 44).padding(.horizontal, 16)
                McBildirim(m: m).padding(.top, 8)
                Spacer(minLength: 0)
                if diskSor, let ad = disk.ad { diskKarti(ad).padding(.horizontal, 20).padding(.bottom, 16).transition(.move(edge: .bottom).combined(with: .opacity)) }
                HStack {
                    Button { m.pip.toggle() } label: {
                        Image(systemName: m.pip ? "rectangle.inset.topright.filled" : "rectangle")
                            .font(.system(size: 16, weight: .medium)).foregroundStyle(m.pip ? Tema.sari : .white)
                            .frame(width: 44, height: 44).yuvarlakYuzey()
                    }
                    .disabled(m.yuvalar.count < 2)
                    .accessibilityLabel("Ön kamera penceresi")
                    Spacer()
                    McKayitDugmesi(m: m, boyut: 74)
                    Spacer()
                    Button { degistir() } label: {
                        Image(systemName: "arrow.triangle.2.circlepath").font(.system(size: 15, weight: .medium))
                            .frame(width: 44, height: 44).yuvarlakYuzey()
                    }
                    .disabled(m.yuvalar.count < 2)
                    .accessibilityLabel("Ana görüntüyü değiştir")
                }
                .padding(.horizontal, 36)
                .padding(.bottom, 14)
                ModSeridi(secili: "VLOG", kilitli: m.kayitta) { ad in
                    if let mod = Kamera.Mod(rawValue: ad) { modSec(mod) }
                }
                .frame(height: 42)
                .padding(.bottom, 6)
            }
        }
        .foregroundStyle(.white)
        .preferredColorScheme(.dark)
        .onAppear {
            m.ac()
            if disk.takili { diskGoster() }
        }
        .onDisappear { m.kapat() }
        .onChange(of: disk.ad) { eski, yeni in
            if eski == nil, yeni != nil { diskGoster() }
            if yeni == nil { withAnimation(.smooth(duration: 0.25)) { diskSor = false } }
        }
        .sheet(isPresented: $klasorAcik) {
            KlasorSecici { u in m.klasor.sec(u); m.diskeYaz = true; withAnimation(.smooth) { diskSor = false } }.ignoresSafeArea()
        }
    }

    // MARK: üst şerit: kalite (solda), süre (ortada), çıktı (sağda; ince yazı, dokununca değişir)

    private var ustSerit: some View {
        ZStack {
            HStack {
                Text(kalite).font(.system(size: 12, weight: .semibold).monospacedDigit()).tracking(0.6)
                    .foregroundStyle(Tema.ikincil)
                Spacer()
                Button {
                    withAnimation(.smooth(duration: 0.2)) { m.yalnizFinal.toggle() }
                    UISelectionFeedbackGenerator().selectionChanged()
                } label: {
                    HStack(spacing: 5) {
                        Image(systemName: m.yalnizFinal ? "film" : "square.stack.3d.up").font(.system(size: 11, weight: .light))
                        Text(m.yalnizFinal ? "Yalnız final" : "3 dosya").font(.system(size: 13, weight: .light))
                            .contentTransition(.opacity)
                    }
                    .padding(.horizontal, 10).frame(height: 28)
                    .contentShape(Rectangle())
                }
                .disabled(m.kayitta).opacity(m.kayitta ? 0.4 : 1)
                .accessibilityLabel("Vlog çıktısı: \(m.yalnizFinal ? "yalnız final" : "arka, ön ve final")")
            }
            if m.kayitta, let bas = m.kayitBasi {
                TimelineView(.periodic(from: bas, by: 1)) { an in
                    Text(MC.sure(an.date.timeIntervalSince(bas))).font(.system(size: 15, weight: .semibold).monospacedDigit())
                        .padding(.horizontal, 10).frame(height: 28)
                        .background(Capsule().fill(Tema.kirmizi))
                }
            } else if m.klasor.takili && m.diskeYaz {
                Label(m.klasor.ad ?? "SSD", systemImage: "externaldrive.fill").font(.system(size: 11, weight: .medium))
                    .foregroundStyle(Tema.ikincil).lineLimit(1)
            }
        }
    }

    /// Ör. "4K · 30" (çoklu kamera kaldırmayınca iPhone 1080p'ye iner; yazı gerçekte açılanı gösterir)
    private var kalite: String {
        guard let b = m.vlogBoyut else { return "VLOG" }
        let k = min(b.width, b.height)
        let ad = k >= 2160 ? "4K" : (k >= 1440 ? "1440p" : (k >= 1080 ? "1080p" : "\(k)p"))
        return "\(ad) · \(m.vlogFps)"
    }

    // MARK: harici disk bildirimi

    private func diskGoster() {
        m.klasor.guncelle()
        withAnimation(.spring(response: 0.38, dampingFraction: 0.86)) { diskSor = true }
    }

    private func diskKarti(_ ad: String) -> some View {
        let hazir = m.klasor.takili
        return VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Image(systemName: "externaldrive.fill").font(.system(size: 20, weight: .regular)).foregroundStyle(Tema.sari)
                    .frame(width: 36, height: 36)
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(ad) takıldı").font(.system(size: 15, weight: .semibold))
                    Text(hazir ? "Vloglar \(m.klasor.ad ?? ad) içindeki klasöre yazılsın mı?" : "Vlogları bu diske yazmak için bir klasör seç.")
                        .font(.system(size: 12)).foregroundStyle(Tema.ikincil).fixedSize(horizontal: false, vertical: true)
                    if let b = disk.bosAlan {
                        Text("\(HariciDisk.boyutYazisi(b)) boş").font(.system(size: 11).monospacedDigit()).foregroundStyle(Tema.metin3)
                    }
                }
                Spacer(minLength: 0)
            }
            HStack(spacing: 8) {
                Button {
                    m.diskeYaz = false
                    withAnimation(.smooth(duration: 0.25)) { diskSor = false }
                } label: {
                    Text("Telefona").font(.system(size: 14, weight: .semibold)).frame(maxWidth: .infinity).frame(height: 38)
                        .background(Capsule().fill(Color.white.opacity(0.12)))
                }
                Button {
                    if hazir {
                        m.diskeYaz = true
                        withAnimation(.smooth(duration: 0.25)) { diskSor = false }
                    } else {
                        klasorAcik = true
                    }
                } label: {
                    Text(hazir ? "Diske kaydet" : "Klasör seç").font(.system(size: 14, weight: .semibold)).foregroundStyle(.black)
                        .frame(maxWidth: .infinity).frame(height: 38)
                        .background(Capsule().fill(Tema.sari))
                }
            }
        }
        .padding(14)
        .yuzey(22)
        .disabled(m.kayitta)
    }

    /// Ana görüntü arka ↔ ön (kayıt sürerken de)
    private func degistir() {
        guard let diger = m.yuvalar.first(where: { $0.id != m.canli }) else { return }
        m.canliYap(diger)
    }
}

/// Kamera'nın alt mod şeridi (Vlog ekranında aynı görünüm): seçili mod ortada, kenarlar silikleşir
struct ModSeridi: View {
    static let adlar = ["TIMELAPSE", "VİDEO", "VLOG", "FOTO", "PRO MODLAR", "PORTRE"]
    let secili: String
    var kilitli = false
    var sec: (String) -> Void

    var body: some View {
        GeometryReader { g in
            ScrollViewReader { kaydir in
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 2) {
                        Color.clear.frame(width: max(0, g.size.width / 2 - 40), height: 1)
                        ForEach(ModSeridi.adlar, id: \.self) { ad in
                            Button {
                                guard ad != secili, !kilitli else { return }
                                UISelectionFeedbackGenerator().selectionChanged()
                                sec(ad)
                            } label: {
                                Text(ad == "PRO MODLAR" ? "PRO" : ad).font(.system(size: 12, weight: .semibold)).tracking(1.4).lineLimit(1)
                                    .foregroundStyle(ad == secili ? Color.white : Tema.ikincil)
                                    .padding(.horizontal, 11).frame(height: 30)
                                    .background(Capsule().fill(ad == secili ? Color.white.opacity(0.12) : .clear))
                                    .shadow(color: .black.opacity(0.5), radius: 2)
                            }
                            .id(ad)
                        }
                        Color.clear.frame(width: max(0, g.size.width / 2 - 40), height: 1)
                    }
                    .frame(height: g.size.height)
                }
                .onAppear { kaydir.scrollTo(secili, anchor: .center) }
            }
        }
        .mask(LinearGradient(stops: [.init(color: .clear, location: 0), .init(color: .black, location: 0.14),
                                     .init(color: .black, location: 0.86), .init(color: .clear, location: 1)],
                             startPoint: .leading, endPoint: .trailing))
        .opacity(kilitli ? 0.45 : 1)
    }
}
