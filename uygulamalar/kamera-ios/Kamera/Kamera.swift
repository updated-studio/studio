import AVFoundation
import Photos
import UIKit

/// Kamera oturumu: önizleme, fotoğraf, video (4K varsa 4K), elle ISO.
/// Baz ISO: etkin biçimin en düşük ISO'su (Android'de SENSOR_INFO_SENSITIVITY_RANGE alt sınırı ile aynı mantık).
final class Kamera: NSObject, ObservableObject {
    enum Mod: String, CaseIterable { case foto = "FOTOĞRAF", video = "VİDEO" }

    @Published var izinVar = true
    @Published var mod: Mod = .foto
    @Published var kayitta = false
    @Published var kayitBasi: Date?
    @Published var isoDegerleri: [Float] = []
    @Published var bazIso: Float = 0
    /// nil = otomatik
    @Published var secilenIso: Float?
    @Published var cozunurluk = ""
    @Published var bildirim: String?

    let oturum = AVCaptureSession()
    private let kuyruk = DispatchQueue(label: "tr.com.updated.kamera")
    private var cihaz: AVCaptureDevice?
    private var girdi: AVCaptureDeviceInput?
    private let fotoCikti = AVCapturePhotoOutput()
    private let videoCikti = AVCaptureMovieFileOutput()
    private var konum: AVCaptureDevice.Position = .back
    private var kuruldu = false

    /// Fotoğrafçılıkta alışılan ISO basamakları; cihazın aralığına göre süzülür
    static let basamaklar: [Float] = [25, 32, 40, 50, 64, 80, 100, 125, 160, 200, 250, 320, 400, 500, 640, 800,
                                      1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000, 6400, 8000, 10000, 12800]

    static func isoListesi(min: Float, max: Float) -> [Float] {
        let taban = min.rounded()
        return [taban] + basamaklar.filter { $0 > taban * 1.05 && $0 <= max }
    }

    func baslat() {
        Task {
            let kamera = await AVCaptureDevice.requestAccess(for: .video)
            _ = await AVCaptureDevice.requestAccess(for: .audio)
            await MainActor.run { self.izinVar = kamera }
            guard kamera else { return }
            kuyruk.async {
                if self.kuruldu { if !self.oturum.isRunning { self.oturum.startRunning() } } else { self.kur() }
            }
        }
    }

    func durdur() { kuyruk.async { if self.oturum.isRunning { self.oturum.stopRunning() } } }

    private func kur() {
        kuruldu = true
        oturum.beginConfiguration()
        oturum.sessionPreset = .photo
        if let mik = AVCaptureDevice.default(for: .audio), let g = try? AVCaptureDeviceInput(device: mik), oturum.canAddInput(g) {
            oturum.addInput(g)
        }
        if oturum.canAddOutput(fotoCikti) { oturum.addOutput(fotoCikti); fotoCikti.maxPhotoQualityPrioritization = .quality }
        if oturum.canAddOutput(videoCikti) { oturum.addOutput(videoCikti) }
        oturum.commitConfiguration()
        cihazSec(konum)
        oturum.startRunning()
    }

