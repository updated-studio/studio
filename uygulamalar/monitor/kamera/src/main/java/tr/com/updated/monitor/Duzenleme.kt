package tr.com.updated.monitor

import android.content.ContentValues
import android.content.Context
import android.graphics.Color
import android.net.Uri
import android.opengl.GLES20
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import androidx.annotation.OptIn
import androidx.media3.common.Effect
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.GlProgram
import androidx.media3.common.util.GlUtil
import androidx.media3.common.util.Size
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.BaseGlShaderProgram
import androidx.media3.effect.GlEffect
import androidx.media3.effect.GlShaderProgram
import androidx.media3.effect.OverlaySettings
import androidx.media3.effect.VideoCompositorSettings
import androidx.media3.effect.SingleColorLut
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.ProgressHolder
import androidx.media3.transformer.Transformer
import java.io.File

/**
 * Kayıt sonrası düzenleme (Fatih 29 Ekim: "iPhone 17 Pro'daki gibi düzenleme ve gürültü giderme"): kırpma, stil/LUT (yoğunlukla),
 * gürültü giderme. Sonuç yeni dosya olarak galeriye gider (Movies/UPDATED Kamera), özgün video kalır. Aynı kodek, aynı boyut.
 * Yalnız kırpma varsa Media3 anahtar kare sınırında yeniden kodlamadan keser (hızlı).
 */
class Duzen(
    val kaynak: Uri,
    /** Kırpma (mikrosaniye); son null: videonun sonu */
    val basUs: Long = 0, val sonUs: Long? = null,
    val lut: Lut? = null,
    /** LUT yoğunluğu 0–1 (0: özgün renk) */
    val yogunluk: Float = 1f,
    /** Gürültü giderme: 0 kapalı, 1 hafif, 2 orta, 3 güçlü */
    val gurultu: Int = 0,
    val hevc: Boolean = true,
) {
    val etkiVar get() = (lut != null && yogunluk > 0f) || gurultu > 0
    val kirpmaVar get() = basUs > 0 || sonUs != null
    init { require(basUs >= 0 && (sonUs == null || sonUs > basUs)) { "Kırpma aralığı geçersiz" }; require(gurultu in 0..3) }
}

object DuzenMotoru {
    /** LUT küpü yoğunlukla: özgün renk ile LUT çıktısı arasında doğrusal karışım (SingleColorLut'un sırası: [r][g][b]) */
    fun kup(lut: Lut, yogunluk: Float): Array<Array<IntArray>> {
        val n = lut.boyut; val k = yogunluk.coerceIn(0f, 1f)
        fun b8(v: Float) = (v.coerceIn(0f, 1f) * 255 + 0.5f).toInt()
        return Array(n) { r -> Array(n) { g -> IntArray(n) { b ->
            val i = ((b * n + g) * n + r) * 3; val o = n - 1f
            Color.rgb(b8(r / o + (lut.veri[i] - r / o) * k), b8(g / o + (lut.veri[i + 1] - g / o) * k), b8(b / o + (lut.veri[i + 2] - b / o) * k))
        } } }
    }

    /** Düzenlenmiş dosyanın adı: "<özgün ad> düzenlendi.mp4" (özgün ad yoksa tarih) */
    fun yeniAd(ozgun: String?, ek: String = "düzenlendi"): String {
        val kok = ozgun?.substringBeforeLast('.')?.takeIf { it.isNotBlank() } ?: "UPDATED ${java.text.SimpleDateFormat("yyyyMMdd-HHmmss", java.util.Locale.US).format(java.util.Date())}"
        return "$kok $ek.mp4"
    }

    @OptIn(UnstableApi::class)
    fun etkiler(d: Duzen): List<Effect> = buildList {
        if (d.gurultu > 0) add(GurultuGiderme(d.gurultu))
        if (d.lut != null && d.yogunluk > 0f) add(SingleColorLut.createFromCube(kup(d.lut, d.yogunluk)))
    }

