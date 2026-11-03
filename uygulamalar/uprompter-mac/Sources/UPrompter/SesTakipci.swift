import Foundation
import Speech
import AVFoundation

/// Mikrofonu dinler, Apple'ın konuşma tanımasıyla (mümkünse cihazda) Türkçe metne çevirir
/// ve söyleneni prompter metnindeki konuma eşler. Apple bir tanıma görevini ~1 dakikayla
/// sınırladığı için görev 50 saniyede bir ve her bitişte kendiliğinden yenilenir.
final class SesTakipci {
    var ilerledi: ((Int) -> Void)?
    var durumDegisti: ((MikrofonDurumu) -> Void)?

    private let tanici = SFSpeechRecognizer(locale: Locale(identifier: "tr-TR"))
    private let motor = AVAudioEngine()
    private let kilit = NSLock()
    private var istek: SFSpeechAudioBufferRecognitionRequest?
    private var gorev: SFSpeechRecognitionTask?
    private var tokenlar: [String] = []
    private var taban = 0
    private var atla = 0
    private var sonSayi = 0
    private var konum = 0
    private var acik = false
    private var dinleniyor = false
    private var tazeleZamanlayici: Timer?
    private var ardisikHata = 0

    func tokenlariAyarla(_ t: [String]) {
        tokenlar = t
        if konum >= t.count { konum = max(0, t.count - 1) }
        taban = konum
        atla = sonSayi
    }

    /// Konum dışarıdan değişti (geri sar, fareyle kaydırma): takip yeni yerden sürer.
    func konumAyarla(_ p: Int) {
        konum = p
        taban = p
        atla = sonSayi
    }

    func baslat(konum p: Int) {
        konum = p
        guard let tanici else { durumDegisti?(.desteklenmiyor); return }
        if acik { return }
        acik = true
        SFSpeechRecognizer.requestAuthorization { durum in
            DispatchQueue.main.async {
                guard self.acik else { return }
                guard durum == .authorized else {
                    self.acik = false
                    self.durumDegisti?(.izinYok)
                    return
                }
                AVCaptureDevice.requestAccess(for: .audio) { izin in
                    DispatchQueue.main.async {
                        guard self.acik else { return }
                        guard izin else {
                            self.acik = false
                            self.durumDegisti?(.izinYok)
                            return
                        }
                        guard tanici.isAvailable else {
                            self.acik = false
                            self.durumDegisti?(.desteklenmiyor)
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
            durumDegisti?(.hata("Mikrofon bulunamadı"))
            return
        }
        giris.removeTap(onBus: 0)
        giris.installTap(onBus: 0, bufferSize: 1024, format: bicim) { [weak self] tampon, _ in
            guard let self else { return }
            self.kilit.lock()
            let r = self.istek
            self.kilit.unlock()
            r?.append(tampon)
        }
        motor.prepare()
        do {
            try motor.start()
        } catch {
            giris.removeTap(onBus: 0)
            acik = false
            durumDegisti?(.hata("Mikrofon açılamadı"))
            return
        }
        dinleniyor = true
        ardisikHata = 0
        durumDegisti?(.acik)
        yeniGorev()
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

        taban = konum
        atla = 0
        sonSayi = 0
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
            let kelimeler = sonuc.bestTranscription.segments.map { $0.substring }
            sonSayi = kelimeler.count
            let p = Hizalama.hizala(kelimeler, tokenlar: tokenlar, taban: taban, atla: atla)
            let yeni = min(p, max(0, tokenlar.count - 1))
            if yeni > konum {
                konum = yeni
                ilerledi?(yeni)
            }
            ardisikHata = 0
            durumDegisti?(.dinliyor)
            if sonuc.isFinal { yeniGorevGecikmeli() }
        } else if let hata {
            let ns = hata as NSError
            // 1110: konuşma duyulmadı. Sessizlik hata sayılmaz.
            let sessizlik = ns.code == 1110
            if !sessizlik { ardisikHata += 1 }
            if ardisikHata > 5 {
                durdur()
                durumDegisti?(.hata(ns.localizedDescription))
                return
            }
            yeniGorevGecikmeli()
        }
    }

    private func yeniGorevGecikmeli() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in self?.yeniGorev() }
    }

    func durdur() {
        let oncedenAcik = acik
        acik = false
        tazeleZamanlayici?.invalidate()
        tazeleZamanlayici = nil
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
        if oncedenAcik { durumDegisti?(.kapali) }
    }
}
