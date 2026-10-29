package tr.com.updated.monitor

import android.content.Context
import android.media.MediaCodec
import android.media.MediaFormat
import android.net.ConnectivityManager
import android.net.Network
import android.view.Surface
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.Inet4Address
import java.net.InetSocketAddress
import java.net.Socket
import java.util.UUID
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/**
 * Insta360 Luna Ultra'nın Wi-Fi dili (UCD2). Ayrıntı: notlar/insta360-luna.md "Luna UCD2 protokolü".
 * Çerçeve: "UCD2" 01 0c [tür] [sıra] [gövde uzunluğu 4 LE] [gövde] [denetim 4 LE]; tür 1 medya, 4 komut/yanıt, 5 nabız.
 */
object Ucd2 {
    const val MEDYA = 1; const val KOMUT = 4; const val NABIZ = 5
    const val BASLIK = 12
    private val IMZA = byteArrayOf(0x55, 0x43, 0x44, 0x32)
    /** İstemci nabzının sonundaki sabit (kamera kabul ediyor; hesaplanmış denetim değil) */
    private val SELAM_SONU = byteArrayOf(0xf6.toByte(), 0xcc.toByte(), 0x4f, 0x09)
    private const val EN_COK = 8 shl 20
    private val tablo = IntArray(256) { i -> var c = i shl 24; repeat(8) { c = if (c and Int.MIN_VALUE != 0) (c shl 1) xor 0x04C11DB7 else c shl 1 }; c }

    /** Denetim değeri: her bayt en düşük bayta XOR'lanır, sonra 4 kez 8 bit kaydırılıp tablodan geçirilir */
    fun denetim(b: ByteArray, bas: Int, son: Int): Int {
        var c = -1
        for (i in bas until son) { c = c xor (b[i].toInt() and 0xFF); repeat(4) { c = (c shl 8) xor tablo[c ushr 24] } }
        return c
    }

    private fun yazLe(b: ByteArray, i: Int, v: Int) { for (k in 0..3) b[i + k] = (v ushr (8 * k)).toByte() }
    fun okuLe(b: ByteArray, i: Int) = (b[i].toInt() and 0xFF) or ((b[i + 1].toInt() and 0xFF) shl 8) or ((b[i + 2].toInt() and 0xFF) shl 16) or ((b[i + 3].toInt() and 0xFF) shl 24)
    private fun kisaLe(b: ByteArray, i: Int) = (b[i].toInt() and 0xFF) or ((b[i + 1].toInt() and 0xFF) shl 8)

    private fun baslik(b: ByteArray, tur: Int, sira: Int) { IMZA.copyInto(b); b[4] = 1; b[5] = BASLIK.toByte(); b[6] = tur.toByte(); b[7] = sira.toByte() }

    fun cerceve(tur: Int, sira: Int, govde: ByteArray): ByteArray {
        val b = ByteArray(govde.size + BASLIK + 4)
        baslik(b, tur, sira); yazLe(b, 8, govde.size); govde.copyInto(b, BASLIK)
        yazLe(b, BASLIK + govde.size, denetim(b, 0, BASLIK + govde.size))
        return b
    }

    fun selam(sira: Int) = ByteArray(16).also { baslik(it, NABIZ, sira); SELAM_SONU.copyInto(it, BASLIK) }

    /** Komut gövdesi: [kod 2] 02 [istek no 2] 00 80 00 00 [protobuf] */
    fun komut(sira: Int, kod: Int, istek: Int, pb: ByteArray): ByteArray {
        val g = ByteArray(9 + pb.size)
        g[0] = kod.toByte(); g[1] = (kod shr 8).toByte(); g[2] = 2; g[3] = istek.toByte(); g[4] = (istek shr 8).toByte(); yazLe(g, 5, 0x8000)
        pb.copyInto(g, 9)
        return cerceve(KOMUT, sira, g)
    }

    /** Gelen çerçeve. Komutta kod/istek dolu; medyada alt akış (0x20 görüntü) dolu; veri 9 baytlık alt başlıktan sonrası */
    class Cerceve(val tur: Int, val kod: Int = 0, val istek: Int = 0, val altAkis: Int = 0, val veri: ByteArray)

