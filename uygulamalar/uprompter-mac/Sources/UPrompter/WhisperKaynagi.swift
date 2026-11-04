import Foundation
import WhisperKit

/// Mac'in üzerinde çalışan Whisper (WhisperKit, Core ML). İnternet yalnız modeli ilk
/// indirirken gerekir; Dikte'ye ihtiyaç duymaz, ses hiçbir yere gönderilmez.
/// Akış boyunca tek oturumdur: onaylanmış + onaylanmamış parçalar birikimli metni verir.
final class WhisperKaynagi: KonusmaKaynagi {
    var kelimeler: (([String]) -> Void)?
    var yeniOturum: (() -> Void)?
    var durum: ((MikrofonDurumu) -> Void)?

    let model: String
    private var akis: AudioStreamTranscriber?
    private var gorev: Task<Void, Never>?
    private var acik = false
    private var sonMetin = ""

    /// Yüklenmiş model bellekte tutulur; aynı modele dönüşte yeniden yüklenmez.
    private static var yuklu: (model: String, kit: WhisperKit)?

    init(model: String) { self.model = model }

    func baslat() {
        acik = true
        gorev = Task { [weak self] in await self?.calis() }
    }

    func durdur() {
        acik = false
        let a = akis
        akis = nil
        Task { await a?.stopStreamTranscription() }
        gorev = nil
    }

    private func bildir(_ d: MikrofonDurumu) {
        DispatchQueue.main.async { [weak self] in
            guard let self, self.acik else { return }
            self.durum?(d)
        }
    }

    private func calis() async {
        do {
            let kit = try await Self.hazirla(model: model,
                                             ilerleme: { [weak self] p in self?.bildir(.modelIndiriliyor(p)) },
                                             hazirlaniyor: { [weak self] in self?.bildir(.modelHazirlaniyor) })
            guard acik else { return }
            guard let tokenizer = kit.tokenizer else { bildir(.hata("Whisper modeli yüklenemedi")); return }
            let secenek = DecodingOptions(
                language: "tr",
                temperatureFallbackCount: 1,
                usePrefillPrompt: true,
                detectLanguage: false,
                skipSpecialTokens: true
            )
            let a = AudioStreamTranscriber(
                audioEncoder: kit.audioEncoder,
                featureExtractor: kit.featureExtractor,
                segmentSeeker: kit.segmentSeeker,
                textDecoder: kit.textDecoder,
                tokenizer: tokenizer,
                audioProcessor: kit.audioProcessor,
                decodingOptions: secenek,
                requiredSegmentsForConfirmation: 1,
                silenceThreshold: 0.3,
                useVAD: true
            ) { [weak self] _, yeni in
                let metin = (yeni.confirmedSegments + yeni.unconfirmedSegments).map { $0.text }.joined(separator: " ")
                DispatchQueue.main.async { self?.metinGeldi(metin) }
            }
            akis = a
            await MainActor.run {
                guard self.acik else { return }
                self.yeniOturum?()
                self.durum?(.acik)
            }
            try await a.startStreamTranscription()
        } catch {
            bildir(.hata("Whisper: \(error.localizedDescription)"))
        }
    }

    private func metinGeldi(_ metin: String) {
        guard acik, metin != sonMetin else { return }
        sonMetin = metin
        // Whisper'ın özel işaretlerini (<|...|>, [Müzik] gibi) at.
        let temiz = metin
            .replacingOccurrences(of: "<\\|[^|]*\\|>", with: " ", options: .regularExpression)
            .replacingOccurrences(of: "\\[[^\\]]*\\]|\\([^)]*\\)", with: " ", options: .regularExpression)
        let w = temiz.split(whereSeparator: { $0.isWhitespace }).map(String.init)
        if !w.isEmpty { kelimeler?(w) }
    }

    // MARK: Model indirme ve yükleme

    private static var modelKoku: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("UPrompter/Modeller", isDirectory: true)
    }

    static func indirildiMi(_ model: String) -> Bool {
        guard let yol = UserDefaults.standard.string(forKey: "whisperKlasoru." + model) else { return false }
        return FileManager.default.fileExists(atPath: yol)
    }

    private static func hazirla(model: String,
                                ilerleme: @escaping (Double) -> Void,
                                hazirlaniyor: @escaping () -> Void) async throws -> WhisperKit {
        if let y = yuklu, y.model == model { return y.kit }
        yuklu = nil
        let anahtar = "whisperKlasoru." + model
        var klasor: URL
        if let yol = UserDefaults.standard.string(forKey: anahtar), FileManager.default.fileExists(atPath: yol) {
            klasor = URL(fileURLWithPath: yol)
        } else {
            try FileManager.default.createDirectory(at: modelKoku, withIntermediateDirectories: true)
            klasor = try await WhisperKit.download(variant: model, downloadBase: modelKoku,
                                                   progressCallback: { p in ilerleme(p.fractionCompleted) })
            UserDefaults.standard.set(klasor.path, forKey: anahtar)
        }
        hazirlaniyor()
        let ayar = WhisperKitConfig(model: model, downloadBase: modelKoku, modelFolder: klasor.path,
                                    verbose: false, prewarm: true, load: true, download: false)
        let kit = try await WhisperKit(ayar)
        yuklu = (model, kit)
        return kit
    }
}
