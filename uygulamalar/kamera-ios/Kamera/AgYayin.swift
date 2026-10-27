import AVFoundation
import Network
import VideoToolbox

/// Masa (çok kameralı kayıt) için Wi-Fi görüntü aktarımı — Android sürümündeki AgYayin.kt ile aynı dil, iki taraf birbirine bağlanır.
/// Kamera telefonu sunucudur: görüntüyü H.264'e sıkıştırır, ağda "_updatedkam._tcp" adıyla duyurur (Bonjour); masa bulur, bağlanır.
///
/// Akış (TCP): önce tek satır JSON başlık {"ad","w","h"}, sonra paketler: [tür 1 bayt][uzunluk 4][zaman µs 8][veri] (büyük uçlu).
/// Tür: 0 = kodlayıcı ayarı (SPS/PPS, Annex-B), 1 = anahtar kare, 2 = kare, 3 = yön (veri: 2 bayt derece; görüntü dik olsun diye
/// saat yönünde bu kadar döndürülür). Masadan kameraya satır satır JSON gelir: {"tally":true} (kamera canlıda).
enum AgYayin {
    static let tur = "_updatedkam._tcp"
    static let kapi: UInt16 = 47800
    static let ayar: UInt8 = 0, anahtar: UInt8 = 1, kare: UInt8 = 2, yon: UInt8 = 3
    static let baslangic = Data([0, 0, 0, 1])

    static func tcp() -> NWParameters {
        let t = NWProtocolTCP.Options()
        t.noDelay = true
        return NWParameters(tls: nil, tcp: t)
    }

    static func paket(_ tur: UInt8, _ us: Int64, _ veri: Data) -> Data {
        var d = Data(capacity: 13 + veri.count)
        d.append(tur)
        withUnsafeBytes(of: UInt32(veri.count).bigEndian) { d.append(contentsOf: $0) }
        withUnsafeBytes(of: us.bigEndian) { d.append(contentsOf: $0) }
        d.append(veri)
        return d
    }

    static func ikiBayt(_ n: Int) -> Data { Data([UInt8((n >> 8) & 0xFF), UInt8(n & 0xFF)]) }

    /// Annex-B akışını NAL birimlerine böler (başlangıç kodları atılır)
    static func nallar(_ d: Data) -> [Data] {
        let b = [UInt8](d)
        var sonuc: [Data] = []
        var i = 0, bas = -1
        func kapat(_ son: Int) {
            guard bas >= 0 else { return }
            var s = son
            while s > bas && b[s - 1] == 0 { s -= 1 }
            if s > bas { sonuc.append(Data(b[bas..<s])) }
        }
        while i + 2 < b.count {
            if b[i] == 0 && b[i + 1] == 0 && b[i + 2] == 1 { kapat(i); i += 3; bas = i } else { i += 1 }
        }
        kapat(b.count)
        return sonuc
    }

    /// Kodlayıcının uzunluk önekli (AVCC) çıktısını başlangıç kodlu (Annex-B) hale getirir
    static func annexB(_ sb: CMSampleBuffer) -> Data? {
        guard let blok = CMSampleBufferGetDataBuffer(sb) else { return nil }
        let toplam = CMBlockBufferGetDataLength(blok)
        guard toplam > 0 else { return nil }
        var ham = Data(count: toplam)
        let s = ham.withUnsafeMutableBytes { CMBlockBufferCopyDataBytes(blok, atOffset: 0, dataLength: toplam, destination: $0.baseAddress!) }
        guard s == noErr else { return nil }
        var cikti = Data(capacity: toplam + 16)
        var i = 0
        while i + 4 <= toplam {
            let n = Int(ham[i]) << 24 | Int(ham[i + 1]) << 16 | Int(ham[i + 2]) << 8 | Int(ham[i + 3])
            i += 4
            guard n > 0, i + n <= toplam else { break }
            cikti.append(baslangic)
            cikti.append(ham[i..<(i + n)])
            i += n
        }
        return cikti
    }

