package tr.com.updated.monitor

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.SurfaceTexture
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CaptureRequest
import android.net.Uri
import android.os.Handler
import android.os.HandlerThread
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

/** Kamera listesi: harici (USB/UVC çevirici, Android 14+ destekleyen cihazlar) önce, sonra arka ve ön kamera */
fun kameralar(ctx: Context): List<Pair<String, String>> {
    val cm = ctx.getSystemService(Context.CAMERA_SERVICE) as CameraManager
    return cm.cameraIdList.map { id ->
        val y = cm.getCameraCharacteristics(id).get(CameraCharacteristics.LENS_FACING)
        val ad = when (y) { CameraCharacteristics.LENS_FACING_EXTERNAL -> "USB görüntü (HDMI çevirici) #$id"; CameraCharacteristics.LENS_FACING_BACK -> "Telefonun arka kamerası (deneme)"; else -> "Telefonun ön kamerası (deneme)" }
        id to ad
    }.sortedBy { if (it.second.startsWith("USB")) 0 else 1 }
}

/** Camera2 kaynağı: UVC çevirici Android'de "harici kamera" olarak görünür (Android 14+ ve üretici desteği gerekir) */
class KameraKaynak(private val ctx: Context, private val id: String, override val ad: String) : Kaynak {
    private var cihaz: CameraDevice? = null
    private var oturum: CameraCaptureSession? = null
    private val is_ = HandlerThread("kamera").also { it.start() }
    private val h = Handler(is_.looper)
    var sensorYonu = 0; private set
    val haricimi: Boolean get() = ad.startsWith("USB")

    @SuppressLint("MissingPermission")
    override fun baslat(yuzey: Surface, boyut: (Int, Int) -> Unit, hata: (String) -> Unit) {
        val cm = ctx.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        val oz = cm.getCameraCharacteristics(id)
        sensorYonu = oz.get(CameraCharacteristics.SENSOR_ORIENTATION) ?: 0
        val harita = oz.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
        val secenekler = harita?.getOutputSizes(SurfaceTexture::class.java)?.toList().orEmpty()
        // 1080p'yi geçmeyen en büyük 16:9 (yoksa en büyük) boyut: telefonlar ve çeviriciler için akıcı
        val sec: Size = secenekler.filter { it.width <= 1920 && it.height <= 1080 && kotlin.math.abs(it.width * 9 - it.height * 16) < it.width / 10 }.maxByOrNull { it.width * it.height }
            ?: secenekler.filter { it.width <= 1920 }.maxByOrNull { it.width * it.height } ?: Size(1920, 1080)
        boyut(sec.width, sec.height)
        try {
            cm.openCamera(id, object : CameraDevice.StateCallback() {
                override fun onOpened(c: CameraDevice) {
                    cihaz = c
                    @Suppress("DEPRECATION")
                    c.createCaptureSession(listOf(yuzey), object : CameraCaptureSession.StateCallback() {
                        override fun onConfigured(s: CameraCaptureSession) {
                            oturum = s
                            val istek = c.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW).apply { addTarget(yuzey) }
                            s.setRepeatingRequest(istek.build(), null, h)
                        }
                        override fun onConfigureFailed(s: CameraCaptureSession) = hata("Görüntü oturumu açılamadı.")
                    }, h)
                }
                override fun onDisconnected(c: CameraDevice) { c.close(); hata("Kaynak çıkarıldı.") }
                override fun onError(c: CameraDevice, e: Int) { c.close(); hata("Kamera hatası ($e).") }
            }, h)
        } catch (e: Exception) { hata(e.message ?: "Kamera açılamadı.") }
    }

    override fun durdur() { runCatching { oturum?.close(); cihaz?.close() }; oturum = null; cihaz = null; is_.quitSafely() }
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
            adres.startsWith("rtsp", true) -> RtspMediaSource.Factory().setForceUseRtpTcp(false).createMediaSource(oge)
            adres.startsWith("rtmp", true) -> ProgressiveMediaSource.Factory(RtmpDataSource.Factory()).createMediaSource(oge)
            else -> DefaultMediaSourceFactory(ctx).createMediaSource(oge)
        }
        p.setVideoSurface(yuzey)
        p.addListener(object : Player.Listener {
            override fun onVideoSizeChanged(v: VideoSize) { if (v.width > 0) boyut(v.width, v.height) }
            override fun onPlayerError(e: PlaybackException) = hata("Yayın açılamadı: ${e.errorCodeName}")
        })
        p.volume = 0f
        p.setMediaSource(kaynak); p.prepare(); p.playWhenReady = true
    }

    override fun durdur() { oynatici?.release(); oynatici = null }
}
