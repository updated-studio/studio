package tr.com.updated.monitor

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * Stiller (Fatih 29 Ekim: "zahmetsizce nasıl renklendirecek?"; iPhone'daki Stiller.swift ile birebir): hazır stil + pad (yatay soğuk ↔ sıcak,
 * dikey ton) + yoğunluk ve doygunluk. Stil, seçili LUT'la birleşip tek bir 33³ LUT olur: ekranda GL çizici bunu kullanır,
 * "Kayda göm" açıksa aynı LUT fotoğrafa (JPEG yeniden yazılır) ve videoya (kayıttan sonra Media3 Transformer ile) işlenir.
 */
enum class HazirStil(val ad: String, val renkler: IntArray, val aciklama: String = "", val kimlik: String = "") {
    STANDART("Standart", intArrayOf(Color.rgb(201, 138, 89), Color.rgb(46, 59, 74))),
    SINEMATIK("Sinematik", intArrayOf(Color.rgb(217, 153, 89), Color.rgb(31, 64, 69))),
    SICAK("Sıcak", intArrayOf(Color.rgb(232, 168, 107), Color.rgb(89, 59, 41))),
    SOGUK("Soğuk", intArrayOf(Color.rgb(153, 176, 209), Color.rgb(31, 41, 59))),
    CANLI("Canlı", intArrayOf(Color.rgb(255, 153, 79), Color.rgb(33, 74, 122))),
    SIYAH_BEYAZ("S-B", intArrayOf(Color.rgb(171, 171, 171), Color.rgb(33, 33, 33))),
    // Film reçeteleri (Fatih 29 Ekim): sevilen film ve fotoğraf makinesi görünümlerinden esinli; marka adı kullanılmaz.
    // Kimlikler iPhone'daki HazirStil rawValue'larıyla aynı
    LC_KLASIK("LC Klasik", intArrayOf(Color.rgb(219, 163, 115), Color.rgb(20, 26, 31)), "Doğal, derin siyahlar, hafif sıcak", "lcKlasik"),
    LC_CANLI("LC Canlı", intArrayOf(Color.rgb(250, 140, 64), Color.rgb(13, 51, 107)), "Sert kontrast, dolgun renk", "lcCanli"),
    LC_SB("LC S-B", intArrayOf(Color.rgb(217, 217, 217), Color.rgb(8, 8, 8)), "Yüksek kontrastlı siyah-beyaz", "lcSB"),
    KLASIK_KROM("Klasik Krom", intArrayOf(Color.rgb(184, 168, 143), Color.rgb(41, 56, 61)), "Sakin renkler, sert gölgeler, belgesel", "klasikKrom"),
    KLASIK_NEGATIF("Klasik Negatif", intArrayOf(Color.rgb(230, 158, 140), Color.rgb(26, 69, 74)), "Camgöbeği gölge, sıcak ışık, sert ton", "klasikNegatif"),
    CANLI_SLAYT("Canlı Slayt", intArrayOf(Color.rgb(255, 107, 51), Color.rgb(0, 82, 140)), "Slayt film: çok doygun, parlak", "canliSlayt"),
    SINEMA_YUMUSAK("Sinema Yumuşak", intArrayOf(Color.rgb(178, 166, 148), Color.rgb(56, 69, 74)), "Düşük kontrast, az doygun, sinema", "sinemaYumusak"),
    GUMUS_SB("Gümüş S-B", intArrayOf(Color.rgb(199, 199, 199), Color.rgb(51, 51, 51)), "İnce tonlu, yumuşak siyah-beyaz", "gumusSB"),
    FILM_GORUNUMU("Film Görünümü", intArrayOf(Color.rgb(242, 189, 153), Color.rgb(64, 56, 61)), "Sıcak ten, yumuşak, açık siyahlar", "filmGorunumu"),
    RETRO("Retro", intArrayOf(Color.rgb(224, 194, 115), Color.rgb(61, 71, 51)), "70'ler: sarı-yeşil, soluk", "retro"),
    VINTAGE("Vintage", intArrayOf(Color.rgb(219, 189, 158), Color.rgb(82, 69, 64)), "Solmuş baskı, sıcak, düşük doygunluk", "vintage"),
    ;
    val recete: Boolean get() = this in RECETELER

    companion object {
        val TEMEL = listOf(STANDART, SINEMATIK, SICAK, SOGUK, CANLI, SIYAH_BEYAZ)
        val RECETELER = listOf(LC_KLASIK, LC_CANLI, LC_SB, KLASIK_KROM, KLASIK_NEGATIF, CANLI_SLAYT, SINEMA_YUMUSAK, GUMUS_SB, FILM_GORUNUMU, RETRO, VINTAGE)
    }
}

