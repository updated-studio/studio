import Foundation
import AVFoundation

/// Deepgram (bulut) canlı konuşma tanıma: en düşük gecikme, Türkçe (nova-2).
/// Kullanıcının kendi API anahtarıyla çalışır; ses 16 kHz tek kanal olarak gönderilir.
/// Bağlantı boyunca tek oturumdur: kesinleşen parçalar + o anki ara sonuç birikimli metni verir.
final class DeepgramKaynagi: KonusmaKaynagi {
    var kelimeler: (([String]) -> Void)?
    var yeniOturum: (() -> Void)?
    var durum: ((MikrofonDurumu) -> Void)?

    private let motor = AVAudioEngine()
    private let kilit = NSLock()
    private var soket: URLSessionWebSocketTask?
    private var donusturucu: AVAudioConverter?
    private let hedefBicim = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: true)!
    private var kesin: [String] = []
    private var acik = false
    private var dinleniyor = false
    private var tekrar = 0
    private var canliTut: Timer?

    func baslat() {
        let anahtar = Ayarlar.ortak.deepgramAnahtari.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !anahtar.isEmpty else { durum?(.anahtarYok); return }
        acik = true
        baglan(anahtar)
        guard mikrofonuAc() else { return }
        durum?(.acik)
        let t = Timer(timeInterval: 5, repeats: true) { [weak self] _ in self?.gonder(metin: "{\"type\":\"KeepAlive\"}") }
        RunLoop.main.add(t, forMode: .common)
        canliTut = t
    }

    func durdur() {
        acik = false
        canliTut?.invalidate()
        canliTut = nil
        if dinleniyor {
            motor.stop()
            motor.inputNode.removeTap(onBus: 0)
            dinleniyor = false
        }
        kilit.lock()
        let s = soket
        soket = nil
        kilit.unlock()
        s?.send(.string("{\"type\":\"CloseStream\"}")) { _ in }
        s?.cancel(with: .normalClosure, reason: nil)
    }

    private func baglan(_ anahtar: String) {
        var c = URLComponents(string: "wss://api.deepgram.com/v1/listen")!
        c.queryItems = [
            URLQueryItem(name: "model", value: "nova-2"),
            URLQueryItem(name: "language", value: "tr"),
            URLQueryItem(name: "encoding", value: "linear16"),
            URLQueryItem(name: "sample_rate", value: "16000"),
            URLQueryItem(name: "channels", value: "1"),
            URLQueryItem(name: "interim_results", value: "true"),
            URLQueryItem(name: "punctuate", value: "false"),
            URLQueryItem(name: "smart_format", value: "false"),
            URLQueryItem(name: "endpointing", value: "300"),
        ]
        var istek = URLRequest(url: c.url!)
        istek.setValue("Token \(anahtar)", forHTTPHeaderField: "Authorization")
        let s = URLSession.shared.webSocketTask(with: istek)
        kilit.lock()
        soket = s
        kilit.unlock()
        kesin = []
        yeniOturum?()
        s.resume()
        dinle(s)
    }

    private func dinle(_ s: URLSessionWebSocketTask) {
        s.receive { [weak self] sonuc in
            guard let self else { return }
            switch sonuc {
            case .success(let m):
                if case .string(let t) = m { DispatchQueue.main.async { self.mesaj(t, s) } }
                self.dinle(s)
            case .failure(let e):
                DispatchQueue.main.async { self.koptu(e, s) }
            }
        }
    }

    private func mesaj(_ t: String, _ s: URLSessionWebSocketTask) {
        guard acik, s === soket,
              let veri = t.data(using: .utf8),
              let j = try? JSONSerialization.jsonObject(with: veri) as? [String: Any],
              (j["type"] as? String) == "Results",
              let kanal = j["channel"] as? [String: Any],
              let alt = (kanal["alternatives"] as? [[String: Any]])?.first
        else { return }
        tekrar = 0
        let w = (alt["transcript"] as? String ?? "").split(separator: " ").map(String.init)
        let kesinMi = j["is_final"] as? Bool ?? false
        if !w.isEmpty { kelimeler?(kesin + w) }
        if kesinMi { kesin += w }
    }

    private func koptu(_ e: Error, _ s: URLSessionWebSocketTask) {
        guard acik, s === soket else { return }
        if let r = s.response as? HTTPURLResponse, r.statusCode == 401 || r.statusCode == 403 {
            durum?(.hata("Deepgram anahtarı geçersiz"))
            return
        }
        tekrar += 1
        if tekrar > 3 {
            durum?(.hata("Deepgram'a bağlanılamadı (\(e.localizedDescription))"))
            return
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in
            guard let self, self.acik else { return }
            self.baglan(Ayarlar.ortak.deepgramAnahtari.trimmingCharacters(in: .whitespacesAndNewlines))
        }
    }

    private func gonder(metin: String) {
        kilit.lock()
        let s = soket
        kilit.unlock()
        s?.send(.string(metin)) { _ in }
    }

    private func mikrofonuAc() -> Bool {
        let giris = motor.inputNode
        let bicim = giris.outputFormat(forBus: 0)
        guard bicim.sampleRate > 0, bicim.channelCount > 0,
              let d = AVAudioConverter(from: bicim, to: hedefBicim) else {
            durum?(.hata("Mikrofon bulunamadı"))
            return false
        }
        donusturucu = d
        giris.removeTap(onBus: 0)
        giris.installTap(onBus: 0, bufferSize: 2048, format: bicim) { [weak self] tampon, _ in
            self?.isle(tampon)
        }
        motor.prepare()
        do {
            try motor.start()
        } catch {
            giris.removeTap(onBus: 0)
            durum?(.hata("Mikrofon açılamadı"))
            return false
        }
        dinleniyor = true
        return true
    }

    /// Ses iş parçacığında çalışır: mikrofon sesini 16 kHz tek kanala çevirip gönderir.
    private func isle(_ tampon: AVAudioPCMBuffer) {
        guard let d = donusturucu else { return }
        let oran = hedefBicim.sampleRate / tampon.format.sampleRate
        let kapasite = AVAudioFrameCount(Double(tampon.frameLength) * oran + 64)
        guard let cikti = AVAudioPCMBuffer(pcmFormat: hedefBicim, frameCapacity: kapasite) else { return }
        var verildi = false
        var hata: NSError?
        d.convert(to: cikti, error: &hata) { _, girdiDurumu in
            if verildi {
                girdiDurumu.pointee = .noDataNow
                return nil
            }
            verildi = true
            girdiDurumu.pointee = .haveData
            return tampon
        }
        guard hata == nil, cikti.frameLength > 0, let kanal = cikti.int16ChannelData else { return }
        let veri = Data(bytes: kanal[0], count: Int(cikti.frameLength) * MemoryLayout<Int16>.size)
        kilit.lock()
        let s = soket
        kilit.unlock()
        s?.send(.data(veri)) { _ in }
    }
}
