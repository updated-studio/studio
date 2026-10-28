import SwiftUI

/// UPDATED Kamera (iPhone/iPad). Android sürümüyle (uygulamalar/monitor) aynı ad, aynı paket kimliği.
@main
struct UpdatedKameraApp: App {
    var body: some Scene {
        WindowGroup {
            AnaEkran()
                .preferredColorScheme(.dark)
                .statusBarHidden()
                .persistentSystemOverlays(.hidden)
        }
    }
}
