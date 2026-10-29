package tr.com.updated.monitor

import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.params.ColorSpaceTransform
import android.hardware.camera2.params.RggbChannelVector
import kotlin.math.abs
import kotlin.math.ln

/**
 * Elle beyaz denge (Kelvin + yeşil–macenta ton): Camera2'de beyaz denge kapatılıp renk kazançları el ile verilir.
 * Kazanç, sensörün kalibrasyon matrislerinden (DNG'deki ColorMatrix ve CameraCalibration; iki referans ışık arasında 1/T ile
 * karıştırılarak) o sıcaklıktaki beyazın sensördeki karşılığı hesaplanıp bulunur. Telefon matris vermiyorsa, son otomatik
 * kazançlar 5500 K sayılıp sRGB'deki kara cisim oranıyla ölçeklenir (yaklaşık).
 */
object BeyazDenge {
    const val EN_AZ = 2500; const val EN_COK = 10000; const val ADIM = 50

    /** Kara cisim / gün ışığı eğrisinde xy (Kim vd., 1667–25000 K) */
    private fun xy(t: Double): Pair<Double, Double> {
        val T = t.coerceIn(1667.0, 25000.0)
        val x = if (T <= 4000) -0.2661239e9 / (T * T * T) - 0.2343589e6 / (T * T) + 0.8776956e3 / T + 0.179910
                else -3.0258469e9 / (T * T * T) + 2.1070379e6 / (T * T) + 0.2226347e3 / T + 0.240390
        val y = when {
            T <= 2222 -> -1.1063814 * x * x * x - 1.34811020 * x * x + 2.18555832 * x - 0.20219683
            T <= 4000 -> -0.9549476 * x * x * x - 1.37418593 * x * x + 2.09137015 * x - 0.16748867
            else -> 3.0817580 * x * x * x - 5.87338670 * x * x + 3.75112997 * x - 0.37001483
        }
        return x to y
    }
    private fun xyz(t: Double): DoubleArray { val (x, y) = xy(t); return doubleArrayOf(x / y, 1.0, (1 - x - y) / y) }

    /** EXIF ışık kaynağı kodunun sıcaklığı */
    private fun isik(kod: Int): Double = when (kod) {
        17, 3 -> 2856.0; 24 -> 3200.0; 15 -> 3450.0; 2, 14 -> 4150.0; 18 -> 4874.0; 13, 23 -> 5000.0; 1, 4, 9, 20 -> 5500.0
        12 -> 6430.0; 10, 21 -> 6504.0; 19 -> 6774.0; 11, 22 -> 7500.0; else -> 5500.0
    }

    private fun mat(c: ColorSpaceTransform?): DoubleArray? = c?.let { m -> DoubleArray(9) { i -> m.getElement(i % 3, i / 3).toDouble() } }
    private fun carp(m: DoubleArray, v: DoubleArray) = DoubleArray(3) { r -> m[r * 3] * v[0] + m[r * 3 + 1] * v[1] + m[r * 3 + 2] * v[2] }

    private class Kalib(val t1: Double, val t2: Double, val cm1: DoubleArray, val cm2: DoubleArray, val cc1: DoubleArray?, val cc2: DoubleArray?)
    private val onbellek = HashMap<CameraCharacteristics, Kalib?>()
    private fun kalib(oz: CameraCharacteristics): Kalib? = onbellek.getOrPut(oz) {
        val cm1 = mat(oz.get(CameraCharacteristics.SENSOR_COLOR_TRANSFORM1)) ?: return@getOrPut null
        val cm2 = mat(oz.get(CameraCharacteristics.SENSOR_COLOR_TRANSFORM2)) ?: cm1
        val t1 = isik(oz.get(CameraCharacteristics.SENSOR_REFERENCE_ILLUMINANT1) ?: 17)
        val t2 = isik(oz.get(CameraCharacteristics.SENSOR_REFERENCE_ILLUMINANT2)?.toInt() ?: 21)
        Kalib(t1, t2, cm1, cm2, mat(oz.get(CameraCharacteristics.SENSOR_CALIBRATION_TRANSFORM1)), mat(oz.get(CameraCharacteristics.SENSOR_CALIBRATION_TRANSFORM2)))
    }

