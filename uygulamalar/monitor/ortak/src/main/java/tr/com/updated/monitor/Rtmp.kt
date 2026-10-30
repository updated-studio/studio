package tr.com.updated.monitor

import android.media.MediaCodec
import android.media.MediaFormat
import android.view.Surface
import java.io.DataInputStream
import java.io.EOFException
import java.io.IOException
import java.io.OutputStream
import java.net.ServerSocket
import java.net.Socket
import java.nio.ByteBuffer
import java.util.concurrent.CopyOnWriteArrayList

/**
 * RTMP alıcısı (Multi Cam): canlı yayın yapabilen kameralar (DJI Osmo Pocket/Action, Insta360 Ace Pro 2, GO Ultra, GoPro, OBS…)
 * kendi uygulamalarından "RTMP ile canlı yayın" adresine bu telefonu verir: rtmp://<telefon-ip>:1935/canli/<kaynak-adı>.
 * Markadan bağımsız: kameranın protokolünü bilmeden görüntüyü alır. Görüntü H.264 (FLV) ya da H.265 (Enhanced RTMP "hvc1",
 * bazı kameraların kullandığı kodek 12); ses şimdilik alınmaz. Alınan akış yeniden kodlanmadan ayrı kayda (ISO) yazılabilir.
 */
object Rtmp {
    const val KAPI = 1935
    const val UYGULAMA = "canli"

    /** AMF0: komut mesajlarının değerleri (sayı, mantıksal, metin, nesne, boş) */
    object Amf0 {
        fun oku(b: ByteArray): List<Any?> {
            val l = ArrayList<Any?>(); var i = 0
            fun u16() = ((b[i].toInt() and 0xFF) shl 8 or (b[i + 1].toInt() and 0xFF)).also { i += 2 }
            fun u32() = ((b[i].toInt() and 0xFF) shl 24 or ((b[i + 1].toInt() and 0xFF) shl 16) or ((b[i + 2].toInt() and 0xFF) shl 8) or (b[i + 3].toInt() and 0xFF)).also { i += 4 }
            fun metin(n: Int) = String(b, i, n, Charsets.UTF_8).also { i += n }
            fun deger(): Any? {
                return when (b[i++].toInt()) {
                    0 -> java.lang.Double.longBitsToDouble(ByteBuffer.wrap(b, i, 8).long).also { i += 8 }
                    1 -> (b[i++].toInt() != 0)
                    2 -> metin(u16())
                    3, 8 -> {
                        if (b[i - 1].toInt() == 8) i += 4
                        val m = LinkedHashMap<String, Any?>()
                        while (i + 3 <= b.size) {
                            val n = u16(); if (n == 0 && b[i].toInt() == 9) { i++; break }
                            val k = metin(n); m[k] = deger()
                        }
                        m
                    }
                    5, 6 -> null
                    10 -> { val n = u32(); List(n) { deger() } }
                    12 -> metin(u32())
                    else -> throw IOException("AMF0 türü desteklenmiyor")
                }
            }
            while (i < b.size) l.add(deger())
            return l
        }

        class Yaz {
            private val o = java.io.ByteArrayOutputStream()
            private fun u16(v: Int) { o.write(v shr 8); o.write(v) }
            fun sayi(d: Double) = apply { o.write(0); o.write(ByteBuffer.allocate(8).putDouble(d).array()) }
            fun metin(s: String) = apply { val b = s.toByteArray(); o.write(2); u16(b.size); o.write(b) }
            fun bos() = apply { o.write(5) }
            fun nesne(m: Map<String, Any?>) = apply {
                o.write(3)
                for ((k, v) in m) { val b = k.toByteArray(); u16(b.size); o.write(b)
                    when (v) { is Number -> sayi(v.toDouble()); is String -> metin(v); is Boolean -> { o.write(1); o.write(if (v) 1 else 0) }; else -> bos() } }
                u16(0); o.write(9)
            }
            fun bitir(): ByteArray = o.toByteArray()
        }
    }

    /** FLV/RTMP video paketinden çıkan: ayar (Annex B parametre kümeleri) ya da kare (Annex B) */
    class Video(val ayar: Boolean, val hevc: Boolean, val anahtar: Boolean, val veri: ByteArray, val ctsMs: Int)

    private val bas4 = byteArrayOf(0, 0, 0, 1)

