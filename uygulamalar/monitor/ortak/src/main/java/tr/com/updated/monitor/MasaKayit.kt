package tr.com.updated.monitor

import android.content.ContentValues
import android.content.Context
import android.media.MediaCodec
import android.media.MediaCodecList
import android.media.MediaFormat
import android.media.MediaMuxer
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.DocumentsContract
import android.provider.MediaStore
import java.nio.ByteBuffer
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Masa'nın çoklu kaydı (iOS ile aynı kurallar): seçilen klasörde (harici SSD) "UPDATED Masa/<yyyy-MM-dd HH-mm-ss>/" altında
 * "Program.mp4" ve her kaynak için "<yuva no> - <kaynak adı>.mp4". Klasör seçilmemişse ya da erişilemiyorsa telefonun
 * Movies/UPDATED Masa/<tarih>/ klasörüne yazılır.
 */
class KayitOturumu(private val ctx: Context, klasor: Uri?) {
    val ad: String = SimpleDateFormat("yyyy-MM-dd HH-mm-ss", Locale.US).format(Date())
    /** Kayıt başlangıcı (System.nanoTime): bütün dosyaların 0 anı */
    val bas = System.nanoTime()
    private val dizin: Uri? = klasor?.let { runCatching { dizinHazirla(it) }.onFailure { e -> HataKaydi.not("masa", "kayıt klasörü: ${e.message}") }.getOrNull() }
    /** Kayıt SSD'ye (seçilen klasöre) mi gidiyor */
    val harici get() = dizin != null

    private fun dizinHazirla(agac: Uri): Uri {
        val r = ctx.contentResolver
        val kok = DocumentsContract.buildDocumentUriUsingTree(agac, DocumentsContract.getTreeDocumentId(agac))
        val ana = cocuk(agac, DocumentsContract.getDocumentId(kok), "UPDATED Masa")
            ?: DocumentsContract.createDocument(r, kok, DocumentsContract.Document.MIME_TYPE_DIR, "UPDATED Masa") ?: error("klasör açılamadı")
        return DocumentsContract.createDocument(r, ana, DocumentsContract.Document.MIME_TYPE_DIR, ad) ?: error("oturum klasörü açılamadı")
    }

    private fun cocuk(agac: Uri, ebeveyn: String, isim: String): Uri? {
        val u = DocumentsContract.buildChildDocumentsUriUsingTree(agac, ebeveyn)
        ctx.contentResolver.query(u, arrayOf(DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME), null, null, null)?.use { c ->
            while (c.moveToNext()) if (c.getString(1) == isim) return DocumentsContract.buildDocumentUriUsingTree(agac, c.getString(0))
        }
        return null
    }

    /** Açılan dosya: yazılır, sonra `bitti(tamam)` (bozuksa silinir, telefondaysa galeride görünür) */
    inner class Dosya(val pfd: ParcelFileDescriptor, private val uri: Uri, private val medya: Boolean) {
        fun bitti(tamam: Boolean) {
            runCatching { pfd.close() }
            if (!tamam) runCatching { if (medya) ctx.contentResolver.delete(uri, null, null) else DocumentsContract.deleteDocument(ctx.contentResolver, uri) }
            else if (medya) runCatching { ctx.contentResolver.update(uri, ContentValues().apply { put(MediaStore.Video.Media.IS_PENDING, 0) }, null, null) }
        }
    }

    fun ac(dosyaAdi: String): Dosya? {
        val temiz = dosyaAdi.replace(Regex("[\\\\/:*?\"<>|]"), " ").trim()
        dizin?.let { d ->
            runCatching {
                val u = DocumentsContract.createDocument(ctx.contentResolver, d, "video/mp4", "$temiz.mp4")!!
                return Dosya(ctx.contentResolver.openFileDescriptor(u, "w")!!, u, false)
            }.onFailure { e -> HataKaydi.not("masa", "SSD'ye dosya açılamadı: ${e.message}") }
        }
        val v = ContentValues().apply {
            put(MediaStore.Video.Media.DISPLAY_NAME, "$temiz.mp4"); put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
            put(MediaStore.Video.Media.RELATIVE_PATH, "Movies/UPDATED Masa/$ad"); put(MediaStore.Video.Media.IS_PENDING, 1)
        }
        val u = ctx.contentResolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, v) ?: return null
        val p = ctx.contentResolver.openFileDescriptor(u, "w") ?: run { ctx.contentResolver.delete(u, null, null); return null }
        return Dosya(p, u, true)
    }

    companion object {
        /** Bu boyut ve kare hızında donanım kodlayıcısı var mı */
        fun kodlayiciVar(mime: String, w: Int, h: Int, fps: Int) = runCatching {
            MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos.any { i -> i.isEncoder && i.supportedTypes.any { it.equals(mime, true) } &&
                i.getCapabilitiesForType(mime).videoCapabilities?.areSizeAndRateSupported(w, h, fps.toDouble()) == true }
        }.getOrDefault(false)
    }
}

