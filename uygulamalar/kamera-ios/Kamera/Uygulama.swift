import Foundation

/// Hangi uygulamadayız: UPDATED Kamera (tr.com.updated.monitor) ya da UPDATED Masa (tr.com.updated.masa).
/// İki uygulama aynı kaynak kümesini derler (ARCHITECTURE 30 Ekim: Ortak / Kamera / Masa); giriş ve geri düğmeleri buna göre değişir.
enum Uygulama {
    static let masa = Bundle.main.bundleIdentifier?.hasSuffix(".masa") == true
    /// Masa ve Monitör ekranlarındaki geri düğmesi: Kamera'da "Kamera", Masa uygulamasında "Menü"
    static var geri: String { masa ? "Menü" : "Kamera" }
    static var geriBuyuk: String { masa ? "MENÜ" : "KAMERA" }
}