    /** Uzunluk önekli NAL'leri (AVCC/HVCC) Annex B'ye çevirir */
    fun annexB(b: ByteArray, bas: Int, uzunluk: Int): ByteArray {
        val o = java.io.ByteArrayOutputStream(b.size + 16); var i = bas
        while (i + uzunluk <= b.size) {
            var n = 0; for (k in 0 until uzunluk) n = (n shl 8) or (b[i + k].toInt() and 0xFF); i += uzunluk
            if (n <= 0 || i + n > b.size) break
            o.write(bas4); o.write(b, i, n); i += n
        }
        return o.toByteArray()
    }

    /** AVCDecoderConfigurationRecord → SPS + PPS (Annex B), NAL uzunluk alanı boyu */
    fun avcAyar(b: ByteArray, bas: Int): Pair<ByteArray, Int> {
        val o = java.io.ByteArrayOutputStream(); var i = bas + 4
        val uz = (b[i++].toInt() and 3) + 1
        repeat(b[i++].toInt() and 0x1F) { val n = ((b[i].toInt() and 0xFF) shl 8) or (b[i + 1].toInt() and 0xFF); i += 2; o.write(bas4); o.write(b, i, n); i += n }
        repeat(b[i++].toInt() and 0xFF) { val n = ((b[i].toInt() and 0xFF) shl 8) or (b[i + 1].toInt() and 0xFF); i += 2; o.write(bas4); o.write(b, i, n); i += n }
        return o.toByteArray() to uz
    }

    /** HEVCDecoderConfigurationRecord → VPS + SPS + PPS (Annex B), NAL uzunluk alanı boyu */
    fun hevcAyar(b: ByteArray, bas: Int): Pair<ByteArray, Int> {
        val o = java.io.ByteArrayOutputStream(); var i = bas + 21
        val uz = (b[i++].toInt() and 3) + 1
        repeat(b[i++].toInt() and 0xFF) {
            i++ // NAL türü
            val say = ((b[i].toInt() and 0xFF) shl 8) or (b[i + 1].toInt() and 0xFF); i += 2
            repeat(say) { val n = ((b[i].toInt() and 0xFF) shl 8) or (b[i + 1].toInt() and 0xFF); i += 2; o.write(bas4); o.write(b, i, n); i += n }
        }
        return o.toByteArray() to uz
    }

    /** Video mesajını çözer; `uz` önceki ayardan gelen NAL uzunluk alanı boyu (ayar paketi yenisini döndürür) */
    class VideoCozucu {
        var uz = 4; private set
        fun coz(d: ByteArray): Video? {
            if (d.size < 5) return null
            val b0 = d[0].toInt() and 0xFF
            if (b0 and 0x80 != 0) { // Enhanced RTMP
                val tur = b0 and 0x0F; val anahtar = (b0 shr 4) and 7 == 1
                val dort = String(d, 1, 4, Charsets.US_ASCII)
                val hevc = dort == "hvc1"; if (!hevc && dort != "avc1") return null
                return when (tur) {
                    0 -> { val (a, u) = if (hevc) hevcAyar(d, 5) else avcAyar(d, 5); uz = u; Video(true, hevc, true, a, 0) }
                    1 -> { val cts = ((d[5].toInt() shl 16) or ((d[6].toInt() and 0xFF) shl 8) or (d[7].toInt() and 0xFF)); Video(false, hevc, anahtar, annexB(d, 8, uz), cts) }
                    3 -> Video(false, hevc, anahtar, annexB(d, 5, uz), 0)
                    else -> null
                }
            }
            val kodek = b0 and 0x0F; val anahtar = (b0 shr 4) == 1
            val hevc = kodek == 12; if (kodek != 7 && !hevc) return null
            val cts = ((d[2].toInt() shl 16) or ((d[3].toInt() and 0xFF) shl 8) or (d[4].toInt() and 0xFF))
            return when (d[1].toInt()) {
                0 -> { val (a, u) = if (hevc) hevcAyar(d, 5) else avcAyar(d, 5); uz = u; Video(true, hevc, true, a, 0) }
                1 -> Video(false, hevc, anahtar, annexB(d, 5, uz), cts)
                else -> null
            }
        }
    }
}

/** Bir kameranın yayını (bağlantı): adı, boyutu, gelen kareleri dinleyene iletir */
class RtmpYayin(val ad: String, val adres: String) {
    @Volatile var genislik = 0; internal set
    @Volatile var yukseklik = 0; internal set
    @Volatile var hevc = false; internal set
    @Volatile var sonAyar: ByteArray? = null; internal set
    /** Gelen her görüntü paketi (ayar ya da kare; zaman µs) */
    @Volatile var dinleyici: ((Rtmp.Video, Long) -> Unit)? = null
    @Volatile internal var soket: Socket? = null
    fun kapat() { runCatching { soket?.close() } }
}

