import AVFoundation
import SwiftUI
import UniformTypeIdentifiers

/// Kamera ekranının görüntü araçları (Fatih 29 Ekim): false color, zebra, odak vurgusu, histogram, siyah-beyaz, LUT ve Log görüntüyü
/// normal renkte gösterme. Çizim Monitör'ün çizicisiyle (MonitorCizici, Monitor.metal) yapılır; araçlar yalnız ekranda, kayıt temiz kalır.
extension Kamera {
    /// .cube dosyalarını kitaplığa alır; sonuncusu seçilir (Göstergeler → LUT ve Stiller → "+")
    func lutlariAl(_ urller: [URL]) {
        var son: String?
        for u in urller {
            let izin = u.startAccessingSecurityScopedResource()
            defer { if izin { u.stopAccessingSecurityScopedResource() } }
            guard let metin = try? String(contentsOf: u, encoding: .utf8) else { bildirim = "LUT okunamadı: \(u.lastPathComponent)"; continue }
            do {
                _ = try Lut.oku(ad: u.lastPathComponent, metin: metin)
                let ad = u.deletingPathExtension().lastPathComponent + ".cube"
                try metin.write(to: Lut.klasor.appendingPathComponent(ad), atomically: true, encoding: .utf8)
                son = ad
            } catch {
                bildirim = "LUT okunamadı: \(error.localizedDescription)"
            }
        }
        if let son { gosterge.lutAdi = son; gosterge.lutAcik = true }
    }

    /// VİDEO'da Apple Log seçiliyken ekranda Rec.709'a çevrilmiş görüntü
    var logDuzelt: Bool { mod == .video && renkModu == .log && logOnizleme }

    /// VİDEO'da HDR: kare çıkışı HLG/BT.2020 kareyi 8 bit BGRA'ya düşürür; Rec.709 LUT bu kareye uygulanınca renkler bozuluyordu.
    /// HDR'de stil ve LUT ekranda gösterilmez (iPhone'un kendi önizlemesi doğru renkte), stil kayıttan sonra işlenir.
    var hdrOnizleme: Bool { mod == .video && renkModu == .hdr }

    var gostergeEtkin: Bool {
        let g = gosterge
        let renk = !hdrOnizleme && (g.lutAcik || stil.etkin)
        return g.falseColor || g.zebra || g.peaking || g.monokrom || histogram || logDuzelt || renk
    }

    /// Ana iş parçacığında: çizici ayarları; oturumda kare çıkışı gerekiyorsa eklenir (kayıt sürerken oturuma dokunulmaz)
    func gostergeUygula() {
        ciziciAyarla()
        kuyruk.async {
            if self.kayitta {
                self.araclarAcik = self.gostergeEtkin && self.oturum.outputs.contains(self.kareCikti)
                return
            }
            self.oturum.beginConfiguration()
            self.kareCiktiAyarla()
            self.oturum.commitConfiguration()
        }
    }

    func ciziciAyarla() {
        var a = gosterge
        a.temiz = false
        // Renk: taban LUT (kullanıcının ya da Log → Rec.709) ve stil tek LUT'ta birleşir
        if !hdrOnizleme, let r = renkLutu() {
            a.lutAcik = true
            cizici.ozelLut(anahtar: r.anahtar, uret: r.uret)
        } else {
            a.lutAcik = false
            cizici.ozelLut(anahtar: nil, uret: nil)
        }
        cizici.doldur = true  // önizleme ekranı doldurur (Onizleme aspect fill ile aynı)
        if cizici.ayar != a { cizici.ayar = a }
        let h = histo
        if histogram { cizici.olcumGeri = { d, w, hh in h.kare(d, w, hh) } } else { cizici.olcumGeri = nil }
    }
}