    /**
     * Dışa aktarma: `looper` iş parçacığında (VideoIsleme hizmeti). `ilerleme` 0–100; `bitti(yeni uri ya da null)`. Başlamazsa null döner.
     * Önce önbellekteki geçici dosyaya yazılır, sonra galeriye (IS_PENDING) kopyalanıp görünür yapılır.
     */
    @OptIn(UnstableApi::class)
    fun disaAktar(ctx: Context, d: Duzen, looper: Looper, ilerleme: (Int) -> Unit = {}, bitti: (Uri?) -> Unit): Transformer? {
        val gecici = File(ctx.cacheDir, "duzen-${System.currentTimeMillis()}.mp4")
        val h = Handler(looper)
        return try {
            val oge = MediaItem.Builder().setUri(d.kaynak).apply {
                if (d.kirpmaVar) setClippingConfiguration(MediaItem.ClippingConfiguration.Builder().setStartPositionUs(d.basUs)
                    .apply { d.sonUs?.let { setEndPositionUs(it) } }.build())
            }.build()
            val duzenli = EditedMediaItem.Builder(oge).setEffects(Effects(emptyList(), etkiler(d))).build()
            var surer = true
            val t = Transformer.Builder(ctx).setLooper(looper)
                .setVideoMimeType(if (d.hevc) MimeTypes.VIDEO_H265 else MimeTypes.VIDEO_H264)
                .experimentalSetTrimOptimizationEnabled(d.kirpmaVar && !d.etkiVar)
                .addListener(object : Transformer.Listener {
                    override fun onCompleted(c: Composition, s: ExportResult) { surer = false; bitti(yayinla(ctx, d.kaynak, gecici)); gecici.delete() }
                    override fun onError(c: Composition, s: ExportResult, e: ExportException) {
                        surer = false; HataKaydi.not("duzen", e.stackTraceToString()); gecici.delete(); bitti(null)
                    }
                }).build()
            h.post { t.start(duzenli, gecici.absolutePath) }
            val tutucu = ProgressHolder()
            h.post(object : Runnable { override fun run() {
                if (!surer) return
                if (t.getProgress(tutucu) == Transformer.PROGRESS_STATE_AVAILABLE) ilerleme(tutucu.progress)
                h.postDelayed(this, 500)
            } })
            t
        } catch (e: Exception) { HataKaydi.not("duzen", e.stackTraceToString()); gecici.delete(); null }
    }

    /** Vlog birleşik videosu: girdi 0 ön kamera (üstte çizilir), girdi 1 arka kamera (zemin; çıkış boyutu ve ses ondan) */
    const val VLOG_PENCERE = 0.28f; const val VLOG_KENAR = 0.04f
    @OptIn(UnstableApi::class)
    class VlogDuzeni : VideoCompositorSettings {
        @Volatile private var tuval = Size(1920, 1080); @Volatile private var pencere = Size(1280, 720)
        override fun getOutputSize(boyutlar: List<Size>): Size { pencere = boyutlar[0]; tuval = boyutlar.getOrElse(1) { boyutlar[0] }; return tuval }
        override fun getOverlaySettings(girdi: Int, us: Long): OverlaySettings {
            if (girdi != 0) return OverlaySettings.Builder().build()
            // Ön pencere: zemin genişliğinin %28'i, sağ alt köşede, kenarlardan genişliğin %4'ü kadar içeride
            val o = VLOG_PENCERE * tuval.width / pencere.width
            return OverlaySettings.Builder().setScale(o, o).setOverlayFrameAnchor(1f, -1f)
                .setBackgroundFrameAnchor(1f - 2 * VLOG_KENAR, -1f + 2 * VLOG_KENAR * tuval.width / tuval.height).build()
        }
    }

