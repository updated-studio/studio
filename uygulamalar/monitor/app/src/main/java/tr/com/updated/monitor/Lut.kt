package tr.com.updated.monitor

import java.io.InputStream

/** .cube LUT dosyası (Adobe/Resolve biçimi, 3D). Boyut en fazla 65; veri R en hızlı değişecek sırayla RGB üçlüleri. */
class Lut(val ad: String, val boyut: Int, val veri: FloatArray) {
    companion object {
        fun oku(ad: String, girdi: InputStream): Lut {
            var boyut = 0
            var min = floatArrayOf(0f, 0f, 0f); var max = floatArrayOf(1f, 1f, 1f)
            val degerler = ArrayList<Float>(65 * 65 * 65 * 3)
            girdi.bufferedReader().useLines { satirlar ->
                for (ham in satirlar) {
                    val s = ham.trim()
                    if (s.isEmpty() || s.startsWith("#")) continue
                    val p = s.split(Regex("\\s+"))
                    when {
                        p[0].equals("LUT_3D_SIZE", true) -> boyut = p[1].toInt()
                        p[0].equals("LUT_1D_SIZE", true) -> throw IllegalArgumentException("1D LUT desteklenmiyor; 3D .cube dosyası seç.")
                        p[0].equals("DOMAIN_MIN", true) -> min = floatArrayOf(p[1].toFloat(), p[2].toFloat(), p[3].toFloat())
                        p[0].equals("DOMAIN_MAX", true) -> max = floatArrayOf(p[1].toFloat(), p[2].toFloat(), p[3].toFloat())
                        p[0].first().isLetter() -> {} // TITLE vb.
                        p.size >= 3 -> for (i in 0..2) degerler.add((p[i].toFloat() - min[i]) / (max[i] - min[i]))
                    }
                }
            }
            require(boyut in 2..65) { "LUT boyutu okunamadı (LUT_3D_SIZE)." }
            require(degerler.size == boyut * boyut * boyut * 3) { "LUT verisi eksik: ${degerler.size / 3} / ${boyut * boyut * boyut} satır." }
            return Lut(ad, boyut, degerler.toFloatArray())
        }
    }
}
