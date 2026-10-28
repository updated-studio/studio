import AVFoundation
import SwiftUI

enum ProPanelTuru { case mod, ayar }

/// Tam ekran görüntü, üstünde okunaklı katmanlar (Android 0.11.0 düzeni): üstte bilgi, altta mod + deklanşör.
struct AnaEkran: View {
    @StateObject private var kamera = Kamera()
    @State private var isoAcik = false
    @State private var proPanel: ProPanelTuru?
    @State private var uyariMod: ProMod?
    @State private var yardim = false
    /// Masa (çok kamera) ya da Wi-Fi kamera açıkken ana kamera durur
    @State private var ekran: Ekran?
    enum Ekran: String, Identifiable { case masa, wifi, monitor; var id: String { rawValue } }
    @Environment(\.scenePhase) private var evre

    var body: some View {
        GeometryReader { g in
            ZStack {
                Tema.zemin.ignoresSafeArea()
                Onizleme(oturum: kamera.oturum) { nokta in
                    kamera.odakla(nokta)
                }
                .ignoresSafeArea()
                if !kamera.izinVar { izinUyarisi }
                VStack(spacing: 0) {
                    ustBilgi
                        .background(LinearGradient(colors: [.black.opacity(0.55), .clear], startPoint: .top, endPoint: .bottom).ignoresSafeArea())
                    Spacer()
                    if let b = kamera.bildirim { bildirimKutusu(b) }
                    if kamera.mod == .pro {
                        switch proPanel {
                        case .mod: ProModSecici(kamera: kamera) { m in
                            kamera.proModSec(m)
                            proPanel = nil
                            uyariMod = m
                        }.padding(.bottom, 8)
                        case .ayar: ProOzellestir(kamera: kamera).padding(.bottom, 8)
                        case nil: EmptyView()
                        }
                    } else if isoAcik { isoSerit }
                    altCubuk
                        .background(LinearGradient(colors: [.clear, .black.opacity(0.6)], startPoint: .top, endPoint: .bottom).ignoresSafeArea())
                }
                .frame(width: g.size.width)
                if let p = kamera.proIlerleme {
                    Text(p)
                        .font(p.count <= 2 ? .system(size: 72, weight: .bold, design: .rounded) : Tema.mono)
                        .padding(.horizontal, 16).padding(.vertical, 10)
                        .background(Capsule().fill(Color.black.opacity(p.count <= 2 ? 0 : 0.55)))
                        .shadow(color: .black.opacity(0.6), radius: 4)
                        .allowsHitTesting(false)
                }
                if let m = uyariMod { ProUyari(mod: m) { uyariMod = nil } }
            }
        }
        .onAppear { kamera.baslat() }
        .onChange(of: evre) { _, yeni in
            guard ekran == nil else { return }
            if yeni == .active { kamera.baslat() } else if yeni == .background { kamera.durdur() }
        }
        .onChange(of: ekran) { _, yeni in
            if yeni == nil { kamera.baslat() } else { kamera.durdur() }
        }
        .fullScreenCover(item: $ekran) { e in
            switch e {
            case .masa: MasaEkran { ekran = nil }
            case .wifi: WifiKameraEkran { ekran = nil }
            case .monitor: MonitorEkran { ekran = nil }
            }
        }
    }