/**
 * RTMP sunucusu: 1935'i dinler; her "publish" yeni bir yayın olur (`yeni`), bağlantı kopunca `bitti`.
 * Basit el sıkışma (şifreli olmayan); çoğu kamera ve OBS bununla bağlanır.
 */
class RtmpSunucu(private val kapi: Int = Rtmp.KAPI, private val yeni: (RtmpYayin) -> Unit, private val bitti: (RtmpYayin) -> Unit) {
    @Volatile private var calis = true
    private var dinleyici: ServerSocket? = null
    val yayinlar = CopyOnWriteArrayList<RtmpYayin>()

    fun baslat() {
        val ss = runCatching { ServerSocket(kapi).also { it.reuseAddress = true } }.getOrElse { HataKaydi.not("rtmp", "dinlenemedi: ${it.message}"); return }
        dinleyici = ss
        Thread({
            while (calis) {
                val s = runCatching { ss.accept() }.getOrNull() ?: break
                Thread({ runCatching { baglanti(s) }.onFailure { if (calis) HataKaydi.not("rtmp", "${s.inetAddress?.hostAddress}: ${it.message}") }; runCatching { s.close() } }, "rtmp-baglanti").start()
            }
        }, "rtmp-sunucu").start()
    }

    fun durdur() { calis = false; runCatching { dinleyici?.close() }; yayinlar.forEach { it.kapat() } }

    private class Parca(var zaman: Long = 0, var uzunluk: Int = 0, var tur: Int = 0, var akis: Int = 0, var fark: Long = 0, var uzun: Boolean = false, var veri: java.io.ByteArrayOutputStream? = null)

