import Foundation
import Speech
import AVFoundation

/// Apple'ın konuşma tanıması (Dikte). Türkçe cihazda yoksa Apple sunucusunu kullanır;
/// bunun için Mac'te Dikte açık olmalı. Apple bir tanıma görevini ~1 dakikayla sınırladığı
/// ve duraklamalarda sessizce susabildiği için görev bekçiyle yenilenir. Her görev yeni bir oturumdur.
final class AppleKaynagi: KonusmaKaynagi {
    var kelimeler: (([String]) -> Void)?
    var yeniOturum: (() -> Void)?
    var durum: ((MikrofonDurumu) -> Void)?

    private let tanici = SFSpeechRecognizer(locale: Locale(identifier: "tr-TR"))
    private let motor = AVAudioEngine()
    private let kilit = NSLock()
    private var istek: SFSpeechAudioBufferRecognitionRequest?
    private var gorev: SFSpeechRecognitionTask?
    private var acik = false
    private var dinleniyor = false
    private var tazeleZamanlayici: Timer?
    private var ardisikHata = 0

    // Bekçi: Apple'ın tanıması uzun bir duraklamadan sonra hata vermeden susabiliyor.
    // Mikrofonda ses varken tanıma bir süre sonuç vermezse görev yeniden başlatılır.
    private var bekci: Timer?
    private var sonSesZamani: CFAbsoluteTime = 0      // ses dinleme iş parçacığında yazılır (kilit ile)
    private var sonSonucZamani: CFAbsoluteTime = 0
    private var gorevBaslangici: CFAbsoluteTime = 0
    private var gurultuZemini: Float = 0.003           // ortam gürültüsü (ses iş parçacığında güncellenir)

    func baslat() {
        guard let tanici else { durum?(.desteklenmiyor); return }
        if acik { return }
        acik = true
        SFSpeechRecognizer.requestAuthorization { yetki in
            DispatchQueue.main.async {
                guard self.acik else { return }
                guard yetki == .authorized else {
                    self.acik = false
                    self.durum?(.izinYok)
                    return
                }
                AVCaptureDevice.requestAccess(for: .audio) { izin in
                    DispatchQueue.main.async {
                        guard self.acik else { return }
                        guard izin else {
                            self.acik = false
                            self.durum?(.izinYok)
                            return
                        }
                        guard tanici.isAvailable else {
                            self.acik = false
                            self.durum?(.desteklenmiyor)
                            return
                        }
                        self.motoruBaslat()
                    }
                }
            }
        }
    }

    private func motoruBaslat() {
        let giris = motor.inputNode
        let bicim = giris.outputFormat(forBus: 0)
        guard bicim.sampleRate > 0, bicim.channelCount > 0 else {
            acik = false
            durum?(.hata("Mikrofon bulunamadı"))
            return
        }
        giris.removeTap(onBus: 0)
        giris.installTap(onBus: 0, bufferSize: 1024, format: bicim) { [weak self] tampon, _ in
            guard let self else { return }
            let duzey = SesTakipci.seviye(tampon)
            self.kilit.lock()
            let r = self.istek
            // Konuşma eşiği ortam gürültüsüne göre: sessiz anlarda zemin yavaşça ölçülür.
            if duzey < self.gurultuZemini * 2 || self.gurultuZemini <= 0 {
                self.gurultuZemini = max(0.0005, self.gurultuZemini * 0.97 + duzey * 0.03)
            }
            if duzey > max(0.004, self.gurultuZemini * 3) { self.sonSesZamani = CFAbsoluteTimeGetCurrent() }
            self.kilit.unlock()
            r?.append(tampon)
        }
        motor.prepare()
        do {
            try motor.start()
        } catch {
            giris.removeTap(onBus: 0)
            acik = false
            durum?(.hata("Mikrofon açılamadı"))
            return
        }
        dinleniyor = true
        ardisikHata = 0
        durum?(.acik)
        yeniGorev()
        bekci?.invalidate()
        let b = Timer(timeInterval: 0.5, repeats: true) { [weak self] _ in self?.bekle() }
        RunLoop.main.add(b, forMode: .common)
        bekci = b
    }

