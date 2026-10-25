package tr.com.updated.monitor

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.SurfaceTexture
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CameraMetadata
import android.hardware.camera2.CaptureRequest
import android.media.MediaRecorder
import android.net.Uri
import android.os.Handler
import android.os.HandlerThread
import android.os.ParcelFileDescriptor
import android.util.Range
import android.util.Size
import android.view.Surface
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.VideoSize
import androidx.media3.datasource.rtmp.RtmpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.rtsp.RtspMediaSource
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.source.ProgressiveMediaSource

/** Görüntü kaynağı: bir Surface'e çizer, boyutunu bildirir. */
interface Kaynak {
    val ad: String
    fun baslat(yuzey: Surface, boyut: (Int, Int) -> Unit, hata: (String) -> Unit)
    fun durdur()
}

/** Kamera listesi: harici (USB/UVC çevirici, Android 14+ destekleyen cihazlar) önce, sonra arka ve ön kameralar */
fun kameralar(ctx: Context): List<Pair<String, String>> {
    val cm = ctx.getSystemService(Context.CAMERA_SERVICE) as CameraManager
    var arka = 0
    return cm.cameraIdList.map { id ->
        val oz = cm.getCameraCharacteristics(id)
        val odak = oz.get(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS)?.firstOrNull()
        val ad = when (oz.get(CameraCharacteristics.LENS_FACING)) {
            CameraCharacteristics.LENS_FACING_EXTERNAL -> "USB görüntü (HDMI çevirici) #$id"
            CameraCharacteristics.LENS_FACING_BACK -> { arka++; "Arka kamera ${if (arka == 1) "(ana)" else "#$id"}" + (odak?.let { " · %.1f mm".format(it) } ?: "") }
            else -> "Ön kamera" + (odak?.let { " · %.1f mm".format(it) } ?: "")
        }
        id to ad
    }.sortedBy { if (it.second.startsWith("USB")) 0 else if (it.second.startsWith("Arka")) 1 else 2 }
}

/** Kameranın el ile ayarları (null = otomatik). Değişince oturum yeniden kurulmadan istek güncellenir. */
data class KameraAyari(
    var boyut: Size? = null, var fps: Range<Int>? = null,
    var iso: Int? = null, var pozlamaNs: Long? = null, var ev: Int = 0,
    var awb: Int = CameraMetadata.CONTROL_AWB_MODE_AUTO, var odakMesafe: Float? = null, var sabitleme: Boolean = true,
)

/** Kameranın yetenekleri (ayar listeleri buradan çizilir) */
class KameraYetenek(val boyutlar: List<Size>, val fpsler: List<Range<Int>>, val isoAralik: Range<Int>?, val pozlamaAralik: Range<Long>?, val evAralik: Range<Int>?, val evAdim: Float,
                    val awbModlari: IntArray, val minOdak: Float, val elleKontrol: Boolean, val diyafram: Float?)

/** Camera2 kaynağı: telefon kameraları ve UVC çevirici (Android'de "harici kamera"). Kayıt: MediaRecorder (H.264/H.265, AAC). */
class KameraKaynak(private val ctx: Context, val id: String, override val ad: String, val ayar: KameraAyari = KameraAyari()) : Kaynak {
    private var cihaz: CameraDevice? = null
    private var oturum: CameraCaptureSession? = null
    private var onizleme: Surface? = null
    private var kaydedici: MediaRecorder? = null
    private var kayitDosyasi: ParcelFileDescriptor? = null
    private val is_ = HandlerThread("kamera").also { it.start() }
    private val h = Handler(is_.looper)
    private val cm = ctx.getSystemService(Context.CAMERA_SERVICE) as CameraManager
    private val oz = cm.getCameraCharacteristics(id)
    var sensorYonu = oz.get(CameraCharacteristics.SENSOR_ORIENTATION) ?: 0; private set
    val haricimi: Boolean get() = ad.startsWith("USB")
    val kayitta: Boolean get() = kaydedici != null
    private var hataGeri: (String) -> Unit = {}

    val yetenek: KameraYetenek by lazy {
        val harita = oz.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
        val boyutlar = harita?.getOutputSizes(SurfaceTexture::class.java)?.sortedByDescending { it.width * it.height }.orEmpty()
        val fpsler = oz.get(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES)?.toList()?.distinct()?.sortedWith(compareBy({ it.upper }, { it.lower })).orEmpty()
        val yet = oz.get(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES) ?: IntArray(0)
        KameraYetenek(boyutlar, fpsler, oz.get(CameraCharacteristics.SENSOR_INFO_SENSITIVITY_RANGE), oz.get(CameraCharacteristics.SENSOR_INFO_EXPOSURE_TIME_RANGE),
            oz.get(CameraCharacteristics.CONTROL_AE_COMPENSATION_RANGE), oz.get(CameraCharacteristics.CONTROL_AE_COMPENSATION_STEP)?.toFloat() ?: 0f,
            oz.get(CameraCharacteristics.CONTROL_AWB_AVAILABLE_MODES) ?: intArrayOf(CameraMetadata.CONTROL_AWB_MODE_AUTO),
            oz.get(CameraCharacteristics.LENS_INFO_MINIMUM_FOCUS_DISTANCE) ?: 0f,
            CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_MANUAL_SENSOR in yet, oz.get(CameraCharacteristics.LENS_INFO_AVAILABLE_APERTURES)?.firstOrNull())
    }

    /** Varsayılan boyut: 1080p'yi geçmeyen en büyük 16:9 (yoksa en büyük) */
    fun secilenBoyut(): Size = ayar.boyut ?: yetenek.boyutlar.filter { it.width <= 1920 && it.height <= 1080 && kotlin.math.abs(it.width * 9 - it.height * 16) < it.width / 10 }.maxByOrNull { it.width * it.height }
        ?: yetenek.boyutlar.filter { it.width <= 1920 }.maxByOrNull { it.width * it.height } ?: Size(1920, 1080)

    @SuppressLint("MissingPermission")
    override fun baslat(yuzey: Surface, boyut: (Int, Int) -> Unit, hata: (String) -> Unit) {
        onizleme = yuzey; hataGeri = hata
        val b = secilenBoyut(); boyut(b.width, b.height)
        h.post { ac(0) }
    }

    /** Kamerayı açar; "devre dışı/kullanımda" (1, 2, 3) yanıtında önceki kamera kapanırken çakışmış olabilir: 4 kez yeniden dener */
    @SuppressLint("MissingPermission")
    private fun ac(deneme: Int) {
        try {
            cm.openCamera(id, object : CameraDevice.StateCallback() {
                override fun onOpened(c: CameraDevice) { cihaz = c; oturumKur() }
                override fun onDisconnected(c: CameraDevice) { c.close(); cihaz = null; hataGeri("Kaynak çıkarıldı ya da başka uygulama kullanıyor.") }
                override fun onError(c: CameraDevice, e: Int) {
                    c.close(); cihaz = null
                    if (e in 1..3 && deneme < 4) { h.postDelayed({ ac(deneme + 1) }, 400L * (deneme + 1)); return }
                    val neden = when (e) { 1 -> "kamera başka uygulamada açık"; 2 -> "aynı anda açılabilecek kamera sınırı"; 3 -> "kamera devre dışı (telefonun kamera erişimi kapalı olabilir: Ayarlar → Gizlilik → Kamera erişimi)"; 4 -> "kamera aygıt hatası"; else -> "kamera servisi hatası" }
                    hataGeri("Kamera açılamadı: $neden."); HataKaydi.not("kamera", "openCamera onError $e (deneme $deneme) · $ad")
                }
            }, h)
        } catch (e: Exception) {
            if (deneme < 4) { h.postDelayed({ ac(deneme + 1) }, 400L * (deneme + 1)); return }
            hataGeri(e.message ?: "Kamera açılamadı."); HataKaydi.not("kamera", e.stackTraceToString())
        }
    }

    private fun oturumKur() {
        val c = cihaz ?: return
        val hedefler = listOfNotNull(onizleme, kaydedici?.surface)
        runCatching { oturum?.close() }
        try {
            @Suppress("DEPRECATION")
            c.createCaptureSession(hedefler, object : CameraCaptureSession.StateCallback() {
                override fun onConfigured(s: CameraCaptureSession) { oturum = s; istekGonder(); if (kaydedici != null) runCatching { kaydedici?.start() }.onFailure { hataGeri("Kayıt başlatılamadı: ${it.message}"); HataKaydi.not("kayit", it.stackTraceToString()); kayitBirak() } }
                override fun onConfigureFailed(s: CameraCaptureSession) { hataGeri("Görüntü oturumu kurulamadı (bu çözünürlük/kare hızı desteklenmiyor olabilir)."); HataKaydi.not("kamera", "onConfigureFailed $ad ${secilenBoyut()} ${ayar.fps}") }
            }, h)
        } catch (e: Exception) { hataGeri(e.message ?: "Oturum kurulamadı"); HataKaydi.not("kamera", e.stackTraceToString()) }
    }

    /** El ile ayarları uygular (oturumu kapatmadan) */
    fun istekGonder() {
        val c = cihaz ?: return; val s = oturum ?: return
        try {
            val r = c.createCaptureRequest(if (kaydedici != null) CameraDevice.TEMPLATE_RECORD else CameraDevice.TEMPLATE_PREVIEW)
            onizleme?.let { r.addTarget(it) }; kaydedici?.surface?.let { r.addTarget(it) }
            ayar.fps?.let { r.set(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE, it) }
            val elle = ayar.iso != null || ayar.pozlamaNs != null
            if (elle && yetenek.elleKontrol) {
                r.set(CaptureRequest.CONTROL_AE_MODE, CameraMetadata.CONTROL_AE_MODE_OFF)
                r.set(CaptureRequest.SENSOR_SENSITIVITY, ayar.iso ?: yetenek.isoAralik?.lower?.coerceAtLeast(100) ?: 100)
                r.set(CaptureRequest.SENSOR_EXPOSURE_TIME, ayar.pozlamaNs ?: 1_000_000_000L / 50)
                ayar.fps?.let { r.set(CaptureRequest.SENSOR_FRAME_DURATION, 1_000_000_000L / it.upper) }
            } else {
                r.set(CaptureRequest.CONTROL_AE_MODE, CameraMetadata.CONTROL_AE_MODE_ON)
                r.set(CaptureRequest.CONTROL_AE_EXPOSURE_COMPENSATION, ayar.ev)
            }
            r.set(CaptureRequest.CONTROL_AWB_MODE, ayar.awb)
            if (ayar.odakMesafe != null && yetenek.minOdak > 0f) { r.set(CaptureRequest.CONTROL_AF_MODE, CameraMetadata.CONTROL_AF_MODE_OFF); r.set(CaptureRequest.LENS_FOCUS_DISTANCE, ayar.odakMesafe!!) }
            else r.set(CaptureRequest.CONTROL_AF_MODE, CameraMetadata.CONTROL_AF_MODE_CONTINUOUS_VIDEO)
            r.set(CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE, if (ayar.sabitleme) CameraMetadata.CONTROL_VIDEO_STABILIZATION_MODE_ON else CameraMetadata.CONTROL_VIDEO_STABILIZATION_MODE_OFF)
            s.setRepeatingRequest(r.build(), null, h)
        } catch (e: Exception) { HataKaydi.not("kamera", "istek: " + e.stackTraceToString()) }
    }

    fun ayarDegisti() = h.post { istekGonder() }

    /** Çözünürlük/kare hızı değişince oturum yeniden kurulur (kayıt sırasında değiştirilmez) */
    fun oturumYenile(boyut: (Int, Int) -> Unit) { if (kayitta) return; val b = secilenBoyut(); boyut(b.width, b.height); h.post { oturumKur() } }

    /** Kayıt: dosya tanımlayıcısı (MediaStore) verilir; H.264/H.265, bit hızı Mbps, ses isteğe bağlı */
    fun kayitBasla(dosya: ParcelFileDescriptor, hevc: Boolean, mbps: Int, ses: Boolean, sonuc: (String?) -> Unit) {
        h.post {
            try {
                val b = secilenBoyut(); val fps = ayar.fps?.upper ?: 30
                val m = MediaRecorder(ctx)
                if (ses) m.setAudioSource(MediaRecorder.AudioSource.CAMCORDER)
                m.setVideoSource(MediaRecorder.VideoSource.SURFACE)
                m.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                m.setOutputFile(dosya.fileDescriptor)
                m.setVideoEncoder(if (hevc) MediaRecorder.VideoEncoder.HEVC else MediaRecorder.VideoEncoder.H264)
                m.setVideoSize(b.width, b.height); m.setVideoFrameRate(fps); m.setVideoEncodingBitRate(mbps * 1_000_000)
                if (ses) { m.setAudioEncoder(MediaRecorder.AudioEncoder.AAC); m.setAudioSamplingRate(48000); m.setAudioEncodingBitRate(192_000); m.setAudioChannels(2) }
                m.setOrientationHint(0)
                m.prepare()
                kaydedici = m; kayitDosyasi = dosya
                oturumKur() // kayıt yüzeyiyle; başlat onConfigured'da
                sonuc(null)
            } catch (e: Exception) { kayitBirak(); sonuc(e.message ?: "Kayıt hazırlanamadı"); HataKaydi.not("kayit", e.stackTraceToString()) }
        }
    }

    fun kayitDurdur(bitti: (Boolean) -> Unit) {
        h.post {
            val ok = runCatching { kaydedici?.stop() }.isSuccess
            kayitBirak(); oturumKur(); bitti(ok)
        }
    }

    private fun kayitBirak() { runCatching { kaydedici?.release() }; kaydedici = null; runCatching { kayitDosyasi?.close() }; kayitDosyasi = null }

    /** Ses düzeyi (0–32767), yalnız kayıt sırasında */
    fun sesDuzeyi(): Int = runCatching { kaydedici?.maxAmplitude ?: 0 }.getOrDefault(0)

    /** Kapatma kamera iş parçacığında: ana iş parçacığı beklemez (donma olmasın) */
    override fun durdur() = durdurVe {}

    /** Kapatma kamera iş parçacığında (ana ekran beklemez); kamera tamamen kapanınca `bitti` çağrılır */
    fun durdurVe(bitti: () -> Unit) {
        h.post {
            runCatching { kaydedici?.stop() }; kayitBirak()
            runCatching { oturum?.close() }; runCatching { cihaz?.close() }; oturum = null; cihaz = null
            is_.quitSafely(); bitti()
        }
    }
}

/** Ağ yayını: RTSP (kameralar, kayıt cihazları), RTMP, HLS (.m3u8) ya da doğrudan video adresi; düşük gecikme ayarlı */
class AgKaynak(private val ctx: Context, private val adres: String) : Kaynak {
    override val ad = "Ağ: $adres"
    private var oynatici: ExoPlayer? = null

    override fun baslat(yuzey: Surface, boyut: (Int, Int) -> Unit, hata: (String) -> Unit) {
        val yukle = DefaultLoadControl.Builder().setBufferDurationsMs(300, 2000, 200, 300).build()
        val p = ExoPlayer.Builder(ctx).setLoadControl(yukle).build()
        oynatici = p
        val oge = MediaItem.fromUri(Uri.parse(adres))
        val kaynak = when {
            adres.startsWith("rtsp", true) -> RtspMediaSource.Factory().createMediaSource(oge)
            adres.startsWith("rtmp", true) -> ProgressiveMediaSource.Factory(RtmpDataSource.Factory()).createMediaSource(oge)
            else -> DefaultMediaSourceFactory(ctx).createMediaSource(oge)
        }
        p.setVideoSurface(yuzey)
        p.addListener(object : Player.Listener {
            override fun onVideoSizeChanged(v: VideoSize) { if (v.width > 0) boyut(v.width, v.height) }
            override fun onPlayerError(e: PlaybackException) { hata("Yayın açılamadı: ${e.errorCodeName}"); HataKaydi.not("ag", "${e.errorCodeName} $adres") }
        })
        p.volume = 0f
        p.setMediaSource(kaynak); p.prepare(); p.playWhenReady = true
    }

    override fun durdur() { oynatici?.release(); oynatici = null }
}
