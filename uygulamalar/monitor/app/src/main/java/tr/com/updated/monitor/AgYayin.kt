package tr.com.updated.monitor

import android.content.Context
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Bundle
import android.view.Surface
import org.json.JSONObject
import java.io.DataInputStream
import java.io.DataOutputStream
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.TimeUnit

/**
 * Masa (çok kameralı kayıt) için Wi-Fi görüntü aktarımı. Kamera telefonu sunucudur: görüntüyü H.264'e sıkıştırır, ağda
 * "_updatedkam._tcp" adıyla kendini duyurur (NSD); masa bulur ve bağlanır. Aynı Wi-Fi ya da masanın erişim noktası yeter.
 *
 * Akış (TCP): önce tek satır JSON başlık {"ad","w","h"}, sonra paketler: [tür 1 bayt][uzunluk 4][zaman µs 8][veri].
 * Tür: 0 = kodlayıcı ayarı (SPS/PPS), 1 = anahtar kare, 2 = kare, 3 = yön (veri: derece, 2 bayt). Masadan kameraya
 * satır satır JSON gelir: {"tally":true} (kamera canlıda).
 */
object AgYayin {
    const val TUR = "_updatedkam._tcp."
    const val KAPI = 47800
    const val AYAR: Byte = 0; const val ANAHTAR: Byte = 1; const val KARE: Byte = 2; const val YON: Byte = 3
}