    private var ustBilgi: some View {
        HStack(spacing: 14) {
            if kamera.kayitta, let bas = kamera.kayitBasi {
                TimelineView(.periodic(from: bas, by: 1)) { an in
                    Label(sure(an.date.timeIntervalSince(bas)), systemImage: "record.circle.fill")
                        .foregroundStyle(.red)
                }
            }
            if kamera.mod == .pro {
                Text(kamera.proMod.ozet(kamera.proAyar)).lineLimit(1).minimumScaleFactor(0.7)
            } else {
                Text(kamera.cozunurluk)
                Text(isoYazi)
                    .foregroundStyle(kamera.secilenIso != nil && kamera.secilenIso == kamera.bazIso ? Tema.baz : .white)
            }
            Spacer()
            Button { withAnimation(.easeOut(duration: 0.15)) { yardim.toggle() } } label: {
                Image(systemName: "questionmark")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(yardim ? .black : .white)
                    .frame(width: 30, height: 30)
                    .background(Circle().fill(yardim ? Tema.vurgu : Color.black.opacity(0.45)))
            }
            .accessibilityLabel("Düğmelerin açıklaması")
            ustDugme("Monitör", sistem: "display") { ekran = .monitor }
            ustDugme("Wi-Fi kamera", sistem: "wifi") { ekran = .wifi }
            ustDugme("Masa", sistem: "rectangle.split.2x2") { ekran = .masa }
        }
        .font(Tema.mono)
        .foregroundStyle(.white)
        .shadow(color: .black.opacity(0.6), radius: 3)
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 18)
    }

    private func ustDugme(_ yazi: String, sistem: String, eylem: @escaping () -> Void) -> some View {
        Button(action: eylem) {
            Image(systemName: sistem)
                .font(.system(size: 13, weight: .bold))
                .frame(width: 30, height: 30)
                .background(Circle().fill(Color.black.opacity(0.45)))
        }
        .accessibilityLabel(yazi)
        .disabled(kamera.kayitta)
    }

    private var isoYazi: String {
        guard let iso = kamera.secilenIso else { return "ISO AUTO" }
        return "ISO \(Int(iso))"
    }

    private var isoSerit: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                isoKutu(nil)
                ForEach(kamera.isoDegerleri, id: \.self) { isoKutu($0) }
            }
            .padding(.horizontal, 16)
        }
        .padding(.vertical, 8)
        .background(Tema.yuzey)
    }

    private func isoKutu(_ iso: Float?) -> some View {
        let secili = kamera.secilenIso == iso
        let baz = iso != nil && iso == kamera.bazIso
        return Button { kamera.isoSec(iso) } label: {
            VStack(spacing: 1) {
                Text(iso.map { "\(Int($0))" } ?? "AUTO").font(Tema.mono)
                if baz { Text("baz").font(.caption2.weight(.semibold)) }
            }
            .foregroundStyle(secili ? .black : (baz ? Tema.baz : .white))
            .padding(.horizontal, 12)
            .frame(minHeight: 40)
            .background(Capsule().fill(secili ? (baz ? Tema.baz : Tema.vurgu) : Color.white.opacity(0.1)))
        }
    }

    private var altCubuk: some View {
        VStack(spacing: 14) {
            HStack(spacing: 22) {
                ForEach(Kamera.Mod.allCases, id: \.self) { m in
                    Button(m.rawValue) { kamera.modDegistir(m); proPanel = nil; isoAcik = false }
                        .font(.footnote.weight(.bold))
                        .foregroundStyle(kamera.mod == m ? Tema.vurgu : .white)
                        .disabled(kamera.kayitta || kamera.proCalisiyor)
                }
            }
            HStack {
                if kamera.mod == .pro {
                    yuvarlakDugme(nil, sistem: "square.grid.3x3", secili: proPanel == .mod, yardimYazi: "Hazır mod") { panelAc(.mod) }
                    yuvarlakDugme(nil, sistem: "slider.horizontal.3", secili: proPanel == .ayar, yardimYazi: "Özelleştir") { panelAc(.ayar) }
                } else {
                    yuvarlakDugme("ISO", sistem: nil, secili: isoAcik, yardimYazi: "Elle ISO") { withAnimation(.easeOut(duration: 0.15)) { isoAcik.toggle() } }
                }
                Spacer()
                deklansor
                    .overlay(alignment: .top) { if yardim { yardimBalon(kamera.mod == .pro && kamera.proMod.seri ? "Basılı tut: seri" : "Çek").offset(y: -30) } }
                Spacer()
                yuvarlakDugme(nil, sistem: "arrow.triangle.2.circlepath.camera", secili: false, yardimYazi: "Ön / arka") { kamera.cevir() }
                    .disabled(kamera.kayitta || kamera.proCalisiyor)
            }
            .padding(.horizontal, 24)
        }
        .padding(.top, 24)
        .padding(.bottom, 12)
    }

    private var deklansor: some View {
        Button {
            proPanel = nil
            kamera.deklansor(yon: ekranYonu)
        } label: {
            ZStack {
                Circle().stroke(.white, lineWidth: 4).frame(width: 76, height: 76)
                if kamera.mod == .pro && kamera.proCalisiyor {
                    RoundedRectangle(cornerRadius: 6).fill(.red).frame(width: 30, height: 30)
                } else if kamera.mod == .video {
                    RoundedRectangle(cornerRadius: kamera.kayitta ? 6 : 31)
                        .fill(.red)
                        .frame(width: kamera.kayitta ? 30 : 62, height: kamera.kayitta ? 30 : 62)
                } else {
                    Circle().fill(.white).frame(width: 62, height: 62)
                }
            }
            .animation(.easeOut(duration: 0.15), value: kamera.kayitta)
        }
        .simultaneousGesture(LongPressGesture(minimumDuration: 0.35).onEnded { _ in kamera.seriBasla(yon: ekranYonu) })
        .simultaneousGesture(DragGesture(minimumDistance: 0).onEnded { _ in kamera.seriBitir() })
        .accessibilityLabel(kamera.mod == .video ? (kamera.kayitta ? "Kaydı durdur" : "Kaydı başlat") : "Fotoğraf çek")
    }

    private var ekranYonu: AVCaptureVideoOrientation {
        Onizleme.yon(UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.interfaceOrientation }.first ?? .portrait)
    }

    private func panelAc(_ p: ProPanelTuru) {
        withAnimation(.easeOut(duration: 0.15)) { proPanel = proPanel == p ? nil : p }
    }

    private func yardimBalon(_ yazi: String) -> some View {
        Text(yazi)
            .font(.caption2.weight(.semibold))
            .fixedSize()
            .padding(.horizontal, 8).padding(.vertical, 4)
            .background(Capsule().fill(Tema.vurgu))
            .foregroundStyle(.black)
            .allowsHitTesting(false)
    }

    private func yuvarlakDugme(_ yazi: String?, sistem: String?, secili: Bool, yardimYazi: String? = nil, eylem: @escaping () -> Void) -> some View {
        Button(action: eylem) {
            Group {
                if let sistem { Image(systemName: sistem).font(.system(size: 20, weight: .semibold)) }
                else { Text(yazi ?? "").font(Tema.mono) }
            }
            .foregroundStyle(secili ? .black : .white)
            .frame(width: 52, height: 52)
            .background(Circle().fill(secili ? Tema.vurgu : Color.black.opacity(0.45)))
        }
        .overlay(alignment: .top) { if yardim, let y = yardimYazi { yardimBalon(y).offset(y: -28) } }
    }

    private func bildirimKutusu(_ yazi: String) -> some View {
        Text(yazi)
            .font(.footnote.weight(.semibold))
            .padding(.horizontal, 14).padding(.vertical, 8)
            .background(Capsule().fill(Tema.yuzey))
            .padding(.bottom, 8)
            .task(id: yazi) {
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                kamera.bildirim = nil
            }
    }

    private var izinUyarisi: some View {
        VStack(spacing: 12) {
            Text("Kamera izni gerekiyor").font(.headline)
            Text("Ayarlar → UPDATED Kamera → Kamera'yı aç.").font(.subheadline).foregroundStyle(Tema.metin2)
            Button("Ayarları aç") {
                if let u = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(u) }
            }
            .buttonStyle(.borderedProminent).tint(Tema.vurgu)
        }
        .padding(24)
    }

    private func sure(_ s: TimeInterval) -> String {
        let t = Int(s)
        return t >= 3600 ? String(format: "%d:%02d:%02d", t / 3600, t / 60 % 60, t % 60) : String(format: "%d:%02d", t / 60, t % 60)
    }
}
