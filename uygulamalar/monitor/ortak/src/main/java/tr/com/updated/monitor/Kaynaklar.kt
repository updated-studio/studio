package tr.com.updated.monitor

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.ImageFormat
import android.graphics.SurfaceTexture
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CameraMetadata
import android.hardware.camera2.CaptureRequest
import android.hardware.camera2.DngCreator
import android.hardware.camera2.TotalCaptureResult
import android.media.ExifInterface
import android.media.Image
import android.media.ImageReader
import android.media.MediaRecorder
import android.net.Uri
import android.os.Handler
import android.os.HandlerThread
import android.os.ParcelFileDescriptor
import android.util.Range
import android.util.Size
import android.view.Surface
import java.io.OutputStream
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
    var awb: Int = CameraMetadata.CONTROL_AWB_MODE_AUTO, var odakMesafe: Float? = null,
    var fotoBoyut: Size? = null, var raw: Boolean = false,
    var zoomOrani: Float = 1f,
    /** Kamera ekranında 1/10 sn'den uzun elle enstantane: önizleme kareleri 1/10 sn'de tutulur (0 kapalı, 1 ISO aradaki fark kadar artar, 2 artmaz) */
    var uzunOnizleme: Int = 0,
    /** Flaş: 0 kapalı, 1 otomatik, 2 açık, 3 fener (sürekli ışık) */
    var flas: Int = 0,
    /** Genel Ayarlar: kodek (H.265 / H.264), renk (0 SDR, 1 HDR HLG10), sabitleme (0 kapalı, 1 standart, 2 sinematik = önizleme sabitlemesi) */
    var hevc: Boolean = false, var renk: Int = 0, var sabit: Int = 1,
    /** Elle beyaz denge: Kelvin (null = beyaz denge modu `awb`) ve ton (yeşil −100 … +100 macenta) */
    var kelvin: Int? = null, var ton: Int = 0,
    /** Ses girişi (AudioDeviceInfo.id; null = otomatik: takılı harici mikrofon varsa o) */
    var sesGirdi: Int? = null,
    /** Diyafram (f sayısı): yalnız değişken diyaframlı telefonda; null = telefonun varsayılanı */
    var diyafram: Float? = null,
)

/** Kameranın yetenekleri (ayar listeleri buradan çizilir) */
class KameraYetenek(val boyutlar: List<Size>, val fpsler: List<Range<Int>>, val isoAralik: Range<Int>?, val pozlamaAralik: Range<Long>?, val evAralik: Range<Int>?, val evAdim: Float,
                    val awbModlari: IntArray, val minOdak: Float, val elleKontrol: Boolean, val diyafram: Float?)

