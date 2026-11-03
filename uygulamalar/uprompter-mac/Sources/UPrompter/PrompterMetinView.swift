import AppKit
import QuartzCore
import SwiftUI

/// Prompter metnini çizen ve kaydıran görünüm. Metin bir NSTextView'da durur; görünüm onu
/// yukarı kaydırarak okunan satırı sabit yerde tutar. Saniyede 60 kez güncellenir.
final class PrompterMetinView: NSView {
    private let metin: NSTextView
    private var kelimeAraliklari: [NSRange] = []
    private var isaretAraliklari: [NSRange] = []
    private var kelimeY: [CGFloat] = []
    private var kimlik: UUID?
    private var yaziBoyu: CGFloat = 0
    private var olculenGenislik: CGFloat = 0
    private var boyananPtr = -1
    private var offset: CGFloat = 0
    private var hedef: CGFloat = 0
    private var zamanlayici: Timer?
    private var sonZaman = CACurrentMediaTime()

    override var isFlipped: Bool { true }

    override init(frame: NSRect) {
        let depo = NSTextStorage()
        let duzen = NSLayoutManager()
        depo.addLayoutManager(duzen)
        let kap = NSTextContainer(size: NSSize(width: 100, height: CGFloat.greatestFiniteMagnitude))
        kap.widthTracksTextView = false
        kap.lineFragmentPadding = 0
        duzen.addTextContainer(kap)
        metin = NSTextView(frame: .zero, textContainer: kap)
        super.init(frame: frame)

        wantsLayer = true
        layer?.masksToBounds = true
        metin.isEditable = false
        metin.isSelectable = false
        metin.drawsBackground = false
        metin.textContainerInset = .zero
        metin.isVerticallyResizable = false
        metin.isHorizontallyResizable = false
        addSubview(metin)

        let t = Timer(timeInterval: 1.0 / 60.0, repeats: true) { [weak self] _ in self?.adim() }
        RunLoop.main.add(t, forMode: .common)
        zamanlayici = t
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) kullanılmaz") }

    deinit { zamanlayici?.invalidate() }

    // Fare olayları alttaki metne değil bu görünüme gelsin (kaydırma için).
    override func hitTest(_ point: NSPoint) -> NSView? {
        super.hitTest(point) != nil ? self : nil
    }

    private var satir: CGFloat { (yaziBoyu * 1.3).rounded() }
    private var okumaSatiri: CGFloat { Ayarlar.ortak.satirSayisi >= 3 ? 1 : 0 }
    private var enCok: CGFloat { max(0, (kelimeY.last ?? 0) - satir * okumaSatiri) }

    func guncelle(ayrisim: Ayrisim, yaziBoyu: CGFloat) {
        guard ayrisim.kimlik != kimlik || yaziBoyu != self.yaziBoyu else { return }
        kimlik = ayrisim.kimlik
        self.yaziBoyu = yaziBoyu
        yaziyiKur(ayrisim)
    }

    func basaDon() {
        hedef = 0
        offset = 0
    }

    func satirKaydir(_ n: Int) {
        hedef = min(enCok, max(0, hedef + CGFloat(n) * satir))
    }

    private func yaziyiKur(_ a: Ayrisim) {
        let fs = yaziBoyu
        let paragraf = NSMutableParagraphStyle()
        paragraf.alignment = .center
        paragraf.minimumLineHeight = satir
        paragraf.maximumLineHeight = satir
        paragraf.paragraphSpacing = (fs * 0.45).rounded()
        paragraf.lineBreakMode = .byWordWrapping

        let govdeYazi = NSFont.systemFont(ofSize: fs, weight: .medium, width: .condensed)
        let isaretBoyu = max(10, (fs * 0.42).rounded())
        let isaretYazi = NSFont.monospacedSystemFont(ofSize: isaretBoyu, weight: .medium)
        let temel: [NSAttributedString.Key: Any] = [
            .font: govdeYazi, .paragraphStyle: paragraf, .foregroundColor: Renk.siradakiNS,
        ]

        let s = NSMutableAttributedString()
        var kelimeler: [NSRange] = []
        var isaretler: [NSRange] = []
        for (i, p) in a.parcalar.enumerated() {
            if i > 0 { s.append(NSAttributedString(string: p.paragrafBasi ? "\n" : " ", attributes: temel)) }
            let bas = s.length
            switch p.tur {
            case .kelime, .duz:
                s.append(NSAttributedString(string: p.metin, attributes: temel))
            case .isaret:
                var o = temel
                o[.font] = isaretYazi
                o[.foregroundColor] = Renk.isaretNS
                o[.baselineOffset] = ((fs - isaretBoyu) * 0.3).rounded()
                s.append(NSAttributedString(string: "[" + p.metin.uppercased(with: Locale(identifier: "tr_TR")) + "]", attributes: o))
            }
            let r = NSRange(location: bas, length: s.length - bas)
            if p.tur == .kelime { kelimeler.append(r) } else if p.tur == .isaret { isaretler.append(r) }
        }
        if s.length == 0 {
            s.append(NSAttributedString(string: "Metin boş. Ana pencereden bir metin yazın.", attributes: temel))
        }
        metin.textStorage?.setAttributedString(s)
        kelimeAraliklari = kelimeler
        isaretAraliklari = isaretler
        kelimeY = []
        boyananPtr = -1
        olculenGenislik = 0
        olcule()
    }