    private fun baglanti(s: Socket) {
        s.tcpNoDelay = true; s.receiveBufferSize = 2 * 1024 * 1024; s.soTimeout = 15_000
        val g = DataInputStream(s.getInputStream().buffered(256 * 1024)); val c = s.getOutputStream().buffered(64 * 1024)
        // El sıkışma: C0 C1 → S0 S1 S2 → C2
        if (g.readUnsignedByte() != 3) throw IOException("RTMP sürümü değil")
        val c1 = ByteArray(1536); g.readFully(c1)
        c.write(3); c.write(ByteArray(1536).also { java.util.Random().nextBytes(it); for (k in 0 until 8) it[k] = 0 }); c.write(c1); c.flush()
        g.readFully(ByteArray(1536))

        var parcaBoyu = 128; val gonderBoyu = 4096
        val parcalar = HashMap<Int, Parca>()
        var yayin: RtmpYayin? = null
        val cozucu = Rtmp.VideoCozucu()
        var alinan = 0L; var onayAraligi = 2_500_000; var sonOnay = 0L

        fun gonder(csid: Int, tur: Int, akis: Int, veri: ByteArray) {
            var i = 0; var ilk = true
            while (ilk || i < veri.size) {
                if (ilk) {
                    c.write(csid and 0x3F); c.write(0); c.write(0); c.write(0)
                    c.write(veri.size shr 16); c.write(veri.size shr 8); c.write(veri.size); c.write(tur)
                    c.write(akis); c.write(akis shr 8); c.write(akis shr 16); c.write(akis shr 24)
                } else c.write(0xC0 or (csid and 0x3F))
                val n = minOf(gonderBoyu, veri.size - i); c.write(veri, i, n); i += n; ilk = false
            }
            c.flush()
        }
        fun u32(v: Int) = byteArrayOf((v shr 24).toByte(), (v shr 16).toByte(), (v shr 8).toByte(), v.toByte())
        fun komut(akis: Int, vararg d: Rtmp.Amf0.Yaz.() -> Unit) = gonder(3, 20, akis, Rtmp.Amf0.Yaz().apply { d.forEach { it() } }.bitir())

        fun mesaj(p: Parca, d: ByteArray) {
            when (p.tur) {
                1 -> parcaBoyu = ((d[0].toInt() and 0x7F) shl 24) or ((d[1].toInt() and 0xFF) shl 16) or ((d[2].toInt() and 0xFF) shl 8) or (d[3].toInt() and 0xFF)
                5 -> onayAraligi = ((d[0].toInt() and 0xFF) shl 24) or ((d[1].toInt() and 0xFF) shl 16) or ((d[2].toInt() and 0xFF) shl 8) or (d[3].toInt() and 0xFF)
                20, 17 -> {
                    val l = Rtmp.Amf0.oku(if (p.tur == 17) d.copyOfRange(1, d.size) else d)
                    val ad = l.getOrNull(0) as? String ?: return; val no = (l.getOrNull(1) as? Double) ?: 0.0
                    when (ad) {
                        "connect" -> {
                            gonder(2, 5, 0, u32(2_500_000)); gonder(2, 6, 0, u32(2_500_000) + byteArrayOf(2)); gonder(2, 1, 0, u32(gonderBoyu))
                            komut(0, { metin("_result") }, { sayi(no) }, { nesne(mapOf("fmsVer" to "FMS/3,5,7,7009", "capabilities" to 31.0)) },
                                { nesne(mapOf("level" to "status", "code" to "NetConnection.Connect.Success", "description" to "Bağlandı", "objectEncoding" to 0.0)) })
                        }
                        "createStream" -> komut(0, { metin("_result") }, { sayi(no) }, { bos() }, { sayi(1.0) })
                        "releaseStream", "FCPublish", "FCUnpublish", "_checkbw" -> if (no > 0) komut(0, { metin("_result") }, { sayi(no) }, { bos() }, { bos() })
                        "publish" -> {
                            val akisAdi = (l.getOrNull(3) as? String)?.substringBefore('?')?.ifBlank { null } ?: "Kamera"
                            komut(p.akis, { metin("onStatus") }, { sayi(0.0) }, { bos() },
                                { nesne(mapOf("level" to "status", "code" to "NetStream.Publish.Start", "description" to "$akisAdi yayında")) })
                            yayin = RtmpYayin(akisAdi, s.inetAddress?.hostAddress ?: "").also { it.soket = s; yayinlar.add(it); yeni(it) }
                        }
                        "deleteStream" -> throw EOFException()
                    }
                }
                18, 15 -> { // @setDataFrame onMetaData: boyut
                    val l = runCatching { Rtmp.Amf0.oku(if (p.tur == 15) d.copyOfRange(1, d.size) else d) }.getOrNull() ?: return
                    val m = l.firstOrNull { it is Map<*, *> } as? Map<*, *> ?: return
                    yayin?.let { y -> (m["width"] as? Double)?.let { y.genislik = it.toInt() }; (m["height"] as? Double)?.let { y.yukseklik = it.toInt() } }
                }
                9 -> {
                    val y = yayin ?: return
                    val v = cozucu.coz(d) ?: return
                    if (v.ayar) { y.sonAyar = v.veri; y.hevc = v.hevc }
                    y.dinleyici?.invoke(v, (p.zaman + v.ctsMs) * 1000)
                }
            }
        }

        try {
            while (calis) {
                val b0 = g.readUnsignedByte(); alinan++
                val fmt = b0 shr 6
                val csid = when (b0 and 0x3F) { 0 -> 64 + g.readUnsignedByte(); 1 -> 64 + g.readUnsignedByte() + g.readUnsignedByte() * 256; else -> b0 and 0x3F }
                val p = parcalar.getOrPut(csid) { Parca() }
                fun u24() = (g.readUnsignedByte() shl 16) or (g.readUnsignedByte() shl 8) or g.readUnsignedByte()
                var ts = 0L
                if (fmt <= 2) ts = u24().toLong()
                if (fmt <= 1) { p.uzunluk = u24(); p.tur = g.readUnsignedByte() }
                if (fmt == 0) p.akis = g.readUnsignedByte() or (g.readUnsignedByte() shl 8) or (g.readUnsignedByte() shl 16) or (g.readUnsignedByte() shl 24)
                // Genişletilmiş zaman (≥ 0xFFFFFF): fmt 3 parçalar da öncekinin genişletilmiş alanını taşır
                if (fmt <= 2) p.uzun = ts == 0xFFFFFFL
                if (p.uzun) { val t = g.readInt().toLong() and 0xFFFFFFFFL; if (fmt <= 2) ts = t }
                val yeniMesaj = p.veri == null
                if (yeniMesaj) {
                    when (fmt) { 0 -> { p.zaman = ts; p.fark = ts }; 1, 2 -> { p.fark = ts; p.zaman += ts }; 3 -> p.zaman += p.fark }
                    if (p.uzunluk > 16_000_000) throw IOException("mesaj çok büyük")
                    p.veri = java.io.ByteArrayOutputStream(p.uzunluk)
                }
                val v = p.veri!!
                val n = minOf(parcaBoyu, p.uzunluk - v.size()); val tampon = ByteArray(n); g.readFully(tampon); v.write(tampon)
                alinan += n
                if (v.size() >= p.uzunluk) { p.veri = null; mesaj(p, v.toByteArray()) }
                if (alinan - sonOnay > onayAraligi) { sonOnay = alinan; gonder(2, 3, 0, u32(alinan.toInt())) }
            }
        } catch (_: EOFException) {
        } finally {
            yayin?.let { yayinlar.remove(it); it.dinleyici = null; bitti(it) }
        }
    }
}

