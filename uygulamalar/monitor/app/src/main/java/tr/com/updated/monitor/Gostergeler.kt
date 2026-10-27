package tr.com.updated.monitor

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.view.View
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.sqrt

/** Kayıt düğmesi: beyaz halka içinde kırmızı daire; kayıtta kırmızı kare ve nabız. Fotoğraf modunda beyaz deklanşör */
class KayitDugmesi(c: Context) : View(c) {
    var kayitta = false; set(v) { field = v; invalidate() }
    var foto = false; set(v) { field = v; invalidate() }
    var basili = false; set(v) { field = v; invalidate() }
    private val beyaz = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE }
    private val halka = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE; style = Paint.Style.STROKE }
    private val kirmizi = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(230, 40, 40) }
    override fun onDraw(c: Canvas) {
        val r = minOf(width, height) / 2f; val cx = width / 2f; val cy = height / 2f
        halka.strokeWidth = r * 0.1f
        c.drawCircle(cx, cy, r * 0.92f, halka)
        if (foto) { c.drawCircle(cx, cy, r * (if (basili) 0.62f else 0.72f), beyaz); return }
        if (kayitta) {
            val a = (System.currentTimeMillis() / 500 % 2 == 0L); kirmizi.alpha = if (a) 255 else 200
            val s = r * 0.42f; c.drawRoundRect(RectF(cx - s, cy - s, cx + s, cy + s), s * 0.25f, s * 0.25f, kirmizi); postInvalidateDelayed(500)
        } else { kirmizi.alpha = 255; c.drawCircle(cx, cy, r * 0.7f, kirmizi) }
    }
}

/** İki kanal ses göstergesi (dBFS, −60…0): ekolayzer gibi ince dik çizgiler, zeminsiz (görüntünün üstünde durur).
 *  Yanan çizgiler yeşil → sarı (−12) → kırmızı (−3), yanmayanlar çok soluk; tepe noktası kısa süre beyaz çizgiyle kalır. */
class SesGostergesi(c: Context) : View(c) {
    private var duzey = floatArrayOf(-90f, -90f); private val tepe = floatArrayOf(-90f, -90f); private var tepeZaman = longArrayOf(0, 0)
    private val yog = resources.displayMetrics.density
    private val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { strokeCap = Paint.Cap.ROUND; setShadowLayer(2f * yog, 0f, 0f, Color.argb(140, 0, 0, 0)) }
    private val yazi = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(200, 255, 255, 255); textSize = 9f * yog; setShadowLayer(2f * yog, 0f, 1f * yog, Color.argb(200, 0, 0, 0)) }
    private val YESIL = Color.rgb(70, 215, 100); private val SARI = Color.rgb(245, 205, 50); private val KIRMIZI = Color.rgb(235, 60, 45)
    init { setLayerType(LAYER_TYPE_SOFTWARE, null) } // çizgi gölgesi için
    fun ayarla(sol: Float, sag: Float) {
        duzey = floatArrayOf(sol, sag); val s = System.currentTimeMillis()
        for (i in 0..1) if (duzey[i] > tepe[i] || s - tepeZaman[i] > 1500) { tepe[i] = duzey[i]; tepeZaman[i] = s }
        postInvalidate()
    }
    override fun onDraw(c: Canvas) {
        val yaziVar = width > 140 * yog
        val alan = height - (if (yaziVar) 12f * yog else 0f)
        val kanalH = (alan - 4f * yog) / 2f
        val adim = 3.5f * yog; p.strokeWidth = 1.6f * yog
        val n = max(8, ((width - p.strokeWidth) / adim).toInt()); val bas = p.strokeWidth / 2f
        for (i in 0..1) {
            val y0 = i * (kanalH + 4f * yog) + p.strokeWidth / 2f; val y1 = y0 + kanalH - p.strokeWidth
            val yanan = (((duzey[i] + 60f) / 60f).coerceIn(0f, 1f) * n).toInt()
            val tepeCizgi = (((tepe[i] + 60f) / 60f).coerceIn(0f, 1f) * n).toInt() - 1
            for (k in 0 until n) {
                val db = -60f + 60f * (k + 1) / n
                p.color = when {
                    k == tepeCizgi && tepeCizgi >= yanan -> Color.WHITE
                    k >= yanan -> Color.argb(46, 255, 255, 255)
                    db > -3f -> KIRMIZI; db > -12f -> SARI; else -> YESIL
                }
                val x = bas + k * adim; c.drawLine(x, y0, x, y1, p)
            }
        }
        if (yaziVar) for (db in intArrayOf(-48, -24, -12, -6, 0)) { val x = width * ((db + 60f) / 60f); val t = "$db"; c.drawText(t, (x - yazi.measureText(t)).coerceAtLeast(0f), height - 1f * yog, yazi) }
    }
}

/** Kayıt dışında mikrofon düzeyi (AudioRecord); kayıt başlayınca durur (mikrofon kaydediciye geçer) */
class SesOlcer(private val geri: (Float, Float) -> Unit) {
    @Volatile private var calis = false
    private var t: Thread? = null
    @SuppressLint("MissingPermission")
    fun baslat() {
        if (calis) return; calis = true
        t = Thread {
            val ornek = 48000; val tampon = max(AudioRecord.getMinBufferSize(ornek, AudioFormat.CHANNEL_IN_STEREO, AudioFormat.ENCODING_PCM_16BIT), 4096)
            val ar = runCatching { AudioRecord(MediaRecorder.AudioSource.CAMCORDER, ornek, AudioFormat.CHANNEL_IN_STEREO, AudioFormat.ENCODING_PCM_16BIT, tampon) }.getOrNull()
            if (ar == null || ar.state != AudioRecord.STATE_INITIALIZED) { calis = false; return@Thread }
            val b = ShortArray(2048); ar.startRecording()
            while (calis) {
                val n = ar.read(b, 0, b.size); if (n <= 0) continue
                var sl = 0.0; var sg = 0.0; var i = 0
                while (i + 1 < n) { sl += b[i] * b[i].toDouble(); sg += b[i + 1] * b[i + 1].toDouble(); i += 2 }
                fun db(t: Double) = (20 * log10(max(1e-9, sqrt(t / (n / 2)) / 32768.0))).toFloat()
                geri(db(sl), db(sg))
            }
            runCatching { ar.stop(); ar.release() }
        }.also { it.isDaemon = true; it.start() }
    }
    fun durdur() { calis = false; t = null }
}