    override func layout() {
        super.layout()
        olcule()
    }

    private func olcule() {
        let w = bounds.width
        guard w > 0, let duzen = metin.layoutManager, let kap = metin.textContainer else { return }
        guard w != olculenGenislik else { return }
        olculenGenislik = w
        kap.containerSize = NSSize(width: w, height: CGFloat.greatestFiniteMagnitude)
        duzen.ensureLayout(for: kap)
        kelimeY = kelimeAraliklari.map { r in
            let g = duzen.glyphRange(forCharacterRange: r, actualCharacterRange: nil)
            return duzen.boundingRect(forGlyphRange: g, in: kap).minY
        }
        let yukseklik = duzen.usedRect(for: kap).height
        metin.frame = NSRect(x: 0, y: -offset, width: w, height: yukseklik + max(bounds.height, 1))
        boyananPtr = -1
    }

    private func ptrBul(_ off: CGFloat) -> Int {
        let y = off + satir * okumaSatiri - satir * 0.5
        var lo = 0, hi = kelimeY.count - 1, sonuc = max(0, kelimeY.count - 1)
        while lo <= hi {
            let orta = (lo + hi) / 2
            if kelimeY[orta] >= y { sonuc = orta; hi = orta - 1 } else { lo = orta + 1 }
        }
        return max(0, sonuc)
    }

    private func adim() {
        olcule()
        let simdi = CACurrentMediaTime()
        let dt = CGFloat(min(0.05, simdi - sonZaman))
        sonZaman = simdi
        guard !kelimeY.isEmpty else { return }
        let o = Oturum.ortak
        let a = Ayarlar.ortak

        switch a.kip {
        case .ses:
            hedef = max(0, kelimeY[min(max(0, o.ptr), kelimeY.count - 1)] - satir * okumaSatiri)
        case .hiz:
            if o.calisiyor {
                hedef = min(enCok, hedef + CGFloat(a.hiz) * dt)
                if hedef >= enCok { o.durdur() }
            }
            let p = ptrBul(hedef)
            if p != o.ptr { o.ptr = p }
        case .elle:
            let p = ptrBul(hedef)
            if p != o.ptr { o.ptr = p }
        }

        offset += (hedef - offset) * min(1, dt * 7)
        if abs(hedef - offset) < 0.3 { offset = hedef }
        if metin.frame.origin.y != -offset { metin.frame.origin.y = -offset }
        if boyananPtr != o.ptr { boya(o.ptr) }
    }

    override func scrollWheel(with e: NSEvent) {
        let carpan: CGFloat = e.hasPreciseScrollingDeltas ? 1 : 12
        hedef = min(enCok, max(0, hedef - e.scrollingDeltaY * carpan))
        if Ayarlar.ortak.kip == .ses, !kelimeY.isEmpty {
            Oturum.ortak.elleKonum(ptrBul(hedef))
        }
    }

    private func boya(_ istenen: Int) {
        guard let ts = metin.textStorage, !kelimeAraliklari.isEmpty else { return }
        let p = min(max(0, istenen), kelimeAraliklari.count - 1)
        let tum = NSRange(location: 0, length: ts.length)
        let simdiki = kelimeAraliklari[p]
        let sonra = simdiki.location + simdiki.length
        ts.beginEditing()
        ts.removeAttribute(.underlineStyle, range: tum)
        ts.addAttribute(.foregroundColor, value: Renk.okunduNS, range: NSRange(location: 0, length: simdiki.location))
        ts.addAttribute(.foregroundColor, value: NSColor.white, range: simdiki)
        ts.addAttributes([.underlineStyle: NSUnderlineStyle.thick.rawValue, .underlineColor: Renk.maviNS], range: simdiki)
        ts.addAttribute(.foregroundColor, value: Renk.siradakiNS, range: NSRange(location: sonra, length: ts.length - sonra))
        for r in isaretAraliklari { ts.addAttribute(.foregroundColor, value: Renk.isaretNS, range: r) }
        ts.endEditing()
        boyananPtr = istenen
    }
}

struct PrompterMetin: NSViewRepresentable {
    let ayrisim: Ayrisim
    let yaziBoyu: Double

    func makeNSView(context: Context) -> PrompterMetinView {
        let v = PrompterMetinView(frame: .zero)
        Oturum.ortak.gorunum = v
        return v
    }

    func updateNSView(_ v: PrompterMetinView, context: Context) {
        v.guncelle(ayrisim: ayrisim, yaziBoyu: CGFloat(yaziBoyu))
    }
}
