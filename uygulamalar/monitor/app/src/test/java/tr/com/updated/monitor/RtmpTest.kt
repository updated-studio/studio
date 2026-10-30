package tr.com.updated.monitor

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.net.Socket
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.TimeUnit

/** RTMP alıcısı: AMF0, AVC/HEVC ayar kayıtları ve sahte bir kameranın yayın sırası (el sıkışma → connect → publish → görüntü) */
class RtmpTest {
    private fun hex(s: String) = s.replace(" ", "").chunked(2).map { it.toInt(16).toByte() }.toByteArray()

    @Test fun amf0GidisDonus() {
        val b = Rtmp.Amf0.Yaz().metin("publish").sayi(5.0).bos().metin("kamera1").nesne(mapOf("a" to 1.0, "b" to "x")).bitir()
        val l = Rtmp.Amf0.oku(b)
        assertEquals(listOf("publish", 5.0, null, "kamera1", mapOf("a" to 1.0, "b" to "x")), l)
    }

    @Test fun avcAyarVeKare() {
        // AVCDecoderConfigurationRecord: sürüm 1, profil 42, uyum c0, seviye 1f, ff (4 bayt uzunluk), 1 SPS, 1 PPS
        val kayit = hex("01 42c01f ff e1 0004 6742c01f 01 0003 68ce3c")
        val c = Rtmp.VideoCozucu()
        val a = c.coz(hex("17 00 000000") + kayit)!!
        assertTrue(a.ayar); assertArrayEquals(hex("00000001 6742c01f 00000001 68ce3c"), a.veri)
        val k = c.coz(hex("17 01 000000") + hex("00000003 650102 00000002 0607"))!!
        assertTrue(k.anahtar); assertArrayEquals(hex("00000001 650102 00000001 0607"), k.veri)
        // Enhanced RTMP HEVC: anahtar kare, CodedFramesX (zaman farkı yok)
        val h = c.coz(hex("93") + "hvc1".toByteArray() + hex("00000002 2601"))!!
        assertTrue(h.hevc && h.anahtar); assertArrayEquals(hex("00000001 2601"), h.veri)
    }

    /** Sahte kamera: parça boyu 128 iken 128'den uzun mesaj (fmt 3 devam parçaları) da gönderir */
    @Test fun yayinSirasi() {
        val kapi = 19000 + (System.nanoTime() % 900).toInt()
        val gelen = ArrayBlockingQueue<Any>(20)
        val sunucu = RtmpSunucu(kapi, yeni = { y -> gelen.offer("yeni:" + y.ad); y.dinleyici = { v, us -> gelen.offer(v); gelen.offer(us) } }, bitti = { gelen.offer("bitti") })
        sunucu.baslat(); Thread.sleep(200)
        val s = Socket("127.0.0.1", kapi); val o = s.getOutputStream(); val g = DataInputStream(s.getInputStream())
        o.write(3); o.write(ByteArray(1536)); o.flush()
        g.readFully(ByteArray(1 + 1536 + 1536)); o.write(ByteArray(1536)); o.flush()
        fun mesaj(tur: Int, akis: Int, zaman: Int, d: ByteArray) {
            val b = ByteArrayOutputStream()
            b.write(3); b.write(zaman shr 16); b.write(zaman shr 8); b.write(zaman); b.write(d.size shr 16); b.write(d.size shr 8); b.write(d.size); b.write(tur)
            b.write(akis); b.write(0); b.write(0); b.write(0)
            var i = 0; while (i < d.size) { if (i > 0) b.write(0xC3); val n = minOf(128, d.size - i); b.write(d, i, n); i += n }
            o.write(b.toByteArray()); o.flush()
        }
        mesaj(20, 0, 0, Rtmp.Amf0.Yaz().metin("connect").sayi(1.0).nesne(mapOf("app" to "canli")).bitir())
        mesaj(20, 0, 0, Rtmp.Amf0.Yaz().metin("createStream").sayi(2.0).bos().bitir())
        mesaj(20, 1, 0, Rtmp.Amf0.Yaz().metin("publish").sayi(3.0).bos().metin("osmo?anahtar=1").metin("live").bitir())
        assertEquals("yeni:osmo", gelen.poll(2, TimeUnit.SECONDS))
        mesaj(9, 1, 0, hex("17 00 000000 01 42c01f ff e1 0004 6742c01f 01 0003 68ce3c"))
        val buyuk = ByteArray(300) { 7 }
        mesaj(9, 1, 40, hex("17 01 000000") + byteArrayOf(0, 0, 1, 44) + buyuk)
        val ayar = gelen.poll(2, TimeUnit.SECONDS) as Rtmp.Video; gelen.poll(1, TimeUnit.SECONDS)
        assertTrue(ayar.ayar)
        val kare = gelen.poll(2, TimeUnit.SECONDS) as Rtmp.Video; val us = gelen.poll(1, TimeUnit.SECONDS)
        assertEquals(304, kare.veri.size); assertEquals(40_000L, us)
        s.close()
        assertEquals("bitti", gelen.poll(2, TimeUnit.SECONDS))
        sunucu.durdur()
    }
}