    /**
     * Birleşik vlog'un bit hızı (iPhone MasaKayit ile aynı kural): HEVC ≈ 0,12 bit/piksel, H.264 bunun ~1,6 katı; en az 16 Mbit.
     * Boyut ve kare hızı arka kamera dosyasından (okunamazsa 1080p 30).
     */
    private fun vlogBitHizi(ctx: Context, arka: Uri, hevc: Boolean): Int {
        val m = android.media.MediaMetadataRetriever()
        val (w, h, fps) = runCatching {
            m.setDataSource(ctx, arka)
            fun oku(k: Int) = m.extractMetadata(k)?.toFloatOrNull()
            Triple(oku(android.media.MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH) ?: 1920f, oku(android.media.MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT) ?: 1080f,
                // Kare hızı: kare sayısı / süre (CAPTURE_FRAMERATE çoğu dosyada yok)
                (oku(android.media.MediaMetadataRetriever.METADATA_KEY_VIDEO_FRAME_COUNT)?.let { n -> oku(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION)?.takeIf { it > 0f }?.let { n * 1000f / it } }
                    ?: oku(android.media.MediaMetadataRetriever.METADATA_KEY_CAPTURE_FRAMERATE) ?: 30f).coerceIn(24f, 60f))
        }.getOrDefault(Triple(1920f, 1080f, 30f)).also { runCatching { m.release() } }
        val bpp = if (hevc) 0.12f else 0.19f
        return maxOf(16_000_000, (w * h * fps * bpp).toInt())
    }

    /** Vlog: arka ve ön kamera dosyalarından birleşik video ("<ad> vlog.mp4"); iki özgün dosya kalır. `disaAktar` gibi çalışır */
    @OptIn(UnstableApi::class)
    fun vlogBirlestir(ctx: Context, arka: Uri, on: Uri, hevc: Boolean, looper: Looper, ilerleme: (Int) -> Unit = {}, dizin: Uri? = null, bitti: (Uri?) -> Unit): Transformer? {
        val gecici = File(ctx.cacheDir, "vlog-${System.currentTimeMillis()}.mp4")
        val h = Handler(looper)
        return try {
            val c = Composition.Builder(
                EditedMediaItemSequence(EditedMediaItem.Builder(MediaItem.fromUri(on)).setRemoveAudio(true).build()),
                EditedMediaItemSequence(EditedMediaItem.Builder(MediaItem.fromUri(arka)).build()))
                .setVideoCompositorSettings(VlogDuzeni()).build()
            var surer = true
            val t = Transformer.Builder(ctx).setLooper(looper)
                .setVideoMimeType(if (hevc) MimeTypes.VIDEO_H265 else MimeTypes.VIDEO_H264)
                .setEncoderFactory(androidx.media3.transformer.DefaultEncoderFactory.Builder(ctx).setRequestedVideoEncoderSettings(
                    androidx.media3.transformer.VideoEncoderSettings.Builder().setBitrate(vlogBitHizi(ctx, arka, hevc)).build()).build())
                .addListener(object : Transformer.Listener {
                    override fun onCompleted(c: Composition, s: ExportResult) { surer = false; bitti(yayinla(ctx, arka, gecici, "vlog", dizin)); gecici.delete() }
                    override fun onError(c: Composition, s: ExportResult, e: ExportException) {
                        surer = false; HataKaydi.not("vlog", e.stackTraceToString()); gecici.delete(); bitti(null)
                    }
                }).build()
            h.post { t.start(c, gecici.absolutePath) }
            val tutucu = ProgressHolder()
            h.post(object : Runnable { override fun run() {
                if (!surer) return
                if (t.getProgress(tutucu) == Transformer.PROGRESS_STATE_AVAILABLE) ilerleme(tutucu.progress)
                h.postDelayed(this, 500)
            } })
            t
        } catch (e: Exception) { HataKaydi.not("vlog", e.stackTraceToString()); gecici.delete(); null }
    }

