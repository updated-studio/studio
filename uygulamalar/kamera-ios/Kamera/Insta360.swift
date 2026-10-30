import AVFoundation
import Network
import SwiftUI
import VideoToolbox

/// Insta360 Luna Ultra'nın Wi-Fi canlı görüntüsü. Kamera kendi Wi-Fi'ını açar (192.168.42.1); iPhone o ağa bağlanır.
/// Dil ("UCD2" çerçevesi, bkz. uygulamalar/monitor/notlar/insta360-luna.md): TCP 6666, her çerçeve
/// "UCD2" 01 0c [tür] [sıra] [gövde uzunluğu 4B LE] [gövde] [CRC-32 4B LE]. Tür 05 selam/nabız (3 sn'de bir), 04 komut/yanıt, 01 görüntü
/// (gövde 0. bayt 0x20 = görüntü; 9 baytlık başlıktan sonra H.265 Annex-B). Sıra: selam → 39 yetki (kamera ekranda onay sorabilir) → 118 → 1 canlı.
/// Kameraya yalnız bu dört istek yazılır; ayar değiştirilmez.
final class Insta360Alici: ObservableObject {
    static let adres = "192.168.42.1"
    static let kapi: UInt16 = 6666

    @Published var durum = "Bağlanmadı"
    @Published var kayit: [String] = []
    @Published var bilgi = ""
    let katman = AVSampleBufferDisplayLayer()

    private let kuyruk = DispatchQueue(label: "tr.com.updated.insta360")
    private var baglanti: NWConnection?
    private var zamanlayici: DispatchSourceTimer?
    private var tampon = Data()
    private var akis = Data()
    private var hevc: Bool?
    private var vps: Data?, sps: Data?, pps: Data?
    private var bicim: CMVideoFormatDescription?
    private var kareNal: [Data] = []
    private var kareSayisi = 0, paketSayisi = 0, bayt = 0
    private var sonSayim = Date()
    /// Tanımadığımız dil için: gelen ilk baytlar olduğu gibi saklanır (paylaşılıp incelenir)
    private var ham = Data()
    private var hamParca = 0
    private var bozukSayisi = 0
    static let hamDosya = FileManager.default.temporaryDirectory.appendingPathComponent("insta360-ham.bin")

    /// Multi Cam kaynağı olunca: çözülmüş kareler (kuyruk iş parçacığında)
    var kare: ((CVPixelBuffer) -> Void)?
    private var cozucu: VTDecompressionSession?
    private var cozucuBicim: CMVideoFormatDescription?

    init() { katman.videoGravity = .resizeAspect }

    private func coz(_ sb: CMSampleBuffer, _ geri: @escaping (CVPixelBuffer) -> Void) {
        guard let f = CMSampleBufferGetFormatDescription(sb) else { return }
        if cozucu == nil || cozucuBicim.map({ !CMFormatDescriptionEqual($0, otherFormatDescription: f) }) ?? true {
            if let c = cozucu { VTDecompressionSessionInvalidate(c) }
            cozucu = nil
            let nitelik: [CFString: Any] = [kCVPixelBufferPixelFormatTypeKey: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange,
                                            kCVPixelBufferIOSurfacePropertiesKey: [String: Any]()]
            var c: VTDecompressionSession?
            guard VTDecompressionSessionCreate(allocator: kCFAllocatorDefault, formatDescription: f, decoderSpecification: nil,
                                               imageBufferAttributes: nitelik as CFDictionary, outputCallback: nil, decompressionSessionOut: &c) == noErr, let c else { return }
            VTSessionSetProperty(c, key: kVTDecompressionPropertyKey_RealTime, value: kCFBooleanTrue)
            cozucu = c; cozucuBicim = f
        }
        guard let c = cozucu else { return }
        let st = VTDecompressionSessionDecodeFrame(c, sampleBuffer: sb, flags: [], infoFlagsOut: nil) { durum, _, g, _, _ in
            guard durum == noErr, let g else { return }
            geri(g)
        }
        if st == OSStatus(kVTInvalidSessionErr) { VTDecompressionSessionInvalidate(c); cozucu = nil }
    }

