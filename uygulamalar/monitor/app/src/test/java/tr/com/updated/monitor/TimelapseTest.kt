package tr.com.updated.monitor

import org.junit.Assert.assertEquals
import org.junit.Test

/** Timelapse hesapları: hız, video süresi, kare zamanı ve ekrandaki yazılar */
class TimelapseTest {
    @Test fun hesap() {
        assertEquals(60f, Timelapse.hiz(2000), 0.001f)               // 2 sn aralık, 30 fps → 60 kat
        assertEquals(15f, Timelapse.hiz(500), 0.001f)
        assertEquals(2000L, Timelapse.videoMs(60))                   // 60 kare = 2 sn video
        assertEquals(33_333_333L, Timelapse.kareZamaniNs(1))
        assertEquals(1_000_000_000L, Timelapse.kareZamaniNs(30))
        assertEquals(2033L, Timelapse.videoMsSuredan(120_000, 2000)) // 2 dk çekim, 2 sn aralık: 61 kare
    }

    @Test fun yazilar() {
        assertEquals("0,5 sn", Timelapse.aralikYazi(500))
        assertEquals("2 sn", Timelapse.aralikYazi(2000))
        assertEquals("1 dk", Timelapse.aralikYazi(60_000))
        assertEquals("Sınırsız", Timelapse.sureYazi(0))
        assertEquals("30 dk", Timelapse.sureYazi(30))
        assertEquals("2 sa", Timelapse.sureYazi(120))
        assertEquals("0:04", Timelapse.saat(4_200))
        assertEquals("1:12:05", Timelapse.saat(4_325_000))
    }
}
