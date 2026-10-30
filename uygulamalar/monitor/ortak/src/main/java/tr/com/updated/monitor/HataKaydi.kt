package tr.com.updated.monitor

import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Hata kaydedici: çökme (yakalanmamış hata) ve donma (ana iş parçacığı 6 sn yanıt vermezse) ayrıntısı dosyaya yazılır,
 * bir sonraki açılışta Stüdyo'ya gönderilir (public.monitor_hatalar, göç 0037; açık anahtar yalnız ekleyebilir).
 * Böylece cihazda deneyen kişinin log göndermesi gerekmez.
 */
object HataKaydi {
    private const val ADRES = "https://panel.updated.com.tr/rest/v1/monitor_hatalar"
    private const val ACIK_ANAHTAR = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzkyNzIxMjQyLCJleHAiOjE5NTA0MDEyNDJ9.E1JwNdTSj6BF2NuOxFtK1_LmAIVeI3Qn3sEvZLd85j8" // Stüdyo'nun herkese açık (anon) anahtarı; yalnız ekleme yetkisi
    private lateinit var klasor: File
    private var surum = "?"

    fun kur(c: Context) {
        klasor = File(c.filesDir, "hatalar").also { it.mkdirs() }
        surum = runCatching { c.packageManager.getPackageInfo(c.packageName, 0).versionName }.getOrNull() ?: "?"
        val onceki = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { t, e -> yaz("cokme", "İş parçacığı: ${t.name}\n" + e.stackTraceToString()); onceki?.uncaughtException(t, e) }
        donmaBekcisi()
        Thread { gonder() }.start()
    }

    /** Uygulama içinden yakalanan ama bilinmesi gereken hatalar (kamera açılamadı vb.) */
    private val gonderilenler = java.util.Collections.synchronizedSet(HashSet<String>())
    /** Aynı hata bir oturumda bir kez bildirilir (yeniden denemeler kayıtları şişirmesin) */
    fun not(tur: String, metin: String) = runCatching { if (!gonderilenler.add(tur + metin.take(200).replace(Regex("deneme \\d+"), ""))) return@runCatching; yaz(tur, metin); Thread { gonder() }.start() }

    private fun yaz(tur: String, metin: String) {
        runCatching { File(klasor, "${System.currentTimeMillis()}-$tur.txt").writeText(metin.take(18000)) }
    }

    private fun donmaBekcisi() {
        val ana = Handler(Looper.getMainLooper())
        Thread {
            var yazildi = false
            while (true) {
                val yanit = java.util.concurrent.atomic.AtomicBoolean(false)
                ana.post { yanit.set(true) }
                Thread.sleep(6000)
                if (!yanit.get() && !yazildi) {
                    yazildi = true
                    yaz("donma", "Ana iş parçacığı 6 sn yanıt vermedi.\n" + Looper.getMainLooper().thread.stackTrace.joinToString("\n") { "  at $it" })
                } else if (yanit.get()) yazildi = false
            }
        }.apply { isDaemon = true; name = "donma-bekcisi" }.start()
    }

    private fun gonder() {
        val dosyalar = klasor.listFiles()?.sortedBy { it.name } ?: return
        for (f in dosyalar) runCatching {
            val tur = f.name.substringAfter('-').removeSuffix(".txt")
            val govde = JSONObject().put("surum", surum).put("cihaz", "${Build.MANUFACTURER} ${Build.MODEL}").put("android", "${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})").put("tur", tur).put("metin", f.readText()).toString()
            val b = URL(ADRES).openConnection() as HttpURLConnection
            b.requestMethod = "POST"; b.doOutput = true; b.connectTimeout = 8000; b.readTimeout = 8000
            b.setRequestProperty("apikey", ACIK_ANAHTAR); b.setRequestProperty("Authorization", "Bearer $ACIK_ANAHTAR")
            b.setRequestProperty("Content-Type", "application/json"); b.setRequestProperty("Prefer", "return=minimal")
            b.outputStream.use { it.write(govde.toByteArray()) }
            if (b.responseCode in 200..299) f.delete()
            b.disconnect()
        }
    }
}