    func baslat() {
        kuyruk.async {
            self.durdurIc()
            self.yaz("\(Insta360Alici.adres):\(Insta360Alici.kapi) bağlanılıyor")
            self.durumYaz("Bağlanıyor")
            let c = NWConnection(host: NWEndpoint.Host(Insta360Alici.adres), port: NWEndpoint.Port(rawValue: Insta360Alici.kapi)!, using: AgYayin.tcp())
            self.baglanti = c
            c.stateUpdateHandler = { [weak self] st in
                guard let self, self.baglanti === c else { return }
                switch st {
                case .ready:
                    self.yaz("Bağlandı")
                    self.durumYaz("Bağlandı, görüntü isteniyor")
                    // Önce 1 sn yalnız dinle: kamera kendi selamını gönderiyorsa kayda olduğu gibi düşer
                    self.yaz("1 sn dinleniyor (hiçbir şey gönderilmeden)")
                    self.kuyruk.asyncAfter(deadline: .now() + 1) { [weak self] in
                        guard let self, self.baglanti === c else { return }
                        self.yaz("Eşleşme gönderiliyor")
                        self.ilkKonusma()
                    }
                case let .waiting(h):
                    self.yaz("Bekliyor: \(h.localizedDescription)")
                    self.durumYaz("Kameranın Wi-Fi'ına bağlı mısın?")
                case let .failed(h):
                    self.yaz("Hata: \(h.localizedDescription)")
                    self.durumYaz("Bağlantı koptu")
                default: break
                }
            }
            c.start(queue: self.kuyruk)
            self.oku(c)
        }
    }

    func durdur() { kuyruk.async { self.durdurIc(); self.durumYaz("Bağlanmadı") } }

    private func durdurIc() {
        zamanlayici?.cancel(); zamanlayici = nil
        yetkiZamanAsimi?.cancel(); yetkiZamanAsimi = nil; yetkiIstek = nil
        if let c = baglanti {
            komut(2)  // StopLiveStream
            c.cancel()
        }
        baglanti = nil
        tampon = Data(); akis = Data(); kareNal = []
        if !ham.isEmpty { try? ham.write(to: Insta360Alici.hamDosya) }
        ham = Data(); hamParca = 0; bozukSayisi = 0
        hevc = nil; vps = nil; sps = nil; pps = nil; bicim = nil
        kareSayisi = 0; paketSayisi = 0; bayt = 0
        DispatchQueue.main.async { self.katman.flushAndRemoveImage() }
    }

    // MARK: gönderme (UCD2 çerçevesi)

    /// Uygulamanın kendi kimliği (yetki isteğinde gider; başka uygulamanınki kullanılmaz)
    static var kimlik: String {
        if let k = UserDefaults.standard.string(forKey: "insta360.kimlik") { return k }
        let k = UUID().uuidString.lowercased()
        UserDefaults.standard.set(k, forKey: "insta360.kimlik")
        return k
    }

    /// CRC-32 (MSB-önce 04C11DB7 tablosu, başlangıç FFFFFFFF, bayt en düşük bayta XOR'lanır, son XOR yok)
    private static let crcTablo: [UInt32] = (0..<256).map { i -> UInt32 in
        var c = UInt32(i) << 24
        for _ in 0..<8 { c = (c & 0x8000_0000) != 0 ? (c << 1) ^ 0x04C1_1DB7 : c << 1 }
        return c
    }

    static func crc(_ d: Data) -> UInt32 {
        var c: UInt32 = 0xFFFF_FFFF
        for b in d {
            c ^= UInt32(b)
            for _ in 0..<4 { c = (c << 8) ^ crcTablo[Int(c >> 24)] }
        }
        return c
    }

