package tr.com.updated.monitor

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs
import kotlin.math.tan

/** Görüntü analizinin yapay görüntülerle sınanması (telefon gerekmez) */
class AnalizTest {
    private val w = 256; private val h = 144

    /** RGBA, üstten alta; f(x, y) 0–1 arası x, y için parlaklık (0–255) */
    private fun goruntu(f: (Float, Float) -> Int): ByteArray {
        val p = ByteArray(w * h * 4)
        for (y in 0 until h) for (x in 0 until w) { val v = f(x / (w - 1f), y / (h - 1f)).coerceIn(0, 255).toByte(); val i = (y * w + x) * 4; p[i] = v; p[i + 1] = v; p[i + 2] = v; p[i + 3] = -1 }
        return p
    }

    @Test fun egikUfukBulunur() {
        val oran = 16f / 9f
        for (derece in listOf(0f, 4f, -6f)) {
            // Ufuk ortanın biraz altında, sağ tarafı (saat yönü tersine) yukarıda: y = 0,55 − (x − 0,5)·oran·tan(a)
            val t = tan(Math.toRadians(derece.toDouble())).toFloat()
            val p = goruntu { x, y -> if (y < 0.55f - (x - 0.5f) * oran * t) 200 else 60 }
            val s = GoruntuAnaliz.hesapla(p, w, h, oran, ustAlt = false)
            assertNotNull("ufuk bulunmalı ($derece°)", s.ufuk)
            assertEquals("ufuk açısı ($derece°)", derece, s.ufuk!!.aci, 1.2f)
            assertEquals("ufuk yeri", 0.55f, s.ufuk!!.ortaY, 0.04f)
        }
    }

    @Test fun simetriAyirtEdilir() {
        val simetrik = GoruntuAnaliz.hesapla(goruntu { x, y -> if (abs(x - 0.5f) < 0.15f || y > 0.7f) 220 else 40 }, w, h, 16f / 9f, false)
        val tek = GoruntuAnaliz.hesapla(goruntu { x, y -> if (x < 0.3f && y < 0.6f) 230 else 40 }, w, h, 16f / 9f, false)
        assertTrue("simetrik sahne: ${simetrik.simetri}", simetrik.simetri > 0.8f)
        assertTrue("tek yana yüklü: ${tek.simetri}", tek.simetri < 0.6f)
        assertTrue("ağırlık solda: ${tek.agirlik.x}", tek.agirlik.x < 0.4f)
    }

    @Test fun onculerVeKacisNoktasi() {
        // Yol: alt köşelerden (0,1) ve (1,1) noktasından (0,5; 0,4)'e giden iki kenar arası açık renk
        val p = goruntu { x, y ->
            if (y < 0.4f) 50 else { val yari = (y - 0.4f) / 0.6f * 0.5f; if (abs(x - 0.5f) < yari) 210 else 70 }
        }
        val s = GoruntuAnaliz.hesapla(p, w, h, 16f / 9f, false)
        assertTrue("en az iki öncü çizgi: ${s.oncu}", s.oncu.size >= 2)
        assertNotNull("kaçış noktası", s.kacis)
        assertEquals(0.5f, s.kacis!!.x, 0.06f); assertEquals(0.4f, s.kacis!!.y, 0.08f)
    }

    @Test fun duzGoruntudeCizgiYok() {
        val s = GoruntuAnaliz.hesapla(goruntu { _, _ -> 120 }, w, h, 16f / 9f, false)
        assertNull(s.ufuk); assertTrue(s.oncu.isEmpty())
    }
}
