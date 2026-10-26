package tr.com.updated.monitor

import android.graphics.RectF
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Yön tarifleri: hangi durumda ne denir */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class IpucuTest {
    private fun ufuk(aci: Float, y: Float) = AnalizSonuc(Cizgi(N(0f, y), N(1f, y), aci, 0.2f), emptyList(), null, 0.3f, N(0.5f, 0.5f))

    @Test fun kenardaKesilen() {
        assertEquals("Konu kenarda kesiliyor: telefonu biraz sola çevir", ipucuUret(RectF(0f, 0.3f, 0.2f, 0.6f), "Konu", null, null, null, 0f))
        assertEquals("Baş kesiliyor: telefonu biraz yukarı kaldır", ipucuUret(RectF(0.4f, 0f, 0.6f, 0.3f), "Yüz", null, null, null, 0f))
        assertEquals("Konu kadraja sığmıyor: biraz uzaklaş", ipucuUret(RectF(0f, 0.3f, 1f, 0.5f), "Konu", null, null, null, 0f))
    }

    @Test fun portre() {
        assertEquals("Gözleri üst üçte bire getir: telefonu biraz aşağı indir", ipucuUret(RectF(0.4f, 0.4f, 0.6f, 0.7f), "Yüz", YuzBilgi(0.5f, 0f), null, null, 1f))
        assertEquals("Baktığı yöne boşluk bırak: telefonu biraz sağa çevir", ipucuUret(RectF(0.6f, 0.2f, 0.8f, 0.5f), "Yüz", YuzBilgi(0.33f, 30f), null, null, 1f))
    }

    @Test fun ufukVeHizalama() {
        assertEquals("Ufuk 3,0° eğik: telefonu düzelt", ipucuUret(null, "", null, ufuk(-3f, 0.7f), null, 0f))
        assertEquals("Ufku alt üçte bire al: telefonu biraz yukarı kaldır", ipucuUret(null, "", null, ufuk(0f, 0.52f), null, 0f))
        // Konu solda, hedef sağda: konu sağa gitmeli → telefon sola
        assertEquals("Telefonu biraz sola çevir", ipucuUret(RectF(0.15f, 0.35f, 0.35f, 0.55f), "Konu", null, null, N(0.66f, 0.45f), 0.3f))
        assertNull(ipucuUret(RectF(0.6f, 0.3f, 0.7f, 0.4f), "Konu", null, null, N(0.66f, 0.33f), 0.95f))
    }
}