    private var sira: UInt8 = 0
    private var istekNo: UInt16 = 1
    private var yetkiIstek: UInt16?
    private var yetkiZamanAsimi: DispatchWorkItem?

    private func cerceve(_ tur: UInt8, _ govde: Data) -> Data {
        var d = Data("UCD2".utf8)
        d.append(contentsOf: [1, 0x0c, tur, sira])
        sira &+= 1
        withUnsafeBytes(of: UInt32(govde.count).littleEndian) { d.append(contentsOf: $0) }
        d.append(govde)
        withUnsafeBytes(of: Insta360Alici.crc(d).littleEndian) { d.append(contentsOf: $0) }
        return d
    }

    /// Selam/nabız: 16 bayt, sonu sabit (LunaLive uygulamasının gönderdiği gibi; kamera kabul ediyor)
    private func selam() -> Data {
        var d = Data("UCD2".utf8)
        d.append(contentsOf: [1, 0x0c, 5, sira, 0, 0, 0, 0, 0xf6, 0xcc, 0x4f, 0x09])
        sira &+= 1
        return d
    }

    private func gonder(_ d: Data) { baglanti?.send(content: d, completion: .contentProcessed { _ in }) }

    /// Komut gövdesi: [komut 2B LE] 02 [istek no 2B LE] 00 80 00 00 [protobuf]
    @discardableResult
    private func komut(_ no: UInt16, _ pb: Data = Data()) -> UInt16 {
        var g = Data()
        withUnsafeBytes(of: no.littleEndian) { g.append(contentsOf: $0) }
        g.append(2)
        let istek = istekNo; istekNo &+= 1
        withUnsafeBytes(of: istek.littleEndian) { g.append(contentsOf: $0) }
        g.append(contentsOf: [0, 0x80, 0, 0])
        gonder(cerceve(4, g + pb))
        return istek
    }

    // Protobuf (düz): varint ve metin alanları
    private static func varint(_ v: UInt64) -> Data {
        var v = v, d = Data()
        repeat { var b = UInt8(v & 0x7f); v >>= 7; if v > 0 { b |= 0x80 }; d.append(b) } while v > 0
        return d
    }
    private static func pbSayi(_ alan: UInt64, _ deger: UInt64) -> Data { varint(alan << 3) + varint(deger) }
    private static func pbMetin(_ alan: UInt64, _ s: String) -> Data { varint(alan << 3 | 2) + varint(UInt64(s.utf8.count)) + Data(s.utf8) }

