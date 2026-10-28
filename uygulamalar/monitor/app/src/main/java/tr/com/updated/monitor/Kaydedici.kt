package tr.com.updated.monitor

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import android.media.MediaRecorder
import android.os.ParcelFileDescriptor
import android.view.Surface
import kotlin.math.abs
import kotlin.math.max

/**
 * Ekrandaki kaynağın (USB görüntü, ağ yayını) MP4 kaydı: MonitorGorunum her yeni kareyi araçsız ve LUT'suz olarak `yuzey`e çizer,
 * görüntü kodlayıcı (H.264/H.265) bunu sıkıştırır; ses varsa USB ses girişinden (fotoğraf makinesinin kendi sesi), yoksa telefonun
 * mikrofonundan AAC olarak eklenir. Zaman damgaları System.nanoTime'dan: görüntü ve ses aynı saatte (timelapse'te ses yok, damgalar kare sırasından).
 * `yon`: oynatıcının videoyu kaç derece (saat yönünde) çevirip göstereceği; telefon yan tutulduysa video yine dik açılır.
 */
class Kaydedici(private val ctx: Context, private val dosya: ParcelFileDescriptor, val genislik: Int, val yukseklik: Int, private val fps: Int,
                private val mbps: Int, private val hevc: Boolean, private val sesIste: Boolean, private val yon: Int = 0) {
    lateinit var yuzey: Surface; private set
    /** Sesin geldiği yer (ekranda bildirmek için): "makineden (USB)", "telefon mikrofonu" ya da null (sessiz) */
    var sesKaynagi: String? = null; private set
    @Volatile var sesDuzeyi = 0; private set

    private lateinit var goruntu: MediaCodec
    private var ses: MediaCodec? = null
    private var mikrofon: AudioRecord? = null
    private val muxer = MediaMuxer(dosya.fileDescriptor, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    private val kilit = Object()
    private var gIz = -1; private var sIz = -1; private var basladi = false
    @Volatile private var calis = true
    private var gIs: Thread? = null; private var sIs: Thread? = null
    private var yazilan = 0L

    fun baslat() {
        val mime = if (hevc) MediaFormat.MIMETYPE_VIDEO_HEVC else MediaFormat.MIMETYPE_VIDEO_AVC
        val f = MediaFormat.createVideoFormat(mime, genislik, yukseklik).apply {
            setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
            setInteger(MediaFormat.KEY_BIT_RATE, mbps * 1_000_000); setInteger(MediaFormat.KEY_FRAME_RATE, fps); setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
        }
        goruntu = runCatching { MediaCodec.createEncoderByType(mime).also { it.configure(f, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE) } }.getOrElse {
            // H.265 kodlayıcısı yoksa ya da bu boyutu kabul etmiyorsa H.264
            val f2 = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, genislik, yukseklik).apply {
                setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
                setInteger(MediaFormat.KEY_BIT_RATE, mbps * 1_000_000); setInteger(MediaFormat.KEY_FRAME_RATE, fps); setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
            }
            MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC).also { it.configure(f2, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE) }
        }
        yuzey = goruntu.createInputSurface()
        if (yon != 0) muxer.setOrientationHint(yon)
        goruntu.start()
        if (sesIste) sesKur()
        gIs = Thread({ bosalt(goruntu, true) }, "kayit-goruntu").also { it.start() }
        if (ses != null) sIs = Thread({ sesDongusu() }, "kayit-ses").also { it.start() }
    }

    @SuppressLint("MissingPermission")
    private fun sesKur() {
        val ornek = 48000
        val boy = max(AudioRecord.getMinBufferSize(ornek, AudioFormat.CHANNEL_IN_STEREO, AudioFormat.ENCODING_PCM_16BIT), 8192)
        val ar = runCatching { AudioRecord(MediaRecorder.AudioSource.CAMCORDER, ornek, AudioFormat.CHANNEL_IN_STEREO, AudioFormat.ENCODING_PCM_16BIT, boy * 2) }.getOrNull()
        if (ar == null || ar.state != AudioRecord.STATE_INITIALIZED) { ar?.release(); return }
        // Fotoğraf makinesi USB'den ses de veriyorsa (USB yayını: UAC) onu tercih et
        val am = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val usb = am.getDevices(AudioManager.GET_DEVICES_INPUTS).firstOrNull { it.type == AudioDeviceInfo.TYPE_USB_DEVICE || it.type == AudioDeviceInfo.TYPE_USB_HEADSET }
        sesKaynagi = if (usb != null && ar.setPreferredDevice(usb)) "makineden (USB)" else "telefon mikrofonu"
        val f = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, ornek, 2).apply {
            setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC); setInteger(MediaFormat.KEY_BIT_RATE, 192_000); setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 16384)
        }
        val c = runCatching { MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC).also { it.configure(f, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE); it.start() } }.getOrNull()
        if (c == null) { ar.release(); sesKaynagi = null; return }
        mikrofon = ar; ses = c
    }

    private fun sesDongusu() {
        val ar = mikrofon ?: return; val c = ses ?: return
        ar.startRecording()
        val b = ShortArray(2048)
        var toplam = 0L; var bas = -1L
        while (true) {
            val i = c.dequeueInputBuffer(10_000)
            if (i >= 0) {
                if (!calis) { c.queueInputBuffer(i, 0, 0, zaman(bas, toplam), MediaCodec.BUFFER_FLAG_END_OF_STREAM); break }
                val n = ar.read(b, 0, b.size)
                if (n > 0) {
                    if (bas < 0) bas = System.nanoTime() / 1000
                    var tepe = 0; for (k in 0 until n) tepe = max(tepe, abs(b[k].toInt())); sesDuzeyi = tepe
                    val tb = c.getInputBuffer(i)!!; tb.clear(); tb.order(java.nio.ByteOrder.nativeOrder()).asShortBuffer().put(b, 0, n)
                    c.queueInputBuffer(i, 0, n * 2, zaman(bas, toplam), 0)
                    toplam += n / 2
                } else c.queueInputBuffer(i, 0, 0, zaman(bas, toplam), 0)
            }
            sesBosalt(c)
        }
        runCatching { ar.stop() }
        while (sesBosalt(c)) {}
    }
    private fun zaman(bas: Long, ornekSayisi: Long) = max(0L, bas) + ornekSayisi * 1_000_000L / 48000

    /** Ses kodlayıcıdan çıkanları yazar; akış bittiyse false */
    private fun sesBosalt(c: MediaCodec): Boolean {
        val bilgi = MediaCodec.BufferInfo()
        while (true) {
            val o = c.dequeueOutputBuffer(bilgi, 0)
            when {
                o == MediaCodec.INFO_TRY_AGAIN_LATER -> return true
                o == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> izEkle(c.outputFormat, false)
                o >= 0 -> {
                    yaz(sIzi(), c.getOutputBuffer(o)!!, bilgi)
                    c.releaseOutputBuffer(o, false)
                    if (bilgi.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) return false
                }
            }
        }
    }
    private fun sIzi() = synchronized(kilit) { sIz }

    private fun bosalt(c: MediaCodec, goruntuMu: Boolean) {
        val bilgi = MediaCodec.BufferInfo()
        while (true) {
            val o = c.dequeueOutputBuffer(bilgi, 10_000)
            when {
                o == MediaCodec.INFO_TRY_AGAIN_LATER -> if (!calis && !goruntuMu) return
                o == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> izEkle(c.outputFormat, goruntuMu)
                o >= 0 -> {
                    yaz(synchronized(kilit) { gIz }, c.getOutputBuffer(o)!!, bilgi)
                    c.releaseOutputBuffer(o, false)
                    if (bilgi.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) return
                }
            }
        }
    }

    private fun izEkle(f: MediaFormat, goruntuMu: Boolean) = synchronized(kilit) {
        if (goruntuMu) gIz = muxer.addTrack(f) else sIz = muxer.addTrack(f)
        // Ses varsa iki iz de eklenince başlar
        if (!basladi && gIz >= 0 && (ses == null || sIz >= 0)) { muxer.start(); basladi = true; kilit.notifyAll() }
    }

    private fun yaz(iz: Int, b: java.nio.ByteBuffer, bilgi: MediaCodec.BufferInfo) {
        if (bilgi.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0 || bilgi.size == 0) return
        synchronized(kilit) {
            if (!basladi) { kilit.wait(2000); if (!basladi) return } // diğer iz henüz hazır değil (ilk birkaç parça atlanabilir)
            b.position(bilgi.offset); b.limit(bilgi.offset + bilgi.size)
            muxer.writeSampleData(iz, b, bilgi); yazilan++
        }
    }

    /** Kaydı bitirir (iş parçacığında çağrılmalı); dosya oynatılabilir durumdaysa true */
    fun bitir(): Boolean {
        calis = false
        runCatching { goruntu.signalEndOfInputStream() }
        runCatching { gIs?.join(3000) }; runCatching { sIs?.join(3000) }
        val ok = synchronized(kilit) { basladi && yazilan > 0 }
        runCatching { goruntu.stop() }; runCatching { goruntu.release() }
        runCatching { ses?.stop() }; runCatching { ses?.release() }; runCatching { mikrofon?.release() }
        runCatching { if (basladi) muxer.stop() }; runCatching { muxer.release() }
        runCatching { yuzey.release() }; runCatching { dosya.close() }
        return ok
    }
}
