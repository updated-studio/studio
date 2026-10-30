import Foundation

/// Hangi uygulamadayız: Updated Camera (tr.com.updated.monitor) ya da UpCam Studio (tr.com.UpCam.Studio, Masa + Monitör).
/// İki uygulama aynı kaynak kümesini derler (ARCHITECTURE 30 Ekim: Ortak / Kamera / Masa); giriş ve geri düğmeleri buna göre değişir.
enum Uygulama {
    static let masa = Bundle.main.bundleIdentifier != "tr.com.updated.monitor"
    /// Masa ve Monitör ekranlarındaki geri düğmesi: Kamera'da "Kamera", Masa uygulamasında "Menü"
    static var geri: String { masa ? "Menü" : "Kamera" }
    static var geriBuyuk: String { masa ? "MENÜ" : "KAMERA" }
}
