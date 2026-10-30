import XCTest

/// Her derlemede simülatörde uygulamayı baştan sona gezer (Fatih 29 Ekim: "app'in her özelliğini denediğinden emin ol").
/// Ana ekrandaki her düğmeye, açılan her panelin içindekilere, her moda ve Genel Ayarlar sayfalarına dokunur; her adımda ekran
/// görüntüsü alır. Uygulama çökerse ya da donarsa hangi adımda olduğu yazılır. Simülatörde kamera yok: görüntü siyah, menüler gerçek.
final class GezintiTesti: XCTestCase {
    private var app: XCUIApplication!
    private var sira = 0
    private var klasor: URL?
    /// Uygulamadan çıkaran ya da sistem penceresi açan düğmeler (ayrıca denenir ya da atlanır)
    private let atla: Set<String> = ["Son çekim", "Ekranı Masa'ya gönder", "Monitör (harici kamera)"]

    override func setUp() {
        continueAfterFailure = true
        if let k = ProcessInfo.processInfo.environment["EKRAN_KLASORU"] {
            klasor = URL(fileURLWithPath: k)
            try? FileManager.default.createDirectory(at: klasor!, withIntermediateDirectories: true)
        }
        app = XCUIApplication()
        addUIInterruptionMonitor(withDescription: "izin") { uyari in
            for ad in ["Allow", "OK", "İzin Ver", "Tamam", "Allow While Using App", "Allow Full Access"] where uyari.buttons[ad].exists {
                uyari.buttons[ad].tap(); return true
            }
            return false
        }
        app.launch()
        sleep(3)
        // İlk açılış: "Ne yapmak istiyorsun?" → Kamera (ortaya rastgele dokunmak Monitör'e götürüyordu)
        let kamera = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Kamera'")).firstMatch
        if kamera.waitForExistence(timeout: 2) { kamera.tap(); sleep(2) }
        app.tap()
    }

