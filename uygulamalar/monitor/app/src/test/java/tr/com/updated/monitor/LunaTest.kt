package tr.com.updated.monitor

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test
import java.net.ServerSocket
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.TimeUnit

/** Luna UCD2 dili: denetim değeri, çerçeve ayıklama ve sahte bir kamerayla bağlantı sırası */
class LunaTest {
    private fun hex(s: String) = s.replace(" ", "").chunked(2).map { it.toInt(16).toByte() }.toByteArray()

    @Test fun nabizDenetimiKameraylaTutuyor() {
        // Kameranın sıra 0 nabzının denetimi (dökümdeki sabit C = 0xA5E7194C, LE yazılmış)
        val b = Ucd2.cerceve(Ucd2.NABIZ, 0, ByteArray(0))
        assertArrayEquals(hex("55434432 01 0c 05 00 00000000 4c19e7a5"), b)
    }

    @Test fun selamVeKomutBicimi() {
        assertArrayEquals(hex("55434432 01 0c 05 07 00000000 f6cc4f09"), Ucd2.selam(7))
        val k = Ucd2.komut(3, 39, 0x0102, byteArrayOf(0x10, 0x02))
        assertEquals(4, k[6].toInt()); assertEquals(3, k[7].toInt()); assertEquals(11, Ucd2.okuLe(k, 8))
        assertArrayEquals(hex("2700 02 0201 00800000 1002"), k.copyOfRange(12, 23))
        assertEquals(Ucd2.denetim(k, 0, 23), Ucd2.okuLe(k, 23))
        assertArrayEquals(hex("0a03616263 1002"), Ucd2.Pb().metin(1, "abc").sayi(2, 2).bitir())
    }

    @Test fun ayristiriciParcaliVeCopluAkis() {
        val yanit = Ucd2.cerceve(Ucd2.KOMUT, 1, hex("c800 02 0500 00800000 aa"))
        val medya = Ucd2.cerceve(Ucd2.MEDYA, 2, hex("20 0000000000000000 00000140010c"))
        val akis = hex("ffee") + yanit + medya
        val a = Ucd2.Ayristirici(); val l = ArrayList<Ucd2.Cerceve>()
        for (p in akis.toList().chunked(5)) l += a.besle(p.toByteArray(), p.size)
        assertEquals(2, l.size)
        assertEquals(200, l[0].kod); assertEquals(5, l[0].istek); assertArrayEquals(hex("aa"), l[0].veri)
        assertEquals(0x20, l[1].altAkis); assertArrayEquals(hex("00000140010c"), l[1].veri)
    }

    /** Sahte Luna: selamı bekler, 39/118/1 komutlarına 200 döner, sonra bir görüntü paketi gönderir; kapanışta 2 gelir */
    @Test fun baglantiSirasi() {
        LunaBaglanti.selamBekleme = 100
        val sunucu = ServerSocket(0); val gelen = ArrayBlockingQueue<Int>(20)
        Thread {
            val s = sunucu.accept(); val g = s.getInputStream(); val o = s.getOutputStream(); val a = Ucd2.Ayristirici(); val t = ByteArray(4096)
            runCatching {
                while (true) {
                    val n = g.read(t); if (n < 0) break
                    for (c in a.besle(t, n)) {
                        if (c.tur == Ucd2.NABIZ) { gelen.offer(-1); continue }
                        gelen.offer(c.kod)
                        val y = ByteArray(9); y[0] = 200.toByte(); y[3] = c.istek.toByte(); y[4] = (c.istek shr 8).toByte()
                        o.write(Ucd2.cerceve(Ucd2.KOMUT, 0, y))
                        if (c.kod == LunaBaglanti.CANLI_BASLAT) o.write(Ucd2.cerceve(Ucd2.MEDYA, 1, hex("20 0000000000000000 000001400101")))
                        o.flush()
                    }
                }
            }
            s.close()
        }.start()
        val kare = ArrayBlockingQueue<ByteArray>(4)
        val b = LunaBaglanti("kimlik-test", "127.0.0.1", sunucu.localPort, goruntu = { kare.offer(it) })
        b.ac()
        assertArrayEquals(hex("000001400101"), kare.poll(2, TimeUnit.SECONDS))
        b.kapat()
        val sira = generateSequence { gelen.poll(1, TimeUnit.SECONDS) }.toList()
        assertEquals(-1, sira.first())
        assertEquals(listOf(39, 118, 1, 2), sira.filter { it >= 0 })
        sunucu.close()
    }
}
