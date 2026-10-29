import SwiftUI

/// iPad masası (yönetmen masası, ATEM düzeni): üstte ÖNİZLEME (yeşil) ve PROGRAM (kırmızı) monitörleri, altta kaynaklar ızgarası,
/// en altta denetim şeridi: kaynak düğmeleri, KES, KAYIT.
/// Kaynağa dokun → önizleme; KES → canlı; çift dokun → hemen canlı. "Hızlı geçiş" açıkken tek dokunuş doğrudan canlıya alır.
/// Klavye: 1–4 kaynak seç, boşluk KES, R kayıt.
struct MasaIpad: View {
    @ObservedObject var m: Masa
    var kapat: () -> Void
    @Binding var kaynakAcik: Bool
    @AppStorage("masa.hizli") private var hizli = false

    private static let yesil = Color(red: 52 / 255, green: 199 / 255, blue: 89 / 255)
    private static let kirmizi = Color(red: 1, green: 59 / 255, blue: 48 / 255)
    private static let yuzey = Color(white: 0.11)

    var body: some View {
        GeometryReader { g in
            let yatay = g.size.width > g.size.height
            VStack(spacing: 14) {
                ustCubuk
                HStack(spacing: 14) {
                    monitor(baslik: "ÖNİZLEME", renk: MasaIpad.yesil, gorunum: m.onizleme, yuva: yuva(m.siradaki),
                            bos: hizli ? "Hızlı geçiş açık: kaynağa dokununca doğrudan canlıya geçer" : "Bir kaynağa dokun, burada hazırlanır")
                    monitor(baslik: "PROGRAM", renk: MasaIpad.kirmizi, gorunum: m.program, yuva: yuva(m.canli),
                            bos: "Canlıda kaynak yok")
                }
                kaynaklar(sutun: yatay ? 4 : 2)
                Spacer(minLength: 0)
                denetim
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
        }
        .background(Color.black.ignoresSafeArea())
        .foregroundStyle(.white)
    }

    private func yuva(_ id: UUID?) -> Yuva? { m.yuvalar.first { $0.id == id } }

    private func sec(_ y: Yuva) { if hizli { m.canliYap(y) } else { m.siradakiYap(y) } }

    // MARK: üst

    private var ustCubuk: some View {
        ZStack {
            HStack(spacing: 16) {
                Button(action: kapat) { Label("Kamera", systemImage: "chevron.left").font(.body.weight(.semibold)) }
                    .disabled(m.kayitta)
                Spacer()
                Toggle(isOn: $hizli) { Text("Hızlı geçiş").font(.subheadline) }
                    .toggleStyle(.switch).tint(MasaIpad.yesil).fixedSize()
                Button { kaynakAcik = true } label: {
                    Label("Kaynak ekle", systemImage: "plus").font(.subheadline.weight(.semibold))
                        .padding(.horizontal, 14).frame(height: 36)
                        .background(Capsule().fill(Color.white.opacity(0.12)))
                }
            }
            VStack(spacing: 2) {
                Text("Masa").font(.headline)
                if m.kayitta, let bas = m.kayitBasi {
                    TimelineView(.periodic(from: bas, by: 1)) { an in
                        Text(MasaIpad.sure(an.date.timeIntervalSince(bas)))
                            .font(.system(size: 15, weight: .semibold).monospacedDigit())
                            .padding(.horizontal, 8).padding(.vertical, 2)
                            .background(RoundedRectangle(cornerRadius: 5).fill(MasaIpad.kirmizi))
                    }
                } else if let b = m.bildirim {
                    Text(b).font(.caption).foregroundStyle(Tema.metin2).lineLimit(1)
                        .task(id: b) {
                            try? await Task.sleep(nanoseconds: 3_000_000_000)
                            if m.bildirim == b { m.bildirim = nil }
                        }
                }
            }
        }
        .frame(height: 48)
    }

    // MARK: monitörler

    private func monitor(baslik: String, renk: Color, gorunum: GoruntuGorunumu, yuva: Yuva?, bos: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(baslik).font(.caption.weight(.bold)).tracking(1.2).foregroundStyle(renk)
                if let yuva { Text(yuva.ad).font(.caption.weight(.semibold)).foregroundStyle(Tema.metin2).lineLimit(1) }
            }
            ZStack {
                Goruntu(gorunum: gorunum)
                if yuva == nil {
                    Text(bos).font(.subheadline).foregroundStyle(Tema.metin2).multilineTextAlignment(.center).padding(20)
                }
            }
            .aspectRatio(16 / 9, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(yuva == nil ? Color.white.opacity(0.15) : renk, lineWidth: yuva == nil ? 1 : 3))
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: kaynaklar

    private func kaynaklar(sutun: Int) -> some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: sutun), spacing: 12) {
            ForEach(0..<Masa.enCok, id: \.self) { i in
                if i < m.yuvalar.count {
                    let y = m.yuvalar[i]
                    IpadHucre(y: y, no: i + 1, canli: y.id == m.canli, sirada: y.id == m.siradaki)
                        .onTapGesture(count: 2) { m.canliYap(y) }
                        .onTapGesture { sec(y) }
                        .contextMenu {
                            Button { m.canliYap(y) } label: { Label("Canlıya al", systemImage: "dot.radiowaves.left.and.right") }
                            Button { m.siradakiYap(y) } label: { Label("Önizlemeye al", systemImage: "eye") }
                            Button { m.dondur(y) } label: { Label("Döndür (90°)", systemImage: "rotate.right") }
                            Button(role: .destructive) { m.kaldir(y) } label: { Label("Kaldır", systemImage: "trash") }
                        }
                } else {
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .strokeBorder(Color.white.opacity(0.15), style: StrokeStyle(lineWidth: 1, dash: [6, 5]))
                        .aspectRatio(16 / 9, contentMode: .fit)
                        .overlay(VStack(spacing: 4) {
                            Image(systemName: "plus.circle").font(.title3)
                            Text("Kaynak \(i + 1)").font(.caption)
                        }.foregroundStyle(Tema.metin2))
                        .contentShape(Rectangle())
                        .onTapGesture { kaynakAcik = true }
                }
            }
        }
    }

    // MARK: denetim şeridi

    private var denetim: some View {
        HStack(spacing: 12) {
            ForEach(0..<Masa.enCok, id: \.self) { i in
                let y = i < m.yuvalar.count ? m.yuvalar[i] : nil
                let canli = y != nil && y?.id == m.canli
                let sirada = y != nil && y?.id == m.siradaki
                Button { if let y { sec(y) } } label: {
                    VStack(spacing: 2) {
                        Text("\(i + 1)").font(.system(size: 22, weight: .bold).monospacedDigit())
                        Text(y?.ad ?? "—").font(.system(size: 10, weight: .medium)).lineLimit(1)
                    }
                    .foregroundStyle(canli || sirada ? .black : .white)
                    .frame(width: 84, height: 60)
                    .background(RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(canli ? MasaIpad.kirmizi : (sirada ? MasaIpad.yesil : MasaIpad.yuzey)))
                }
                .disabled(y == nil)
                .keyboardShortcut(KeyEquivalent(Character("\(i + 1)")), modifiers: [])
            }
            Spacer(minLength: 12)
            Button { m.kes() } label: {
                Text("KES").font(.system(size: 20, weight: .heavy)).tracking(1)
                    .foregroundStyle(.black)
                    .frame(width: 120, height: 60)
                    .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(m.siradaki == nil ? Color.white.opacity(0.3) : .white))
            }
            .disabled(m.siradaki == nil)
            .keyboardShortcut(.space, modifiers: [])
            .accessibilityLabel("Önizlemeyi canlıya al")
            Button { m.kayitDegistir() } label: {
                HStack(spacing: 10) {
                    ZStack {
                        Circle().stroke(.white, lineWidth: 3).frame(width: 34, height: 34)
                        RoundedRectangle(cornerRadius: m.kayitta ? 4 : 13).fill(MasaIpad.kirmizi)
                            .frame(width: m.kayitta ? 14 : 26, height: m.kayitta ? 14 : 26)
                    }
                    Text(m.kayitta ? "DURDUR" : "KAYIT").font(.system(size: 17, weight: .bold))
                }
                .padding(.horizontal, 18)
                .frame(height: 60)
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(MasaIpad.yuzey))
                .animation(.easeOut(duration: 0.15), value: m.kayitta)
            }
            .keyboardShortcut("r", modifiers: [])
            .accessibilityLabel(m.kayitta ? "Kaydı durdur" : "Kaydı başlat")
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Color(white: 0.07)))
    }

    static func sure(_ s: TimeInterval) -> String {
        let t = Int(s)
        return String(format: "%02d:%02d:%02d", t / 3600, t / 60 % 60, t % 60)
    }
}

private struct IpadHucre: View {
    @ObservedObject var y: Yuva
    let no: Int
    let canli: Bool
    let sirada: Bool

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            Goruntu(gorunum: y.gorunum)
            if !y.bagli { ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity) }
            HStack(spacing: 6) {
                Text("\(no)").font(.caption.weight(.heavy).monospacedDigit())
                    .frame(width: 20, height: 20)
                    .background(RoundedRectangle(cornerRadius: 5).fill(canli ? Color.red : (sirada ? Color.green : Color.white.opacity(0.25))))
                Image(systemName: y.wifi ? "wifi" : "cable.connector").font(.caption2)
                Text(y.ad).font(.caption.weight(.semibold)).lineLimit(1)
            }
            .padding(.horizontal, 6).padding(.vertical, 4)
            .background(Capsule().fill(Color.black.opacity(0.6)))
            .padding(8)
        }
        .aspectRatio(16 / 9, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous)
            .stroke(canli ? Color.red : (sirada ? Color.green : Color.white.opacity(0.15)), lineWidth: canli || sirada ? 3 : 1))
        .contentShape(Rectangle())
    }
}
