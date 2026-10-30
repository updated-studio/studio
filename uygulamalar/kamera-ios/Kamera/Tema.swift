import SwiftUI

/// Android sürümündeki Tema.kt ile aynı renkler: koyu cam yüzeyler, turuncu vurgu (UPDATED marka rengi).
enum Tema {
    static let zemin = Color(red: 12/255, green: 13/255, blue: 16/255)
    static let yuzey = Color(red: 22/255, green: 24/255, blue: 28/255).opacity(0.84)
    static let metin2 = Color.white.opacity(0.67)
    static let vurgu = Color(red: 1, green: 107/255, blue: 26/255)
    /// Kamera ekranının vurgu rengi (Apple Kamera sarısı)
    static let sari = Color(red: 1, green: 214/255, blue: 10/255)
    static let baz = Color(red: 1, green: 176/255, blue: 32/255)
    static let mono = Font.system(.footnote, design: .monospaced).weight(.semibold)

    // Kamera ekranının dili (Fatih 29 Ekim: "sofistike, şık, işlevsel; büyük stüdyo işi gibi"):
    // tek yazı ailesi ve tablo rakamları; yüzeyler cam değil yarı saydam siyah + yarım piksel hat; sarı yalnız elle değiştirilmiş
    // değerde, yeşil onay, kırmızı kayıt; metin beyaz / %62 / %28.
    static let metin3 = Color.white.opacity(0.28)
    static let ikincil = Color.white.opacity(0.62)
    static let hat = Color.white.opacity(0.18)
    static let koyu = Color.black.opacity(0.34)
    static let yesil = Color(red: 52/255, green: 199/255, blue: 89/255)
    static let kirmizi = Color(red: 1, green: 69/255, blue: 58/255)
    /// Okuma değeri (ISO, S, K…): 15 pt yarı kalın, tablo rakamları
    static let deger = Font.system(size: 15, weight: .semibold).monospacedDigit()
    /// Okuma etiketi (ISO, K, S): küçük, büyük harf, aralıklı
    static let etiket = Font.system(size: 9.5, weight: .semibold)
    /// Panel bölüm başlığı (TEMEL, FİLM REÇETELERİ…)
    static let bolum = Font.system(size: 10, weight: .semibold)
}

extension View {
    /// Yüzey: iOS 26 ve sonrasında Apple'ın cam malzemesi (Kamera uygulamasındaki gibi, hafif koyu tonlu); öncesinde yarı saydam siyah
    /// + yarım piksel hat (Fatih 30 Ekim: "arayüz iOS 27'den uzaklaşmış").
    func yuzey(_ yaricap: CGFloat = 14, dolgu: Color = Tema.koyu) -> some View {
        modifier(CamYuzey(sekil: RoundedRectangle(cornerRadius: yaricap, style: .continuous), dolgu: dolgu, vurgu: nil))
    }

    /// Yuvarlak düğme zemini (aynı dil)
    func yuvarlakYuzey(_ vurgu: Color? = nil) -> some View {
        modifier(CamYuzey(sekil: Circle(), dolgu: Tema.koyu, vurgu: vurgu))
    }

    /// Bölüm başlığı metni
    func bolumBasligi() -> some View { font(Tema.bolum).tracking(1.2).foregroundStyle(Color.white.opacity(0.45)) }
}

struct CamYuzey<S: InsettableShape>: ViewModifier {
    let sekil: S
    let dolgu: Color
    let vurgu: Color?

    @ViewBuilder func body(content: Content) -> some View {
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            content
                .glassEffect(.regular.tint(dolgu), in: sekil)
                .overlay(sekil.strokeBorder(vurgu?.opacity(0.6) ?? .clear, lineWidth: 1).allowsHitTesting(false))
        } else {
            eski(content)
        }
        #else
        eski(content)
        #endif
    }

    private func eski(_ content: Content) -> some View {
        content.background(
            sekil.fill(.ultraThinMaterial)
                .overlay(sekil.fill(dolgu))
                .overlay(sekil.strokeBorder(vurgu?.opacity(0.6) ?? Tema.hat, lineWidth: vurgu == nil ? 0.5 : 1))
                .environment(\.colorScheme, .dark)
        )
    }
}