    /** Geçici dosyayı galeriye yeni video olarak koyar (özgünün yanına; `dizin` verildiyse diskteki o klasöre); olmazsa null */
    private fun yayinla(ctx: Context, ozgun: Uri, dosya: File, ek: String = "düzenlendi", dizin: Uri? = null): Uri? = runCatching {
        val r = ctx.contentResolver
        val ad = runCatching { r.query(ozgun, arrayOf(MediaStore.Video.Media.DISPLAY_NAME), null, null, null)?.use { if (it.moveToFirst()) it.getString(0) else null } }.getOrNull()
        val diskte = dizin?.let { d -> runCatching {
            val u = android.provider.DocumentsContract.createDocument(r, d, "video/mp4", yeniAd(ad, ek))!!
            r.openOutputStream(u, "w")!!.use { o -> dosya.inputStream().use { it.copyTo(o, 1 shl 20) } }
            u
        }.onFailure { HataKaydi.not("disk", "birleşik video diske yazılamadı: ${it.message}") }.getOrNull() }
        if (diskte != null) return@runCatching diskte
        val v = ContentValues().apply {
            put(MediaStore.Video.Media.DISPLAY_NAME, yeniAd(ad, ek)); put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
            put(MediaStore.Video.Media.RELATIVE_PATH, "Movies/UPDATED Kamera"); put(MediaStore.Video.Media.IS_PENDING, 1)
        }
        val u = r.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, v)!!
        try {
            r.openOutputStream(u, "w")!!.use { o -> dosya.inputStream().use { it.copyTo(o, 1 shl 20) } }
            r.update(u, ContentValues().apply { put(MediaStore.Video.Media.IS_PENDING, 0) }, null, null)
        } catch (e: Exception) { r.delete(u, null, null); throw e }
        u
    }.onFailure { HataKaydi.not("duzen", "galeriye yazılamadı: ${it.message}") }.getOrNull()
}

/**
 * GPU gürültü giderme (Media3 efekti): önce uzamsal (kenarı koruyan 5×5 iki yönlü süzgeç), sonra zamansal (önceki temiz kareyle
 * hareket uyumlu karışım: kare değişmeyen yerde güçlü, hareketli yerde zayıf; iz bırakmaz). Seviye 1–3 süzgeç gücünü belirler.
 * Her kare bir kez çizilir ve kendi dokusunda saklanır (sonraki karenin "önceki"si), sonra çıkışa kopyalanır.
 */
@OptIn(UnstableApi::class)
class GurultuGiderme(val seviye: Int) : GlEffect {
    override fun toGlShaderProgram(context: Context, useHdr: Boolean): GlShaderProgram = Program(seviye, useHdr)

    private class Program(seviye: Int, private val hdr: Boolean) : BaseGlShaderProgram(hdr, 1) {
        // Seviye başına: uzamsal renk eşiği (sigma), zamansal en çok karışım, hareket eşiği
        private val sigma = floatArrayOf(0f, 0.035f, 0.06f, 0.09f)[seviye]
        private val zaman = floatArrayOf(0f, 0.45f, 0.6f, 0.72f)[seviye]
        private val esik = floatArrayOf(0f, 0.03f, 0.045f, 0.06f)[seviye]
        private val suzgec = GlProgram(KOSE, SUZGEC)
        private val kopya = GlProgram(KOSE, KOPYA)
        private var w = 0; private var h = 0
        private val doku = IntArray(2); private val fbo = IntArray(2); private var sira = 0; private var ilk = true

        init {
            for (p in listOf(suzgec, kopya)) p.setBufferAttribute("aKonum", GlUtil.getNormalizedCoordinateBounds(), GlUtil.HOMOGENEOUS_COORDINATE_VECTOR_SIZE)
        }

        override fun configure(inputWidth: Int, inputHeight: Int): Size {
            if (inputWidth != w || inputHeight != h) {
                birak(); w = inputWidth; h = inputHeight
                for (i in 0..1) { doku[i] = GlUtil.createTexture(w, h, hdr); fbo[i] = GlUtil.createFboForTexture(doku[i]) }
                ilk = true
            }
            return Size(w, h)
        }

