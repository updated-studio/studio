import Foundation
import AppKit

/// Uygulama içinden güncelleme. Her derlemede GitHub'daki "uprompter" yayınına
/// UPrompter.zip ve surum.json konur; uygulama açılışta surum.json'a bakar,
/// yeni yapı varsa sorar, indirir, kendini değiştirir ve yeniden açılır.
struct SurumBilgisi: Decodable {
    let surum: String
    let yapi: Int
    let not: String?
    let url: String
}

final class Guncelleyici: ObservableObject {
    static let ortak = Guncelleyici()
    static let adres = URL(string: "https://github.com/updated-studio/studio/releases/download/uprompter/surum.json")!

    @Published var durum = ""
    @Published var calisiyor = false

    let mevcutSurum = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "geliştirme"
    let mevcutYapi = Int(Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "") ?? 0

    @MainActor
    func denetle(sessiz: Bool) async {
        guard !calisiyor else { return }
        calisiyor = true
        defer { calisiyor = false }
        if !sessiz { durum = "Denetleniyor…" }
        let bilgi: SurumBilgisi
        do {
            var istek = URLRequest(url: Self.adres)
            istek.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
            istek.timeoutInterval = 20
            let (veri, _) = try await URLSession.shared.data(for: istek)
            bilgi = try JSONDecoder().decode(SurumBilgisi.self, from: veri)
        } catch {
            durum = sessiz ? "" : "Denetlenemedi: \(error.localizedDescription)"
            return
        }
        guard bilgi.yapi > mevcutYapi else {
            durum = "En güncel sürümü kullanıyorsunuz (\(mevcutSurum), yapı \(mevcutYapi))."
            return
        }
        durum = "Yeni sürüm var: \(bilgi.surum) (yapı \(bilgi.yapi))"
        let uyari = NSAlert()
        uyari.messageText = "UPrompter \(bilgi.surum) hazır"
        var aciklama = ""
        if let not = bilgi.not, !not.isEmpty { aciklama += not + "\n\n" }
        aciklama += "Güncelleme indirilir; UPrompter kapanıp yeni sürümle yeniden açılır."
        uyari.informativeText = aciklama
        uyari.addButton(withTitle: "Şimdi güncelle")
        uyari.addButton(withTitle: "Sonra")
        NSApp.activate(ignoringOtherApps: true)
        if uyari.runModal() == .alertFirstButtonReturn {
            await kur(bilgi)
        }
    }

    @MainActor
    private func kur(_ bilgi: SurumBilgisi) async {
        let hedef = Bundle.main.bundleURL
        guard hedef.pathExtension == "app" else {
            durum = "Geliştirme sürümü kendini güncelleyemez."
            return
        }
        if hedef.path.contains("/AppTranslocation/") {
            uyar("UPrompter'ı önce Uygulamalar klasörüne taşıyın, sonra yeniden açıp güncelleyin.")
            return
        }
        guard FileManager.default.isWritableFile(atPath: hedef.deletingLastPathComponent().path) else {
            uyar("UPrompter'ın bulunduğu klasöre yazılamıyor. Uygulamayı Uygulamalar klasörüne taşıyın.")
            return
        }
        guard let url = URL(string: bilgi.url) else { return }
        Oturum.ortak.durdur()
        durum = "İndiriliyor…"
        do {
            let (gecici, _) = try await URLSession.shared.download(from: url)
            let fm = FileManager.default
            let klasor = fm.temporaryDirectory.appendingPathComponent("uprompter-guncelleme-\(UUID().uuidString)")
            try fm.createDirectory(at: klasor, withIntermediateDirectories: true)
            let zip = klasor.appendingPathComponent("UPrompter.zip")
            try fm.moveItem(at: gecici, to: zip)
            try calistir("/usr/bin/ditto", ["-x", "-k", zip.path, klasor.path])
            let yeni = klasor.appendingPathComponent("UPrompter.app")
            guard fm.fileExists(atPath: yeni.appendingPathComponent("Contents/MacOS/UPrompter").path) else {
                throw NSError(domain: "UPrompter", code: 1, userInfo: [NSLocalizedDescriptionKey: "İndirilen dosyada uygulama bulunamadı."])
            }
            MetinDeposu.ortak.simdiKaydet()
            let pid = ProcessInfo.processInfo.processIdentifier
            // $1 = yeni uygulama, $2 = mevcut uygulama. Uygulama kapanınca değiştirir, sorun olursa eskisini geri koyar.
            let betik = """
            while kill -0 \(pid) 2>/dev/null; do sleep 0.2; done
            rm -rf "$2.eski"
            if mv "$2" "$2.eski"; then
              if mv "$1" "$2"; then rm -rf "$2.eski"; else mv "$2.eski" "$2"; fi
            fi
            xattr -dr com.apple.quarantine "$2" 2>/dev/null
            open "$2"
            """
            let p = Process()
            p.executableURL = URL(fileURLWithPath: "/bin/sh")
            p.arguments = ["-c", betik, "uprompter-guncelle", yeni.path, hedef.path]
            try p.run()
            NSApp.terminate(nil)
        } catch {
            durum = ""
            uyar("Güncelleme kurulamadı: \(error.localizedDescription)")
        }
    }

    private func calistir(_ yol: String, _ argumanlar: [String]) throws {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: yol)
        p.arguments = argumanlar
        try p.run()
        p.waitUntilExit()
        if p.terminationStatus != 0 {
            throw NSError(domain: "UPrompter", code: Int(p.terminationStatus),
                          userInfo: [NSLocalizedDescriptionKey: "Dosya açılamadı (\(p.terminationStatus))."])
        }
    }

    @MainActor
    private func uyar(_ mesaj: String) {
        let u = NSAlert()
        u.messageText = "Güncelleme"
        u.informativeText = mesaj
        u.runModal()
    }
}
