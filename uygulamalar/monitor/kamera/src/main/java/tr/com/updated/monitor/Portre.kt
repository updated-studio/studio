package tr.com.updated.monitor

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import java.io.ByteArrayOutputStream

/**
 * Portre sanal diyafram (Fatih 31 Ekim; iPhone'daki f/1.4–f/16 satırı): çekilen JPEG'de konu keskin, arka plan bulanık.
 * Android'de derinlik haritası her telefonda yok; konu yüz algılamadan (baş + omuzlar) bulunur, yüz yoksa ortadaki elips.
 * f küçüldükçe bulanıklık artar; f/16 dokunmaz. Önizlemede görünmez, fotoğrafa işlenir.
 */
object Portre {
    val DEGERLER = listOf(1.4f, 2f, 2.8f, 4f, 5.6f, 8f, 11f, 16f)
    fun yazi(f: Float) = "f/" + (if (f % 1f == 0f) "${f.toInt()}" else "%.1f".format(f).replace('.', ','))

    fun isle(jpeg: ByteArray, f: Float): ByteArray = runCatching {
        if (f >= 16f) return jpeg
        val yon = androidx.exifinterface.media.ExifInterface(jpeg.inputStream()).rotationDegrees
        val sec = BitmapFactory.Options().apply { inJustDecodeBounds = true }; BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size, sec)
        // Bellek: 16 MP'nin üstü yarı boyutta işlenir
        val ornek = if (sec.outWidth.toLong() * sec.outHeight > 16_000_000L) 2 else 1
        var bm = BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size, BitmapFactory.Options().apply { inSampleSize = ornek }) ?: return jpeg
        if (yon != 0) bm = Bitmap.createBitmap(bm, 0, 0, bm.width, bm.height, android.graphics.Matrix().apply { postRotate(yon.toFloat()) }, true)
        val w = bm.width; val h = bm.height
        // Konu: küçük kopyada yüz algılama
        val k = 640f / maxOf(w, h); val kucuk = Bitmap.createScaledBitmap(bm, (w * k).toInt().coerceAtLeast(1), (h * k).toInt().coerceAtLeast(1), true)
        val yuzler = runCatching {
            val d = com.google.mlkit.vision.face.FaceDetection.getClient(com.google.mlkit.vision.face.FaceDetectorOptions.Builder()
                .setPerformanceMode(com.google.mlkit.vision.face.FaceDetectorOptions.PERFORMANCE_MODE_FAST).setMinFaceSize(0.08f).build())
            val l = com.google.android.gms.tasks.Tasks.await(d.process(com.google.mlkit.vision.common.InputImage.fromBitmap(kucuk, 0)), 3, java.util.concurrent.TimeUnit.SECONDS)
            d.close(); l.map { RectF(it.boundingBox.left / k, it.boundingBox.top / k, it.boundingBox.right / k, it.boundingBox.bottom / k) }
        }.getOrDefault(emptyList())
        // Bulanık katman: küçült-büyüt (iki geçiş, yumuşak); f/1.4'te en güçlü
        val guc = ((16f / f - 1f) / (16f / 1.4f - 1f)).coerceIn(0f, 1f)
        val kenar = (maxOf(w, h) / (8f + 40f * guc)).toInt().coerceAtLeast(16)
        val o = kenar.toFloat() / maxOf(w, h)
        var bul = Bitmap.createScaledBitmap(bm, (w * o).toInt().coerceAtLeast(2), (h * o).toInt().coerceAtLeast(2), true)
        bul = Bitmap.createScaledBitmap(Bitmap.createScaledBitmap(bul, bul.width * 2, bul.height * 2, true), bul.width, bul.height, true)
        val sonuc = Bitmap.createScaledBitmap(bul, w, h, true).copy(Bitmap.Config.ARGB_8888, true)
        // Maske: her yüz için baş elipsi ve altında omuz/gövde elipsi, kenarları yumuşak
        val maske = Bitmap.createBitmap(w, h, Bitmap.Config.ALPHA_8); val mc = Canvas(maske)
        fun elips(cx: Float, cy: Float, rx: Float, ry: Float) {
            val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { shader = RadialGradient(0f, 0f, 1f, intArrayOf(Color.BLACK, Color.BLACK, Color.TRANSPARENT), floatArrayOf(0f, 0.72f, 1f), Shader.TileMode.CLAMP) }
            mc.save(); mc.translate(cx, cy); mc.scale(rx, ry); mc.drawCircle(0f, 0f, 1f, p); mc.restore()
        }
        if (yuzler.isEmpty()) elips(w / 2f, h * 0.52f, w * 0.34f, h * 0.42f)
        else yuzler.forEach { r -> val fw = r.width(); val fh = r.height()
            elips(r.centerX(), r.centerY(), fw * 0.95f, fh * 0.95f)
            elips(r.centerX(), r.bottom + fh * 1.6f, fw * 1.9f, fh * 2.3f) }
        // Keskin görüntü maskeyle bulanığın üstüne
        val c = Canvas(sonuc); val kat = c.saveLayer(null, null)
        c.drawBitmap(bm, 0f, 0f, null)
        c.drawBitmap(maske, 0f, 0f, Paint().apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.DST_IN) })
        c.restoreToCount(kat)
        bm.recycle(); maske.recycle()
        ByteArrayOutputStream().also { sonuc.compress(Bitmap.CompressFormat.JPEG, 95, it) }.toByteArray()
    }.getOrElse { HataKaydi.not("portre", it.stackTraceToString()); jpeg }
}