    /// Biçimdeki SPS/PPS, Annex-B olarak (Android masası bunu "csd-0" diye kullanır)
    static func parametreler(_ f: CMFormatDescription) -> Data? {
        var adet = 0
        guard CMVideoFormatDescriptionGetH264ParameterSetAtIndex(f, parameterSetIndex: 0, parameterSetPointerOut: nil, parameterSetSizeOut: nil,
                                                                 parameterSetCountOut: &adet, nalUnitHeaderLengthOut: nil) == noErr, adet > 0 else { return nil }
        var d = Data()
        for i in 0..<adet {
            var p: UnsafePointer<UInt8>?
            var n = 0
            guard CMVideoFormatDescriptionGetH264ParameterSetAtIndex(f, parameterSetIndex: i, parameterSetPointerOut: &p, parameterSetSizeOut: &n,
                                                                     parameterSetCountOut: nil, nalUnitHeaderLengthOut: nil) == noErr, let p else { return nil }
            d.append(baslangic)
            d.append(p, count: n)
        }
        return d
    }

    static func bicim(sps: Data, pps: Data) -> CMVideoFormatDescription? {
        guard !sps.isEmpty, !pps.isEmpty else { return nil }
        let a = [UInt8](sps), b = [UInt8](pps)
        var f: CMVideoFormatDescription?
        let s = a.withUnsafeBufferPointer { pa in
            b.withUnsafeBufferPointer { pb -> OSStatus in
                let isaretler = [pa.baseAddress!, pb.baseAddress!]
                let boylar = [a.count, b.count]
                return CMVideoFormatDescriptionCreateFromH264ParameterSets(allocator: kCFAllocatorDefault, parameterSetCount: 2, parameterSetPointers: isaretler,
                                                                           parameterSetSizes: boylar, nalUnitHeaderLength: 4, formatDescriptionOut: &f)
            }
        }
        return s == noErr ? f : nil
    }

    static func anahtarMi(_ sb: CMSampleBuffer) -> Bool {
        guard let ekler = CMSampleBufferGetSampleAttachmentsArray(sb, createIfNecessary: false) as? [[CFString: Any]], let ilk = ekler.first else { return true }
        return !(ilk[kCMSampleAttachmentKey_NotSync] as? Bool ?? false)
    }

    /// Çözülmüş kareyi ekran katmanının hemen göstereceği örneğe sarar
    static func ornek(_ pb: CVPixelBuffer) -> CMSampleBuffer? {
        var f: CMVideoFormatDescription?
        guard CMVideoFormatDescriptionCreateForImageBuffer(allocator: kCFAllocatorDefault, imageBuffer: pb, formatDescriptionOut: &f) == noErr, let f else { return nil }
        var zaman = CMSampleTimingInfo(duration: .invalid, presentationTimeStamp: CMClockGetTime(CMClockGetHostTimeClock()), decodeTimeStamp: .invalid)
        var sb: CMSampleBuffer?
        guard CMSampleBufferCreateReadyWithImageBuffer(allocator: kCFAllocatorDefault, imageBuffer: pb, formatDescription: f, sampleTiming: &zaman,
                                                       sampleBufferOut: &sb) == noErr, let sb else { return nil }
        if let ekler = CMSampleBufferGetSampleAttachmentsArray(sb, createIfNecessary: true), CFArrayGetCount(ekler) > 0 {
            let s = unsafeBitCast(CFArrayGetValueAtIndex(ekler, 0), to: CFMutableDictionary.self)
            CFDictionarySetValue(s, Unmanaged.passUnretained(kCMSampleAttachmentKey_DisplayImmediately).toOpaque(),
                                 Unmanaged.passUnretained(kCFBooleanTrue).toOpaque())
        }
        return sb
    }

    /// Telefonun yerel ağ adresi (masada elle bağlanmak için); kişisel erişim noktası açıksa onun adresi
    static func ipAdresi() -> String? {
        var ilk: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&ilk) == 0, let ilk else { return nil }
        defer { freeifaddrs(ilk) }
        var bulunan: String?
        var p: UnsafeMutablePointer<ifaddrs>? = ilk
        while let a = p {
            p = a.pointee.ifa_next
            guard let adr = a.pointee.ifa_addr, adr.pointee.sa_family == UInt8(AF_INET) else { continue }
            let ad = String(cString: a.pointee.ifa_name)
            guard ad == "en0" || ad.hasPrefix("bridge") else { continue }
            var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            if getnameinfo(adr, socklen_t(adr.pointee.sa_len), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 {
                let ip = String(cString: host)
                if ad == "en0" { return ip }
                bulunan = ip
            }
        }
        return bulunan
    }
}