    /** O sıcaklıktaki beyazın sensördeki RGB'si */
    private fun notr(k: Kalib, t: Double): DoubleArray {
        val (a, b) = if (k.t1 <= k.t2) k.t1 to k.t2 else k.t2 to k.t1
        val g = if (a == b) 1.0 else ((1 / t - 1 / b) / (1 / a - 1 / b)).coerceIn(0.0, 1.0) // a'nın ağırlığı
        val (ma, mb) = if (k.t1 <= k.t2) k.cm1 to k.cm2 else k.cm2 to k.cm1
        val cm = DoubleArray(9) { g * ma[it] + (1 - g) * mb[it] }
        var n = carp(cm, xyz(t))
        val (ca, cb) = if (k.t1 <= k.t2) k.cc1 to k.cc2 else k.cc2 to k.cc1
        if (ca != null) n = carp(DoubleArray(9) { g * ca[it] + (1 - g) * (cb ?: ca)[it] }, n)
        return n
    }

    /** sRGB'de (doğrusal) o sıcaklıktaki beyaz: matris yoksa yaklaşık hesap için */
    private fun srgb(t: Double): DoubleArray {
        val v = xyz(t)
        return doubleArrayOf(3.2406 * v[0] - 1.5372 * v[1] - 0.4986 * v[2], -0.9689 * v[0] + 1.8758 * v[1] + 0.0415 * v[2], 0.0557 * v[0] - 0.2040 * v[1] + 1.0570 * v[2])
    }

    /** Kazançlar: G = 1 (ton ile oynar), R ve B beyazı nötr yapacak kadar. `oto`: son otomatik kazançlar (yedek yol için) */
    fun kazanc(oz: CameraCharacteristics, kelvin: Int, ton: Int, oto: RggbChannelVector?): RggbChannelVector {
        val t = kelvin.toDouble()
        var (r, b) = kalib(oz)?.let { k -> val n = notr(k, t); (n[1] / n[0]) to (n[1] / n[2]) } ?: run {
            val n = srgb(t); val n0 = srgb(5500.0)
            val oR = oto?.red?.toDouble() ?: 2.0; val oB = oto?.blue?.toDouble() ?: 1.6
            val og = oto?.let { (it.greenEven + it.greenOdd) / 2.0 } ?: 1.0
            (oR / og * (n0[0] / n[0]) * (n[1] / n0[1])) to (oB / og * (n0[2] / n[2]) * (n[1] / n0[1]))
        }
        // Ton: + macenta (yeşil azalır), − yeşil
        val g = 1.0 - ton * 0.0025
        val en = minOf(r, b, g); if (en < 1.0) { r /= en; b /= en }
        val gg = if (en < 1.0) g / en else g
        return RggbChannelVector(r.toFloat(), gg.toFloat(), gg.toFloat(), b.toFloat())
    }

    /** Otomatik beyaz dengenin o anki kazançlarından tahmini Kelvin (elle ayara geçerken başlangıç) */
    fun tahmin(oz: CameraCharacteristics, oto: RggbChannelVector?): Int {
        oto ?: return 5500
        val k = kalib(oz) ?: return 5500
        val hedef = ln(oto.red.toDouble() / oto.blue)
        var en = 5500; var fark = Double.MAX_VALUE
        var t = EN_AZ
        while (t <= EN_COK) { val n = notr(k, t.toDouble()); val f = abs(ln((n[1] / n[0]) / (n[1] / n[2])) - hedef); if (f < fark) { fark = f; en = t }; t += ADIM }
        return en
    }
}