data class Stil(
    var hazir: HazirStil = HazirStil.STANDART,
    /** Pad: x −1 soğuk … +1 sıcak, y −1 koyu/sert … +1 açık/yumuşak */
    var x: Float = 0f, var y: Float = 0f,
    /** 0…1 */
    var yogunluk: Float = 1f,
    /** −1…+1 */
    var doygunluk: Float = 0f,
    /** Eski "Kayda göm" seçimi; Kamera artık kullanmıyor (stil her zaman kayda girer), eski kayıtlar okunabilsin diye duruyor */
    var kaydaGom: Boolean = false,
) {
    /** Görüntüyü değiştiriyor mu */
    val etkin: Boolean get() = yogunluk > 0.01f && (hazir != HazirStil.STANDART || abs(x) > 0.01f || abs(y) > 0.01f || abs(doygunluk) > 0.01f)

    fun json(): String = JSONObject().put("hazir", hazir.name).put("x", x.toDouble()).put("y", y.toDouble()).put("yog", yogunluk.toDouble())
        .put("doy", doygunluk.toDouble()).put("gom", kaydaGom).toString()

    companion object {
        fun oku(s: String?): Stil = runCatching {
            val j = JSONObject(s ?: return Stil())
            Stil(HazirStil.valueOf(j.optString("hazir", "STANDART")), j.optDouble("x").toFloat(), j.optDouble("y").toFloat(),
                j.optDouble("yog", 1.0).toFloat(), j.optDouble("doy").toFloat(), j.optBoolean("gom"))
        }.getOrDefault(Stil())
    }

    /** Tek renge stil (0…1 görüntü renkleri); iPhone'daki Stil.uygula ile aynı */
    fun uygula(r0: Float, g0: Float, b0: Float, cikti: FloatArray) {
        var r = r0; var g = g0; var b = b0
        fun luma() = 0.2126f * r + 0.7152f * g + 0.0722f * b
        fun doy(k: Float) { val l = luma(); r = l + (r - l) * k; g = l + (g - l) * k; b = l + (b - l) * k }
        fun egri(k: Float, kaldir: Float) {
            // Orta griye göre kontrast (k > 1 sert) ve gölge kaldırma
            fun f(v: Float): Float { val s = 0.5f + (v - 0.5f) * k; return s + kaldir * (1 - s) * (1 - s) * 0.5f }
            r = f(r); g = f(g); b = f(b)
        }
        fun sicaklik(t: Float) { r *= 1 + 0.10f * t; g *= 1 + 0.02f * t; b *= 1 - 0.12f * t }
        // Reçeteler için: siyahları kaldırma (solma), gölge/ışık renk kaydırma, S eğrisi
        fun sol(f: Float) { r = f + r * (1 - f); g = f + g * (1 - f); b = f + b * (1 - f) }
        fun ayir(gr: Float, gg: Float, gb: Float, ir: Float, ig: Float, ib: Float) {
            val l = luma(); val gk = max(0f, 1 - l * 2); val ik = max(0f, l * 2 - 1)
            r += gr * gk + ir * ik; g += gg * gk + ig * ik; b += gb * gk + ib * ik
        }
        fun sEgri(k: Float) {
            // Yumuşak S: k > 0 kontrast artar (0,5 sabit kalır)
            fun f(v: Float): Float { val c = v.coerceIn(0f, 1f); return c + k * 2 * (c - 0.5f) * c * (1 - c) }
            r = f(r); g = f(g); b = f(b)
        }
        fun sb(kontrast: Float, kaldir: Float) { val l = luma(); r = l; g = l; b = l; egri(kontrast, kaldir) }
        when (hazir) {
            HazirStil.STANDART -> {}
            HazirStil.SINEMATIK -> {
                // Turuncu-camgöbeği: gölgeler camgöbeğine, açık tonlar sıcağa; hafif yumuşak kontrast, az doygun
                val l = luma()
                val gol = max(0f, 1 - l * 2); val isik = max(0f, l * 2 - 1)
                r += 0.06f * isik - 0.04f * gol; g += 0.01f * isik + 0.02f * gol; b += -0.05f * isik + 0.05f * gol
                egri(1.08f, 0.05f); doy(0.88f)
            }
            HazirStil.SICAK -> { sicaklik(0.6f); doy(1.05f) }
            HazirStil.SOGUK -> { sicaklik(-0.6f); doy(0.95f) }
            HazirStil.CANLI -> { egri(1.12f, 0f); doy(1.3f) }
            HazirStil.SIYAH_BEYAZ -> { val l = luma(); r = l; g = l; b = l; egri(1.15f, 0f) }
            HazirStil.LC_KLASIK -> { sEgri(0.35f); sicaklik(0.15f); doy(0.92f) }
            HazirStil.LC_CANLI -> { sEgri(0.55f); doy(1.28f); sicaklik(0.1f) }
            HazirStil.LC_SB -> { r = 0.3f * r + 0.59f * g + 0.11f * b; g = r; b = r; sEgri(0.8f) }
            HazirStil.KLASIK_KROM -> { doy(0.72f); egri(1.12f, 0f); ayir(-0.01f, 0.01f, 0.025f, 0.015f, 0.008f, -0.01f) }
            HazirStil.KLASIK_NEGATIF -> { egri(1.16f, 0f); doy(0.82f); ayir(-0.03f, 0.015f, 0.035f, 0.04f, 0f, 0f) }
            HazirStil.CANLI_SLAYT -> { sEgri(0.5f); doy(1.45f) }
            HazirStil.SINEMA_YUMUSAK -> { egri(0.86f, 0.06f); doy(0.78f); ayir(-0.01f, 0.01f, 0.02f, 0.01f, 0.005f, -0.005f) }
            HazirStil.GUMUS_SB -> { sb(1.06f, 0.08f); r += 0.008f; b -= 0.008f }
            HazirStil.FILM_GORUNUMU -> { egri(0.92f, 0.04f); sol(0.035f); sicaklik(0.25f); doy(0.9f) }
            HazirStil.RETRO -> { sicaklik(0.35f); g += 0.02f; ayir(-0.01f, 0.025f, -0.01f, 0.02f, 0.015f, -0.03f); sol(0.06f); doy(0.8f) }
            HazirStil.VINTAGE -> { sol(0.09f); egri(0.88f, 0f); sicaklik(0.3f); doy(0.65f) }
        }
        if (abs(x) > 0.001f) sicaklik(x)
        if (abs(y) > 0.001f) egri(1 - 0.3f * y, max(0f, y) * 0.3f)
        if (abs(doygunluk) > 0.001f && hazir != HazirStil.SIYAH_BEYAZ) doy(1 + doygunluk)
        val k = yogunluk
        cikti[0] = (r0 + (r - r0) * k).coerceIn(0f, 1f); cikti[1] = (g0 + (g - g0) * k).coerceIn(0f, 1f); cikti[2] = (b0 + (b - b0) * k).coerceIn(0f, 1f)
    }

    /** Taban LUT (kullanıcının LUT'u; yoksa null) ardından stil: 33³ tek LUT */
    fun lut(taban: Lut?): Lut {
        val n = 33; val v = FloatArray(n * n * n * 3); val c = FloatArray(3); var i = 0
        for (bi in 0 until n) for (gi in 0 until n) for (ri in 0 until n) {
            c[0] = ri / (n - 1f); c[1] = gi / (n - 1f); c[2] = bi / (n - 1f)
            taban?.ornekle(c[0], c[1], c[2], c)
            uygula(c[0], c[1], c[2], c)
            v[i++] = c[0]; v[i++] = c[1]; v[i++] = c[2]
        }
        return Lut("stil", n, v)
    }
}