    private func cihazSec(_ yeni: AVCaptureDevice.Position) {
        guard let d = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: yeni),
              let g = try? AVCaptureDeviceInput(device: d) else { return }
        oturum.beginConfiguration()
        if let eski = girdi { oturum.removeInput(eski) }
        if oturum.canAddInput(g) { oturum.addInput(g); girdi = g; cihaz = d; konum = yeni }
        presetUygula()
        oturum.commitConfiguration()
        isoGuncelle()
    }

    private func presetUygula() {
        if mod == .video {
            oturum.sessionPreset = oturum.canSetSessionPreset(.hd4K3840x2160) ? .hd4K3840x2160 : .high
        } else {
            oturum.sessionPreset = .photo
        }
        let boyut = cihaz.map { CMVideoFormatDescriptionGetDimensions($0.activeFormat.formatDescription) }
        let yazi: String
        switch oturum.sessionPreset {
        case .hd4K3840x2160: yazi = "4K"
        case .photo: yazi = boyut.map { "\(Int(($0.width * $0.height) / 1_000_000)) MP" } ?? ""
        default: yazi = boyut.map { "\($0.height)p" } ?? ""
        }
        DispatchQueue.main.async { self.cozunurluk = yazi }
    }

    private func isoGuncelle() {
        guard let d = cihaz else { return }
        let liste = Kamera.isoListesi(min: d.activeFormat.minISO, max: d.activeFormat.maxISO)
        let iso = secilenIso
        DispatchQueue.main.async {
            self.isoDegerleri = liste
            self.bazIso = liste.first ?? 0
            if let iso, !liste.contains(iso) { self.secilenIso = nil }
        }
        if let iso { isoUygula(iso) }
    }

    func modDegistir(_ yeni: Mod) {
        guard !kayitta, yeni != mod else { return }
        mod = yeni
        kuyruk.async {
            self.oturum.beginConfiguration()
            self.presetUygula()
            self.oturum.commitConfiguration()
            self.isoGuncelle()
        }
    }

    func cevir() {
        guard !kayitta else { return }
        kuyruk.async { self.cihazSec(self.konum == .back ? .front : .back) }
    }

    func isoSec(_ iso: Float?) {
        secilenIso = iso
        kuyruk.async { self.isoUygula(iso) }
    }

    private func isoUygula(_ iso: Float?) {
        guard let d = cihaz, (try? d.lockForConfiguration()) != nil else { return }
        defer { d.unlockForConfiguration() }
        if let iso {
            let deger = Swift.min(Swift.max(iso, d.activeFormat.minISO), d.activeFormat.maxISO)
            d.setExposureModeCustom(duration: AVCaptureDevice.currentExposureDuration, iso: deger)
        } else if d.isExposureModeSupported(.continuousAutoExposure) {
            d.exposureMode = .continuousAutoExposure
        }
    }

    func odakla(_ nokta: CGPoint) {
        kuyruk.async {
            guard let d = self.cihaz, (try? d.lockForConfiguration()) != nil else { return }
            if d.isFocusPointOfInterestSupported { d.focusPointOfInterest = nokta; d.focusMode = .autoFocus }
            if self.secilenIso == nil, d.isExposurePointOfInterestSupported { d.exposurePointOfInterest = nokta; d.exposureMode = .continuousAutoExposure }
            d.unlockForConfiguration()
        }
    }

    func deklansor(yon: AVCaptureVideoOrientation) {
        switch mod {
        case .foto:
            kuyruk.async {
                self.fotoCikti.connection(with: .video)?.videoOrientation = yon
                let ayar = AVCapturePhotoSettings()
                ayar.photoQualityPrioritization = .quality
                self.fotoCikti.capturePhoto(with: ayar, delegate: self)
            }
        case .video:
            if kayitta { kuyruk.async { self.videoCikti.stopRecording() }; return }
            kayitta = true
            kayitBasi = Date()
            kuyruk.async {
                self.videoCikti.connection(with: .video)?.videoOrientation = yon
                let url = FileManager.default.temporaryDirectory.appendingPathComponent("UPDATED-\(Int(Date().timeIntervalSince1970)).mov")
                self.videoCikti.startRecording(to: url, recordingDelegate: self)
            }
        }
    }

    private func kaydet(_ degisiklik: @escaping () -> Void, mesaj: String) {
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { durum in
            guard durum == .authorized || durum == .limited else {
                DispatchQueue.main.async { self.bildirim = "Fotoğraflar izni yok, Ayarlar'dan açılabilir." }
                return
            }
            PHPhotoLibrary.shared().performChanges(degisiklik) { tamam, _ in
                DispatchQueue.main.async { self.bildirim = tamam ? mesaj : "Kaydedilemedi." }
            }
        }
    }
}

extension Kamera: AVCapturePhotoCaptureDelegate {
    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        guard error == nil, let veri = photo.fileDataRepresentation() else { return }
        kaydet({ PHAssetCreationRequest.forAsset().addResource(with: .photo, data: veri, options: nil) }, mesaj: "Fotoğraf kaydedildi")
    }
}

extension Kamera: AVCaptureFileOutputRecordingDelegate {
    func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo url: URL, from connections: [AVCaptureConnection], error: Error?) {
        DispatchQueue.main.async { self.kayitta = false; self.kayitBasi = nil }
        kaydet({ PHAssetCreationRequest.forAsset().addResource(with: .video, fileURL: url, options: nil) }, mesaj: "Video kaydedildi")
    }
}