    /** Akıştan çerçeveleri ayıklar (TCP parçalı gelir; imzayı arar, bozuk uzunluğu atlar) */
    class Ayristirici {
        private var b = ByteArray(256 * 1024); private var n = 0
        fun besle(v: ByteArray, adet: Int): List<Cerceve> {
            if (n + adet > b.size) b = b.copyOf(maxOf(b.size * 2, n + adet))
            v.copyInto(b, n, 0, adet); n += adet
            val l = ArrayList<Cerceve>(); var i = 0
            while (true) {
                val s = imza(i)
                if (s < 0) { i = maxOf(i, n - 3); break }
                if (n - s < BASLIK) { i = s; break }
                val boy = okuLe(b, s + 8)
                if (boy < 0 || boy > EN_COK) { i = s + 4; continue }
                if (n - s < boy + BASLIK + 4) { i = s; break }
                l.add(coz(b[s + 6].toInt() and 0xFF, s + BASLIK, boy)); i = s + boy + BASLIK + 4
            }
            if (i > 0) { b.copyInto(b, 0, i, n); n -= i }
            return l
        }
        private fun imza(bas: Int): Int { var i = bas; while (i <= n - 4) { if (b[i] == IMZA[0] && b[i + 1] == IMZA[1] && b[i + 2] == IMZA[2] && b[i + 3] == IMZA[3]) return i; i++ }; return -1 }
        private fun coz(tur: Int, p: Int, boy: Int) = when {
            tur == KOMUT && boy >= 9 -> Cerceve(tur, kod = kisaLe(b, p), istek = kisaLe(b, p + 3), veri = b.copyOfRange(p + 9, p + boy))
            tur == MEDYA && boy > 9 -> Cerceve(tur, altAkis = b[p].toInt() and 0xFF, veri = b.copyOfRange(p + 9, p + boy))
            else -> Cerceve(tur, veri = b.copyOfRange(p, p + boy))
        }
    }

    /** Düz protobuf: varint ve metin alanları yeter */
    class Pb {
        private val o = java.io.ByteArrayOutputStream()
        private fun varint(v: Long) { var x = v; while (x and 0x7F.inv().toLong() != 0L) { o.write(((x and 0x7F) or 0x80).toInt()); x = x ushr 7 }; o.write(x.toInt()) }
        fun sayi(alan: Int, v: Long) = apply { varint((alan shl 3).toLong()); varint(v) }
        fun metin(alan: Int, v: String) = apply { val b = v.toByteArray(); varint(((alan shl 3) or 2).toLong()); varint(b.size.toLong()); o.write(b) }
        fun bitir(): ByteArray = o.toByteArray()
    }
}

/**
 * Luna ile tek bağlantı: selam + 3 sn nabız → 39 yetki → 118 → 1 canlı görüntü. Kameraya bunlardan başka bir şey yazılmaz
 * (ayar değiştirilmez); kapanırken 2 (canlı görüntüyü durdur). Görüntü `goruntu`ya H.265 Annex B erişim birimi olarak gelir.
 */
