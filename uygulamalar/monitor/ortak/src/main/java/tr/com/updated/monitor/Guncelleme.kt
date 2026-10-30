package tr.com.updated.monitor

import android.app.Activity
import android.app.AlertDialog
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageInstaller
import android.os.Build
import android.widget.ProgressBar
import android.widget.Toast
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * Uygulama içinden güncelleme: sunucudaki surum.json'a bakar, yeni sürüm varsa APK'yı indirip Android'in kurucusuna verir.
 * İlk seferde Android "bu uygulamaya kurulum izni ver" ve "Güncelle" diye sorar; Android 12+ sonraki güncellemeler sorusuz kurulabilir.
 */
object Guncelleme {
    private const val EYLEM = "tr.com.updated.monitor.KURULUM"

    /** Her uygulamanın kendi yayın klasörü: UPDATED Kamera kökte, UpCam Studio "masa/" altında (derle.sh --masa) */
    private fun kanal(a: Activity) = if (Ekranlar.masaUygulamasi(a)) "masa/" else ""

    private fun mevcutKod(a: Activity): Long = a.packageManager.getPackageInfo(a.packageName, 0).longVersionCode

    /** sessiz: açılıştaki denetim, yeni sürüm yoksa ya da ağ yoksa hiçbir şey göstermez */
    fun denetle(a: Activity, sessiz: Boolean) {
        val kok = BuildConfig.GUNCELLEME_ADRESI.takeIf { it.isNotEmpty() }?.plus(kanal(a)).orEmpty()
        if (kok.isEmpty()) { if (!sessiz) Toast.makeText(a, "Bu derlemede güncelleme adresi yok.", Toast.LENGTH_LONG).show(); return }
        thread(isDaemon = true) {
            val j = runCatching { JSONObject(oku(kok + "surum.json?t=" + System.currentTimeMillis()).toString(Charsets.UTF_8)) }.getOrNull()
            a.runOnUiThread {
                if (a.isFinishing) return@runOnUiThread
                if (j == null) { if (!sessiz) Toast.makeText(a, "Güncelleme denetlenemedi (internet?).", Toast.LENGTH_LONG).show(); return@runOnUiThread }
                if (j.optLong("kod") <= mevcutKod(a)) { if (!sessiz) Toast.makeText(a, "Uygulama güncel (${j.optString("ad")}).", Toast.LENGTH_LONG).show(); return@runOnUiThread }
                val not = j.optString("not").takeIf { it.isNotBlank() }?.let { "\n\n$it" } ?: ""
                AlertDialog.Builder(a).setTitle("Yeni sürüm: ${j.optString("ad")}").setMessage("${a.applicationInfo.loadLabel(a.packageManager)} için yeni sürüm hazır.$not")
                    .setPositiveButton("Güncelle") { _, _ -> indirKur(a, kok + j.optString("apk", "updated-monitor.apk")) }
                    .setNegativeButton("Sonra", null).show()
            }
        }
    }

    private fun oku(adres: String, ilerleme: ((Int) -> Unit)? = null): ByteArray {
        val c = URL(adres).openConnection() as HttpURLConnection
        c.connectTimeout = 10_000; c.readTimeout = 30_000; c.useCaches = false
        try {
            if (c.responseCode != 200) error("HTTP ${c.responseCode}")
            val boy = c.contentLengthLong; val cikis = java.io.ByteArrayOutputStream(if (boy > 0) boy.toInt() else 1 shl 20)
            c.inputStream.use { g -> val b = ByteArray(1 shl 16); var top = 0L
                while (true) { val n = g.read(b); if (n < 0) break; cikis.write(b, 0, n); top += n; if (boy > 0) ilerleme?.invoke((top * 100 / boy).toInt()) } }
            return cikis.toByteArray()
        } finally { c.disconnect() }
    }

    private fun indirKur(a: Activity, apk: String) {
        val cubuk = ProgressBar(a, null, android.R.attr.progressBarStyleHorizontal).apply { max = 100; setPadding(48, 24, 48, 24) }
        val pencere = AlertDialog.Builder(a).setTitle("İndiriliyor…").setView(cubuk).setCancelable(false).show()
        thread(isDaemon = true) {
            try {
                val veri = oku(apk) { y -> a.runOnUiThread { cubuk.progress = y } }
                val pi = a.packageManager.packageInstaller
                val p = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
                    setAppPackageName(a.packageName)
                    if (Build.VERSION.SDK_INT >= 31) setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
                }
                val id = pi.createSession(p)
                pi.openSession(id).use { s ->
                    s.openWrite("updated-kamera.apk", 0, veri.size.toLong()).use { it.write(veri); s.fsync(it) }
                    alici(a)
                    val niyet = PendingIntent.getBroadcast(a, id, Intent(EYLEM).setPackage(a.packageName), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE)
                    s.commit(niyet.intentSender)
                }
                a.runOnUiThread { pencere.dismiss() }
            } catch (e: Exception) {
                HataKaydi.not("guncelleme", e.stackTraceToString())
                a.runOnUiThread { pencere.dismiss(); Toast.makeText(a, "Güncelleme indirilemedi: ${e.message}", Toast.LENGTH_LONG).show() }
            }
        }
    }

    private var kayitli = false
    /** Kurucunun yanıtı: onay gerekiyorsa Android'in "Güncelle" ekranını açar */
    private fun alici(a: Activity) {
        if (kayitli) return; kayitli = true
        val r = object : BroadcastReceiver() {
            override fun onReceive(c: Context, i: Intent) {
                when (val durum = i.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
                    PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                        @Suppress("DEPRECATION") val onay = i.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
                        onay?.let { runCatching { a.startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } }
                    }
                    PackageInstaller.STATUS_SUCCESS -> {}
                    else -> {
                        val m = i.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
                        if (durum != PackageInstaller.STATUS_FAILURE_ABORTED) { HataKaydi.not("guncelleme", "kurulum $durum $m"); Toast.makeText(a, "Güncelleme kurulamadı: ${m ?: durum}", Toast.LENGTH_LONG).show() }
                    }
                }
            }
        }
        if (Build.VERSION.SDK_INT >= 33) a.registerReceiver(r, IntentFilter(EYLEM), Context.RECEIVER_NOT_EXPORTED) else a.registerReceiver(r, IntentFilter(EYLEM))
    }
}