/// Kamera tarafı: kameradan gelen kareleri sıkıştırıp bağlanan masaya gönderir. Bir seferde tek masa; yeni bağlanan eskisinin yerini alır.
final class YayinVerici {
    let ad: String
    let genislik: Int32, yukseklik: Int32
    private let mbps: Int
    var tally: (Bool) -> Void = { _ in }
    var durum: (String) -> Void = { _ in }
    /// Kameranın kare kuyruğu da budur: kodlama, ağ ve durum hep aynı sırada
    let kuyruk = DispatchQueue(label: "tr.com.updated.yayin")
    private var oturum: VTCompressionSession?
    private var dinleyici: NWListener?
    private var baglanti: NWConnection?
    private var nesil = 0
    private var ayarVerisi: Data?
    private var anahtarBekle = true
    private var anahtarIstek = true
    private var yolda = 0
    private var yon = 90

    init(ad: String, genislik: Int32 = 1920, yukseklik: Int32 = 1080, mbps: Int = 6) {
        self.ad = ad; self.genislik = genislik; self.yukseklik = yukseklik; self.mbps = mbps
    }

    enum Hata: Error { case kodlayici(OSStatus) }

    func baslat() throws {
        var s: VTCompressionSession?
        let st = VTCompressionSessionCreate(allocator: kCFAllocatorDefault, width: genislik, height: yukseklik, codecType: kCMVideoCodecType_H264,
                                            encoderSpecification: nil, imageBufferAttributes: nil, compressedDataAllocator: nil,
                                            outputCallback: nil, refcon: nil, compressionSessionOut: &s)
        guard st == noErr, let s else { throw Hata.kodlayici(st) }
        VTSessionSetProperty(s, key: kVTCompressionPropertyKey_RealTime, value: kCFBooleanTrue)
        VTSessionSetProperty(s, key: kVTCompressionPropertyKey_ProfileLevel, value: kVTProfileLevel_H264_High_AutoLevel)
        // B-kare yok: masa kareleri geldiği sırayla çözer, gecikme de düşer
        VTSessionSetProperty(s, key: kVTCompressionPropertyKey_AllowFrameReordering, value: kCFBooleanFalse)
        VTSessionSetProperty(s, key: kVTCompressionPropertyKey_AverageBitRate, value: NSNumber(value: mbps * 1_000_000))
        VTSessionSetProperty(s, key: kVTCompressionPropertyKey_ExpectedFrameRate, value: NSNumber(value: 30))
        VTSessionSetProperty(s, key: kVTCompressionPropertyKey_MaxKeyFrameInterval, value: NSNumber(value: 30))
        VTSessionSetProperty(s, key: kVTCompressionPropertyKey_MaxKeyFrameIntervalDuration, value: NSNumber(value: 1))
        VTCompressionSessionPrepareToEncodeFrames(s)
        oturum = s
        kuyruk.async { self.dinle(sabit: true) }
        durum("Masa bekleniyor")
    }

    /// Sabit kapı (adresle elle bağlanmak için); doluysa rastgele
    private func dinle(sabit: Bool) {
        let kapi = sabit ? NWEndpoint.Port(rawValue: AgYayin.kapi)! : .any
        guard let l = try? NWListener(using: AgYayin.tcp(), on: kapi) else {
            if sabit { dinle(sabit: false) } else { durum("Ağ açılamadı") }
            return
        }
        l.service = NWListener.Service(name: ad, type: AgYayin.tur)
        l.newConnectionHandler = { [weak self] c in self?.kabul(c) }
        l.stateUpdateHandler = { [weak self, weak l] st in
            guard let self else { return }
            if case .failed = st {
                l?.cancel()
                if sabit { self.dinle(sabit: false) } else { self.durum("Ağ açılamadı") }
            }
        }
        dinleyici = l
        l.start(queue: kuyruk)
    }

    private func kabul(_ c: NWConnection) {
        baglanti?.cancel()
        nesil += 1
        let n = nesil
        baglanti = c; yolda = 0; anahtarBekle = true; anahtarIstek = true; ayarVerisi = nil
        c.stateUpdateHandler = { [weak self] st in
            guard let self, self.nesil == n else { return }
            switch st {
            case .ready: self.durum("Masaya bağlı")
            case .failed, .cancelled:
                self.baglanti = nil; self.tally(false); self.durum("Masa bekleniyor")
            default: break
            }
        }
        c.start(queue: kuyruk)
        if let j = try? JSONSerialization.data(withJSONObject: ["ad": ad, "w": Int(genislik), "h": Int(yukseklik)] as [String: Any]) { yaz(j + Data([10]), c, n) }
        yaz(AgYayin.paket(AgYayin.yon, 0, AgYayin.ikiBayt(yon)), c, n)
        oku(c, n, birikmis: Data())
    }