class LunaBaglanti(private val kimlik: String, private val host: String = ADRES, private val kapi: Int = KAPI, private val ag: Network? = null,
                   private val goruntu: (ByteArray) -> Unit, private val durum: (String) -> Unit = {}) {
    companion object {
        const val ADRES = "192.168.42.1"; const val KAPI = 6666
        const val YETKI = 39; const val DOSYA_ERISIM = 118; const val CANLI_BASLAT = 1; const val CANLI_DURDUR = 2
        const val TAMAM = 200; const val RET = 500
        var selamBekleme = 1500L; var nabizAra = 3000L; var yetkiBekleme = 30_000L; var komutBekleme = 8000L
    }
    @Volatile private var soket: Socket? = null
    @Volatile private var cikis: OutputStream? = null
    @Volatile var acik = false; private set
    private val sira = AtomicInteger(0); private val istekNo = AtomicInteger(0)
    private val bekleyen = ConcurrentHashMap<Int, ArrayBlockingQueue<Ucd2.Cerceve>>()
    private val yazKilit = Any()

    private fun gonder(b: ByteArray) = synchronized(yazKilit) { (cikis ?: throw IOException("bağlı değil")).apply { write(b); flush() } }

    private fun iste(kod: Int, pb: ByteArray, sure: Long = komutBekleme): Ucd2.Cerceve {
        val no = istekNo.incrementAndGet() and 0xFFFF; val q = ArrayBlockingQueue<Ucd2.Cerceve>(1); bekleyen[no] = q
        try {
            gonder(Ucd2.komut(sira.incrementAndGet(), kod, no, pb))
            val y = q.poll(sure, TimeUnit.MILLISECONDS) ?: throw IOException(if (!acik) "Luna bağlantıyı kapattı" else "Luna $kod komutuna cevap vermedi")
            if (y.kod == RET) throw IOException(if (kod == YETKI) "Luna izin vermedi; kameranın ekranında onay isteniyorsa onayla" else "Luna $kod komutunu reddetti")
            return y
        } finally { bekleyen.remove(no) }
    }

    /** Bağlanır ve görüntüyü başlatır; dönünce görüntü akıyor. Hata olursa IOException (açıklama kullanıcıya gösterilir) */
    fun ac() {
        val s = Socket(); ag?.bindSocket(s); s.tcpNoDelay = true; s.receiveBufferSize = 1024 * 1024
        try { s.connect(InetSocketAddress(host, kapi), 5000) } catch (e: IOException) { runCatching { s.close() }; throw IOException("Luna'ya ulaşılamadı: telefon kameranın Wi-Fi'ına bağlı mı?") }
        soket = s; cikis = s.getOutputStream(); acik = true
        val giris = s.getInputStream()
        Thread({ oku(giris) }, "luna-oku").start()
        gonder(Ucd2.selam(sira.incrementAndGet()))
        Thread.sleep(selamBekleme)
        if (!acik) throw IOException("Luna bağlantıyı reddetti: başka telefonda Insta360 uygulaması açıksa kapat")
        Thread({ while (acik) { runCatching { Thread.sleep(nabizAra); if (acik) gonder(Ucd2.selam(sira.incrementAndGet())) } } }, "luna-nabiz").start()
        durum("Luna: izin isteniyor (kameranın ekranına bak)")
        iste(YETKI, Ucd2.Pb().metin(1, kimlik).sayi(2, 2).bitir(), yetkiBekleme)
        iste(DOSYA_ERISIM, Ucd2.Pb().sayi(1, 5).bitir())
        iste(CANLI_BASLAT, Ucd2.Pb().sayi(2, 1).sayi(6, 40).sayi(7, 9).sayi(8, 1).sayi(9, 40).sayi(10, 18).bitir())
        durum("Luna: görüntü başladı")
    }

    private fun oku(g: InputStream) {
        val a = Ucd2.Ayristirici(); val t = ByteArray(64 * 1024)
        try {
            while (true) {
                val n = g.read(t); if (n < 0) break
                for (c in a.besle(t, n)) when {
                    c.tur == Ucd2.KOMUT && c.kod < 8192 -> bekleyen[c.istek]?.offer(c)
                    c.tur == Ucd2.MEDYA && c.altAkis == 0x20 && c.veri.isNotEmpty() -> goruntu(c.veri)
                }
            }
        } catch (_: IOException) {}
        acik = false
    }

    fun kapat() {
        if (acik) runCatching { gonder(Ucd2.komut(sira.incrementAndGet(), CANLI_DURDUR, istekNo.incrementAndGet() and 0xFFFF, ByteArray(0))) }
        acik = false; runCatching { soket?.close() }
    }
}

