import SwiftUI

/// Multi Cam (eski adı Masa): iPhone'da yan raylı düzen (MultiCam.swift → MultiCamTelefon), iPad'de yönetmen masası (MasaIpad.swift).
/// Kaynağa dokun → sıradaki; bir daha dokun / AUTO → geçişle canlı; CUT → hemen canlı; basılı tut → menü.
struct MasaEkran: View {
    var kapat: () -> Void
    @StateObject private var m = Masa()
    @Environment(\.scenePhase) private var evre
    @State private var kaynakAcik = false

    var body: some View {
        Group {
            if UIDevice.current.userInterfaceIdiom == .pad {
                MasaIpad(m: m, kapat: kapat, kaynakAcik: $kaynakAcik)
            } else {
                MultiCamTelefon(m: m, kapat: kapat, kaynakAcik: $kaynakAcik)
            }
        }
        .preferredColorScheme(.dark)
        .statusBarHidden()
        .persistentSystemOverlays(.hidden)
        .onAppear { m.ac() }
        .onDisappear { m.kapat() }
        .onChange(of: evre) { _, yeni in if yeni == .active { m.usbTara() } }
        .sheet(isPresented: $kaynakAcik) { KaynakEkleSayfasi(m: m) { kaynakAcik = false } }
    }
}