        override fun drawFrame(inputTexId: Int, presentationTimeUs: Long) {
            val cikis = IntArray(1); GLES20.glGetIntegerv(GLES20.GL_FRAMEBUFFER_BINDING, cikis, 0)
            val yeni = sira; val eski = 1 - sira
            GlUtil.focusFramebufferUsingCurrentContext(fbo[yeni], w, h)
            suzgec.use()
            suzgec.setSamplerTexIdUniform("uKare", inputTexId, 0)
            // İlk karede önceki doku boş (tanımsız içerik): karenin kendisi verilir
            suzgec.setSamplerTexIdUniform("uOnceki", if (ilk) inputTexId else doku[eski], 1)
            suzgec.setFloatsUniform("uAdim", floatArrayOf(1f / w, 1f / h))
            suzgec.setFloatUniform("uSigma", sigma)
            suzgec.setFloatUniform("uZaman", if (ilk) 0f else zaman)
            suzgec.setFloatUniform("uEsik", esik)
            suzgec.bindAttributesAndUniforms()
            GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
            GlUtil.focusFramebufferUsingCurrentContext(cikis[0], w, h)
            kopya.use()
            kopya.setSamplerTexIdUniform("uKare", doku[yeni], 0)
            kopya.bindAttributesAndUniforms()
            GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
            GlUtil.checkGlError()
            sira = eski; ilk = false
        }

        /** Sahne kesildiğinde (sarma, yeni parça) önceki kareyle karışım yeniden başlar */
        override fun flush() { ilk = true; super.flush() }

        private fun birak() { for (i in 0..1) { if (fbo[i] != 0) GlUtil.deleteFbo(fbo[i]); if (doku[i] != 0) GlUtil.deleteTexture(doku[i]); fbo[i] = 0; doku[i] = 0 } }

        override fun release() { super.release(); runCatching { birak(); suzgec.delete(); kopya.delete() } }
    }

    private companion object {
        const val KOSE = """
attribute vec4 aKonum;
varying vec2 vDoku;
void main() { gl_Position = aKonum; vDoku = aKonum.xy * 0.5 + 0.5; }
"""
        const val KOPYA = """
precision mediump float;
uniform sampler2D uKare;
varying vec2 vDoku;
void main() { gl_FragColor = texture2D(uKare, vDoku); }
"""
        // Uzamsal: 5×5 iki yönlü (uzaklık + renk farkı ağırlığı). Zamansal: parlaklık farkı eşiğin altındaysa önceki temiz kareye doğru karışım.
        const val SUZGEC = """
precision highp float;
uniform sampler2D uKare;
uniform sampler2D uOnceki;
uniform vec2 uAdim;
uniform float uSigma;
uniform float uZaman;
uniform float uEsik;
varying vec2 vDoku;
float parlak(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
void main() {
    vec3 m = texture2D(uKare, vDoku).rgb;
    vec3 top = vec3(0.0); float agirlik = 0.0;
    float s2 = 2.0 * uSigma * uSigma;
    for (int y = -2; y <= 2; y++) {
        for (int x = -2; x <= 2; x++) {
            vec3 c = texture2D(uKare, vDoku + vec2(float(x), float(y)) * uAdim).rgb;
            vec3 f = c - m;
            float w = exp(-float(x * x + y * y) / 4.5) * exp(-dot(f, f) / s2);
            top += c * w; agirlik += w;
        }
    }
    vec3 uzam = top / agirlik;
    vec3 once = texture2D(uOnceki, vDoku).rgb;
    float fark = abs(parlak(uzam) - parlak(once));
    float k = uZaman * (1.0 - smoothstep(uEsik * 0.5, uEsik * 2.0, fark));
    gl_FragColor = vec4(mix(uzam, once, k), 1.0);
}
"""
    }
}