/** Masa kaynağı: Luna'nın görüntüsünü (1280×720 H.265) çözüp yuvaya çizer; koparsa yeniden bağlanır */
class LunaKaynak(private val ctx: Context, override val ad: String = "Insta360 Luna") : Kaynak {
    companion object {
        /** Bu uygulamanın Luna'ya kendini tanıttığı kimlik (bir kez üretilir, saklanır) */
        fun kimlik(ctx: Context): String {
            val t = ctx.getSharedPreferences("kamera", Context.MODE_PRIVATE)
            return t.getString("luna.kimlik", null) ?: UUID.randomUUID().toString().also { t.edit().putString("luna.kimlik", it).apply() }
        }
        /** Telefonun Luna'nın Wi-Fi'ına (192.168.42.x) bağlı ağı; yoksa null. İnternetsiz ağ olduğundan soket ona bağlanır */
        fun ag(ctx: Context): Network? {
            val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            @Suppress("DEPRECATION")
            return cm.allNetworks.firstOrNull { n -> cm.getLinkProperties(n)?.linkAddresses?.any { (it.address as? Inet4Address)?.hostAddress?.startsWith("192.168.42.") == true } == true }
        }
    }
    @Volatile private var calis = true
    @Volatile private var baglanti: LunaBaglanti? = null

    override fun baslat(yuzey: Surface, boyut: (Int, Int) -> Unit, hata: (String) -> Unit) {
        Thread({
            var son = ""
            while (calis) {
                val ag = ag(ctx)
                if (ag == null) { if (son != "ag") { son = "ag"; hata("$ad: telefonu kameranın Wi-Fi'ına bağla (Ayarlar → Wi-Fi → \"Luna Ultra…\")") }; Thread.sleep(2000); continue }
                var cozucu: MediaCodec? = null; var anahtarGeldi = false; var bas = 0L
                val b = LunaBaglanti(kimlik(ctx), ag = ag, goruntu = { au ->
                    if (!anahtarGeldi) anahtarGeldi = anahtarMi(au)
                    val c = cozucu
                    if (anahtarGeldi && c != null) runCatching {
                        val i = c.dequeueInputBuffer(30_000)
                        if (i >= 0) { c.getInputBuffer(i)!!.apply { clear(); put(au) }; c.queueInputBuffer(i, 0, au.size, (System.nanoTime() - bas) / 1000, 0) }
                        val bi = MediaCodec.BufferInfo()
                        while (true) {
                            val o = c.dequeueOutputBuffer(bi, 0)
                            if (o >= 0) c.releaseOutputBuffer(o, true)
                            else if (o == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) c.outputFormat.let { f -> boyut(f.getInteger(MediaFormat.KEY_WIDTH), f.getInteger(MediaFormat.KEY_HEIGHT)) }
                            else break
                        }
                    }.onFailure { e -> HataKaydi.not("luna", "çözücü: ${e.message}"); anahtarGeldi = false }
                }, durum = { m -> if (m != son) { son = m; hata(m) } })
                baglanti = b
                try {
                    boyut(1280, 720); bas = System.nanoTime()
                    cozucu = MediaCodec.createDecoderByType(MediaFormat.MIMETYPE_VIDEO_HEVC).also { c ->
                        c.configure(MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_HEVC, 1280, 720).apply { if (android.os.Build.VERSION.SDK_INT >= 30) setInteger(MediaFormat.KEY_LOW_LATENCY, 1) }, yuzey, null, 0)
                        c.start() }
                    b.ac()
                    while (calis && b.acik) Thread.sleep(300)
                    if (calis) { son = ""; hata("$ad: bağlantı koptu, yeniden deneniyor") }
                } catch (e: Exception) {
                    HataKaydi.not("luna", e.stackTraceToString())
                    val m = "$ad: ${e.message}"; if (m != son) { son = m; hata(m) }
                } finally {
                    b.kapat(); runCatching { cozucu?.stop() }; runCatching { cozucu?.release() }; baglanti = null
                }
                if (calis) Thread.sleep(2000)
            }
        }, "masa-luna").start()
    }

    /** H.265 erişim biriminde IRAP (16–23) ya da VPS/SPS (32/33) var mı */
    private fun anahtarMi(b: ByteArray): Boolean {
        var i = 0
        while (i + 3 < b.size) {
            if (b[i].toInt() == 0 && b[i + 1].toInt() == 0 && b[i + 2].toInt() == 1) { val t = (b[i + 3].toInt() shr 1) and 0x3F; if (t in 16..23 || t == 32 || t == 33) return true; i += 3 } else i++
        }
        return false
    }

    override fun durdur() { calis = false; baglanti?.kapat() }
}