    private func ilkKonusma() {
        gonder(selam())
        let z = DispatchSource.makeTimerSource(queue: kuyruk)
        z.schedule(deadline: .now() + 3, repeating: 3)
        z.setEventHandler { [weak self] in guard let self else { return }; self.gonder(self.selam()); self.sayimYaz() }
        z.resume()
        zamanlayici = z
        kuyruk.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            guard let self, self.baglanti != nil else { return }
            self.yaz("Yetki isteniyor (39); kamera ekranında onay sorabilir, 30 sn bekleniyor")
            self.durumYaz("Kamera izin istiyor olabilir, ekranına bak")
            self.yetkiIstek = self.komut(39, Insta360Alici.pbMetin(1, Insta360Alici.kimlik) + Insta360Alici.pbSayi(2, 2))
            let z = DispatchWorkItem { [weak self] in
                guard let self, self.yetkiIstek != nil else { return }
                self.yaz("Yetki yanıtı 30 sn'de gelmedi; kamerada onay verilmemiş olabilir")
                self.durumYaz("Kamera yanıt vermedi")
            }
            self.yetkiZamanAsimi = z
            self.kuyruk.asyncAfter(deadline: .now() + 30, execute: z)
        }
    }

    private func yetkiGeldi(_ kod: Int) {
        yetkiIstek = nil
        yetkiZamanAsimi?.cancel(); yetkiZamanAsimi = nil
        guard kod == 200 else {
            yaz("Yetki reddedildi (\(kod)); kamerada onayla ve yeniden Bağlan")
            durumYaz("Kamera izin vermedi")
            return
        }
        yaz("Yetki tamam; 118 ve canlı görüntü (1) isteniyor")
        komut(118, Insta360Alici.pbSayi(1, 5))
        kuyruk.asyncAfter(deadline: .now() + 0.3) { [weak self] in
            guard let self, self.baglanti != nil else { return }
            var pb = Data()
            for (alan, deger) in [(2, 1), (6, 40), (7, 9), (8, 1), (9, 40), (10, 18)] as [(UInt64, UInt64)] { pb += Insta360Alici.pbSayi(alan, deger) }
            self.komut(1, pb)
            self.yaz("Canlı görüntü istendi")
            self.durumYaz("Görüntü bekleniyor")
        }
    }

    // MARK: alma

    private func oku(_ c: NWConnection) {
        c.receive(minimumIncompleteLength: 1, maximumLength: 256 * 1024) { [weak self] veri, _, bitti, hata in
            guard let self, self.baglanti === c else { return }
            if let veri {
                self.hamSakla(veri)
                self.tampon.append(veri); self.ayikla()
            }
            if bitti || hata != nil {
                self.yaz(bitti ? "Kamera bağlantıyı kapattı" : "Okuma hatası")
                self.durumYaz("Bağlantı koptu")
                return
            }
            self.oku(c)
        }
    }

    private func ayikla() {
        while tampon.count >= 12 {
            let b = tampon.startIndex
            guard tampon[b] == 0x55, tampon[b + 1] == 0x43, tampon[b + 2] == 0x44, tampon[b + 3] == 0x32 else {
                bozukSayisi += 1
                if bozukSayisi <= 3 { yaz("Tanınmayan paket (\(tampon.count) bayt): \(onaltilik(tampon.prefix(48)))") }
                tampon = Data(); return
            }
            let n = Int(tampon[b + 8]) | Int(tampon[b + 9]) << 8 | Int(tampon[b + 10]) << 16 | Int(tampon[b + 11]) << 24
            guard n < 16 * 1024 * 1024 else { yaz("Aşırı uzun çerçeve (\(n))"); tampon = Data(); return }
            let toplam = 12 + n + 4
            guard tampon.count >= toplam else { return }
            let tur = tampon[b + 6]
            let govde = Data(tampon[(b + 12)..<(b + 12 + n)])
            tampon = Data(tampon[(b + toplam)...])
            isle(tur, govde)
        }
    }

    private func isle(_ tur: UInt8, _ y: Data) {
        switch tur {
        case 1:
            paketSayisi += 1; bayt += y.count
            guard y.count > 9, y[y.startIndex] == 0x20 else { return }
            if paketSayisi == 1 { yaz("İlk görüntü paketi: \(y.count) bayt, başı \(onaltilik(y.prefix(20)))") }
            akisaEkle(Data(y.dropFirst(9)))
        case 4:
            guard y.count >= 5 else { return }
            let kod = Int(y[y.startIndex]) | Int(y[y.startIndex + 1]) << 8
            let istek = UInt16(y[y.startIndex + 3]) | UInt16(y[y.startIndex + 4]) << 8
            if kod >= 8192 { if kod != 8195 { yaz("Bildirim \(kod)") }; return }
            if let yi = yetkiIstek, yi == istek { yetkiGeldi(kod); return }
            yaz("Yanıt \(kod) (istek \(istek))\(kod == 200 ? " tamam" : kod == 500 ? " ret" : "")")
        case 5: break
        default: yaz("Bilinmeyen çerçeve türü \(tur), \(y.count) bayt")
        }
    }

    // MARK: Annex-B → kareler

    private func akisaEkle(_ d: Data) {
        akis.append(d)
        // Son başlangıç koduna kadar olan NAL'lar tamdır; sonrası bir sonraki pakette tamamlanır
        let b = [UInt8](akis)
        var kodlar: [(Int, Int)] = []  // (başlangıç kodu yeri, uzunluğu)
        var i = 0
        while i + 3 <= b.count {
            if b[i] == 0 && b[i + 1] == 0 {
                if b[i + 2] == 1 { kodlar.append((i, 3)); i += 3; continue }
                if i + 4 <= b.count && b[i + 2] == 0 && b[i + 3] == 1 { kodlar.append((i, 4)); i += 4; continue }
            }
            i += 1
        }
        guard kodlar.count >= 2 else { return }
        for k in 0..<(kodlar.count - 1) {
            let bas = kodlar[k].0 + kodlar[k].1, son = kodlar[k + 1].0
            if son > bas { nal(Data(b[bas..<son])) }
        }
        akis = Data(b[kodlar[kodlar.count - 1].0...])
    }

    private func nal(_ n: Data) {
        guard let ilk = n.first else { return }
        if hevc == nil {
            // H.265 VPS (tür 32) ya da H.264 SPS (tür 7) ile kodek belli olur
            if (ilk >> 1) & 0x3F == 32 { hevc = true; yaz("Kodek: H.265 (HEVC)") }
            else if ilk & 0x1F == 7 { hevc = false; yaz("Kodek: H.264") }
            else { return }
        }
        let h = hevc ?? true
        let tur = h ? Int((ilk >> 1) & 0x3F) : Int(ilk & 0x1F)
        let vcl = h ? tur < 32 : (tur >= 1 && tur <= 5)
        if !vcl {
            kareBitir()
            if h {
                switch tur { case 32: vps = n; case 33: sps = n; case 34: pps = n; default: break }
            } else {
                switch tur { case 7: sps = n; case 8: pps = n; default: break }
            }
            if tur == (h ? 34 : 8) { bicimKur() }
            return
        }
        // Karenin ilk dilimi: HEVC first_slice_segment_in_pic_flag, H.264 first_mb_in_slice == 0
        let ilkDilim = h ? (n.count > 2 && n[n.startIndex + 2] & 0x80 != 0) : (n.count > 1 && n[n.startIndex + 1] & 0x80 != 0)
        if ilkDilim { kareBitir() }
        kareNal.append(n)
    }

    private func bicimKur() {
        var f: CMFormatDescription?
        let st: OSStatus
        if hevc == true {
            guard let vps, let sps, let pps else { return }
            st = vps.withUnsafeBytes { v in sps.withUnsafeBytes { s in pps.withUnsafeBytes { p in
                let ptr = [v.bindMemory(to: UInt8.self).baseAddress!, s.bindMemory(to: UInt8.self).baseAddress!, p.bindMemory(to: UInt8.self).baseAddress!]
                let boy = [vps.count, sps.count, pps.count]
                return CMVideoFormatDescriptionCreateFromHEVCParameterSets(allocator: kCFAllocatorDefault, parameterSetCount: 3, parameterSetPointers: ptr,
                                                                           parameterSetSizes: boy, nalUnitHeaderLength: 4, extensions: nil, formatDescriptionOut: &f)
            } } }
        } else {
            guard let sps, let pps else { return }
            st = sps.withUnsafeBytes { s in pps.withUnsafeBytes { p in
                let ptr = [s.bindMemory(to: UInt8.self).baseAddress!, p.bindMemory(to: UInt8.self).baseAddress!]
                return CMVideoFormatDescriptionCreateFromH264ParameterSets(allocator: kCFAllocatorDefault, parameterSetCount: 2, parameterSetPointers: ptr,
                                                                           parameterSetSizes: [sps.count, pps.count], nalUnitHeaderLength: 4, formatDescriptionOut: &f)
            } }
        }
        guard st == noErr, let f else { yaz("Biçim kurulamadı (\(st))"); return }
        if bicim == nil || !CMFormatDescriptionEqual(bicim, otherFormatDescription: f) {
            bicim = f
            let b = CMVideoFormatDescriptionGetDimensions(f)
            yaz("Görüntü: \(b.width)×\(b.height)")
            DispatchQueue.main.async { self.bilgi = "\(b.width)×\(b.height) · \(self.hevc == true ? "H.265" : "H.264")" }
        }
    }

    private func kareBitir() {
        guard !kareNal.isEmpty else { return }
        defer { kareNal = [] }
        guard let bicim else { return }
        var veri = Data()
        for n in kareNal {
            withUnsafeBytes(of: UInt32(n.count).bigEndian) { veri.append(contentsOf: $0) }
            veri.append(n)
        }
        var blok: CMBlockBuffer?
        guard CMBlockBufferCreateWithMemoryBlock(allocator: kCFAllocatorDefault, memoryBlock: nil, blockLength: veri.count, blockAllocator: kCFAllocatorDefault,
                                                 customBlockSource: nil, offsetToData: 0, dataLength: veri.count, flags: 0, blockBufferOut: &blok) == noErr,
              let blok else { return }
        _ = veri.withUnsafeBytes { CMBlockBufferReplaceDataBytes(with: $0.baseAddress!, blockBuffer: blok, offsetIntoDestination: 0, dataLength: veri.count) }
        var sb: CMSampleBuffer?
        var boy = veri.count
        guard CMSampleBufferCreateReady(allocator: kCFAllocatorDefault, dataBuffer: blok, formatDescription: bicim, sampleCount: 1, sampleTimingEntryCount: 0,
                                        sampleTimingArray: nil, sampleSizeEntryCount: 1, sampleSizeArray: &boy, sampleBufferOut: &sb) == noErr, let sb else { return }
        if let ekler = CMSampleBufferGetSampleAttachmentsArray(sb, createIfNecessary: true), CFArrayGetCount(ekler) > 0 {
            let e = unsafeBitCast(CFArrayGetValueAtIndex(ekler, 0), to: CFMutableDictionary.self)
            CFDictionarySetValue(e, Unmanaged.passUnretained(kCMSampleAttachmentKey_DisplayImmediately).toOpaque(), Unmanaged.passUnretained(kCFBooleanTrue).toOpaque())
        }
        kareSayisi += 1
        if kareSayisi == 1 { yaz("İlk kare çözülüyor"); durumYaz("Canlı") }
        if let kare { coz(sb, kare); return }
        DispatchQueue.main.async {
            if self.katman.status == .failed { self.katman.flush() }
            self.katman.enqueue(sb)
        }
    }

    // MARK: kayıt

    private func sayimYaz() {
        let s = Date().timeIntervalSince(sonSayim)
        sonSayim = Date()
        guard paketSayisi > 0, s > 0 else { return }
        let fps = Double(kareSayisi) / s, mbps = Double(bayt) * 8 / s / 1_000_000
        kareSayisi = 0; bayt = 0
        let b = bicim.map { CMVideoFormatDescriptionGetDimensions($0) }
        DispatchQueue.main.async {
            self.bilgi = "\(b.map { "\($0.width)×\($0.height) · " } ?? "")\(self.hevc == true ? "H.265" : self.hevc == false ? "H.264" : "?") · \(Int(fps.rounded())) fps · \(String(format: "%.1f", mbps)) Mb/sn"
        }
    }

    private func onaltilik(_ d: Data) -> String {
        let h = d.map { String(format: "%02x", $0) }.joined(separator: " ")
        let a = String(d.map { $0 >= 32 && $0 < 127 ? Character(UnicodeScalar($0)) : "." })
        return "\(h)  |\(a)|"
    }

    /// İlk 8 parça kayda (ilk 96 bayt), ilk 1 MB dosyaya
    private func hamSakla(_ v: Data) {
        hamParca += 1
        if hamParca <= 8 { yaz("Gelen #\(hamParca) (\(v.count) bayt): \(onaltilik(v.prefix(96)))") }
        guard ham.count < 1_048_576 else { return }
        ham.append(v.prefix(1_048_576 - ham.count))
        if hamParca % 20 == 1 || ham.count >= 1_048_576 { try? ham.write(to: Insta360Alici.hamDosya) }
    }

    /// Boşsa (durdurulduysa) son dosya korunur
    func hamYaz() { kuyruk.sync { if !ham.isEmpty { try? ham.write(to: Insta360Alici.hamDosya) } } }

    private func yaz(_ s: String) {
        let f = DateFormatter(); f.dateFormat = "HH:mm:ss"
        let satir = "\(f.string(from: Date()))  \(s)"
        DispatchQueue.main.async { self.kayit.append(satir); if self.kayit.count > 200 { self.kayit.removeFirst() } }
    }

    private func durumYaz(_ s: String) { DispatchQueue.main.async { self.durum = s } }
}

