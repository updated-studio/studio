import AVFoundation
import Network
import SwiftUI

/// Insta360 kameralarının Wi-Fi canlı görüntüsü (Luna, X, GO serisi). Kamera kendi Wi-Fi'ını açar (192.168.42.1); telefon/iPad o ağa bağlanır.
/// Dil (yayımlanmış tersine mühendislik çalışmalarından, bkz. uygulamalar/monitor/notlar/insta360-luna.md): TCP 6666, her paket
/// [uzunluk 4 bayt LE, kendisi dahil][yük]. Yük türü ilk 3 bayt: 06 eşleşme ("syNceNdinS"), 05 canlı tutma (2 sn), 04 komut/yanıt, 01 görüntü
/// (12 bayt başlıktan sonra Annex-B; GO Ultra'da H.265). Kameraya hiçbir şey yazılmaz; yalnız görüntü istenir.
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
    private var sira: UInt32 = 0
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

    init() { katman.videoGravity = .resizeAspect }

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
        if let c = baglanti {
            gonder(komut(2))  // StopLiveStream
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

    // MARK: gönderme

    private func paket(_ yuk: Data) -> Data {
        var d = Data()
        withUnsafeBytes(of: UInt32(yuk.count + 4).littleEndian) { d.append(contentsOf: $0) }
        return d + yuk
    }

    private func gonder(_ yuk: Data) { baglanti?.send(content: paket(yuk), completion: .contentProcessed { _ in }) }

    /// 04 00 00 [komut 2B LE] 02 [sıra 3B LE] 80 00 00 [protobuf]
    private func komut(_ no: UInt16, _ pb: Data = Data()) -> Data {
        var d = Data([4, 0, 0])
        withUnsafeBytes(of: no.littleEndian) { d.append(contentsOf: $0) }
        d.append(2)
        withUnsafeBytes(of: sira.littleEndian) { d.append(contentsOf: $0.prefix(3)) }
        d.append(contentsOf: [0x80, 0, 0])
        sira += 1
        return d + pb
    }

    private static let esles = Data([6, 0, 0]) + Data("syNceNdinS".utf8)
    private static let canli = Data([5, 0, 0])

    private func ilkKonusma() {
        gonder(Insta360Alici.esles)
        gonder(Insta360Alici.canli)
        // SetOptions (7): saat eşitleme (GO Ultra çalışmasındaki biçim)
        var ms = Int64(Date().timeIntervalSince1970 * 1000).littleEndian
        let zaman = withUnsafeBytes(of: &ms) { Data($0.prefix(6)) }
        gonder(komut(7, Data([0x0a, 0x02, 0x0c, 0x0d, 0x12, 0x06]) + zaman))
        kuyruk.asyncAfter(deadline: .now() + 0.3) { [weak self] in
            guard let self, self.baglanti != nil else { return }
            self.gonder(self.komut(1))  // StartLiveStream (boş istek)
            self.yaz("Canlı görüntü istendi")
        }
        let z = DispatchSource.makeTimerSource(queue: kuyruk)
        z.schedule(deadline: .now() + 2, repeating: 2)
        z.setEventHandler { [weak self] in self?.gonder(Insta360Alici.canli); self?.sayimYaz() }
        z.resume()
        zamanlayici = z
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
        while tampon.count >= 4 {
            let b = tampon.startIndex
            let n = Int(tampon[b]) | Int(tampon[b + 1]) << 8 | Int(tampon[b + 2]) << 16 | Int(tampon[b + 3]) << 24
            guard n >= 4, n < 16 * 1024 * 1024 else {
                bozukSayisi += 1
                if bozukSayisi <= 3 { yaz("Tanınmayan paket (\(tampon.count) bayt): \(onaltilik(tampon.prefix(48)))") }
                tampon = Data(); return
            }
            guard tampon.count >= n else { return }
            let yuk = Data(tampon[(b + 4)..<(b + n)])
            tampon = Data(tampon[(b + n)...])
            isle(yuk)
        }
    }

    private func isle(_ y: Data) {
        guard y.count >= 3 else { return }
        let t = y[y.startIndex]
        switch t {
        case 1:
            paketSayisi += 1; bayt += y.count
            guard y.count > 12 else { return }
            if paketSayisi == 1 { yaz("İlk görüntü paketi: \(y.count) bayt, başı \(onaltilik(y.prefix(20)))") }
            akisaEkle(Data(y.dropFirst(12)))
        case 4:
            guard y.count >= 9 else { return }
            let kod = Int(y[y.startIndex + 3]) | Int(y[y.startIndex + 4]) << 8
            if kod != 8208 && kod != 8198 { yaz("Yanıt \(kod)\(kod == 200 ? " (tamam)" : kod == 500 ? " (hata: kamera izin istiyor olabilir)" : "")") }
        case 5: break
        case 6: yaz("Eşleşme yanıtı geldi")
        default: yaz("Bilinmeyen paket türü \(t), \(y.count) bayt")
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

    func hamYaz() { kuyruk.sync { try? ham.write(to: Insta360Alici.hamDosya) } }

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
                Text("1) Insta360 uygulamasını tamamen kapat. 2) iPhone Ayarlar → Wi-Fi'dan kameranın ağına bağlan. 3) Buraya dönüp Bağlan'a dokun. Kameraya hiçbir şey yazılmaz, yalnız görüntü istenir.")
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
