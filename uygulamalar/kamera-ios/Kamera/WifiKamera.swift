import AVFoundation
import SwiftUI

/// Wi-Fi kamera: arka kameranın 1080p60 (yoksa 30) görüntüsü H.264 20 Mb/sn ile masaya (iPad ya da Android) gider; masa bunu olduğu gibi kaydeder.
/// Kendi kamera oturumu vardır; açıkken ana kamera durur.
final class WifiKamera: NSObject, ObservableObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    @Published var durum = "Hazırlanıyor"
    @Published var bagli = false
    @Published var canlida = false
    @Published var izinVar = true
    let oturum = AVCaptureSession()
    let ad = "UPDATED · \(UIDevice.current.name)"
    private let cikti = AVCaptureVideoDataOutput()
    private let ayarKuyrugu = DispatchQueue(label: "tr.com.updated.wifikamera")
    private var verici: YayinVerici?
    private var kuruldu = false
    private var yon = 90
    private var fps = 30

    /// 1920×1080'de 60 kare/sn veren biçim varsa onu seçer (masa kaydı 1080p60); yoksa oturum 30'da kalır
    private static func altmisKare(_ d: AVCaptureDevice) -> Bool {
        let uygun = d.formats.filter { f in
            let b = CMVideoFormatDescriptionGetDimensions(f.formatDescription)
            return b.width == 1920 && b.height == 1080
                && CMFormatDescriptionGetMediaSubType(f.formatDescription) == kCVPixelFormatType_420YpCbCr8BiPlanarFullRange
                && f.videoSupportedFrameRateRanges.contains { $0.maxFrameRate >= 60 }
        }
        // Binned olmayan (daha temiz) biçim öne
        guard let f = uygun.first(where: { !$0.isVideoBinned }) ?? uygun.first, (try? d.lockForConfiguration()) != nil else { return false }
        d.activeFormat = f
        d.activeVideoMinFrameDuration = CMTime(value: 1, timescale: 60)
        d.activeVideoMaxFrameDuration = CMTime(value: 1, timescale: 60)
        d.unlockForConfiguration()
        return true
    }

    func baslat() {
        Task {
            let izin = await AVCaptureDevice.requestAccess(for: .video)
            await MainActor.run { self.izinVar = izin }
            guard izin else { return }
            ayarKuyrugu.async { self.kur() }
        }
    }

    private func kur() {
        if !kuruldu {
            kuruldu = true
            oturum.beginConfiguration()
            oturum.sessionPreset = .hd1920x1080
            if let d = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
               let g = try? AVCaptureDeviceInput(device: d), oturum.canAddInput(g) {
                oturum.addInput(g)
                fps = WifiKamera.altmisKare(d) ? 60 : 30
            }
            cikti.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange]
            cikti.alwaysDiscardsLateVideoFrames = true
            if oturum.canAddOutput(cikti) { oturum.addOutput(cikti) }
            oturum.commitConfiguration()
        }
        if verici == nil {
            let v = YayinVerici(ad: ad, fps: fps)
            v.tally = { a in DispatchQueue.main.async { self.canlida = a } }
            v.durum = { d in DispatchQueue.main.async { self.durum = d; self.bagli = d == "Masaya bağlı" } }
            do { try v.baslat() } catch {
                DispatchQueue.main.async { self.durum = "Kodlayıcı açılamadı" }
                return
            }
            v.yonAyarla(yon)
            verici = v
            // Kareler doğrudan vericinin kuyruğuna gelir (sensörün kendi yatay duruşunda, 1920×1080)
            cikti.setSampleBufferDelegate(self, queue: v.kuyruk)
        }
        if !oturum.isRunning { oturum.startRunning() }
    }

    func durdur() {
        ayarKuyrugu.async {
            if self.oturum.isRunning { self.oturum.stopRunning() }
            self.cikti.setSampleBufferDelegate(nil, queue: nil)
            self.verici?.durdur()
            self.verici = nil
            DispatchQueue.main.async { self.bagli = false; self.canlida = false; self.durum = "Kapalı" }
        }
    }

    /// Sensör görüntüsü telefon sola yatıkken (ana ekran tuşu sağda) diktir; diğer duruşlarda masa saat yönünde döndürür
    func yonGuncelle() {
        let d: Int
        switch UIDevice.current.orientation {
        case .portrait: d = 90
        case .landscapeLeft: d = 0
        case .landscapeRight: d = 180
        case .portraitUpsideDown: d = 270
        default: return
        }
        ayarKuyrugu.async {
            self.yon = d
            self.verici?.yonAyarla(d)
        }
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sb: CMSampleBuffer, from connection: AVCaptureConnection) {
        verici?.kodla(sb)
    }
}

struct WifiKameraEkran: View {
    var kapat: () -> Void
    @StateObject private var k = WifiKamera()
    @Environment(\.scenePhase) private var evre
    @State private var ip = AgYayin.ipAdresi()

    var body: some View {
        ZStack {
            Tema.zemin.ignoresSafeArea()
            Onizleme(oturum: k.oturum) { _, _ in }
                .ignoresSafeArea()
            if k.canlida {
                Rectangle().strokeBorder(Color.red, lineWidth: 6).ignoresSafeArea().allowsHitTesting(false)
            }
            VStack(spacing: 0) {
                HStack(spacing: 12) {
                    Button(action: kapat) {
                        Label("Kamera", systemImage: "chevron.left")
                            .font(.footnote.weight(.bold))
                            .padding(.horizontal, 12).frame(height: 36)
                            .background(Capsule().fill(Color.black.opacity(0.45)))
                    }
                    Spacer()
                    Text(k.canlida ? "CANLI" : k.durum)
                        .font(Tema.mono)
                        .foregroundStyle(k.canlida ? .white : (k.bagli ? .green : Tema.metin2))
                        .padding(.horizontal, 12).frame(height: 36)
                        .background(Capsule().fill(k.canlida ? Color.red : Color.black.opacity(0.45)))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 16).padding(.top, 10)
                Spacer()
                if !k.izinVar {
                    Text("Kamera izni gerekiyor: Ayarlar → UPDATED Kamera → Kamera").font(.subheadline)
                }
                VStack(spacing: 4) {
                    Text("WI-FI KAMERA").font(.caption.weight(.heavy)).foregroundStyle(Tema.vurgu)
                    Text(k.ad).font(.footnote.weight(.semibold))
                    Text(ip.map { "Masa bu telefonu kendiliğinden bulur · elle: \($0)" } ?? "Masa ile aynı Wi-Fi'a bağlanın")
                        .font(.caption).foregroundStyle(Tema.metin2)
                        .multilineTextAlignment(.center)
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 16).padding(.vertical, 10)
                .background(RoundedRectangle(cornerRadius: 14).fill(Tema.yuzey))
                .padding(.bottom, 16)
            }
        }
        .preferredColorScheme(.dark)
        .statusBarHidden()
        .onAppear {
            UIDevice.current.beginGeneratingDeviceOrientationNotifications()
            UIApplication.shared.isIdleTimerDisabled = true
            k.baslat()
            k.yonGuncelle()
        }
        .onDisappear {
            k.durdur()
            UIApplication.shared.isIdleTimerDisabled = false
            UIDevice.current.endGeneratingDeviceOrientationNotifications()
        }
        .onReceive(NotificationCenter.default.publisher(for: UIDevice.orientationDidChangeNotification)) { _ in k.yonGuncelle() }
        .onChange(of: evre) { _, yeni in
            if yeni == .active { ip = AgYayin.ipAdresi(); k.baslat() } else if yeni == .background { k.durdur() }
        }
    }
}
