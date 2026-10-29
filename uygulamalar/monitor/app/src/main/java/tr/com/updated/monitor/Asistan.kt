package tr.com.updated.monitor

import android.graphics.Bitmap
import android.graphics.Matrix
import android.graphics.RectF
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.google.mlkit.vision.objects.ObjectDetection
import com.google.mlkit.vision.objects.defaults.ObjectDetectorOptions
import java.nio.ByteBuffer
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Akıllı kompozisyon yardımcısı (Fatih'in fikri): monitörün küçük kopyasında (ölçüm karesi) yüz, yoksa en belirgin nesne bulunur;
 * konu kutusu (0–1) geri verilir. Telefonun içinde çalışır (ML Kit, modeller uygulamada), saniyede ~5 kez.
 */
class Asistan(private val sonuc: (RectF?, String, YuzBilgi?) -> Unit) {
    private val mesgul = AtomicBoolean(false)
    private var son = 0L
    private val yuz = FaceDetection.getClient(FaceDetectorOptions.Builder().setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST).setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_ALL).setMinFaceSize(0.08f).build())
    private val nesne = ObjectDetection.getClient(ObjectDetectorOptions.Builder().setDetectorMode(ObjectDetectorOptions.STREAM_MODE).enableMultipleObjects().enableClassification().build())
    private var kayip = 0

    /**
     * Kullanıcının seçtiği konu (karede 0–1, y aşağı; iPhone'daki Asistan.hedef): adaylardan (yüzler, nesneler) bu noktayı içeren en küçük
     * kutu, yoksa ortası 0,2'den yakın olan izlenir; nokta her karede konunun ortasına taşınır. ~2,5 sn bulunamazsa seçim düşer (`konuKayboldu`).
     * Ana iş parçacığında okunur ve yazılır (ML Kit dinleyicileri ana iş parçacığında).
     */
    @Volatile var hedef: android.graphics.PointF? = null; set(v) { field = v; kayipSecili = 0 }
    var konuKayboldu: () -> Unit = {}
    private var kayipSecili = 0

    fun kare(b: ByteBuffer, w: Int, h: Int) {
        val s = System.currentTimeMillis()
        if (s - son < 180 || !mesgul.compareAndSet(false, true)) return
        son = s
        try {
            b.position(0)
            val ham = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888).apply { copyPixelsFromBuffer(b) }
            val bmp = Bitmap.createBitmap(ham, 0, 0, w, h, Matrix().apply { preScale(1f, -1f) }, false) // glReadPixels alttan üste
            val girdi = InputImage.fromBitmap(bmp, 0)
            hedef?.let { return konuIzle(girdi, w, h, it) }
            yuz.process(girdi).addOnSuccessListener { yuzler ->
                val f = yuzler.maxByOrNull { it.boundingBox.width() * it.boundingBox.height() }
                if (f != null) {
                    // Göz hizası (iki gözün ortalaması) ve başın dönüşü: portre ipuçları
                    val gozler = listOfNotNull(f.getLandmark(com.google.mlkit.vision.face.FaceLandmark.LEFT_EYE), f.getLandmark(com.google.mlkit.vision.face.FaceLandmark.RIGHT_EYE))
                    val gozY = if (gozler.isEmpty()) null else gozler.map { it.position.y }.average().toFloat() / h
                    bitir(RectF(f.boundingBox.left / w.toFloat(), f.boundingBox.top / h.toFloat(), f.boundingBox.right / w.toFloat(), f.boundingBox.bottom / h.toFloat()), "Yüz", YuzBilgi(gozY, f.headEulerAngleY))
                }
                else nesne.process(girdi).addOnSuccessListener { l ->
                    val o = l.maxByOrNull { it.boundingBox.width() * it.boundingBox.height() }
                    if (o == null) bitir(null, "")
                    else bitir(RectF(o.boundingBox.left / w.toFloat(), o.boundingBox.top / h.toFloat(), o.boundingBox.right / w.toFloat(), o.boundingBox.bottom / h.toFloat()), o.labels.firstOrNull()?.text?.let { CEVIRI[it] ?: it } ?: "Konu")
                }.addOnFailureListener { bitir(null, "") }
            }.addOnFailureListener { bitir(null, "") }
        } catch (e: Throwable) { mesgul.set(false) }
    }

    private fun kutu(b: android.graphics.Rect, w: Int, h: Int) = RectF(b.left / w.toFloat(), b.top / h.toFloat(), b.right / w.toFloat(), b.bottom / h.toFloat())

    /** Seçili konu: yüzler ve nesneler birlikte aday; hedefi içeren en küçük kutu (yüz, kişinin içinde: yüz kazanır), yoksa 0,2 yakınındaki */
    private fun konuIzle(girdi: InputImage, w: Int, h: Int, hd: android.graphics.PointF) {
        data class Aday(val r: RectF, val ad: String, val yuz: YuzBilgi?)
        fun sec(adaylar: List<Aday>) {
            mesgul.set(false)
            if (hedef == null) return
            fun alan(r: RectF) = r.width() * r.height()
            fun uzak(r: RectF) = kotlin.math.hypot(r.centerX() - hd.x, r.centerY() - hd.y)
            val iceren = adaylar.filter { RectF(it.r).apply { inset(-0.02f, -0.02f) }.contains(hd.x, hd.y) }.minByOrNull { alan(it.r) }
            val k = iceren ?: adaylar.minByOrNull { uzak(it.r) }?.takeIf { uzak(it.r) < 0.2f }
            if (k != null) {
                hedef = android.graphics.PointF(k.r.centerX(), k.r.centerY())
                sonuc(RectF(k.r.left.coerceIn(0f, 1f), k.r.top.coerceIn(0f, 1f), k.r.right.coerceIn(0f, 1f), k.r.bottom.coerceIn(0f, 1f)), k.ad, k.yuz)
            } else if (++kayipSecili >= 12) { hedef = null; sonuc(null, "", null); konuKayboldu() }
        }
        yuz.process(girdi).addOnSuccessListener { yuzler ->
            val l = yuzler.map { f ->
                val gozler = listOfNotNull(f.getLandmark(com.google.mlkit.vision.face.FaceLandmark.LEFT_EYE), f.getLandmark(com.google.mlkit.vision.face.FaceLandmark.RIGHT_EYE))
                Aday(kutu(f.boundingBox, w, h), "Yüz", YuzBilgi(if (gozler.isEmpty()) null else gozler.map { it.position.y }.average().toFloat() / h, f.headEulerAngleY))
            }
            nesne.process(girdi).addOnSuccessListener { n ->
                sec(l + n.filter { val r = kutu(it.boundingBox, w, h); r.width() * r.height() < 0.7f }
                    .map { o -> Aday(kutu(o.boundingBox, w, h), o.labels.firstOrNull()?.text?.let { CEVIRI[it] ?: it } ?: "Konu", null) })
            }.addOnFailureListener { sec(l) }
        }.addOnFailureListener { sec(emptyList()) }
    }

    /** Konu birkaç kare kaybolunca kutu silinir (titreme olmasın) */
    private fun bitir(r: RectF?, ad: String, yuz: YuzBilgi? = null) {
        mesgul.set(false)
        if (r == null) { if (++kayip >= 4) sonuc(null, "", null) } else { kayip = 0; sonuc(RectF(r.left.coerceIn(0f, 1f), r.top.coerceIn(0f, 1f), r.right.coerceIn(0f, 1f), r.bottom.coerceIn(0f, 1f)), ad, yuz) }
    }

    fun kapat() { runCatching { yuz.close(); nesne.close() } }

    companion object {
        val CEVIRI = mapOf("Fashion good" to "Giysi", "Food" to "Yiyecek", "Home good" to "Ev eşyası", "Place" to "Mekân", "Plant" to "Bitki")
    }
}