/**
 * Kaynağın gelen sıkıştırılmış akışını yeniden kodlamadan MP4'e yazar (Wi-Fi kamera H.264, Luna H.265; Annex B).
 * İlk anahtar kareden başlar. Zaman: paket zamanı − ilk paket zamanı + ilk paketin geldiği an − kayıt başlangıcı
 * (paket zamanı yoksa geliş anı).
 */
class AkisKaydi(private val dosya: KayitOturumu.Dosya, private val hevc: Boolean, private val w: Int, private val h: Int, private val bas: Long) {
    private val muxer = MediaMuxer(dosya.pfd.fileDescriptor, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    private var iz = -1; private var ilkUs = Long.MIN_VALUE; private var ilkGelis = 0L; private var son = -1L
    @Volatile var yazilan = 0L; private set
    @Volatile var bozuk = false; private set
    private val bilgi = MediaCodec.BufferInfo()

    /** H.264 kodlayıcı ayarı (SPS/PPS, Annex B) ya da anahtar karedeki parametre kümeleri */
    private var ayar: ByteArray? = null
    fun ayarVer(v: ByteArray) { if (!hevc) ayar = v }

    @Synchronized fun kare(v: ByteArray, anahtar: Boolean, us: Long? = null) {
        if (bozuk) return
        try {
            if (iz < 0) {
                if (!anahtar) return
                val f = MediaFormat.createVideoFormat(if (hevc) MediaFormat.MIMETYPE_VIDEO_HEVC else MediaFormat.MIMETYPE_VIDEO_AVC, w, h)
                if (hevc) { val ps = nallar(v).filter { it.second in 32..34 }; if (ps.size < 3) return; f.setByteBuffer("csd-0", ByteBuffer.wrap(ps.fold(ByteArray(0)) { a, n -> a + bas4 + n.first })) }
                else {
                    val ps = nallar(ayar ?: v).map { it.first to (it.first[0].toInt() and 0x1F) }
                    val sps = ps.firstOrNull { it.second == 7 }?.first ?: return; val pps = ps.firstOrNull { it.second == 8 }?.first ?: return
                    f.setByteBuffer("csd-0", ByteBuffer.wrap(bas4 + sps)); f.setByteBuffer("csd-1", ByteBuffer.wrap(bas4 + pps))
                }
                iz = muxer.addTrack(f); muxer.start()
            }
            val simdi = System.nanoTime()
            if (ilkUs == Long.MIN_VALUE) { ilkUs = us ?: 0L; ilkGelis = simdi }
            var t = if (us != null) us - ilkUs + (ilkGelis - bas) / 1000 else (simdi - bas) / 1000
            if (t <= son) t = son + 1
            son = t
            bilgi.set(0, v.size, t, if (anahtar) MediaCodec.BUFFER_FLAG_KEY_FRAME else 0)
            muxer.writeSampleData(iz, ByteBuffer.wrap(v), bilgi); yazilan++
        } catch (e: Exception) { bozuk = true; HataKaydi.not("masa", "akış kaydı: ${e.message}") }
    }

    @Synchronized fun bitir(): Boolean {
        val ok = iz >= 0 && yazilan > 0
        runCatching { if (iz >= 0) muxer.stop() }; runCatching { muxer.release() }
        dosya.bitti(ok)
        return ok
    }

    companion object {
        private val bas4 = byteArrayOf(0, 0, 0, 1)
        /** Annex B'den NAL birimleri (başlangıç kodu olmadan) ve türleri (H.265: (b0>>1)&0x3F) */
        fun nallar(b: ByteArray): List<Pair<ByteArray, Int>> {
            val bas = ArrayList<Int>(); var i = 0
            while (i + 2 < b.size) { if (b[i].toInt() == 0 && b[i + 1].toInt() == 0 && b[i + 2].toInt() == 1) { bas.add(i + 3); i += 3 } else i++ }
            return bas.mapIndexed { k, s ->
                var e = if (k + 1 < bas.size) bas[k + 1] - 3 else b.size
                while (e > s && b[e - 1].toInt() == 0) e--
                val n = b.copyOfRange(s, e); n to (if (n.isEmpty()) -1 else (n[0].toInt() shr 1) and 0x3F)
            }.filter { it.first.isNotEmpty() }
        }
    }
}