/// Görüntü araçları menüsü (kamera ekranında ve Genel Ayarlar → Göstergeler'de)
struct GostergeMenu: View {
    @ObservedObject var kamera: Kamera
    @State private var lutAl = false
    @State private var lutlar: [String] = []

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 3), spacing: 8) {
                arac("False color", "paintpalette", kamera.gosterge.falseColor) { kamera.gosterge.falseColor.toggle() }
                arac("Zebra", "line.diagonal", kamera.gosterge.zebra) { kamera.gosterge.zebra.toggle() }
                arac("Odak vurgusu", "scope", kamera.gosterge.peaking) { kamera.gosterge.peaking.toggle() }
                arac("Histogram", "chart.bar.xaxis", kamera.histogram) { kamera.histogram.toggle() }
                arac("Siyah-beyaz", "circle.lefthalf.filled", kamera.gosterge.monokrom) { kamera.gosterge.monokrom.toggle() }
                arac("LUT", "camera.filters", kamera.gosterge.lutAcik) {
                    if kamera.gosterge.lutAcik { kamera.gosterge.lutAcik = false } else if let ilk = lutlar.first { kamera.gosterge.lutAdi = kamera.gosterge.lutAdi.isEmpty ? ilk : kamera.gosterge.lutAdi; kamera.gosterge.lutAcik = true } else { lutAl = true }
                }
            }
            if kamera.gosterge.zebra {
                HStack(spacing: 6) {
                    Text("ZEBRA").bolumBasligi().frame(width: 52, alignment: .leading)
                    Secenek(yazi: "%95", alt: "patlama", secili: kamera.gosterge.zebraEsik >= 0.9) { kamera.gosterge.zebraEsik = 0.95 }
                    Secenek(yazi: "%70", alt: "ten", secili: kamera.gosterge.zebraEsik < 0.9) { kamera.gosterge.zebraEsik = 0.70 }
                }
            }
            HStack(spacing: 6) {
                Text("LUT").bolumBasligi().frame(width: 52, alignment: .leading)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        Secenek(yazi: "Kapalı", secili: !kamera.gosterge.lutAcik) { kamera.gosterge.lutAcik = false }
                        ForEach(lutlar, id: \.self) { ad in
                            Secenek(yazi: ad.replacingOccurrences(of: ".cube", with: ""), secili: kamera.gosterge.lutAcik && kamera.gosterge.lutAdi == ad) {
                                kamera.gosterge.lutAdi = ad; kamera.gosterge.lutAcik = true
                            }
                        }
                        Secenek(yazi: "+ Ekle", secili: false) { lutAl = true }
                    }
                }
            }
            if kamera.mod == .video && kamera.renkModu == .log {
                Toggle("Log görüntüyü ekranda normal renkte göster", isOn: $kamera.logOnizleme).font(.subheadline).tint(Tema.sari)
            }
            if kamera.gostergeYok {
                Text("Bu iPhone bu modda kayıtla birlikte görüntü araçlarını desteklemiyor.").font(.caption).foregroundStyle(Tema.metin2)
            } else {
                Text("Araçlar yalnız ekranda görünür; kayıt temiz kalır.").font(.caption).foregroundStyle(Tema.metin2)
            }
        }
        .pano()
        .onAppear { lutlar = Lut.kitaplik().map(\.lastPathComponent) }
        .fileImporter(isPresented: $lutAl, allowedContentTypes: [UTType(filenameExtension: "cube") ?? .data, .data, .text], allowsMultipleSelection: true) { s in
            if case let .success(urller) = s { lutlariAl(urller) }
        }
    }

    private func arac(_ ad: String, _ simge: String, _ acik: Bool, eylem: @escaping () -> Void) -> some View {
        Button(action: eylem) {
            VStack(spacing: 5) {
                Image(systemName: simge).font(.system(size: 16, weight: .medium))
                Text(ad).font(.system(size: 11, weight: .medium)).lineLimit(1).minimumScaleFactor(0.8)
            }
            .foregroundStyle(acik ? .black : .white)
            .frame(maxWidth: .infinity).frame(height: 54)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(acik ? Tema.sari : Color.white.opacity(0.1)))
        }
    }

    private func lutlariAl(_ urller: [URL]) {
        kamera.lutlariAl(urller)
        lutlar = Lut.kitaplik().map(\.lastPathComponent)
    }
}
