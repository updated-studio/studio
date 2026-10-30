import AVFoundation
import SwiftUI

/// Ana ekranda sağ üstte biçim (Fatih 30 Ekim 10:41: "çözünürlük ve kare hızı için Genel Ayarlar'a girmeyelim; sarı, likit cam"):
/// video: çözünürlük · kare hızı · sabitleme; fotoğraf: MP · HEIF/JPEG/RAW. Dokun: sıradaki değer; sağa/sola kaydır: bir sonraki / önceki;
/// basılı tut: bütün seçenekler ve "Ayrıntılı…" (diğer basılı tut menüleriyle aynı dil).
struct HizliBicim: View {
    @ObservedObject var kamera: Kamera
    var ayrinti: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            let parcalar = self.parcalar
            ForEach(Array(parcalar.enumerated()), id: \.element.id) { i, p in
                if i > 0 { Rectangle().fill(Tema.sari.opacity(0.28)).frame(width: 0.5, height: 14) }
                Parca(p: p, ayrinti: ayrinti)
            }
        }
        .padding(.horizontal, 4)
        .frame(height: 34)
        .yuzey(17, dolgu: Color.black.opacity(0.22))
        .foregroundStyle(Tema.sari)
        .disabled(kamera.kayitta || kamera.proCalisiyor)
        .opacity(kamera.kayitta ? 0.55 : 1)
        .animation(.snappy(duration: 0.22), value: parcalar.map(\.yazi))
    }

    struct Secenek { let ad: String; let secili: Bool; let sec: () -> Void }
    struct ParcaVeri: Identifiable {
        let id: String
        let yazi: String
        var simge: String? = nil
        let secenekler: [Secenek]
    }

    private var parcalar: [ParcaVeri] {
        let k = kamera
        switch k.mod {
        case .video, .timelapse:
            var l = [ParcaVeri(id: "coz", yazi: HizliBicim.cozAd(k.videoYukseklik), secenekler: k.videoSecenekleri.map { h in
                Secenek(ad: HizliBicim.cozAd(h), secili: k.videoYukseklik == h) { k.videoYukseklik = h }
            })]
            if k.mod == .video {
                l.append(ParcaVeri(id: "fps", yazi: "\(k.videoFps)", secenekler: k.videoFpsler.map { f in
                    Secenek(ad: "\(f) kare/sn", secili: k.videoFps == f) { k.videoFps = f }
                }))
                l.append(ParcaVeri(id: "sab", yazi: "", simge: HizliBicim.sabitlemeSimge(k.etkinSabitleme), secenekler: k.sabitlemeler.map { s in
                    Secenek(ad: s.ad, secili: k.sabitleme == s) { k.sabitleme = s }
                }))
            }
            return l
        default:
            // Fotoğraf: çözünürlük (12 MP ve üstü) · biçim (HEIF / JPEG / RAW); video ayarları burada görünmez
            var l: [ParcaVeri] = []
            if !k.fotoBoyutlari.isEmpty {
                l.append(ParcaVeri(id: "mp", yazi: k.fotoBoyut.map { HizliBicim.mpAd($0) } ?? "", secenekler: k.fotoBoyutlari.map { b in
                    Secenek(ad: KameraAyarlar.mp(b), secili: k.fotoBoyut.map { $0.width == b.width && $0.height == b.height } ?? false) { k.fotoBoyutSec(b) }
                }))
            }
            l.append(ParcaVeri(id: "bicim", yazi: k.fotoBicim.rawValue, secenekler: k.fotoBicimleri.map { f in
                Secenek(ad: f.rawValue, secili: k.fotoBicim == f) { k.fotoBicim = f }
            }))
            return l
        }
    }

    static func mpAd(_ b: CMVideoDimensions) -> String { "\(Int((Double(b.width) * Double(b.height) / 1_000_000).rounded())) MP" }

    static func cozAd(_ h: Int) -> String { h >= 2160 ? "4K" : (h >= 1080 ? "HD" : "\(h)p") }

    static func sabitlemeSimge(_ s: Sabitleme) -> String {
        switch s {
        case .kapali: return "hand.raised.slash"
        case .standart: return "hand.raised"
        case .sinematik: return "figure.walk"
        case .sinematikGenis: return "figure.walk.motion"
        case .aksiyon: return "figure.run"
        }
    }

    /// Tek değer: dokun / kaydır / basılı tut
    private struct Parca: View {
        let p: ParcaVeri
        var ayrinti: () -> Void

        var body: some View {
            Group {
                if let s = p.simge {
                    Image(systemName: s).font(.system(size: 13, weight: .semibold)).contentTransition(.symbolEffect(.replace))
                } else {
                    Text(p.yazi).font(.system(size: 14, weight: .semibold).monospacedDigit()).tracking(0.3).contentTransition(.numericText())
                }
            }
            .lineLimit(1)
            .padding(.horizontal, 10).frame(minWidth: 36).frame(height: 34)
            .contentShape(Rectangle())
            .onTapGesture { kaydir(1) }
            .gesture(DragGesture(minimumDistance: 14).onEnded { d in
                guard abs(d.translation.width) > abs(d.translation.height) else { return }
                kaydir(d.translation.width < 0 ? 1 : -1)
            })
            .contextMenu {
                ForEach(Array(p.secenekler.enumerated()), id: \.offset) { _, s in
                    Button(action: s.sec) { if s.secili { Label(s.ad, systemImage: "checkmark") } else { Text(s.ad) } }
                }
                Divider()
                Button(action: ayrinti) { Label("Ayrıntılı…", systemImage: "slider.horizontal.3") }
            }
            .accessibilityElement()
            .accessibilityLabel(p.secenekler.first { $0.secili }?.ad ?? p.yazi)
            .accessibilityHint("Dokun: sıradaki")
            .accessibilityAction { kaydir(1) }
        }

        private func kaydir(_ adim: Int) {
            let l = p.secenekler
            guard l.count > 1 else { return }
            let i = l.firstIndex { $0.secili } ?? 0
            let j = (i + adim + l.count) % l.count
            UISelectionFeedbackGenerator().selectionChanged()
            withAnimation(.snappy(duration: 0.22)) { l[j].sec() }
        }
    }
}
