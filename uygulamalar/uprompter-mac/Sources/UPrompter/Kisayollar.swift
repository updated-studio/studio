import Carbon
import Foundation

/// Bütün sistemde çalışan kısayollar (⌃⌥ ile). Uygulama arka plandayken de çalışır,
/// böylece görüşme ya da kayıt uygulamasından çıkmadan prompter yönetilir.
final class Kisayollar {
    static let ortak = Kisayollar()

    struct Tanim {
        let tus: Int
        let simge: String
        let aciklama: String
        let eylem: () -> Void
    }

    private var kayitlar: [EventHotKeyRef?] = []
    private var eylemler: [UInt32: () -> Void] = [:]
    private var kuruldu = false

    static let liste: [Tanim] = [
        Tanim(tus: kVK_Space, simge: "⌃⌥ Boşluk", aciklama: "Başlat / durdur") { Oturum.ortak.degistir() },
        Tanim(tus: kVK_UpArrow, simge: "⌃⌥ ↑", aciklama: "Hızlandır ya da geri") {
            if Ayarlar.ortak.kip == .hiz { Oturum.ortak.hizDegistir(5) } else { Oturum.ortak.zipla(-10) }
        },
        Tanim(tus: kVK_DownArrow, simge: "⌃⌥ ↓", aciklama: "Yavaşlat ya da ileri") {
            if Ayarlar.ortak.kip == .hiz { Oturum.ortak.hizDegistir(-5) } else { Oturum.ortak.zipla(10) }
        },
        Tanim(tus: kVK_LeftArrow, simge: "⌃⌥ ←", aciklama: "Geri sar") { Oturum.ortak.zipla(-10) },
        Tanim(tus: kVK_RightArrow, simge: "⌃⌥ →", aciklama: "İleri al") { Oturum.ortak.zipla(10) },
        Tanim(tus: kVK_ANSI_R, simge: "⌃⌥ R", aciklama: "Başa dön") { Oturum.ortak.basaDon() },
        Tanim(tus: kVK_ANSI_P, simge: "⌃⌥ P", aciklama: "Prompter'ı göster / gizle") { PanelYoneticisi.ortak.degistir() },
    ]

    func kur() {
        guard !kuruldu else { return }
        kuruldu = true
        var tur = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        InstallEventHandler(GetApplicationEventTarget(), { _, olay, _ in
            var kimlik = EventHotKeyID()
            let sonuc = GetEventParameter(
                olay, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID),
                nil, MemoryLayout<EventHotKeyID>.size, nil, &kimlik
            )
            if sonuc == noErr {
                let no = kimlik.id
                DispatchQueue.main.async { Kisayollar.ortak.calistir(no) }
            }
            return noErr
        }, 1, &tur, nil, nil)

        let degistiriciler = UInt32(controlKey | optionKey)
        for (i, t) in Self.liste.enumerated() {
            let no = UInt32(i + 1)
            var ref: EventHotKeyRef?
            let kimlik = EventHotKeyID(signature: OSType(0x5550_5254), id: no) // "UPRT"
            RegisterEventHotKey(UInt32(t.tus), degistiriciler, kimlik, GetApplicationEventTarget(), 0, &ref)
            kayitlar.append(ref)
            eylemler[no] = t.eylem
        }
    }

    private func calistir(_ no: UInt32) {
        eylemler[no]?()
    }
}