/** Üç doğrusal örnekleme (veri R en hızlı) */
fun Lut.ornekle(r: Float, g: Float, b: Float, cikti: FloatArray) {
    val m = (boyut - 1).toFloat()
    fun bol(x: Float): Triple<Int, Int, Float> { val p = x.coerceIn(0f, 1f) * m; val i = min(p.toInt(), boyut - 2); return Triple(i, i + 1, p - i) }
    val (r0, r1, fr) = bol(r); val (g0, g1, fg) = bol(g); val (b0, b1, fb) = bol(b)
    fun al(ri: Int, gi: Int, bi: Int, k: Int) = veri[((bi * boyut + gi) * boyut + ri) * 3 + k]
    for (k in 0..2) {
        val c00 = al(r0, g0, b0, k) * (1 - fr) + al(r1, g0, b0, k) * fr
        val c10 = al(r0, g1, b0, k) * (1 - fr) + al(r1, g1, b0, k) * fr
        val c01 = al(r0, g0, b1, k) * (1 - fr) + al(r1, g0, b1, k) * fr
        val c11 = al(r0, g1, b1, k) * (1 - fr) + al(r1, g1, b1, k) * fr
        cikti[k] = (c00 * (1 - fg) + c10 * fg) * (1 - fb) + (c01 * (1 - fg) + c11 * fg) * fb
    }
}

