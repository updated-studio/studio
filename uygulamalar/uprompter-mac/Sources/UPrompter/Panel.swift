import AppKit
import SwiftUI
import Combine

/// Ekranın tepesinde, çentiğin (kameranın) hemen altında duran prompter penceresi.
/// Menü çubuğunun üstünde durur, bütün masaüstlerinde görünür, odağı çalmaz
/// ve isteğe bağlı olarak ekran paylaşımı / kayıtta görünmez.
final class PrompterPaneli: NSPanel {
    init() {
        super.init(
            contentRect: NSRect(x: 0, y: 0, width: 620, height: 200),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        isFloatingPanel = true
        level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.mainMenuWindow)) + 2)
        backgroundColor = .clear
        isOpaque = false
        hasShadow = false
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        hidesOnDeactivate = false
        isMovable = false
        isReleasedWhenClosed = false
    }

    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

final class PanelYoneticisi {
    static let ortak = PanelYoneticisi()
    private var panel: PrompterPaneli?
    private var iptaller = Set<AnyCancellable>()

    func goster() {
        if panel == nil { olustur() }
        konumla()
        panel?.orderFrontRegardless()
        Oturum.ortak.panelGorunur = true
    }

    func gizle() {
        panel?.orderOut(nil)
        Oturum.ortak.panelGorunur = false
    }

    func degistir() {
        if Oturum.ortak.panelGorunur { gizle() } else { goster() }
    }

    private func olustur() {
        let p = PrompterPaneli()
        let kok = PanelGorunumu()
            .environmentObject(Ayarlar.ortak)
            .environmentObject(Oturum.ortak)
        let barindirici = NSHostingView(rootView: kok)
        barindirici.sizingOptions = []
        p.contentView = barindirici
        panel = p
        Ayarlar.ortak.objectWillChange
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in self?.konumla() }
            .store(in: &iptaller)
        NotificationCenter.default.publisher(for: NSApplication.didChangeScreenParametersNotification)
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in self?.konumla() }
            .store(in: &iptaller)
    }

    /// Çentikli ekran varsa onu, yoksa ana ekranı kullanır.
    private var ekran: NSScreen? {
        NSScreen.screens.first(where: { $0.safeAreaInsets.top > 0 }) ?? NSScreen.main
    }

    func konumla() {
        guard let p = panel, let ekran else { return }
        let a = Ayarlar.ortak
        let ust = max(ekran.safeAreaInsets.top, NSStatusBar.system.thickness) + 6
        if Oturum.ortak.ustBosluk != ust { Oturum.ortak.ustBosluk = ust }
        let vp = CGFloat(a.satirSayisi) * a.satirYuksekligi
        let w = min(CGFloat(a.genislik), ekran.frame.width - 40)
        let h = ust + vp + 50
        let cerceve = NSRect(x: (ekran.frame.midX - w / 2).rounded(), y: ekran.frame.maxY - h, width: w, height: h)
        if p.frame != cerceve { p.setFrame(cerceve, display: true) }
        p.sharingType = a.paylasimdaGizle ? .none : .readOnly
    }
}

struct PanelGorunumu: View {
    @EnvironmentObject var ayarlar: Ayarlar
    @EnvironmentObject var oturum: Oturum

    var body: some View {
        VStack(spacing: 0) {
            Color.clear.frame(height: oturum.ustBosluk)
            PrompterMetin(ayrisim: oturum.ayrisim, yaziBoyu: ayarlar.yaziBoyu)
                .scaleEffect(x: ayarlar.ayna ? -1 : 1, y: 1)
                .frame(height: CGFloat(ayarlar.satirSayisi) * ayarlar.satirYuksekligi)
                .padding(.horizontal, 22)
            altCubuk
                .frame(height: 50)
                .padding(.horizontal, 14)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(AltKoseliSekil(yaricap: 22).fill(Color.black))
        .overlay {
            if let k = oturum.geriSayimKalan {
                ZStack {
                    Color.black.opacity(0.65)
                    Text("\(k)")
                        .font(.system(size: 60, weight: .semibold, design: .rounded))
                        .foregroundColor(.white)
                }
                .clipShape(AltKoseliSekil(yaricap: 22))
            }
        }
        .environment(\.colorScheme, .dark)
    }

    private var mikrofonRengi: Color {
        if ayarlar.kip != .ses { return Color(white: 0.35) }
        switch oturum.mikrofon {
        case .dinliyor: return Renk.mavi
        case .acik: return Renk.mavi.opacity(0.5)
        case .kapali: return Color(white: 0.35)
        default: return Color(red: 0.94, green: 0.27, blue: 0.37)
        }
    }

    private var durumYazisi: String {
        switch ayarlar.kip {
        case .ses: return oturum.mikrofon.yazi
        case .hiz: return "Sabit hız · \(Int(ayarlar.hiz)) pt/sn"
        case .elle: return "Elle kaydırma"
        }
    }

    private var altCubuk: some View {
        HStack(spacing: 6) {
            PanelDugmesi(simge: oturum.calisiyor ? "pause.fill" : "play.fill",
                         etiket: oturum.calisiyor ? "Durdur" : "Başlat") { oturum.degistir() }
            PanelDugmesi(simge: "gobackward", etiket: "Geri sar") { oturum.zipla(-10) }
            PanelDugmesi(simge: "goforward", etiket: "İleri al") { oturum.zipla(10) }
            Circle().fill(mikrofonRengi).frame(width: 7, height: 7).padding(.leading, 6)
            Text(durumYazisi).lineLimit(1).truncationMode(.tail)
            Spacer(minLength: 8)
            Text(zamanYazisi(oturum.sure)).monospacedDigit()
            Text("~" + zamanYazisi(oturum.kalanSure) + " kaldı").monospacedDigit()
            PanelDugmesi(simge: "xmark", etiket: "Prompter'ı kapat") {
                oturum.durdur()
                PanelYoneticisi.ortak.gizle()
            }
        }
        .font(.system(size: 11))
        .foregroundColor(Color(white: 0.62))
    }
}

struct PanelDugmesi: View {
    let simge: String
    let etiket: String
    let eylem: () -> Void

    var body: some View {
        Button(action: eylem) {
            Image(systemName: simge)
                .font(.system(size: 11, weight: .semibold))
                .frame(width: 26, height: 26)
                .background(RoundedRectangle(cornerRadius: 7).fill(Color(white: 0.13)))
                .foregroundColor(Color(white: 0.92))
        }
        .buttonStyle(.plain)
        .help(etiket)
        .accessibilityLabel(etiket)
    }
}

/// Üstü düz, altı yuvarlak köşeli şekil: çentikten sarkan bir şerit gibi.
struct AltKoseliSekil: Shape {
    var yaricap: CGFloat

    func path(in r: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: r.minX, y: r.minY))
        p.addLine(to: CGPoint(x: r.maxX, y: r.minY))
        p.addLine(to: CGPoint(x: r.maxX, y: r.maxY - yaricap))
        p.addQuadCurve(to: CGPoint(x: r.maxX - yaricap, y: r.maxY), control: CGPoint(x: r.maxX, y: r.maxY))
        p.addLine(to: CGPoint(x: r.minX + yaricap, y: r.maxY))
        p.addQuadCurve(to: CGPoint(x: r.minX, y: r.maxY - yaricap), control: CGPoint(x: r.minX, y: r.maxY))
        p.closeSubpath()
        return p
    }
}
