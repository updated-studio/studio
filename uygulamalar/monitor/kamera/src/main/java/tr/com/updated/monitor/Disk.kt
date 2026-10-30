package tr.com.updated.monitor

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.DocumentsContract
import android.provider.MediaStore

/**
 * Harici diske kayıt (Fatih 30 Ekim; iPhone Vlog.swift `diskeYaz` ile aynı kural): disk takılınca açılan karttan seçilen klasöre
 * "UPDATED Kamera" alt klasörü açılır, videolar oraya yazılır. Seçilmemişse ya da diske ulaşılamıyorsa telefona (Movies/UPDATED Kamera).
 * Diskteki dosya galeride görünmez (IS_PENDING yok); telefondaki dosya yazılırken gizli, bitince görünür.
 */
object Disk {
    /** Seçilen ağacın (tree URI) içindeki "UPDATED Kamera" klasörü; yoksa açar. Erişilemezse null */
    fun dizin(ctx: Context, agac: Uri): Uri? = runCatching {
        val r = ctx.contentResolver
        val kok = DocumentsContract.buildDocumentUriUsingTree(agac, DocumentsContract.getTreeDocumentId(agac))
        val cocuklar = DocumentsContract.buildChildDocumentsUriUsingTree(agac, DocumentsContract.getDocumentId(kok))
        r.query(cocuklar, arrayOf(DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME), null, null, null)?.use { c ->
            while (c.moveToNext()) if (c.getString(1) == "UPDATED Kamera") return@runCatching DocumentsContract.buildDocumentUriUsingTree(agac, c.getString(0))
        }
        DocumentsContract.createDocument(r, kok, DocumentsContract.Document.MIME_TYPE_DIR, "UPDATED Kamera")
    }.onFailure { HataKaydi.not("disk", "klasör: ${it.message}") }.getOrNull()

    /** Video dosyası açar: `dizin` verildiyse diskte, yoksa ya da olmazsa telefonda. (uri, tanımlayıcı, diskte mi) */
    fun ac(ctx: Context, dizin: Uri?, ad: String): Triple<Uri, ParcelFileDescriptor, Boolean>? {
        val r = ctx.contentResolver
        dizin?.let { d ->
            runCatching {
                val u = DocumentsContract.createDocument(r, d, "video/mp4", ad)!!
                return Triple(u, r.openFileDescriptor(u, "w")!!, true)
            }.onFailure { HataKaydi.not("disk", "dosya: ${it.message}") }
        }
        val v = ContentValues().apply { put(MediaStore.Video.Media.DISPLAY_NAME, ad); put(MediaStore.Video.Media.MIME_TYPE, "video/mp4"); put(MediaStore.Video.Media.RELATIVE_PATH, "Movies/UPDATED Kamera"); put(MediaStore.Video.Media.IS_PENDING, 1) }
        val u = r.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, v) ?: return null
        val p = r.openFileDescriptor(u, "w") ?: run { r.delete(u, null, null); return null }
        return Triple(u, p, false)
    }

    /** Diskteki (belge) dosya mı */
    fun mi(u: Uri) = u.authority != MediaStore.AUTHORITY

    /** Yazma bitti: telefondaki dosya galeride görünür olur */
    fun yayinla(ctx: Context, u: Uri) { if (!mi(u)) runCatching { ctx.contentResolver.update(u, ContentValues().apply { put(MediaStore.Video.Media.IS_PENDING, 0) }, null, null) } }

    fun sil(ctx: Context, u: Uri) { runCatching { if (mi(u)) DocumentsContract.deleteDocument(ctx.contentResolver, u) else ctx.contentResolver.delete(u, null, null) } }
}