    private func bekle() {
        guard acik else { return }
        let simdi = CFAbsoluteTimeGetCurrent()
        kilit.lock()
        let ses = sonSesZamani
        kilit.unlock()
        let gorevYasi = simdi - gorevBaslangici
        let sonuctanBeri = simdi - max(sonSonucZamani, gorevBaslangici)
        let sessizlik = simdi - ses
        let sonucVar = sonSonucZamani > gorevBaslangici
        let sesGoruldu = ses > gorevBaslangici
        // Konuşmacı durdu (0,8 sn sessizlik): tanımayı şimdiden tazele ki tekrar
        // konuşmaya başlayınca ilk kelimeyi taze bir görev duysun.
        let durdu = sonucVar && sesGoruldu && sessizlik > 0.8 && gorevYasi > 1.0
        // Konuşuluyor ama 1,2 sn'dir sonuç yok: tanıma takılmış.
        let takildi = sessizlik < 0.5 && sonuctanBeri > 1.2 && gorevYasi > 2.0
        // Hiç sonuç gelmeden 6 sn geçti: sessizlikte de tazele.
        let bayat = sonuctanBeri > 6 && gorevYasi > 6
        if durdu || takildi || bayat { yeniGorev() }
    }

    private static func seviye(_ tampon: AVAudioPCMBuffer) -> Float {
        guard let kanal = tampon.floatChannelData?[0] else { return 0 }
        let n = Int(tampon.frameLength)
        if n == 0 { return 0 }
        var toplam: Float = 0
        var i = 0
        while i < n { let v = kanal[i]; toplam += v * v; i += 2 }
        return (toplam / Float((n + 1) / 2)).squareRoot()
    }

    private func yeniGorev() {
        guard acik, let tanici else { return }
        let eskiGorev = gorev
        let r = SFSpeechAudioBufferRecognitionRequest()
        r.shouldReportPartialResults = true
        r.taskHint = .dictation
        if tanici.supportsOnDeviceRecognition { r.requiresOnDeviceRecognition = true }
        r.addsPunctuation = false

        kilit.lock()
        let eskiIstek = istek
        istek = r
        kilit.unlock()
        eskiIstek?.endAudio()
        eskiGorev?.cancel()

        yeniOturum?()
        gorevBaslangici = CFAbsoluteTimeGetCurrent()
        sonSonucZamani = 0
        gorev = tanici.recognitionTask(with: r) { [weak self] sonuc, hata in
            DispatchQueue.main.async { self?.isle(sonuc, hata, r) }
        }

        tazeleZamanlayici?.invalidate()
        let t = Timer(timeInterval: 50, repeats: false) { [weak self] _ in self?.yeniGorev() }
        RunLoop.main.add(t, forMode: .common)
        tazeleZamanlayici = t
    }

    private func isle(_ sonuc: SFSpeechRecognitionResult?, _ hata: Error?, _ r: SFSpeechAudioBufferRecognitionRequest) {
        kilit.lock()
        let guncel = (istek === r)
        kilit.unlock()
        guard acik, guncel else { return }

        if let sonuc {
            ardisikHata = 0
            sonSonucZamani = CFAbsoluteTimeGetCurrent()
            kelimeler?(sonuc.bestTranscription.segments.map { $0.substring })
            if sonuc.isFinal { yeniGorevGecikmeli() }
        } else if let hata {
            let ns = hata as NSError
            // Türkçe cihazda tanınamıyorsa Apple sunucusu kullanılır; bunun için Mac'te Dikte açık olmalı.
            let metin = ns.localizedDescription.lowercased()
            if metin.contains("dictation") || metin.contains("siri") || metin.contains("dikte") {
                durdur()
                durum?(.dikteKapali)
                return
            }
            // 1110: konuşma duyulmadı. Sessizlik hata sayılmaz.
            let sessizlik = ns.code == 1110
            if !sessizlik { ardisikHata += 1 }
            if ardisikHata > 5 {
                durdur()
                durum?(.hata(ns.localizedDescription))
                return
            }
            yeniGorevGecikmeli()
        }
    }

    private func yeniGorevGecikmeli() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in self?.yeniGorev() }
    }

    func durdur() {
        acik = false
        tazeleZamanlayici?.invalidate()
        tazeleZamanlayici = nil
        bekci?.invalidate()
        bekci = nil
        if dinleniyor {
            motor.stop()
            motor.inputNode.removeTap(onBus: 0)
            dinleniyor = false
        }
        kilit.lock()
        let r = istek
        istek = nil
        kilit.unlock()
        r?.endAudio()
        gorev?.cancel()
        gorev = nil
    }
}