    private func oku(_ c: NWConnection, _ n: Int, birikmis: Data) {
        c.receive(minimumIncompleteLength: 1, maximumLength: 4096) { [weak self] veri, _, bitti, hata in
            guard let self, self.nesil == n else { return }
            var b = birikmis
            if let veri { b.append(veri) }
            while let i = b.firstIndex(of: 10) {
                let satir = b.subdata(in: b.startIndex..<i)
                b = b.subdata(in: (i + 1)..<b.endIndex)
                if let j = (try? JSONSerialization.jsonObject(with: satir)) as? [String: Any], let t = j["tally"] as? Bool { self.tally(t) }
            }
            if bitti || hata != nil { c.cancel(); return }
            self.oku(c, n, birikmis: b)
        }
    }

    /// Telefonun duruşu: görüntü dik olsun diye saat yönünde kaç derece döndürülmeli
    func yonAyarla(_ d: Int) {
        kuyruk.async {
            guard d != self.yon else { return }
            self.yon = d
            if let c = self.baglanti { self.yaz(AgYayin.paket(AgYayin.yon, 0, AgYayin.ikiBayt(d)), c, self.nesil) }
        }
    }

    /// Kamera karesi (kuyruk üzerinde çağrılır). Masa yokken kodlanmaz, pil gitmesin.
    func kodla(_ sb: CMSampleBuffer) {
        guard let s = oturum, baglanti != nil, let pb = CMSampleBufferGetImageBuffer(sb) else { return }
        var ozellik: CFDictionary?
        if anahtarIstek {
            anahtarIstek = false
            ozellik = [kVTEncodeFrameOptionKey_ForceKeyFrame: true] as CFDictionary
        }
        VTCompressionSessionEncodeFrame(s, imageBuffer: pb, presentationTimeStamp: CMSampleBufferGetPresentationTimeStamp(sb), duration: .invalid,
                                        frameProperties: ozellik, infoFlagsOut: nil) { [weak self] st, _, cikti in
            guard st == noErr, let cikti, let self else { return }
            self.kuyruk.async { self.kodlandi(cikti) }
        }
    }

    private func kodlandi(_ sb: CMSampleBuffer) {
        guard let c = baglanti else { return }
        let anahtar = AgYayin.anahtarMi(sb)
        if anahtar, let f = CMSampleBufferGetFormatDescription(sb), let p = AgYayin.parametreler(f), p != ayarVerisi {
            ayarVerisi = p
            yaz(AgYayin.paket(AgYayin.ayar, 0, p), c, nesil)
        }
        if anahtar { anahtarBekle = false }
        guard !anahtarBekle else { return }
        // Ağ yetişmiyorsa: bir sonraki anahtar kareye kadar atlanır (görüntü bozulmaz, yalnız takılır)
        if yolda > 3_000_000 { anahtarBekle = true; anahtarIstek = true; return }
        guard let veri = AgYayin.annexB(sb) else { return }
        let us = Int64(CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sb)) * 1_000_000)
        yaz(AgYayin.paket(anahtar ? AgYayin.anahtar : AgYayin.kare, us, veri), c, nesil)
    }

    private func yaz(_ d: Data, _ c: NWConnection, _ n: Int) {
        yolda += d.count
        c.send(content: d, completion: .contentProcessed { [weak self] _ in
            guard let self, self.nesil == n else { return }
            self.yolda -= d.count
        })
    }

    func durdur() {
        kuyruk.async {
            self.nesil += 1
            self.dinleyici?.cancel(); self.dinleyici = nil
            self.baglanti?.cancel(); self.baglanti = nil
            if let s = self.oturum {
                VTCompressionSessionCompleteFrames(s, untilPresentationTimeStamp: .invalid)
                VTCompressionSessionInvalidate(s)
            }
            self.oturum = nil
        }
    }
}

