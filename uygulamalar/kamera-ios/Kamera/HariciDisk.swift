import AVFoundation
import Combine

/// USB-C'ye takılı harici SSD'ye doğrudan video kaydı (iPhone 15 Pro ve sonrası, iOS 17).
/// Apple kuralı: ProRes 4K 60 yalnız harici diske yazılabilir; diğer biçimler de SSD takılıyken oraya gider (Ayarlar → Kayıt'tan kapatılabilir).
/// Dosya SSD'de kalır (Fotoğraflar'a kopyalanmaz); SSD çıkarılınca uygulama dosyaya erişemez.
final class HariciDisk: NSObject, ObservableObject {
    /// Takılı SSD adı; nil = takılı değil (ya da bu iPhone desteklemiyor)
    @Published private(set) var ad: String?
    @Published private(set) var bosAlan: Int64?
    /// Kullanıcı harici diske yazma iznini verdi mi
    @Published private(set) var izin = false
    private var gozlem: NSKeyValueObservation?
    private var cihaz: AnyObject?

    override init() {
        super.init()
        if #available(iOS 17.0, *) { kur() }
    }

    @available(iOS 17.0, *)
    private func kur() {
        guard AVExternalStorageDeviceDiscoverySession.isSupported, let o = AVExternalStorageDeviceDiscoverySession.shared else { return }
        gozlem = o.observe(\.externalStorageDevices, options: [.initial, .new]) { [weak self] oturum, _ in
            self?.guncelle(oturum.externalStorageDevices)
        }
    }

    @available(iOS 17.0, *)
    private func guncelle(_ liste: [AVExternalStorageDevice]) {
        let d = liste.first { $0.isConnected && !$0.isNotRecommendedForCaptureUse } ?? liste.first { $0.isConnected }
        cihaz = d
        let ad = d.map { $0.displayName ?? "Harici disk" }
        let bos = d.map { Int64($0.freeSize) }
        DispatchQueue.main.async { self.ad = ad; self.bosAlan = bos }
        guard d != nil else { return }
        if AVExternalStorageDevice.authorizationStatus == .authorized { DispatchQueue.main.async { self.izin = true }; return }
        Task {
            let ok = await AVExternalStorageDevice.requestAccess()
            await MainActor.run { self.izin = ok }
        }
    }

    var takili: Bool { ad != nil }

    /// Kayıt dosyası için SSD'de yeni yol (erişim açılmış olarak); SSD yoksa ya da izin yoksa nil.
    /// Kayıt bitince `birak(_:)` çağrılır.
    func yeniDosya(uzanti: String) -> URL? {
        guard #available(iOS 17.0, *), let c = cihaz as? AVExternalStorageDevice, c.isConnected, izin,
              let u = try? c.nextAvailableURLs(withPathExtensions: [uzanti]).first else { return nil }
        _ = u.startAccessingSecurityScopedResource()
        return u
    }

    func birak(_ u: URL) { u.stopAccessingSecurityScopedResource() }

    static func boyutYazisi(_ b: Int64) -> String { KayitKlasoru.boyutYazisi(b) }
}