/** Camera2 kaynağı: telefon kameraları ve UVC çevirici (Android'de "harici kamera"). Kayıt: MediaRecorder (H.264/H.265, AAC). */
/** PRO MODLAR uzun pozlamasında önizlemenin en uzun kare süresi (1/10 sn) */
private const val ONIZLEME_EN_UZUN = 100_000_000L

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
    val onKamera: Boolean get() = oz.get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_FRONT
    /** Ekranın o anki dönüşü (0/90/180/270); kaydın yön bilgisi bundan hesaplanır */
    /** Kayda göm açıkken fotoğrafın JPEG verisine renk stili işler (Stiller) */
    @Volatile var jpegIsle: ((ByteArray) -> ByteArray)? = null
    @Volatile var ekranYonu = 0
    val kayitta: Boolean get() = kaydedici != null
    private var hataGeri: (String) -> Unit = {}

    /** Timelapse: otomatik pozlama ve beyaz denge o anki değerinde kilitlenir (kareler arası titreme olmaz) */
    @Volatile var pozKilit = false
    /** Seçili sahne (Sahne.kt); ayarların üstüne uygulanır */
    @Volatile var sahne = Sahne.KAPALI
    /** PRO MODLAR (ProModlar.kt): seçiliyse el ile ayarların ve sahnenin yerine geçer */
    @Volatile var pro: Pair<ProMod, ProAyar>? = null
    /** Son otomatik pozlama ölçümü (ISO × ns): enstantane/ISO öncelikli modlarda çekimdeki karşılığı bundan hesaplanır */
    @Volatile private var otoIsoNs = 0.0
    /** Otomatik pozlamanın son ölçümü (sahne önerisi için): ISO ve pozlama süresi */
    @Volatile var sonIso = 0; private set
    @Volatile var sonPozNs = 0L; private set
    /** Dokunarak odak: görüntü üzerindeki nokta, kamera sensörünün koordinatına çevrilmiş (0–1); null = sürekli otomatik odak */
    @Volatile var odakNoktasi: android.graphics.PointF? = null; private set
    /** Flaşlı çekimden önce pozlama ölçümü bitince çağrılır */
    private var olcumBekleyen: ((Int?) -> Unit)? = null
    val zoomAralik: Range<Float>? by lazy { if (android.os.Build.VERSION.SDK_INT >= 30) oz.get(CameraCharacteristics.CONTROL_ZOOM_RATIO_RANGE) else null }
    val flasVar: Boolean by lazy { oz.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true }
    /** Otomatik beyaz dengenin son kazançları ve renk dönüşümü: elle Kelvin'de dönüşüm bundan alınır, başlangıç Kelvin'i bundan tahmin edilir */
    @Volatile private var sonKazanc: android.hardware.camera2.params.RggbChannelVector? = null
    @Volatile private var sonDonusum: android.hardware.camera2.params.ColorSpaceTransform? = null
    private val olcumGeri = object : CameraCaptureSession.CaptureCallback() {
        override fun onCaptureCompleted(ss: CameraCaptureSession, q: CaptureRequest, t: TotalCaptureResult) {
            olcumBekleyen?.invoke(t.get(android.hardware.camera2.CaptureResult.CONTROL_AE_STATE))
            if (t.get(android.hardware.camera2.CaptureResult.CONTROL_AWB_MODE) != CameraMetadata.CONTROL_AWB_MODE_OFF) {
                t.get(android.hardware.camera2.CaptureResult.COLOR_CORRECTION_GAINS)?.let { sonKazanc = it }
                val ilk = sonDonusum == null
                t.get(android.hardware.camera2.CaptureResult.COLOR_CORRECTION_TRANSFORM)?.let { sonDonusum = it }
                if (ilk && sonDonusum != null && ayar.kelvin != null && elleBdVar) h.post { istekGonder() }
            }
            t.get(android.hardware.camera2.CaptureResult.SENSOR_SENSITIVITY)?.let { sonIso = it }
            t.get(android.hardware.camera2.CaptureResult.SENSOR_EXPOSURE_TIME)?.let { sonPozNs = it }
            if (t.get(android.hardware.camera2.CaptureResult.CONTROL_AE_MODE) != CameraMetadata.CONTROL_AE_MODE_OFF && sonIso > 0 && sonPozNs > 0) otoIsoNs = sonIso.toDouble() * sonPozNs
        }
    }
    private val sahneModlari: IntArray by lazy { oz.get(CameraCharacteristics.CONTROL_AVAILABLE_SCENE_MODES) ?: IntArray(0) }
    fun sahneModuVar(m: Int) = m in sahneModlari
    /** Telefon tek çekimde en az 4 sn pozlama verebiliyor mu (Samanyolu için) */
    /**
     * Baz (en temiz) ISO: Android bunu doğrudan vermiyor. Sensörün en düşük duyarlılığı (SENSOR_INFO_SENSITIVITY_RANGE alt sınırı)
     * pratikte baz ISO'dur; kumlanma en az, dinamik aralık en geniş. (SENSOR_MAX_ANALOG_SENSITIVITY de var: onun üstü dijital kazanç;
     * şimdilik gösterilmiyor.)
     */
    val bazIso: Int? get() = yetenek.isoAralik?.lower
    val uzunPozlamaVar: Boolean get() = yetenek.elleKontrol && (yetenek.pozlamaAralik?.upper ?: 0L) >= 4_000_000_000L

    /** Fotoğraf modu: oturuma JPEG (ve istenirse RAW/DNG) okuyucusu eklenir, önizleme fotoğrafın en/boy oranına geçer */
    @Volatile var fotoModu = false
    private var jpegOkuyucu: ImageReader? = null
    private var rawOkuyucu: ImageReader? = null
    private var rawDustu = false // bu telefonda RAW + JPEG + önizleme birlikte kurulamadı
    private var cekiliyor = false
    private val harita get() = oz.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
    val fotoBoyutlari: List<Size> by lazy { harita?.getOutputSizes(ImageFormat.JPEG)?.sortedByDescending { it.width * it.height }.orEmpty() }
    val rawVar: Boolean by lazy {
        CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_RAW in (oz.get(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES) ?: IntArray(0)) &&
            harita?.getOutputSizes(ImageFormat.RAW_SENSOR)?.isNotEmpty() == true
    }
    val rawAcik: Boolean get() = rawOkuyucu != null

    private val yetenekler: IntArray by lazy { oz.get(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES) ?: IntArray(0) }
    /** HDR (HLG, 10 bit): Android 13+ ve kamera 10 bit HLG10 veriyorsa */
    val hdrVar: Boolean by lazy {
        android.os.Build.VERSION.SDK_INT >= 33 && CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_DYNAMIC_RANGE_TEN_BIT in yetenekler &&
            oz.get(CameraCharacteristics.REQUEST_AVAILABLE_DYNAMIC_RANGE_PROFILES)?.supportedProfiles?.contains(android.hardware.camera2.params.DynamicRangeProfiles.HLG10) == true
    }
    /** Desteklenen sabitlemeler: 0 kapalı, 1 standart (EIS), 2 sinematik (önizleme sabitlemesi, Android 13+) */
    val sabitlemeler: List<Int> by lazy {
        val m = oz.get(CameraCharacteristics.CONTROL_AVAILABLE_VIDEO_STABILIZATION_MODES) ?: IntArray(0)
        listOfNotNull(0, 1.takeIf { CameraMetadata.CONTROL_VIDEO_STABILIZATION_MODE_ON in m },
            2.takeIf { android.os.Build.VERSION.SDK_INT >= 33 && CameraMetadata.CONTROL_VIDEO_STABILIZATION_MODE_PREVIEW_STABILIZATION in m })
    }
    /** Elle Kelvin: beyaz denge kapatılıp renk kazançları verilebiliyorsa */
    val elleBdVar: Boolean by lazy { CameraMetadata.CONTROL_AWB_MODE_OFF in yetenek.awbModlari && CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_MANUAL_POST_PROCESSING in yetenekler }
    /** Beyaz denge şu an kaç Kelvin (otomatikse son kazançlardan tahmin) */
    fun mevcutKelvin(): Int = ayar.kelvin ?: (BeyazDenge.tahmin(oz, sonKazanc) / BeyazDenge.ADIM * BeyazDenge.ADIM)
    /** Diyafram: telefonun mercek açıklıkları (çoğu telefonda tek; değişken diyaframlı telefonda birden çok) */
    val diyaframlar: FloatArray by lazy { oz.get(CameraCharacteristics.LENS_INFO_AVAILABLE_APERTURES) ?: FloatArray(0) }
    /** Wi-Fi kamera yayınında HDR kapalı: görüntü 8 bit SDR'ye çizilip Masa'ya gidiyor, HLG ton eşlemesiz soluk ve kayık görünüyordu */
    @Volatile var sdrZorla = false
    private val hdrAcik: Boolean get() = ayar.renk == 1 && hdrVar && !fotoModu && !sdrZorla
    fun secilenFotoBoyut(): Size? = ayar.fotoBoyut?.takeIf { it in fotoBoyutlari } ?: fotoBoyutlari.firstOrNull()

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
    fun secilenBoyut(): Size = (if (fotoModu) fotoOnizleme() else ayar.boyut) ?: yetenek.boyutlar.filter { it.width <= 1920 && it.height <= 1080 && kotlin.math.abs(it.width * 9 - it.height * 16) < it.width / 10 }.maxByOrNull { it.width * it.height }
        ?: yetenek.boyutlar.filter { it.width <= 1920 }.maxByOrNull { it.width * it.height } ?: Size(1920, 1080)

    /** Fotoğrafla aynı en/boy oranında, 1080p'yi geçmeyen en büyük önizleme */
    private fun fotoOnizleme(): Size? {
        val f = secilenFotoBoyut() ?: return null
        return yetenek.boyutlar.filter { it.width <= 1920 && it.height <= 1440 && kotlin.math.abs(it.width.toLong() * f.height - it.height.toLong() * f.width) < it.width.toLong() * f.height / 50 }.maxByOrNull { it.width * it.height }
    }

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
                    hataGeri(if (e == 3) "POLITIKA" else "Kamera açılamadı: $neden."); HataKaydi.not("kamera", "openCamera onError $e (deneme $deneme) · $ad")
                }
            }, h)
        } catch (e: Exception) {
            // "disabled by policy": telefonun kendisi bu uygulamaya kamerayı kapatmış; yeniden denemek işe yaramaz
            if (e is android.hardware.camera2.CameraAccessException && e.reason == android.hardware.camera2.CameraAccessException.CAMERA_DISABLED) {
                hataGeri("POLITIKA"); HataKaydi.not("kamera", e.stackTraceToString()); return }
            if (deneme < 4) { h.postDelayed({ ac(deneme + 1) }, 400L * (deneme + 1)); return }
            hataGeri(e.message ?: "Kamera açılamadı."); HataKaydi.not("kamera", e.stackTraceToString())
        }
    }

    private fun oturumKur() {
        val c = cihaz ?: return
        runCatching { oturum?.close() }; oturum = null
        okuyuculariKur()
        val hedefler = listOfNotNull(onizleme, kaydedici?.surface, jpegOkuyucu?.surface, rawOkuyucu?.surface)
        val hdr = hdrAcik; val kayitYuzeyi = kaydedici?.surface
        val ciktilar = hedefler.map { y -> android.hardware.camera2.params.OutputConfiguration(y).apply {
            if (hdr && android.os.Build.VERSION.SDK_INT >= 33 && (y === onizleme || y === kayitYuzeyi)) dynamicRangeProfile = android.hardware.camera2.params.DynamicRangeProfiles.HLG10 } }
        try {
            c.createCaptureSession(android.hardware.camera2.params.SessionConfiguration(android.hardware.camera2.params.SessionConfiguration.SESSION_REGULAR, ciktilar,
                java.util.concurrent.Executor { h.post(it) }, object : CameraCaptureSession.StateCallback() {
                override fun onConfigured(s: CameraCaptureSession) { oturum = s; istekGonder(); if (kaydedici != null) runCatching { kaydedici?.start() }.onFailure { hataGeri("Kayıt başlatılamadı: ${it.message}"); HataKaydi.not("kayit", it.stackTraceToString()); kayitBirak() } }
                override fun onConfigureFailed(s: CameraCaptureSession) {
                    if (rawOkuyucu != null) { rawDustu = true; runCatching { rawOkuyucu?.close() }; rawOkuyucu = null; hataGeri("Bu kamera RAW'ı önizlemeyle birlikte veremiyor; yalnız JPEG çekilecek."); oturumKur(); return }
                    if (hdr) { ayar.renk = 0; hataGeri("Bu çözünürlük/kare hızında HDR kurulamadı; SDR'ye dönüldü."); oturumKur(); return }
                    hataGeri("Görüntü oturumu kurulamadı (bu çözünürlük/kare hızı desteklenmiyor olabilir)."); HataKaydi.not("kamera", "onConfigureFailed $ad ${secilenBoyut()} ${ayar.fps}") }
            }))
        } catch (e: Exception) { hataGeri(e.message ?: "Oturum kurulamadı"); HataKaydi.not("kamera", e.stackTraceToString()) }
    }

    private fun okuyuculariKur() {
        val foto = fotoModu && kaydedici == null
        val fb = if (foto) secilenFotoBoyut() else null
        if (fb == null || jpegOkuyucu?.let { it.width != fb.width || it.height != fb.height } == true) { runCatching { jpegOkuyucu?.close() }; jpegOkuyucu = null }
        if (fb != null && jpegOkuyucu == null) jpegOkuyucu = ImageReader.newInstance(fb.width, fb.height, ImageFormat.JPEG, 2)
        val rawIste = foto && ayar.raw && rawVar && !rawDustu
        if (!rawIste) { runCatching { rawOkuyucu?.close() }; rawOkuyucu = null }
        else if (rawOkuyucu == null) harita?.getOutputSizes(ImageFormat.RAW_SENSOR)?.maxByOrNull { it.width * it.height }?.let { rawOkuyucu = ImageReader.newInstance(it.width, it.height, ImageFormat.RAW_SENSOR, 2) }
    }

    /** Fotoğraf/video modu değişince oturum yeniden kurulur (kayıt sırasında değişmez) */
    fun modDegistir(foto: Boolean, boyut: (Int, Int) -> Unit) { if (kayitta) return; fotoModu = foto; oturumYenile(boyut) }

    /** Telefonun o anki tutuluşuna göre fotoğrafın/videonun dik görünmesi için gereken açı */
    fun cikisYonu(): Int = if (haricimi) 0 else if (onKamera) (sensorYonu + ekranYonu) % 360 else (sensorYonu - ekranYonu + 360) % 360

    /**
     * Görüntüye dokununca odak ve pozlama o noktaya: (u, v) ekranda görünen görüntüye göre 0–1.
     * Görüntü sensöre göre döndürülmüş gösterildiği için önce sensör koordinatına çevrilir; ön kamera aynalıdır.
     */
    fun odakla(u: Float, v: Float, ekranDonusu: Int) {
        odakNoktasi = sensorNoktasi(u, v, ekranDonusu); izliyor = false
        h.post {
            val c = cihaz ?: return@post; val s = oturum ?: return@post
            runCatching {
                val r = c.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW); onizleme?.let { r.addTarget(it) }
                ayarUygula(r, foto = false); r.set(CaptureRequest.CONTROL_AF_TRIGGER, CameraMetadata.CONTROL_AF_TRIGGER_START)
                s.capture(r.build(), null, h)
            }
            istekGonder()
        }
    }
    fun odakSerbest() { odakNoktasi = null; izliyor = false; ayarDegisti() }

    /** Ekrandaki (u, v) → sensör koordinatı. Ekrandaki dönüş = sensör yönü + ekranın kendi dönüşü (dikey kilitli ekranda 0) */
    private fun sensorNoktasi(u: Float, v: Float, ekranDonusu: Int): android.graphics.PointF {
        val d = ((if (onKamera) sensorYonu + ekranDonusu else sensorYonu - ekranDonusu) % 360 + 360) % 360
        val uu = if (onKamera) 1f - u else u
        return when (d) { 90 -> android.graphics.PointF(v, 1f - uu); 180 -> android.graphics.PointF(1f - uu, 1f - v); 270 -> android.graphics.PointF(1f - v, uu); else -> android.graphics.PointF(uu, v) }
    }

    /** Seçili konuyu izle (AI Kadraj): odak ve pozlama bölgesi konuyla gider; sürekli odakta kalır, tetik yok (avlanmasın) */
    @Volatile private var izliyor = false
    fun konuIzle(u: Float, v: Float, ekranDonusu: Int) {
        odakNoktasi = sensorNoktasi(u, v, ekranDonusu); izliyor = true
        h.post { istekGonder() }
    }

    private fun bolge(p: android.graphics.PointF): Array<android.hardware.camera2.params.MeteringRectangle> {
        val a = oz.get(CameraCharacteristics.SENSOR_INFO_ACTIVE_ARRAY_SIZE) ?: return emptyArray()
        val w = a.width(); val hh = a.height(); val yari = (minOf(w, hh) * 0.08f).toInt()
        val x = (p.x * w).toInt().coerceIn(yari, w - yari); val y = (p.y * hh).toInt().coerceIn(yari, hh - yari)
        return arrayOf(android.hardware.camera2.params.MeteringRectangle(x - yari, y - yari, yari * 2, yari * 2, 900))
    }

    /** Ayarları (pozlama, ISO, beyaz dengesi, odak, sabitleme) bir isteğe uygular */
    private fun ayarUygula(r: CaptureRequest.Builder, foto: Boolean) {
        pro?.let { (m, a) -> return proUygula(r, foto, m, a) }
        ayar.fps?.let { if (!foto) r.set(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE, it) }
        val elle = ayar.iso != null || ayar.pozlamaNs != null
        if (elle && yetenek.elleKontrol) {
            r.set(CaptureRequest.CONTROL_AE_MODE, CameraMetadata.CONTROL_AE_MODE_OFF)
            val istenen = ayar.pozlamaNs ?: 1_000_000_000L / 50
            var poz = yetenek.pozlamaAralik?.let { istenen.coerceIn(it.lower, it.upper) } ?: istenen
            // ISO otomatikse son otomatik ölçümün ışığı korunur
            var iso = ayar.iso ?: (if (ayar.uzunOnizleme > 0 && otoIsoNs > 0) (otoIsoNs / istenen).toInt() else null) ?: yetenek.isoAralik?.lower?.coerceAtLeast(100) ?: 100
            if (!foto && ayar.uzunOnizleme > 0 && poz > ONIZLEME_EN_UZUN) {
                if (ayar.uzunOnizleme == 1) iso = (iso.toDouble() * istenen / ONIZLEME_EN_UZUN).toInt()
                poz = ONIZLEME_EN_UZUN
            }
            yetenek.isoAralik?.let { iso = iso.coerceIn(it.lower, it.upper) }
            r.set(CaptureRequest.SENSOR_SENSITIVITY, iso)
            r.set(CaptureRequest.SENSOR_EXPOSURE_TIME, poz)
            if (foto) r.set(CaptureRequest.SENSOR_FRAME_DURATION, poz) // uzun pozlama: kare süresi pozlama kadar
            else ayar.fps?.let { r.set(CaptureRequest.SENSOR_FRAME_DURATION, maxOf(poz, 1_000_000_000L / it.upper)) }
        } else {
            r.set(CaptureRequest.CONTROL_AE_MODE, CameraMetadata.CONTROL_AE_MODE_ON)
            r.set(CaptureRequest.CONTROL_AE_EXPOSURE_COMPENSATION, ayar.ev)
            r.set(CaptureRequest.CONTROL_AE_LOCK, pozKilit)
        }
        val donusum = sonDonusum; val kelvin = ayar.kelvin
        if (kelvin != null && elleBdVar && donusum != null) {
            r.set(CaptureRequest.CONTROL_AWB_MODE, CameraMetadata.CONTROL_AWB_MODE_OFF)
            r.set(CaptureRequest.COLOR_CORRECTION_MODE, CameraMetadata.COLOR_CORRECTION_MODE_TRANSFORM_MATRIX)
            r.set(CaptureRequest.COLOR_CORRECTION_GAINS, BeyazDenge.kazanc(oz, kelvin, ayar.ton, sonKazanc))
            r.set(CaptureRequest.COLOR_CORRECTION_TRANSFORM, donusum)
        } else {
            r.set(CaptureRequest.CONTROL_AWB_MODE, if (kelvin != null) CameraMetadata.CONTROL_AWB_MODE_AUTO else ayar.awb)
            if (ayar.awb == CameraMetadata.CONTROL_AWB_MODE_AUTO) r.set(CaptureRequest.CONTROL_AWB_LOCK, pozKilit)
        }
        if (ayar.odakMesafe != null && yetenek.minOdak > 0f) { r.set(CaptureRequest.CONTROL_AF_MODE, CameraMetadata.CONTROL_AF_MODE_OFF); r.set(CaptureRequest.LENS_FOCUS_DISTANCE, ayar.odakMesafe!!) }
        else if (odakNoktasi != null) {
            val b = bolge(odakNoktasi!!)
            r.set(CaptureRequest.CONTROL_AF_MODE, if (!izliyor) CameraMetadata.CONTROL_AF_MODE_AUTO else if (fotoModu) CameraMetadata.CONTROL_AF_MODE_CONTINUOUS_PICTURE else CameraMetadata.CONTROL_AF_MODE_CONTINUOUS_VIDEO)
            if ((oz.get(CameraCharacteristics.CONTROL_MAX_REGIONS_AF) ?: 0) > 0) r.set(CaptureRequest.CONTROL_AF_REGIONS, b)
            if ((oz.get(CameraCharacteristics.CONTROL_MAX_REGIONS_AE) ?: 0) > 0) r.set(CaptureRequest.CONTROL_AE_REGIONS, b)
        }
        else r.set(CaptureRequest.CONTROL_AF_MODE, if (fotoModu) CameraMetadata.CONTROL_AF_MODE_CONTINUOUS_PICTURE else CameraMetadata.CONTROL_AF_MODE_CONTINUOUS_VIDEO)
        ayar.diyafram?.takeIf { diyaframlar.size > 1 && diyaframlar.any { d -> d == it } }?.let { r.set(CaptureRequest.LENS_APERTURE, it) }
        // Yakınlaştırma (Android 11+: lensler arası geçiş dahil; .5 geniş açı telefon destekliyorsa)
        if (android.os.Build.VERSION.SDK_INT >= 30) zoomAralik?.let { z -> r.set(CaptureRequest.CONTROL_ZOOM_RATIO, ayar.zoomOrani.coerceIn(z.lower, z.upper)) }
        // Flaş: yalnız otomatik pozlamada
        if (flasVar && !(elle && yetenek.elleKontrol)) when (ayar.flas) {
            1 -> r.set(CaptureRequest.CONTROL_AE_MODE, CameraMetadata.CONTROL_AE_MODE_ON_AUTO_FLASH)
            2 -> r.set(CaptureRequest.CONTROL_AE_MODE, CameraMetadata.CONTROL_AE_MODE_ON_ALWAYS_FLASH)
            3 -> { r.set(CaptureRequest.CONTROL_AE_MODE, CameraMetadata.CONTROL_AE_MODE_ON); r.set(CaptureRequest.FLASH_MODE, CameraMetadata.FLASH_MODE_TORCH) }
            else -> r.set(CaptureRequest.FLASH_MODE, CameraMetadata.FLASH_MODE_OFF)
        }
        r.set(CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE, when {
            foto || fotoModu || ayar.sabit !in sabitlemeler -> CameraMetadata.CONTROL_VIDEO_STABILIZATION_MODE_OFF
            ayar.sabit == 2 && android.os.Build.VERSION.SDK_INT >= 33 -> CameraMetadata.CONTROL_VIDEO_STABILIZATION_MODE_PREVIEW_STABILIZATION
            ayar.sabit >= 1 -> CameraMetadata.CONTROL_VIDEO_STABILIZATION_MODE_ON
            else -> CameraMetadata.CONTROL_VIDEO_STABILIZATION_MODE_OFF
        })
        sahneUygula(r, foto)
    }

    /**
     * PRO MODLAR: ISO ve enstantane ikisi de seçiliyse tam el ile; biri AUTO ise önizleme otomatik pozlamada kalır, çekimde son ölçümden
     * öteki hesaplanır (enstantane/ISO önceliği; modun ISO ve enstantane üst sınırıyla). Uzun pozlamada önizleme donmasın diye
     * önizleme 1/10 sn'de, aynı parlaklık için ISO artırılarak gösterilir.
     */
    private fun proUygula(r: CaptureRequest.Builder, foto: Boolean, m: ProMod, a: ProAyar) {
        val y = yetenek; val isoA = y.isoAralik; val pozA = y.pozlamaAralik
        if (android.os.Build.VERSION.SDK_INT >= 30) zoomAralik?.let { z -> r.set(CaptureRequest.CONTROL_ZOOM_RATIO, ayar.zoomOrani.coerceIn(z.lower, z.upper)) }
        if (flasVar) r.set(CaptureRequest.FLASH_MODE, CameraMetadata.FLASH_MODE_OFF)
        r.set(CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE, CameraMetadata.CONTROL_VIDEO_STABILIZATION_MODE_OFF)
        var iso: Int? = null; var ns: Long? = null
        if (y.elleKontrol && isoA != null && pozA != null) {
            val olcum = otoIsoNs
            when {
                a.iso != null && a.enstNs != null -> { iso = a.iso; ns = a.enstNs }
                foto && olcum > 0 && a.enstNs != null -> { ns = a.enstNs.coerceIn(pozA.lower, pozA.upper); iso = minOf((olcum / ns).toInt(), m.isoUst ?: Int.MAX_VALUE) }
                foto && olcum > 0 && a.iso != null -> { iso = a.iso.coerceIn(isoA.lower, isoA.upper); ns = minOf((olcum / iso).toLong(), m.enstUstNs ?: Long.MAX_VALUE) }
            }
            if (iso != null && ns != null) {
                ns = ns.coerceIn(pozA.lower, pozA.upper)
                if (!foto && ns > ONIZLEME_EN_UZUN) { iso = (iso.toDouble() * ns / ONIZLEME_EN_UZUN).toInt(); ns = ONIZLEME_EN_UZUN }
                iso = iso.coerceIn(isoA.lower, isoA.upper)
            }
        }
        if (iso != null && ns != null) {
            r.set(CaptureRequest.CONTROL_AE_MODE, CameraMetadata.CONTROL_AE_MODE_OFF)
            r.set(CaptureRequest.SENSOR_SENSITIVITY, iso); r.set(CaptureRequest.SENSOR_EXPOSURE_TIME, ns)
            r.set(CaptureRequest.SENSOR_FRAME_DURATION, if (foto) ns else maxOf(ns, 1_000_000_000L / 30))
        } else {
            r.set(CaptureRequest.CONTROL_AE_MODE, CameraMetadata.CONTROL_AE_MODE_ON)
            r.set(CaptureRequest.CONTROL_AE_EXPOSURE_COMPENSATION, evAdimi(a.ev)); r.set(CaptureRequest.CONTROL_AE_LOCK, false)
            // Otomatik pozlamada en uzun enstantane: kare hızının alt sınırı (gece şehirde 1/15 sn, sporda en yüksek sabit kare hızı)
            val fps = when {
                m.seri -> y.fpsler.filter { it.lower == it.upper }.maxByOrNull { it.upper }
                m.enstUstNs != null -> y.fpsler.filter { it.lower >= 1_000_000_000L / m.enstUstNs }.minByOrNull { it.lower }
                else -> null
            }
            fps?.let { r.set(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE, it) }
        }
        r.set(CaptureRequest.CONTROL_AWB_MODE, if (a.bd in y.awbModlari) a.bd else CameraMetadata.CONTROL_AWB_MODE_AUTO)
        val mesafe = when (a.odak) { ProAyar.ODAK_SONSUZ -> 0f; ProAyar.ODAK_2M -> 0.5f; else -> null } // diyoptri (1/m)
        if (mesafe != null && y.minOdak >= mesafe && y.minOdak > 0f) { r.set(CaptureRequest.CONTROL_AF_MODE, CameraMetadata.CONTROL_AF_MODE_OFF); r.set(CaptureRequest.LENS_FOCUS_DISTANCE, mesafe) }
        else if (a.odak == ProAyar.ODAK_OTO && odakNoktasi != null) {
            r.set(CaptureRequest.CONTROL_AF_MODE, if (izliyor) CameraMetadata.CONTROL_AF_MODE_CONTINUOUS_PICTURE else CameraMetadata.CONTROL_AF_MODE_AUTO)
            if ((oz.get(CameraCharacteristics.CONTROL_MAX_REGIONS_AF) ?: 0) > 0) r.set(CaptureRequest.CONTROL_AF_REGIONS, bolge(odakNoktasi!!))
        }
        else r.set(CaptureRequest.CONTROL_AF_MODE, CameraMetadata.CONTROL_AF_MODE_CONTINUOUS_PICTURE)
    }

    private fun evAdimi(ev: Float): Int { val adim = yetenek.evAdim.takeIf { it > 0f } ?: return 0; val a = yetenek.evAralik ?: return 0; return Math.round(ev / adim).coerceIn(a.lower, a.upper) }

    /** Sahnenin ayarları: telefonun kendi sahne modu varsa o, yoksa karşılığı el ile */
    private fun sahneUygula(r: CaptureRequest.Builder, foto: Boolean) {
        fun mod(m: Int): Boolean { if (!sahneModuVar(m)) return false; r.set(CaptureRequest.CONTROL_MODE, CameraMetadata.CONTROL_MODE_USE_SCENE_MODE); r.set(CaptureRequest.CONTROL_SCENE_MODE, m); return true }
        fun awb(m: Int) { if (m in yetenek.awbModlari) r.set(CaptureRequest.CONTROL_AWB_MODE, m) }
        fun sonsuz() { if (yetenek.minOdak > 0f) { r.set(CaptureRequest.CONTROL_AF_MODE, CameraMetadata.CONTROL_AF_MODE_OFF); r.set(CaptureRequest.LENS_FOCUS_DISTANCE, 0f) } }
        when (sahne) {
            Sahne.KAPALI -> {}
            Sahne.GUN_BATIMI -> if (!mod(CameraMetadata.CONTROL_SCENE_MODE_SUNSET)) { awb(CameraMetadata.CONTROL_AWB_MODE_CLOUDY_DAYLIGHT); r.set(CaptureRequest.CONTROL_AE_EXPOSURE_COMPENSATION, evAdimi(-0.7f)) }
            Sahne.SPOR -> if (!mod(CameraMetadata.CONTROL_SCENE_MODE_SPORTS)) {
                // Sabit yüksek kare hızı: otomatik pozlama enstantaneyi kısa tutmak zorunda kalır
                yetenek.fpsler.filter { it.lower == it.upper }.maxByOrNull { it.upper }?.let { if (!foto) r.set(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE, it) } }
            Sahne.PORTRE -> { if (!mod(CameraMetadata.CONTROL_SCENE_MODE_PORTRAIT)) mod(CameraMetadata.CONTROL_SCENE_MODE_FACE_PRIORITY) }
            Sahne.MANZARA -> mod(CameraMetadata.CONTROL_SCENE_MODE_LANDSCAPE)
            Sahne.GECE -> mod(CameraMetadata.CONTROL_SCENE_MODE_NIGHT)
            Sahne.ISIK_IZI -> r.set(CaptureRequest.CONTROL_AE_EXPOSURE_COMPENSATION, evAdimi(-0.3f))
            Sahne.SAMANYOLU -> {
                sonsuz(); awb(CameraMetadata.CONTROL_AWB_MODE_FLUORESCENT) // ≈ 4000 K: gece göğü
                if (foto && uzunPozlamaVar) {
                    val poz = minOf(yetenek.pozlamaAralik!!.upper, 15_000_000_000L)
                    r.set(CaptureRequest.CONTROL_AE_MODE, CameraMetadata.CONTROL_AE_MODE_OFF)
                    r.set(CaptureRequest.SENSOR_SENSITIVITY, yetenek.isoAralik?.let { minOf(3200, it.upper) } ?: 1600)
                    r.set(CaptureRequest.SENSOR_EXPOSURE_TIME, poz); r.set(CaptureRequest.SENSOR_FRAME_DURATION, poz)
                } else {
                    r.set(CaptureRequest.CONTROL_AE_MODE, CameraMetadata.CONTROL_AE_MODE_ON)
                    yetenek.evAralik?.let { r.set(CaptureRequest.CONTROL_AE_EXPOSURE_COMPENSATION, it.upper) }
                    yetenek.fpsler.minByOrNull { it.lower }?.let { r.set(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE, it) } // karede en uzun pozlama
                }
            }
        }
    }

    /**
     * Fotoğraf çeker: JPEG (ve RAW açıksa DNG). `kaydet(dosyaAdı, mime, yaz)` dosyayı galeriye yazar, başarıyı döndürür.
     * `sonuc` her dosya yazıldıktan sonra bir kez çağrılır: hata yoksa null.
     */
    private var cekimNo = 0
    fun fotoCek(kaydet: (String, String, (OutputStream) -> Unit) -> Boolean, sonuc: (String?) -> Unit) {
        h.post {
            val c = cihaz; val s = oturum; val jr = jpegOkuyucu
            if (c == null || s == null || jr == null) { sonuc("Kamera fotoğrafa hazır değil."); return@post }
            // Önceki çekim bitmeden yeni basış sessizce yutulmasın (deklanşör "basmıyor" gibi görünüyordu)
            if (cekiliyor) { sonuc("Önceki fotoğraf kaydediliyor, bir an bekle."); return@post }
            cekiliyor = true
            val no = ++cekimNo
            val ad = "UPDATED_" + java.text.SimpleDateFormat("yyyyMMdd_HHmmss", java.util.Locale.US).format(java.util.Date())
            val rr = rawOkuyucu; val yon = cikisYonu()
            var bekleyen = if (rr != null) 2 else 1; var hata: String? = null
            var tamam = false
            fun bitti(e: String?) { if (tamam) return; if (e != null && hata == null) hata = e; if (--bekleyen == 0) { tamam = true; cekiliyor = false; sonuc(hata) } }
            // Güvenlik: kamera kareyi hiç vermezse (sürücü takılması) deklanşör kilitli kalmasın
            val sure = 6000L + ((ayar.pozlamaNs ?: 0L) / 1_000_000L).coerceAtMost(60_000L)
            h.postDelayed({ if (!tamam && cekimNo == no) { tamam = true; cekiliyor = false; HataKaydi.not("foto", "zaman aşımı"); sonuc("Fotoğraf alınamadı, tekrar dene.") } }, sure)
            jr.setOnImageAvailableListener({ r ->
                val img = runCatching { r.acquireNextImage() }.getOrNull() ?: return@setOnImageAvailableListener
                val b0 = try { val buf = img.planes[0].buffer; ByteArray(buf.remaining()).also { buf.get(it) } } catch (e: Exception) { bitti("JPEG: ${e.message}"); null } finally { img.close() }
                // Renk işleme ve kaydetme kamera iş parçacığının dışında: büyük fotoğrafta önizleme donmasın
                if (b0 != null) { val isle = jpegIsle; Thread({
                    val e = try { val b = isle?.invoke(b0) ?: b0; if (kaydet("$ad.jpg", "image/jpeg") { it.write(b) }) null else "JPEG kaydedilemedi." } catch (t: Throwable) { "JPEG: ${t.message}" }
                    h.post { bitti(e) } }, "foto-kaydet").start() }
            }, h)
            var meta: TotalCaptureResult? = null; var rawImg: Image? = null
            fun dng() {
                val m = meta ?: return; val im = rawImg ?: return; rawImg = null
                try {
                    val d = DngCreator(oz, m).setOrientation(when (yon) { 90 -> ExifInterface.ORIENTATION_ROTATE_90; 180 -> ExifInterface.ORIENTATION_ROTATE_180; 270 -> ExifInterface.ORIENTATION_ROTATE_270; else -> ExifInterface.ORIENTATION_NORMAL })
                    val ok = kaydet("$ad.dng", "image/x-adobe-dng") { d.writeImage(it, im) }; d.close(); bitti(if (ok) null else "RAW kaydedilemedi.")
                } catch (e: Exception) { bitti("RAW: ${e.message}"); HataKaydi.not("foto", e.stackTraceToString()) } finally { im.close() }
            }
            rr?.setOnImageAvailableListener({ r -> rawImg = runCatching { r.acquireNextImage() }.getOrNull(); dng() }, h)
            fun cek() = try {
                val r = c.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE)
                r.addTarget(jr.surface); rr?.let { r.addTarget(it.surface) }; onizleme?.let { r.addTarget(it) }
                ayarUygula(r, foto = true)
                r.set(CaptureRequest.JPEG_ORIENTATION, yon); r.set(CaptureRequest.JPEG_QUALITY, 95.toByte())
                s.capture(r.build(), object : CameraCaptureSession.CaptureCallback() {
                    override fun onCaptureCompleted(ss: CameraCaptureSession, q: CaptureRequest, t: TotalCaptureResult) { meta = t; if (rr != null) dng() }
                    override fun onCaptureFailed(ss: CameraCaptureSession, q: CaptureRequest, f: android.hardware.camera2.CaptureFailure) { bekleyen = 1; bitti("Çekim başarısız oldu.") }
                }, h)
            } catch (e: Exception) { tamam = true; cekiliyor = false; sonuc(e.message ?: "Çekim başarısız."); HataKaydi.not("foto", e.stackTraceToString()) }
            // Flaş açık/otomatik: önce pozlama ölçümü (ön flaş), ölçüm bitince ya da 1,5 sn sonra çekim
            val flasli = flasVar && ayar.flas in 1..2 && ayar.iso == null && ayar.pozlamaNs == null && pro == null
            if (!flasli) cek()
            else runCatching {
                var bitti = false
                fun devam() { if (bitti) return; bitti = true; olcumBekleyen = null; cek() }
                val r = c.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW); onizleme?.let { r.addTarget(it) }
                ayarUygula(r, foto = false); r.set(CaptureRequest.CONTROL_AE_PRECAPTURE_TRIGGER, CameraMetadata.CONTROL_AE_PRECAPTURE_TRIGGER_START)
                var basladi = false
                olcumBekleyen = { durum ->
                    if (durum == CameraMetadata.CONTROL_AE_STATE_PRECAPTURE) basladi = true
                    else if (basladi && (durum == CameraMetadata.CONTROL_AE_STATE_CONVERGED || durum == CameraMetadata.CONTROL_AE_STATE_FLASH_REQUIRED)) devam()
                }
                s.capture(r.build(), olcumGeri, h)
                h.postDelayed({ devam() }, 1500)
            }.onFailure { cek() }
        }
    }

    /** El ile ayarları uygular (oturumu kapatmadan) */
    fun istekGonder() {
        val c = cihaz ?: return; val s = oturum ?: return
        try {
            val r = c.createCaptureRequest(if (kaydedici != null) CameraDevice.TEMPLATE_RECORD else CameraDevice.TEMPLATE_PREVIEW)
            onizleme?.let { r.addTarget(it) }; kaydedici?.surface?.let { r.addTarget(it) }
            ayarUygula(r, foto = false)
            s.setRepeatingRequest(r.build(), olcumGeri, h)
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
                val m = MediaRecorder(ctx); val hdr = hdrAcik
                if (ses) {
                    m.setAudioSource(MediaRecorder.AudioSource.CAMCORDER)
                    sesGirisi(ctx, ayar.sesGirdi)?.let { m.setPreferredDevice(it) }
                }
                m.setVideoSource(MediaRecorder.VideoSource.SURFACE)
                m.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                m.setOutputFile(dosya.fileDescriptor)
                m.setVideoEncoder(if (hevc || hdr) MediaRecorder.VideoEncoder.HEVC else MediaRecorder.VideoEncoder.H264)
                if (hdr) m.setVideoEncodingProfileLevel(android.media.MediaCodecInfo.CodecProfileLevel.HEVCProfileMain10, android.media.MediaCodecInfo.CodecProfileLevel.HEVCMainTierLevel51)
                m.setVideoSize(b.width, b.height); m.setVideoFrameRate(fps); m.setVideoEncodingBitRate(mbps * 1_000_000)
                if (ses) { m.setAudioEncoder(MediaRecorder.AudioEncoder.AAC); m.setAudioSamplingRate(48000); m.setAudioEncodingBitRate(256_000); m.setAudioChannels(2) }
                // Oynatıcı videoyu, telefon kayıt anında nasıl tutulduysa öyle dik göstersin
                m.setOrientationHint(cikisYonu())
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
            runCatching { jpegOkuyucu?.close() }; runCatching { rawOkuyucu?.close() }; jpegOkuyucu = null; rawOkuyucu = null
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

/** Ses girişleri (telefon mikrofonu, USB, kablolu, Bluetooth): (id, ad, harici mi) */
fun sesGirisleri(ctx: Context): List<Triple<Int, String, Boolean>> {
    val am = ctx.getSystemService(Context.AUDIO_SERVICE) as android.media.AudioManager
    return am.getDevices(android.media.AudioManager.GET_DEVICES_INPUTS).mapNotNull { d ->
        val (tur, harici) = when (d.type) {
            android.media.AudioDeviceInfo.TYPE_BUILTIN_MIC -> "Telefon mikrofonu" to false
            android.media.AudioDeviceInfo.TYPE_USB_DEVICE, android.media.AudioDeviceInfo.TYPE_USB_HEADSET -> "USB" to true
            android.media.AudioDeviceInfo.TYPE_WIRED_HEADSET -> "Kablolu mikrofon" to true
            android.media.AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> "Bluetooth" to true
            else -> if (android.os.Build.VERSION.SDK_INT >= 31 && d.type == android.media.AudioDeviceInfo.TYPE_BLE_HEADSET) "Bluetooth LE" to true else return@mapNotNull null
        }
        val ad = d.productName?.toString()?.takeIf { it.isNotBlank() && harici && it != android.os.Build.MODEL }?.let { "$tur · $it" } ?: tur
        Triple(d.id, ad, harici)
    }.distinctBy { it.second }
}

/** Kayıtta kullanılacak giriş: seçilen (takılıysa), yoksa takılı harici mikrofon, yoksa null (telefonun kendi seçimi) */
fun sesGirisi(ctx: Context, secilen: Int?): android.media.AudioDeviceInfo? {
    val am = ctx.getSystemService(Context.AUDIO_SERVICE) as android.media.AudioManager
    val hepsi = am.getDevices(android.media.AudioManager.GET_DEVICES_INPUTS)
    secilen?.let { id -> hepsi.firstOrNull { it.id == id }?.let { return it } }
    val harici = sesGirisleri(ctx).firstOrNull { it.third } ?: return null
    return hepsi.firstOrNull { it.id == harici.first }
}