object StilGom {
    /** Fotoğrafa LUT işler: JPEG çözülür, EXIF yönüne göre dik çevrilir, LUT uygulanıp yeniden JPEG yazılır; olmazsa özgün veri */
    fun foto(jpeg: ByteArray, lut: Lut): ByteArray = runCatching {
        val yon = androidx.exifinterface.media.ExifInterface(jpeg.inputStream()).rotationDegrees
        var bm = BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size, BitmapFactory.Options().apply { inMutable = true }) ?: return jpeg
        val w = bm.width; val h = bm.height; val satir = IntArray(w); val c = FloatArray(3)
        // 8 bit girişe tablo: 256³ yerine 33³ LUT'tan anında örnekleme (satır satır, bellek az)
        for (yy in 0 until h) {
            bm.getPixels(satir, 0, w, 0, yy, w, 1)
            for (xx in 0 until w) {
                val p = satir[xx]
                lut.ornekle(((p shr 16) and 255) / 255f, ((p shr 8) and 255) / 255f, (p and 255) / 255f, c)
                satir[xx] = (0xFF shl 24) or ((c[0] * 255 + 0.5f).toInt() shl 16) or ((c[1] * 255 + 0.5f).toInt() shl 8) or (c[2] * 255 + 0.5f).toInt()
            }
            bm.setPixels(satir, 0, w, 0, yy, w, 1)
        }
        if (yon != 0) bm = Bitmap.createBitmap(bm, 0, 0, w, h, android.graphics.Matrix().apply { postRotate(yon.toFloat()) }, true)
        ByteArrayOutputStream().also { bm.compress(Bitmap.CompressFormat.JPEG, 95, it) }.toByteArray()
    }.getOrElse { HataKaydi.not("stil", it.stackTraceToString()); jpeg }

    /**
     * Videoya LUT işler (kayıttan sonra yeniden kodlar, Media3 Transformer): `uri`deki dosya geçici dosyaya işlenir, sonra üstüne yazılır.
     * Ana iş parçacığından çağrılır; `bitti(başarılı)` ana iş parçacığında.
     */
    @androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
    fun video(ctx: Context, uri: Uri, lut: Lut, hevc: Boolean, bitti: (Boolean) -> Unit) {
        val n = lut.boyut
        val kup = Array(n) { r -> Array(n) { g -> IntArray(n) { b ->
            val i = ((b * n + g) * n + r) * 3
            Color.rgb((lut.veri[i] * 255 + 0.5f).toInt(), (lut.veri[i + 1] * 255 + 0.5f).toInt(), (lut.veri[i + 2] * 255 + 0.5f).toInt())
        } } }
        val gecici = File(ctx.cacheDir, "stil-${System.currentTimeMillis()}.mp4")
        try {
            val etki = androidx.media3.effect.SingleColorLut.createFromCube(kup)
            val oge = androidx.media3.transformer.EditedMediaItem.Builder(androidx.media3.common.MediaItem.fromUri(uri))
                .setEffects(androidx.media3.transformer.Effects(emptyList(), listOf(etki))).build()
            val t = androidx.media3.transformer.Transformer.Builder(ctx)
                .setVideoMimeType(if (hevc) androidx.media3.common.MimeTypes.VIDEO_H265 else androidx.media3.common.MimeTypes.VIDEO_H264)
                .addListener(object : androidx.media3.transformer.Transformer.Listener {
                    override fun onCompleted(c: androidx.media3.transformer.Composition, s: androidx.media3.transformer.ExportResult) {
                        val ok = runCatching { ctx.contentResolver.openOutputStream(uri, "wt")!!.use { o -> gecici.inputStream().use { it.copyTo(o) } } }.isSuccess
                        gecici.delete(); bitti(ok)
                    }
                    override fun onError(c: androidx.media3.transformer.Composition, s: androidx.media3.transformer.ExportResult, e: androidx.media3.transformer.ExportException) {
                        HataKaydi.not("stil", e.stackTraceToString()); gecici.delete(); bitti(false)
                    }
                }).build()
            t.start(oge, gecici.absolutePath)
        } catch (e: Exception) { HataKaydi.not("stil", e.stackTraceToString()); gecici.delete(); bitti(false) }
    }
}
