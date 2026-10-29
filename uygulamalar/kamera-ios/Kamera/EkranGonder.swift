import ReplayKit
import SwiftUI

/// "Ekranı Masa'ya gönder": iOS'un ekran yayını penceresini açar, uzantı (EkranYayini) seçili gelir.
/// Kendi görüntü çıkışı olmayan kameralar için: üreticinin uygulaması açık durur, ekrandaki önizleme masaya kaynak olur.
struct EkranGonderDugme: View {
    var body: some View {
        ZStack(alignment: .leading) {
            Label("Ekranı Masa'ya gönder", systemImage: "rectangle.on.rectangle")
            YayinSecici().opacity(0.02)
        }
    }
}

private struct YayinSecici: UIViewRepresentable {
    func makeUIView(context: Context) -> RPSystemBroadcastPickerView {
        let v = RPSystemBroadcastPickerView(frame: .zero)
        v.preferredExtension = (Bundle.main.bundleIdentifier ?? "tr.com.updated.monitor") + ".ekran"
        v.showsMicrophoneButton = false
        return v
    }

    func updateUIView(_ v: RPSystemBroadcastPickerView, context: Context) {}
}