/// Masa tarafı: Wi-Fi kamerasına bağlanır, görüntüyü çözer; bağlantı koparsa kendiliğinden yeniden bağlanır
final class WifiAlici {
    let ad: String
    private let hedef: NWEndpoint
    private let kuyruk: DispatchQueue
    private var baglanti: NWConnection?
    private var calis = true
    private var tampon = Data()
    private var basOkundu = false
    private var sps: Data?, pps: Data?
    private var bicim: CMVideoFormatDescription?
    private var cozucu: VTDecompressionSession?
    private var tallyAcik = false
    /// Çözülen kare (çözücünün iş parçacığında)
    var kare: (CVPixelBuffer) -> Void = { _ in }
    var yonDegisti: (Int) -> Void = { _ in }
    var durum: (Bool) -> Void = { _ in }

    init(ad: String, hedef: NWEndpoint) {
        self.ad = ad; self.hedef = hedef
        kuyruk = DispatchQueue(label: "tr.com.updated.masa.wifi")
    }

    func baslat() { kuyruk.async { self.baglan() } }

    private func baglan() {
        guard calis else { return }
        tampon = Data(); basOkundu = false; sps = nil; pps = nil; bicim = nil; cozucuKapat()
        let c = NWConnection(to: hedef, using: AgYayin.tcp())
        baglanti = c
        c.stateUpdateHandler = { [weak self, weak c] st in
            guard let self, let c, self.baglanti === c else { return }
            switch st {
            case .ready: self.oku(c)
            case .failed, .waiting: self.koptu(c)
            case .cancelled: self.koptu(c)
            default: break
            }
        }
        c.start(queue: kuyruk)
    }

    private func koptu(_ c: NWConnection) {
        guard baglanti === c else { return }
        baglanti = nil
        c.cancel()
        cozucuKapat()
        durum(false)
        if calis { kuyruk.asyncAfter(deadline: .now() + 1) { self.baglan() } }
    }

    private func oku(_ c: NWConnection) {
        c.receive(minimumIncompleteLength: 1, maximumLength: 512 * 1024) { [weak self] veri, _, bitti, hata in
            guard let self, self.baglanti === c else { return }
            if let veri, !veri.isEmpty, !self.isle(veri) { self.koptu(c); return }
            if bitti || hata != nil { self.koptu(c); return }
            self.oku(c)
        }
    }

    /// Gelen baytları paketlere ayırır; bozuk akışta false
    private func isle(_ veri: Data) -> Bool {
        tampon.append(veri)
        var i = tampon.startIndex
        if !basOkundu {
            guard let s = tampon.firstIndex(of: 10) else { return tampon.count < 64 * 1024 }
            basOkundu = true
            i = s + 1
            durum(true)
            tallyGonder()
        }
        while tampon.endIndex - i >= 13 {
            let tur = tampon[i]
            let n = Int(tampon[i + 1]) << 24 | Int(tampon[i + 2]) << 16 | Int(tampon[i + 3]) << 8 | Int(tampon[i + 4])
            guard n <= 8_000_000 else { return false }
            guard tampon.endIndex - i - 13 >= n else { break }
            let v = tampon.subdata(in: (i + 13)..<(i + 13 + n))
            i += 13 + n
            paket(tur, v)
        }
        tampon = tampon.subdata(in: i..<tampon.endIndex)
        return true
    }

    private func paket(_ tur: UInt8, _ v: Data) {
        switch tur {
        case AgYayin.yon:
            if v.count >= 2 { yonDegisti(Int(v[v.startIndex]) << 8 | Int(v[v.startIndex + 1])) }
        case AgYayin.ayar:
            for nal in AgYayin.nallar(v) { parametre(nal) }
            bicimKur()
        case AgYayin.anahtar, AgYayin.kare:
            coz(v)
        default: break
        }
    }

    /// SPS/PPS ise saklar ve true döner
    @discardableResult
    private func parametre(_ nal: Data) -> Bool {
        guard let ilk = nal.first else { return false }
        switch ilk & 0x1F {
        case 7: sps = nal; return true
        case 8: pps = nal; return true
        default: return false
        }
    }

    private func bicimKur() {
        guard let sps, let pps, let f = AgYayin.bicim(sps: sps, pps: pps) else { return }
        if let eski = bicim, CMFormatDescriptionEqual(eski, otherFormatDescription: f) { return }
        bicim = f
        cozucuKapat()
    }

