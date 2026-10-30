package tr.com.updated.monitor

import android.graphics.Color
import android.net.Uri
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Kayıt sonrası düzenleme: LUT yoğunluğu, kırpma aralığı, yeni dosya adı */
@RunWith(RobolectricTestRunner::class)
class DuzenTest {
    /** 2×2×2 ters çeviren LUT (R en hızlı değişir) */
    private val ters = Lut("ters", 2, FloatArray(24).also { v ->
        for (b in 0..1) for (g in 0..1) for (r in 0..1) { val i = ((b * 2 + g) * 2 + r) * 3; v[i] = 1f - r; v[i + 1] = 1f - g; v[i + 2] = 1f - b }
    })

    @Test fun lutYogunlugu() {
        // Tam yoğunlukta siyah köşe beyaz olur, sıfırda özgün kalır, yarıda ortada (yuvarlama 128)
        assertEquals(Color.WHITE, DuzenMotoru.kup(ters, 1f)[0][0][0])
        assertEquals(Color.BLACK, DuzenMotoru.kup(ters, 0f)[0][0][0])
        assertEquals(Color.rgb(128, 128, 128), DuzenMotoru.kup(ters, 0.5f)[1][1][1])
        // Küp sırası [r][g][b]: kırmızı köşe camgöbeğine döner
        assertEquals(Color.CYAN, DuzenMotoru.kup(ters, 1f)[1][0][0])
    }

    @Test fun aralikVeEtkiler() {
        val u = Uri.parse("content://media/external/video/media/1")
        assertFalse(Duzen(u).kirpmaVar); assertFalse(Duzen(u).etkiVar)
        assertTrue(Duzen(u, basUs = 1_000_000).kirpmaVar)
        assertTrue(Duzen(u, gurultu = 2).etkiVar)
        assertFalse(Duzen(u, lut = ters, yogunluk = 0f).etkiVar)
        assertTrue(runCatching { Duzen(u, basUs = 5, sonUs = 5) }.isFailure)
        assertEquals(2, DuzenMotoru.etkiler(Duzen(u, lut = ters, gurultu = 1)).size)
    }

    @Test fun yeniAd() {
        assertEquals("UPDATED 20261030-101500 düzenlendi.mp4", DuzenMotoru.yeniAd("UPDATED 20261030-101500.mp4"))
        assertTrue(DuzenMotoru.yeniAd(null).endsWith(" düzenlendi.mp4"))
        assertEquals("UPDATED_20261030_101500 vlog.mp4", DuzenMotoru.yeniAd("UPDATED_20261030_101500.mp4", "vlog"))
    }
}