/** Kamera tarafı: `yuzey`e çizilen görüntüyü sıkıştırıp bağlanan masaya gönderir */
class YayinVerici(private val ctx: Context, val ad: String, val genislik: Int, val yukseklik: Int, private val mbps: Int = 6,
                  private val tally: (Boolean) -> Unit, private val durum: (String) -> Unit) {
    lateinit var yuzey: Surface; private set
    private lateinit var kodlayici: MediaCodec
    private var sunucu: ServerSocket? = null
    @Volatile private var istemci: Socket? = null
    @Volatile private var calis = true
    @Volatile private var ayarVerisi: ByteArray? = null
    @Volatile private var anahtarBekle = true
    @Volatile var yon = 0; set(v) { if (field != v) { field = v; kuyruk.offer(Paket(AgYayin.YON, 0L, byteArrayOf((v shr 8).toByte(), v.toByte()))) } }
    private class Paket(val tur: Byte, val us: Long, val veri: ByteArray)
    private val kuyruk = ArrayBlockingQueue<Paket>(60)
    private var nsd: NsdManager? = null
    private var kayitDinle: NsdManager.RegistrationListener? = null
    val bagli: Boolean get() = istemci != null

    fun baslat() {
        val f = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, genislik, yukseklik).apply {
            setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
            setInteger(MediaFormat.KEY_BIT_RATE, mbps * 1_000_000); setInteger(MediaFormat.KEY_FRAME_RATE, 30); setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
            if (android.os.Build.VERSION.SDK_INT >= 30) setInteger(MediaFormat.KEY_LOW_LATENCY, 1)
        }
        kodlayici = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC).also { it.configure(f, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE) }
        yuzey = kodlayici.createInputSurface()
        kodlayici.start()
        Thread({ bosalt() }, "yayin-kodla").start()
        // Sabit kapı (adresle elle bağlanmak için); doluysa rastgele
        val s = runCatching { ServerSocket(AgYayin.KAPI) }.getOrElse { ServerSocket(0) }.also { sunucu = it }
        Thread({ kabul(s) }, "yayin-kabul").start()
        Thread({ gonder() }, "yayin-gonder").start()
        duyur(s.localPort)
        durum("Masa bekleniyor")
    }

    private fun duyur(port: Int) {
        val n = ctx.getSystemService(Context.NSD_SERVICE) as NsdManager; nsd = n
        val l = object : NsdManager.RegistrationListener {
            override fun onServiceRegistered(i: NsdServiceInfo) {}
            override fun onRegistrationFailed(i: NsdServiceInfo, e: Int) { HataKaydi.not("yayin", "NSD kaydı olmadı $e") }
            override fun onServiceUnregistered(i: NsdServiceInfo) {}
            override fun onUnregistrationFailed(i: NsdServiceInfo, e: Int) {}
        }
        kayitDinle = l
        runCatching { n.registerService(NsdServiceInfo().apply { serviceName = ad; serviceType = AgYayin.TUR; setPort(port) }, NsdManager.PROTOCOL_DNS_SD, l) }
    }

    /** Bir seferde tek masa: yeni bağlanan eskisinin yerini alır */
    private fun kabul(s: ServerSocket) {
        while (calis) {
            val c = runCatching { s.accept() }.getOrNull() ?: break
            runCatching { istemci?.close() }
            c.tcpNoDelay = true; c.sendBufferSize = 512 * 1024
            runCatching { c.getOutputStream().write((JSONObject().put("ad", ad).put("w", genislik).put("h", yukseklik).toString() + "\n").toByteArray()) }
            kuyruk.clear(); anahtarBekle = true; istemci = c
            ayarVerisi?.let { kuyruk.offer(Paket(AgYayin.AYAR, 0L, it)) }
            kuyruk.offer(Paket(AgYayin.YON, 0L, byteArrayOf((yon shr 8).toByte(), yon.toByte())))
            anahtarIste()
            durum("Masaya bağlı")
            Thread({ dinle(c) }, "yayin-dinle").start()
        }
    }

    private fun anahtarIste() = runCatching { kodlayici.setParameters(Bundle().apply { putInt(MediaCodec.PARAMETER_KEY_REQUEST_SYNC_FRAME, 0) }) }

    private fun dinle(c: Socket) {
        runCatching {
            c.getInputStream().bufferedReader().forEachLine { l -> runCatching { val j = JSONObject(l); if (j.has("tally")) tally(j.getBoolean("tally")) } }
        }
        if (istemci === c) { istemci = null; tally(false); if (calis) durum("Masa bekleniyor") }
    }

    private fun bosalt() {
        val b = MediaCodec.BufferInfo()
        while (calis) {
            val o = try { kodlayici.dequeueOutputBuffer(b, 20_000) } catch (e: IllegalStateException) { break }
            if (o < 0) continue
            val tampon = kodlayici.getOutputBuffer(o)
            if (tampon != null && b.size > 0) {
                val v = ByteArray(b.size); tampon.position(b.offset); tampon.get(v)
                when {
                    b.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0 -> { ayarVerisi = v; if (istemci != null) kuyruk.offer(Paket(AgYayin.AYAR, 0L, v)) }
                    istemci == null -> {}
                    else -> {
                        val anahtar = b.flags and MediaCodec.BUFFER_FLAG_KEY_FRAME != 0
                        if (anahtar) anahtarBekle = false
                        // Ağ yetişmiyorsa kuyruk dolar: bir sonraki anahtar kareye kadar atlanır (görüntü bozulmaz, yalnız takılır)
                        if (!anahtarBekle && !kuyruk.offer(Paket(if (anahtar) AgYayin.ANAHTAR else AgYayin.KARE, b.presentationTimeUs, v))) { kuyruk.clear(); anahtarBekle = true; anahtarIste() }
                    }
                }
            }
            runCatching { kodlayici.releaseOutputBuffer(o, false) }
        }
    }

    private fun gonder() {
        while (calis) {
            val p = kuyruk.poll(200, TimeUnit.MILLISECONDS) ?: continue
            val c = istemci ?: continue
            runCatching {
                val d = DataOutputStream(c.getOutputStream().buffered(256 * 1024))
                d.writeByte(p.tur.toInt()); d.writeInt(p.veri.size); d.writeLong(p.us); d.write(p.veri); d.flush()
            }.onFailure { runCatching { c.close() } }
        }
    }

    fun durdur() {
        calis = false
        runCatching { kayitDinle?.let { nsd?.unregisterService(it) } }
        runCatching { istemci?.close() }; runCatching { sunucu?.close() }
        Thread { Thread.sleep(100); runCatching { kodlayici.stop() }; runCatching { kodlayici.release() }; runCatching { yuzey.release() } }.start()
    }
}

/** Masa tarafı: Wi-Fi kamerasına bağlanır, görüntüyü çözüp yüzeye çizer; bağlantı koparsa kendiliğinden yeniden bağlanır */
class WifiKameraKaynak(val host: String, val port: Int, override val ad: String) : Kaynak {
    @Volatile private var calis = true
    @Volatile private var soket: Socket? = null
    @Volatile var yon = 0; private set
    /** Kameranın yönü değişince (telefon yan çevrildi) */
    var yonDegisti: (Int) -> Unit = {}
    @Volatile var bagli = false; private set
    @Volatile private var tallyAcik = false

    override fun baslat(yuzey: Surface, boyut: (Int, Int) -> Unit, hata: (String) -> Unit) {
        Thread({
            var uyarildi = false
            while (calis) {
                runCatching { oku(yuzey, boyut) }.onFailure { e -> if (calis && !uyarildi) { uyarildi = true; hata("$ad: bağlantı koptu, yeniden deneniyor") }; HataKaydi.not("masa", "$ad: ${e.message}") }
                bagli = false
                if (calis) Thread.sleep(1000)
            }
        }, "masa-$ad").start()
    }