    func testTumEkranlar() {
        ekran("ana-ekran")
        XCTAssertTrue(app.buttons["FOTO"].waitForExistence(timeout: 5), "Kamera ekranı açılmadı (mod düğmeleri yok)")
        // Modlar
        for mod in ["FOTO", "VİDEO", "PORTRE", "PRO", "TİMELAPSE", "FOTO"] {
            dokun(app.buttons[mod], "mod-\(mod)")
            if mod == "PRO" { panelleriGez(on: "pro") }
        }
        panelleriGez(on: "foto")
        dokun(app.buttons["VİDEO"], "video")
        panelleriGez(on: "video")
        dokun(app.buttons["FOTO"], "foto-geri")
        // Vlog modu (simülatörde iki kamera yok; ekran ve çıktı seçimi gezilir, alt şeritten FOTO'ya dönülür)
        if dokun(app.buttons["VLOG"], "vlog") {
            sleep(2)
            dokun(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Vlog çıktısı'")).firstMatch, "vlog-cikti")
            dokun(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Vlog çıktısı'")).firstMatch, "vlog-cikti-geri")
            dokun(app.buttons["FOTO"].firstMatch, "vlog-foto")
            sleep(2)
        }
        // Yan tutuş
        XCUIDevice.shared.orientation = .landscapeLeft
        sleep(2); ekran("yatay")
        panelleriGez(on: "yatay", sinir: 4)
        XCUIDevice.shared.orientation = .portrait
        sleep(2); ekran("dikey-geri")
        ayarlariGez()
        // Monitör (en sonda; kamera ekranından çıkar)
        if dokun(app.buttons["Monitör (harici kamera)"].firstMatch, "monitor") {
            for ad in adlar().prefix(12) where !atla.contains(ad) { dokun(app.buttons[ad].firstMatch, "monitor-\(ad)"); kapat() }
        }
        XCTAssertEqual(app.state, .runningForeground, "Uygulama gezinti sonunda açık değil")
    }

    /// Ana ekrandaki düğmeler; her biri açılır, içindeki yeni düğmelere de birer kez dokunulur, sonra kapatılır
    private func panelleriGez(on: String, sinir: Int = 99) {
        let ana = adlar()
        for ad in ana.prefix(sinir) where !atla.contains(ad) && !Self.modlar.contains(ad) && ad != "Kapat" && !ad.hasPrefix("Fotoğraf çek") && !ad.hasPrefix("Kayd") {
            guard dokun(app.buttons[ad].firstMatch, "\(on)-\(ad)") else { continue }
            let ic = adlar().filter { !ana.contains($0) && !atla.contains($0) && $0 != "Kapat" }
            for alt in ic.prefix(14) { dokun(app.buttons[alt].firstMatch, "\(on)-\(ad)-\(alt)") }
            kapat()
        }
        // Deklanşör en sonda (simülatörde kamera yok; çökmemeli)
        if app.buttons["Fotoğraf çek"].exists { dokun(app.buttons["Fotoğraf çek"], "\(on)-deklansor") }
        if app.buttons["Kaydı başlat"].exists {
            dokun(app.buttons["Kaydı başlat"], "\(on)-kayit")
            sleep(2)
            if app.buttons["Kaydı durdur"].exists { dokun(app.buttons["Kaydı durdur"], "\(on)-kayit-dur") }
        }
    }

    private func ayarlariGez() {
        let ayar = ["Ayarlar", "Genel Ayarlar"].map { app.buttons[$0].firstMatch }.first { $0.exists }
        guard let ayar, dokun(ayar, "ayarlar") else { kaydet("Ayarlar düğmesi bulunamadı"); return }
        let baglantilar = app.buttons.allElementsBoundByIndex.filter { gorunur($0) }.map(\.label).filter { !$0.isEmpty }
        for ad in baglantilar.prefix(30) where !atla.contains(ad) {
            guard dokun(app.buttons[ad].firstMatch, "ayar-\(ad)") else { continue }
            if app.navigationBars.buttons.firstMatch.exists, app.navigationBars.count > 0, app.navigationBars.buttons.element(boundBy: 0).isHittable {
                app.navigationBars.buttons.element(boundBy: 0).tap(); sleep(1)
            }
        }
        for ad in ["Bitti", "Kapat", "Done"] where app.buttons[ad].exists { app.buttons[ad].firstMatch.tap(); break }
    }

    static let modlar: Set<String> = ["FOTO", "VİDEO", "PORTRE", "PRO", "TİMELAPSE", "MONİTÖR", "VLOG"]

    /// Ekranda ve dokunulabilir mi (kaydırmalı şeritte kenarda kalan düğmenin isHittable'ı hata veriyordu)
    private func gorunur(_ e: XCUIElement) -> Bool {
        guard e.exists else { return false }
        let f = e.frame
        guard !f.isEmpty, f.width >= 2, f.height >= 2, app.frame.contains(CGPoint(x: f.midX, y: f.midY)) else { return false }
        return e.isHittable
    }

    private func adlar() -> [String] {
        var gorulen = Set<String>()
        return app.buttons.allElementsBoundByIndex.filter { gorunur($0) }.map(\.label)
            .filter { !$0.isEmpty && gorulen.insert($0).inserted }
    }

    @discardableResult
    private func dokun(_ e: XCUIElement, _ ad: String) -> Bool {
        guard gorunur(e) else { return false }
        e.tap()
        usleep(700_000)
        guard app.state == .runningForeground else {
            XCTFail("ÇÖKTÜ ya da kapandı: \(ad)")
            kaydet("ÇÖKTÜ: \(ad)")
            app.launch(); sleep(3)
            return false
        }
        ekran(ad)
        return true
    }

    private func kapat() {
        if app.buttons["Kapat"].firstMatch.exists, app.buttons["Kapat"].firstMatch.isHittable { app.buttons["Kapat"].firstMatch.tap() }
        else { app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.35)).tap() }
        usleep(400_000)
    }

    private func ekran(_ ad: String) {
        sira += 1
        let temiz = ad.replacingOccurrences(of: "/", with: "-").replacingOccurrences(of: " ", with: "_")
        let ss = XCUIScreen.main.screenshot()
        let ek = XCTAttachment(screenshot: ss); ek.name = temiz; ek.lifetime = .keepAlways; add(ek)
        if let klasor { try? ss.pngRepresentation.write(to: klasor.appendingPathComponent(String(format: "%03d-%@.png", sira, temiz))) }
        kaydet("ADIM \(sira): \(ad)")
    }

    private func kaydet(_ s: String) { print("GEZINTI \(s)") }
}
