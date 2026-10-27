import SwiftUI

/// Tam ekran görüntü, üstünde okunaklı katmanlar (Android 0.11.0 düzeni): üstte bilgi, altta mod + deklanşör.
struct AnaEkran: View {
    @StateObject private var kamera = Kamera()
    @State private var isoAcik = false
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
                    if isoAcik { isoSerit }
                    altCubuk
                        .background(LinearGradient(colors: [.clear, .black.opacity(0.6)], startPoint: .top, endPoint: .bottom).ignoresSafeArea())
                }
                .frame(width: g.size.width)
            }
        }
        .onAppear { kamera.baslat() }
        .onChange(of: evre) { _, yeni in
            if yeni == .active { kamera.baslat() } else if yeni == .background { kamera.durdur() }
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
            Text(kamera.cozunurluk)
            Text(isoYazi)
                .foregroundStyle(kamera.secilenIso != nil && kamera.secilenIso == kamera.bazIso ? Tema.baz : .white)
            Spacer()
        }
        .font(Tema.mono)
        .foregroundStyle(.white)
        .shadow(color: .black.opacity(0.6), radius: 3)
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 18)
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
                    Button(m.rawValue) { kamera.modDegistir(m) }
                        .font(.footnote.weight(.bold))
                        .foregroundStyle(kamera.mod == m ? Tema.vurgu : .white)
                        .disabled(kamera.kayitta)
                }
            }
            HStack {
                yuvarlakDugme("ISO", sistem: nil, secili: isoAcik) { withAnimation(.easeOut(duration: 0.15)) { isoAcik.toggle() } }
                Spacer()
                deklansor
                Spacer()
                yuvarlakDugme(nil, sistem: "arrow.triangle.2.circlepath.camera", secili: false) { kamera.cevir() }
                    .disabled(kamera.kayitta)
            }
            .padding(.horizontal, 32)
        }
        .padding(.top, 24)
        .padding(.bottom, 12)
    }

    private var deklansor: some View {
        Button {
            let yon = Onizleme.yon(UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.interfaceOrientation }.first ?? .portrait)
            kamera.deklansor(yon: yon)
        } label: {
            ZStack {
                Circle().stroke(.white, lineWidth: 4).frame(width: 76, height: 76)
                if kamera.mod == .video {
                    RoundedRectangle(cornerRadius: kamera.kayitta ? 6 : 31)
                        .fill(.red)
                        .frame(width: kamera.kayitta ? 30 : 62, height: kamera.kayitta ? 30 : 62)
                } else {
                    Circle().fill(.white).frame(width: 62, height: 62)
                }
            }
            .animation(.easeOut(duration: 0.15), value: kamera.kayitta)
        }
        .accessibilityLabel(kamera.mod == .video ? (kamera.kayitta ? "Kaydı durdur" : "Kaydı başlat") : "Fotoğraf çek")
    }

    private func yuvarlakDugme(_ yazi: String?, sistem: String?, secili: Bool, eylem: @escaping () -> Void) -> some View {
        Button(action: eylem) {
            Group {
                if let sistem { Image(systemName: sistem).font(.system(size: 20, weight: .semibold)) }
                else { Text(yazi ?? "").font(Tema.mono) }
            }
            .foregroundStyle(secili ? .black : .white)
            .frame(width: 52, height: 52)
            .background(Circle().fill(secili ? Tema.vurgu : Color.black.opacity(0.45)))
        }
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