private struct KatmanGorunum: UIViewRepresentable {
    let katman: AVSampleBufferDisplayLayer
    final class V: UIView {
        var k: AVSampleBufferDisplayLayer?
        override func layoutSubviews() { super.layoutSubviews(); k?.frame = bounds }
    }
    func makeUIView(context: Context) -> V {
        let v = V(); v.backgroundColor = .black; v.k = katman; v.layer.addSublayer(katman); return v
    }
    func updateUIView(_ v: V, context: Context) {}
}

/// Genel Ayarlar → Masa → "Insta360 kamerayı dene": kameranın Wi-Fi'ına bağlıyken görüntüyü ve konuşma kaydını gösterir
struct Insta360Deneme: View {
    @StateObject private var a = Insta360Alici()
    @State private var kopyalandi = false

    var body: some View {
        List {
            Section {
                ZStack {
                    KatmanGorunum(katman: a.katman)
                    if a.durum != "Canlı" { Text(a.durum).font(.footnote.weight(.semibold)).foregroundStyle(.white.opacity(0.8)) }
                }
                .aspectRatio(16 / 9, contentMode: .fit)
                .listRowInsets(EdgeInsets())
                if !a.bilgi.isEmpty { Text(a.bilgi).font(Tema.mono) }
                HStack {
                    Button("Bağlan") { a.baslat() }
                    Spacer()
                    Button("Durdur", role: .destructive) { a.durdur() }
                }
                .buttonStyle(.borderless)
            } footer: {
                Text("1) Her telefondaki Insta360 uygulamasını tamamen kapat (kamera tek bağlantı kabul eder). 2) iPhone Ayarlar → Wi-Fi'dan kameranın ağına bağlan. 3) Buraya dönüp Bağlan'a dokun; ilk seferde kamera kendi ekranında izin sorabilir, onayla. Kameraya yalnız görüntü isteği yazılır, ayar değiştirilmez.")
            }
            Section {
                ForEach(Array(a.kayit.enumerated()), id: \.offset) { _, s in Text(s).font(.system(size: 11, design: .monospaced)) }
                Button(kopyalandi ? "Kopyalandı" : "Kaydı kopyala (bana gönder)") {
                    UIPasteboard.general.string = ([a.bilgi] + a.kayit).joined(separator: "\n")
                    kopyalandi = true
                }
                ShareLink(item: Insta360Alici.hamDosya) { Label("Ham veriyi paylaş (dosya)", systemImage: "square.and.arrow.up") }
                    .simultaneousGesture(TapGesture().onEnded { a.hamYaz() })
            } header: { Text("Kayıt") }
        }
        .navigationTitle("Insta360 deneme")
        .onDisappear { a.durdur() }
    }
}
