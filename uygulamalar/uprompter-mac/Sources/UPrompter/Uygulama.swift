import SwiftUI
import AppKit

@main
struct UPrompterUygulamasi: App {
    @NSApplicationDelegateAdaptor(UygulamaDelegesi.self) private var delege
    @StateObject private var ayarlar = Ayarlar.ortak
    @StateObject private var depo = MetinDeposu.ortak
    @StateObject private var oturum = Oturum.ortak
    @StateObject private var guncelleyici = Guncelleyici.ortak

    var body: some Scene {
        Window("UPrompter", id: "ana") {
            AnaPencere()
                .environmentObject(ayarlar)
                .environmentObject(depo)
                .environmentObject(oturum)
                .environmentObject(guncelleyici)
                .frame(minWidth: 960, minHeight: 600)
                .tint(Renk.mavi)
        }
        .commands {
            CommandGroup(after: .appInfo) {
                Button("Güncellemeleri Denetle…") {
                    Task { await Guncelleyici.ortak.denetle(sessiz: false) }
                }
            }
            CommandMenu("Prompter") {
                Button(oturum.calisiyor ? "Durdur" : "Başlat") { Oturum.ortak.degistir() }
                Button("Başa dön") { Oturum.ortak.basaDon() }
                Divider()
                Button(oturum.panelGorunur ? "Prompter'ı gizle" : "Prompter'ı göster") {
                    PanelYoneticisi.ortak.degistir()
                }
            }
        }
    }
}

final class UygulamaDelegesi: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        Kisayollar.ortak.kur()
        Oturum.ortak.metniYukle(hemen: true)
        if Ayarlar.ortak.otomatikGuncelle {
            Task {
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                await Guncelleyici.ortak.denetle(sessiz: true)
            }
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    func applicationWillTerminate(_ notification: Notification) {
        Oturum.ortak.durdur()
        MetinDeposu.ortak.simdiKaydet()
    }
}

enum Renk {
    static let mavi = Color(red: 0x25 / 255, green: 0x63 / 255, blue: 0xEB / 255)
    static let maviNS = NSColor(srgbRed: 0x3B / 255, green: 0x74 / 255, blue: 0xF0 / 255, alpha: 1)
    static let siradakiNS = NSColor(white: 0.70, alpha: 1)
    static let okunduNS = NSColor(white: 0.32, alpha: 1)
    static let isaretNS = NSColor(srgbRed: 0.55, green: 0.68, blue: 0.97, alpha: 1)
}

func zamanYazisi(_ t: TimeInterval) -> String {
    let sn = max(0, Int(t.rounded()))
    return String(format: "%02d:%02d", sn / 60, sn % 60)
}
