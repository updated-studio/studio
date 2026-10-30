package tr.com.updated.monitor

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Looper
import android.provider.MediaStore
import java.util.concurrent.ConcurrentLinkedQueue

/**
 * Kayıttan sonra videoya stil (LUT) işleme, ön plan hizmetinde: ekrandan çıkılsa, telefon kilitlense de yarıda kalmaz
 * (Fatih 29 Ekim: "ekrandan erken çıkınca Log olarak çıktı"). Video işlenene kadar galeride görünmez (IS_PENDING);
 * bitince görünür, işlenemezse özgün renkte görünür. Birden çok video sırayla işlenir; ilerleme bildirimde.
 */
class VideoIsleme : Service() {
    class Is(val uri: Uri, val lut: Lut, val hevc: Boolean)
    companion object {
        private const val KANAL = "isleme"; private const val BILDIRIM = 48
        private val sira = ConcurrentLinkedQueue<Is>()
        /** Ekran açıksa sonucu gösterir (uri, işlendi mi); ana iş parçacığında */
        @Volatile var bitti: ((Uri, Boolean) -> Unit)? = null
        /** İşlenen videonun ilerlemesi (0–100; -1 iş yok) */
        @Volatile var yuzde = -1; private set
        fun ekle(ctx: Context, i: Is) {
            sira.add(i)
            val n = Intent(ctx, VideoIsleme::class.java)
            if (android.os.Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(n) else ctx.startService(n)
        }
        /** Önceki oturumda işlenirken uygulama kapandıysa bekleyen videoları galeride görünür yapar (özgün renkte) */
        fun artiklariKurtar(ctx: Context) {
            if (yuzde >= 0 || sira.isNotEmpty() || android.os.Build.VERSION.SDK_INT < 30) return
            Thread {
                runCatching {
                    val q = android.os.Bundle().apply {
                        putInt(MediaStore.QUERY_ARG_MATCH_PENDING, MediaStore.MATCH_ONLY)
                        putString(android.content.ContentResolver.QUERY_ARG_SQL_SELECTION, "${MediaStore.Video.Media.RELATIVE_PATH} LIKE ?")
                        putStringArray(android.content.ContentResolver.QUERY_ARG_SQL_SELECTION_ARGS, arrayOf("Movies/UPDATED Kamera%"))
                    }
                    // Kayıt sürerken açık olan dosya da bekler: yalnız 2 dakikadan eskiler
                    val esik = System.currentTimeMillis() / 1000 - 120
                    ctx.contentResolver.query(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, arrayOf(MediaStore.Video.Media._ID, MediaStore.Video.Media.DATE_ADDED, MediaStore.Video.Media.SIZE), q, null)?.use { c ->
                        while (c.moveToNext()) {
                            if (c.getLong(1) > esik) continue
                            val u = android.content.ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, c.getLong(0))
                            if (c.getLong(2) > 0) ctx.contentResolver.update(u, ContentValues().apply { put(MediaStore.Video.Media.IS_PENDING, 0) }, null, null)
                            else ctx.contentResolver.delete(u, null, null)
                        }
                    }
                }.onFailure { HataKaydi.not("isleme", "kurtarma: ${it.message}") }
            }.start()
        }
    }

    private val is_ = HandlerThread("video-isleme").also { it.start() }
    private val islem = Handler(is_.looper)
    private val ana = Handler(Looper.getMainLooper())
    private var calisiyor = false

    override fun onBind(i: Intent?): IBinder? = null

    override fun onStartCommand(i: Intent?, flags: Int, startId: Int): Int {
        bildirim("Stil videoya işleniyor", 0)
        if (!calisiyor) { calisiyor = true; islem.post { siradaki() } }
        return START_NOT_STICKY
    }

    /** İşleyici iş parçacığında: sıradaki videoyu işler, sıra bitince hizmeti kapatır */
    private fun siradaki() {
        val j = sira.poll() ?: run { yuzde = -1; ana.post { calisiyor = false; stopForeground(STOP_FOREGROUND_REMOVE); stopSelf() }; return }
        yuzde = 0
        val t = StilGom.video(this, j.uri, j.lut, j.hevc, islem.looper,
            ilerleme = { p -> if (p != yuzde) { yuzde = p; ana.post { bildirim("Stil videoya işleniyor", p) } } }) { ok ->
            runCatching { contentResolver.update(j.uri, ContentValues().apply { put(MediaStore.Video.Media.IS_PENDING, 0) }, null, null) }
            ana.post {
                val b = bitti
                if (b != null) b(j.uri, ok) else if (!ok) bilgi("Stil işlenemedi; video özgün renkte kaydedildi.")
            }
            islem.post { siradaki() }
        }
        if (t == null) { runCatching { contentResolver.update(j.uri, ContentValues().apply { put(MediaStore.Video.Media.IS_PENDING, 0) }, null, null) }; islem.post { siradaki() } }
    }

    private fun kanal() = getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel(KANAL, "Video işleme", NotificationManager.IMPORTANCE_LOW))

    private fun bildirim(baslik: String, p: Int) {
        kanal()
        val ac = PendingIntent.getActivity(this, 3, Intent(this, KameraActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val kalan = sira.size
        val b = Notification.Builder(this, KANAL).setSmallIcon(R.drawable.ic_ag).setContentTitle(baslik)
            .setContentText("%$p" + if (kalan > 0) " · sırada $kalan video" else "").setProgress(100, p, false).setOngoing(true).setContentIntent(ac).build()
        when {
            android.os.Build.VERSION.SDK_INT >= 35 -> startForeground(BILDIRIM, b, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROCESSING)
            android.os.Build.VERSION.SDK_INT >= 29 -> startForeground(BILDIRIM, b, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
            else -> startForeground(BILDIRIM, b)
        }
    }

    /** Ekran kapalıyken sonuç bildirimi */
    private fun bilgi(m: String) {
        kanal()
        getSystemService(NotificationManager::class.java).notify(49, Notification.Builder(this, KANAL).setSmallIcon(R.drawable.ic_ag).setContentTitle("Video").setContentText(m).setAutoCancel(true).build())
    }

    /** Android 15: medya işleme hizmetinin süresi doldu; kalan sıra özgün renkte görünür yapılır */
    override fun onTimeout(startId: Int, fgsType: Int) {
        generateSequence { sira.poll() }.forEach { j -> runCatching { contentResolver.update(j.uri, ContentValues().apply { put(MediaStore.Video.Media.IS_PENDING, 0) }, null, null) } }
        stopSelf()
    }

    override fun onDestroy() { is_.quitSafely(); super.onDestroy() }
}
