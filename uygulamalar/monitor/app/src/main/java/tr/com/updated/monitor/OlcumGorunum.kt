package tr.com.updated.monitor

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.view.View
import java.nio.ByteBuffer
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.max
import kotlin.math.min

/**
 * Ölçüm paneli: dalga formu (parlaklık), RGB parade, vektörskop, histogram. Kaynak, monitörün her üç karede bir verdiği
 * 256×144 RGBA kopyasıdır; hesap arka planda yapılır, panel kendini çizer. Hangi ölçümlerin görüneceği seçilebilir.
 */
class OlcumGorunum(context: Context) : View(context) {
    enum class Tur(val ad: String) { DALGA("Dalga formu"), PARADE("RGB parade"), VEKTOR("Vektörskop"), HISTOGRAM("Histogram") }
    var gorunen = linkedSetOf(Tur.DALGA, Tur.PARADE, Tur.VEKTOR, Tur.HISTOGRAM)
        set(v) { field = v; invalidate() }

    /** Görüntünün üstünde küçük pencere olarak (köşe histogramı): yarı saydam zemin, başlıksız */
    var bindirme = false
    private val is_ = Executors.newSingleThreadExecutor()
    private val mesgul = AtomicBoolean(false)
    @Volatile private var bitmapler: Map<Tur, Bitmap> = emptyMap()
    private val yazi = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(200, 255, 255, 255); textSize = 22f }
    private val cizgi = Paint().apply { color = Color.argb(70, 255, 255, 255); strokeWidth = 1f }
    private val cerceve = Paint().apply { color = Color.argb(255, 18, 20, 24) }
    private val bmpBoya = Paint(Paint.FILTER_BITMAP_FLAG)

    /** Monitör iş parçasından çağrılır; önceki hesap bitmediyse kare atlanır */
    fun kare(b: ByteBuffer, w: Int, h: Int) {
        if (!mesgul.compareAndSet(false, true)) return
        val kopya = ByteArray(w * h * 4); b.position(0); b.get(kopya)
        is_.execute {
            try { bitmapler = hesapla(kopya, w, h); postInvalidate() } finally { mesgul.set(false) }
        }
    }

    private fun hesapla(p: ByteArray, w: Int, h: Int): Map<Tur, Bitmap> {
        val sonuc = HashMap<Tur, Bitmap>()
        val H = 128
        // Dalga formu ve parade: her sütun için parlaklık (0–1) dağılımı. glReadPixels alttan üste okur; yön önemli değil (sütun bazlı).
        if (Tur.DALGA in gorunen || Tur.PARADE in gorunen) {
            val dalga = IntArray(w * H); val par = IntArray(w * 3 * H)
            for (y in 0 until h) for (x in 0 until w) {
                val i = (y * w + x) * 4
                val r = p[i].toInt() and 255; val g = p[i + 1].toInt() and 255; val bl = p[i + 2].toInt() and 255
                val l = (0.2126 * r + 0.7152 * g + 0.0722 * bl).toInt()
                dalga[(H - 1 - l * (H - 1) / 255) * w + x]++
                par[(H - 1 - r * (H - 1) / 255) * w * 3 + x]++
                par[(H - 1 - g * (H - 1) / 255) * w * 3 + w + x]++
                par[(H - 1 - bl * (H - 1) / 255) * w * 3 + 2 * w + x]++
            }
            if (Tur.DALGA in gorunen) sonuc[Tur.DALGA] = Bitmap.createBitmap(IntArray(w * H) { val v = min(255, dalga[it] * 40); Color.argb(255, v / 3, v, v / 3) }, w, H, Bitmap.Config.ARGB_8888)
            if (Tur.PARADE in gorunen) sonuc[Tur.PARADE] = Bitmap.createBitmap(IntArray(w * 3 * H) { val x = it % (w * 3); val v = min(255, par[it] * 40)
                when { x < w -> Color.argb(255, v, v / 6, v / 6); x < 2 * w -> Color.argb(255, v / 6, v, v / 6); else -> Color.argb(255, v / 4, v / 4, v) } }, w * 3, H, Bitmap.Config.ARGB_8888)
        }
        if (Tur.VEKTOR in gorunen) {
            val N = 160; val v = IntArray(N * N)
            for (i in 0 until w * h) {
                val r = (p[i * 4].toInt() and 255) / 255.0; val g = (p[i * 4 + 1].toInt() and 255) / 255.0; val bl = (p[i * 4 + 2].toInt() and 255) / 255.0
                val y = 0.2126 * r + 0.7152 * g + 0.0722 * bl
                val cb = (bl - y) / 1.8556; val cr = (r - y) / 1.5748
                val x = ((cb + 0.5) * (N - 1)).toInt().coerceIn(0, N - 1); val yy = ((0.5 - cr) * (N - 1)).toInt().coerceIn(0, N - 1)
                v[yy * N + x]++
            }
            sonuc[Tur.VEKTOR] = Bitmap.createBitmap(IntArray(N * N) { val k = min(255, v[it] * 30); Color.argb(255, k / 2, k, k / 2) }, N, N, Bitmap.Config.ARGB_8888)
        }
        if (Tur.HISTOGRAM in gorunen) {
            val hr = IntArray(256); val hg = IntArray(256); val hb = IntArray(256); val hl = IntArray(256)
            for (i in 0 until w * h) {
                val r = p[i * 4].toInt() and 255; val g = p[i * 4 + 1].toInt() and 255; val bl = p[i * 4 + 2].toInt() and 255
                hr[r]++; hg[g]++; hb[bl]++; hl[(0.2126 * r + 0.7152 * g + 0.0722 * bl).toInt().coerceIn(0, 255)]++
            }
            val enCok = max(1, (hl.maxOrNull() ?: 1))
            val px = IntArray(256 * H)
            for (x in 0 until 256) {
                fun boy(n: Int) = min(H, n * (H - 4) / enCok)
                for (yy in 0 until H) {
                    val d = H - yy
                    var rr = 0; var gg = 0; var bb = 0
                    if (d <= boy(hr[x])) rr = 160; if (d <= boy(hg[x])) gg = 160; if (d <= boy(hb[x])) bb = 160
                    val l = if (d <= boy(hl[x])) 90 else 0
                    px[yy * 256 + x] = Color.argb(255, min(255, rr + l), min(255, gg + l), min(255, bb + l))
                }
            }
            sonuc[Tur.HISTOGRAM] = Bitmap.createBitmap(px, 256, H, Bitmap.Config.ARGB_8888)
        }
        return sonuc
    }

    override fun onDraw(c: Canvas) {
        if (bindirme) { val b = bitmapler[Tur.HISTOGRAM] ?: return; c.drawColor(Color.argb(110, 0, 0, 0)); c.drawBitmap(b, Rect(0, 0, b.width, b.height), RectF(4f, 4f, width - 4f, height - 4f), Paint(bmpBoya).apply { alpha = 220 }); return }
        c.drawColor(Color.rgb(12, 13, 16))
        val turler = gorunen.toList(); if (turler.isEmpty()) return
        val sutun = if (turler.size > 1 && width > height * 0.9f) 2 else 1
        val satir = (turler.size + sutun - 1) / sutun
        val kw = width / sutun.toFloat(); val kh = height / satir.toFloat()
        turler.forEachIndexed { i, t ->
            val x = (i % sutun) * kw; val y = (i / sutun) * kh
            val alan = RectF(x + 6, y + 30, x + kw - 6, y + kh - 6)
            c.drawRect(alan, cerceve)
            bitmapler[t]?.let { bmp ->
                val hedef = if (t == Tur.VEKTOR) { val s = min(alan.width(), alan.height()); RectF(alan.centerX() - s / 2, alan.centerY() - s / 2, alan.centerX() + s / 2, alan.centerY() + s / 2) } else alan
                c.drawBitmap(bmp, Rect(0, 0, bmp.width, bmp.height), hedef, bmpBoya)
                if (t == Tur.DALGA || t == Tur.PARADE) for (k in 0..4) { val yy = hedef.bottom - hedef.height() * k / 4f; c.drawLine(hedef.left, yy, hedef.right, yy, cizgi) }
                if (t == Tur.VEKTOR) { c.drawLine(hedef.centerX(), hedef.top, hedef.centerX(), hedef.bottom, cizgi); c.drawLine(hedef.left, hedef.centerY(), hedef.right, hedef.centerY(), cizgi)
                    // Ten çizgisi (yaklaşık 123°)
                    val a = Math.toRadians(123.0); val r = hedef.width() / 2
                    c.drawLine(hedef.centerX(), hedef.centerY(), hedef.centerX() + (r * Math.cos(a)).toFloat(), hedef.centerY() - (r * Math.sin(a)).toFloat(), Paint(cizgi).apply { color = Color.argb(160, 255, 180, 120) }) }
            }
            c.drawText(t.ad, x + 10, y + 24, yazi)
        }
    }

    override fun onDetachedFromWindow() { super.onDetachedFromWindow(); is_.shutdownNow() }
}
