import SwiftUI

/// Vlog (Fatih 30 Ekim: "çift kamera ile Vlog kayıt"): arka ve ön kamera aynı anda; ön kamera köşede (PiP), dikey 9:16.
/// Multi Cam motoruyla (Masa vlog kipi): üç dosya aynı anda: arka kamera, ön kamera ve birleşik görüntü; SSD takılıysa oraya.
struct VlogEkran: View {
    var kapat: () -> Void
    @StateObject private var m = Masa(vlog: true, dikey: true)
    @Environment(\.scenePhase) private var evre

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            Goruntu(gorunum: m.program).ignoresSafeArea()
            VStack(spacing: 10) {
                HStack {
                    Button(action: kapat) {
                        HStack(spacing: 4) { Image(systemName: "chevron.left"); Text("Kamera") }
                            .font(.system(size: 13, weight: .semibold))
                            .padding(.horizontal, 12).frame(height: 32).yuzey(16)
                    }
                    .disabled(m.kayitta).opacity(m.kayitta ? 0.4 : 1)
                    Spacer()
                    if m.kayitta, let bas = m.kayitBasi {
                        TimelineView(.periodic(from: bas, by: 1)) { an in
                            HStack(spacing: 6) {
                                Circle().fill(MC.kirmizi).frame(width: 7, height: 7)
                                Text(MC.sure(an.date.timeIntervalSince(bas))).font(.system(size: 14, weight: .semibold).monospacedDigit())
                            }
                            .padding(.horizontal, 12).frame(height: 32).yuzey(10)
                        }
                    } else {
                        Text("VLOG").font(Tema.bolum).tracking(1.6).padding(.horizontal, 12).frame(height: 32).yuzey(10)
                    }
                    Spacer()
                    SsdCipi(k: m.klasor, kilitli: m.kayitta).labelStyle(.iconOnly)
                }
                McBildirim(m: m)
                Spacer()
                HStack {
                    Button { m.pip.toggle() } label: {
                        Image(systemName: m.pip ? "rectangle.inset.topright.filled" : "rectangle")
                            .font(.system(size: 17, weight: .medium)).foregroundStyle(m.pip ? Tema.sari : .white)
                            .frame(width: 48, height: 48).yuvarlakYuzey(m.pip ? Tema.sari : nil)
                    }
                    .accessibilityLabel("Ön kamera penceresi")
                    Spacer()
                    McKayitDugmesi(m: m, boyut: 74)
                    Spacer()
                    Button { degistir() } label: {
                        Image(systemName: "arrow.triangle.2.circlepath").font(.system(size: 17, weight: .medium))
                            .frame(width: 48, height: 48).yuvarlakYuzey()
                    }
                    .disabled(m.yuvalar.count < 2)
                    .accessibilityLabel("Ana görüntüyü değiştir")
                }
                .padding(.horizontal, 34)
                Text(m.yuvalar.count < 2 ? "Tek kamera" : "Arka + ön kamera · 3 dosya: arka, ön ve birleşik")
                    .font(.system(size: 11)).foregroundStyle(Tema.ikincil)
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
        }
        .foregroundStyle(.white)
        .preferredColorScheme(.dark)
        .statusBarHidden()
        .persistentSystemOverlays(.hidden)
        .onAppear { m.ac() }
        .onDisappear { m.kapat() }
    }

    /// Ana görüntü arka ↔ ön (kayıt sürerken de)
    private func degistir() {
        guard let diger = m.yuvalar.first(where: { $0.id != m.canli }) else { return }
        m.canliYap(diger)
    }
}