/** Multi Cam kaynağı: bir RTMP yayınının görüntüsünü çözüp yüzeye çizer; ayrı kayıt için akış olduğu gibi `kayit`a gider */
class RtmpKaynak(val yayin: RtmpYayin) : Kaynak {
    override val ad: String get() = yayin.ad
    @Volatile var kayit: AkisKaydi? = null
    @Volatile private var calis = true
    private var cozucu: MediaCodec? = null
    private var hevcCozucu = false

    override fun baslat(yuzey: Surface, boyut: (Int, Int) -> Unit, hata: (String) -> Unit) {
        val w = yayin.genislik.takeIf { it > 0 } ?: 1920; val h = yayin.yukseklik.takeIf { it > 0 } ?: 1080
        boyut(w, h)
        fun kur(ayar: ByteArray, hevc: Boolean) {
            runCatching { cozucu?.stop() }; runCatching { cozucu?.release() }; cozucu = null
            val mime = if (hevc) MediaFormat.MIMETYPE_VIDEO_HEVC else MediaFormat.MIMETYPE_VIDEO_AVC
            val f = MediaFormat.createVideoFormat(mime, yayin.genislik.takeIf { it > 0 } ?: w, yayin.yukseklik.takeIf { it > 0 } ?: h).apply {
                if (hevc) setByteBuffer("csd-0", ByteBuffer.wrap(ayar))
                else { val ps = AkisKaydi.nallar(ayar).map { it.first to (it.first[0].toInt() and 0x1F) }
                    ps.firstOrNull { it.second == 7 }?.let { setByteBuffer("csd-0", ByteBuffer.wrap(byteArrayOf(0, 0, 0, 1) + it.first)) }
                    ps.firstOrNull { it.second == 8 }?.let { setByteBuffer("csd-1", ByteBuffer.wrap(byteArrayOf(0, 0, 0, 1) + it.first)) } }
                if (android.os.Build.VERSION.SDK_INT >= 30) setInteger(MediaFormat.KEY_LOW_LATENCY, 1)
            }
            cozucu = runCatching { MediaCodec.createDecoderByType(mime).also { it.configure(f, yuzey, null, 0); it.start() } }
                .onFailure { e -> HataKaydi.not("rtmp", "çözücü: ${e.message}"); hata("${yayin.ad}: görüntü çözülemedi") }.getOrNull()
            hevcCozucu = hevc
            if (yayin.genislik > 0) boyut(yayin.genislik, yayin.yukseklik)
        }
        yayin.sonAyar?.let { kur(it, yayin.hevc) }
        yayin.dinleyici = { v, us ->
            if (calis) {
                if (v.ayar) { kayit?.ayarVer(v.veri); kur(v.veri, v.hevc) }
                else {
                    kayit?.kare(v.veri, v.anahtar, us)
                    cozucu?.let { c -> runCatching {
                        val i = c.dequeueInputBuffer(50_000)
                        if (i >= 0) { c.getInputBuffer(i)!!.apply { clear(); put(v.veri) }; c.queueInputBuffer(i, 0, v.veri.size, us, if (v.anahtar) MediaCodec.BUFFER_FLAG_KEY_FRAME else 0) }
                        val b = MediaCodec.BufferInfo()
                        while (true) { val o = c.dequeueOutputBuffer(b, 0); if (o >= 0) c.releaseOutputBuffer(o, true) else if (o == MediaCodec.INFO_TRY_AGAIN_LATER) break }
                    }.onFailure { HataKaydi.not("rtmp", "kare: ${it.message}") } }
                }
            }
        }
    }

    override fun durdur() {
        calis = false; yayin.dinleyici = null
        runCatching { cozucu?.stop() }; runCatching { cozucu?.release() }; cozucu = null
    }
}