    private fun oku(yuzey: Surface, boyut: (Int, Int) -> Unit) {
        val s = Socket(); s.tcpNoDelay = true; s.receiveBufferSize = 1024 * 1024
        s.connect(InetSocketAddress(host, port), 3000); soket = s
        val giris = DataInputStream(s.getInputStream().buffered(256 * 1024))
        val bas = StringBuilder(); while (true) { val c = giris.read(); if (c < 0) throw java.io.EOFException(); if (c == '\n'.code) break; bas.append(c.toChar()) }
        val j = JSONObject(bas.toString()); val w = j.getInt("w"); val h = j.getInt("h")
        boyut(w, h); bagli = true; tallyGonder(tallyAcik)
        var cozucu: MediaCodec? = null
        try {
            while (calis) {
                val tur = giris.readByte(); val n = giris.readInt(); val us = giris.readLong()
                if (n < 0 || n > 8_000_000) throw java.io.IOException("bozuk paket")
                val v = ByteArray(n); giris.readFully(v)
                when (tur) {
                    AgYayin.YON -> { yon = ((v[0].toInt() and 0xFF) shl 8) or (v[1].toInt() and 0xFF); yonDegisti(yon) }
                    AgYayin.AYAR -> {
                        runCatching { cozucu?.stop() }; runCatching { cozucu?.release() }
                        val f = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, w, h).apply {
                            setByteBuffer("csd-0", java.nio.ByteBuffer.wrap(v))
                            if (android.os.Build.VERSION.SDK_INT >= 30) setInteger(MediaFormat.KEY_LOW_LATENCY, 1)
                        }
                        cozucu = MediaCodec.createDecoderByType(MediaFormat.MIMETYPE_VIDEO_AVC).also { it.configure(f, yuzey, null, 0); it.start() }
                    }
                    else -> cozucu?.let { c ->
                        val i = c.dequeueInputBuffer(50_000)
                        if (i >= 0) { c.getInputBuffer(i)!!.apply { clear(); put(v) }; c.queueInputBuffer(i, 0, n, us, if (tur == AgYayin.ANAHTAR) MediaCodec.BUFFER_FLAG_KEY_FRAME else 0) }
                        // Çözülen kare beklemeden ekrana (gecikme birikmesin)
                        val b = MediaCodec.BufferInfo()
                        while (true) { val o = c.dequeueOutputBuffer(b, 0); if (o >= 0) c.releaseOutputBuffer(o, true) else if (o == MediaCodec.INFO_TRY_AGAIN_LATER) break }
                    }
                }
            }
        } finally { runCatching { cozucu?.stop() }; runCatching { cozucu?.release() }; runCatching { s.close() } }
    }

    /** Canlıdaki kameranın ekranı kırmızı çerçeveyle yanar */
    fun tally(acik: Boolean) { tallyAcik = acik; Thread { tallyGonder(acik) }.start() }
    private fun tallyGonder(acik: Boolean) { runCatching { soket?.getOutputStream()?.apply { write((JSONObject().put("tally", acik).toString() + "\n").toByteArray()); flush() } } }

    override fun durdur() { calis = false; runCatching { soket?.close() } }
}

/** Ağdaki Wi-Fi kameralarını bulur (masa açıkken) */
class KameraBulucu(ctx: Context, private val bulundu: (String, String, Int) -> Unit) {
    private val nsd = ctx.getSystemService(Context.NSD_SERVICE) as NsdManager
    private var dinle: NsdManager.DiscoveryListener? = null

    fun baslat() {
        val l = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(t: String) {}
            override fun onDiscoveryStopped(t: String) {}
            override fun onStartDiscoveryFailed(t: String, e: Int) { HataKaydi.not("masa", "arama başlamadı $e") }
            override fun onStopDiscoveryFailed(t: String, e: Int) {}
            override fun onServiceLost(i: NsdServiceInfo) {}
            override fun onServiceFound(i: NsdServiceInfo) {
                @Suppress("DEPRECATION")
                runCatching { nsd.resolveService(i, object : NsdManager.ResolveListener {
                    override fun onResolveFailed(i: NsdServiceInfo, e: Int) {}
                    override fun onServiceResolved(i: NsdServiceInfo) { i.host?.hostAddress?.let { bulundu(i.serviceName, it, i.port) } }
                }) }
            }
        }
        dinle = l
        runCatching { nsd.discoverServices(AgYayin.TUR, NsdManager.PROTOCOL_DNS_SD, l) }
    }

    fun durdur() { runCatching { dinle?.let { nsd.stopServiceDiscovery(it) } }; dinle = null }
}