    private func coz(_ v: Data) {
        var avcc = Data(capacity: v.count + 16)
        var yeni = false
        for nal in AgYayin.nallar(v) {
            let t = nal[nal.startIndex] & 0x1F
            if t == 7 || t == 8 { if parametre(nal) { yeni = true }; continue }
            if t == 9 { continue }
            withUnsafeBytes(of: UInt32(nal.count).bigEndian) { avcc.append(contentsOf: $0) }
            avcc.append(nal)
        }
        if yeni { bicimKur() }
        guard let f = bicim, !avcc.isEmpty else { return }
        if cozucu == nil { cozucuKur(f) }
        guard let s = cozucu else { return }
        var blok: CMBlockBuffer?
        guard CMBlockBufferCreateWithMemoryBlock(allocator: kCFAllocatorDefault, memoryBlock: nil, blockLength: avcc.count, blockAllocator: kCFAllocatorDefault,
                                                 customBlockSource: nil, offsetToData: 0, dataLength: avcc.count,
                                                 flags: kCMBlockBufferAssureMemoryNowFlag, blockBufferOut: &blok) == noErr, let blok else { return }
        let kopya = avcc.withUnsafeBytes { CMBlockBufferReplaceDataBytes(with: $0.baseAddress!, blockBuffer: blok, offsetIntoDestination: 0, dataLength: avcc.count) }
        guard kopya == noErr else { return }
        var boy = avcc.count
        var ornek: CMSampleBuffer?
        guard CMSampleBufferCreateReady(allocator: kCFAllocatorDefault, dataBuffer: blok, formatDescription: f, sampleCount: 1, sampleTimingEntryCount: 0,
                                        sampleTimingArray: nil, sampleSizeEntryCount: 1, sampleSizeArray: &boy, sampleBufferOut: &ornek) == noErr,
              let ornek else { return }
        let st = VTDecompressionSessionDecodeFrame(s, sampleBuffer: ornek, flags: [], infoFlagsOut: nil) { [weak self] durum, _, goruntu, _, _ in
            guard durum == noErr, let goruntu else { return }
            self?.kare(goruntu)
        }
        // Uygulama arka plana gidip dönünce çözücü geçersizleşir: yenisi kurulur
        if st == OSStatus(kVTInvalidSessionErr) { cozucuKapat() }
    }

    private func cozucuKur(_ f: CMVideoFormatDescription) {
        let nitelik: [CFString: Any] = [
            kCVPixelBufferPixelFormatTypeKey: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange,
            kCVPixelBufferIOSurfacePropertiesKey: [String: Any](),
        ]
        var s: VTDecompressionSession?
        if VTDecompressionSessionCreate(allocator: kCFAllocatorDefault, formatDescription: f, decoderSpecification: nil,
                                        imageBufferAttributes: nitelik as CFDictionary, outputCallback: nil, decompressionSessionOut: &s) == noErr {
            VTSessionSetProperty(s!, key: kVTDecompressionPropertyKey_RealTime, value: kCFBooleanTrue)
            cozucu = s
        }
    }

    private func cozucuKapat() {
        if let s = cozucu { VTDecompressionSessionInvalidate(s) }
        cozucu = nil
    }

    /// Canlıdaki kameranın ekranı kırmızı çerçeveyle yanar
    func tally(_ acik: Bool) { kuyruk.async { self.tallyAcik = acik; self.tallyGonder() } }

    private func tallyGonder() {
        guard basOkundu, let c = baglanti else { return }
        c.send(content: Data("{\"tally\":\(tallyAcik)}\n".utf8), completion: .contentProcessed { _ in })
    }

    func durdur() {
        kuyruk.async {
            self.calis = false
            self.baglanti?.cancel(); self.baglanti = nil
            self.cozucuKapat()
        }
    }
}

/// Ağdaki Wi-Fi kameralarını bulur (masa açıkken)
final class KameraBulucu {
    private var tarayici: NWBrowser?
    var bulundu: (String, NWEndpoint) -> Void = { _, _ in }
    var izinYok: () -> Void = {}

    func baslat() {
        let b = NWBrowser(for: .bonjour(type: AgYayin.tur, domain: nil), using: AgYayin.tcp())
        b.browseResultsChangedHandler = { [weak self] sonuclar, _ in
            for s in sonuclar {
                if case let .service(ad, _, _, _) = s.endpoint { self?.bulundu(ad, s.endpoint) }
            }
        }
        b.stateUpdateHandler = { [weak self] st in
            if case .waiting = st { self?.izinYok() }
        }
        b.start(queue: .main)
        tarayici = b
    }

    func durdur() { tarayici?.cancel(); tarayici = nil }
}
