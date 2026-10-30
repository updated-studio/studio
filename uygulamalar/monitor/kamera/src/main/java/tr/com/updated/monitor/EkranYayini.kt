package tr.com.updated.monitor

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Handler
import android.os.IBinder
import android.os.Looper

/**
 * Ekranı Masa'ya gönder (Fatih 29 Ekim: USB'den webcam vermeyen kameralar, ör. Insta360): telefon ekranı, Wi-Fi kamerasıyla aynı yoldan
 * (YayinVerici: Bonjour _updatedkam._tcp, H.264) masaya kaynak olarak gider. Kameranın kendi uygulaması açık durur, onun önizlemesi aktarılır.
 * Görüntü yatay (ekranın uzun kenarı en çok 1920); telefon yan tutulunca ekranı tam doldurur. Kaynak adı "Ekran · <cihaz>".
 */
class EkranYayini : Service() {
    companion object {
        const val SONUC = "sonuc"; const val VERI = "veri"; const val DURDUR = "durdur"
        private const val KANAL = "ekran"; private const val BILDIRIM = 47
        @Volatile var calisiyor = false; private set
        @Volatile var durum = ""; private set
        var degisti: (() -> Unit)? = null
        fun durdur(ctx: Context) { ctx.stopService(Intent(ctx, EkranYayini::class.java)) }
    }

    private var yansitma: MediaProjection? = null
    private var ekran: VirtualDisplay? = null
    private var verici: YayinVerici? = null
    private val ana = Handler(Looper.getMainLooper())

    override fun onBind(i: Intent?): IBinder? = null

    override fun onStartCommand(i: Intent?, flags: Int, startId: Int): Int {
        if (i?.getBooleanExtra(DURDUR, false) == true) { stopSelf(); return START_NOT_STICKY }
        val sonuc = i?.getIntExtra(SONUC, 0) ?: 0
        @Suppress("DEPRECATION") val veri: Intent? = i?.getParcelableExtra(VERI)
        if (veri == null || calisiyor) return START_NOT_STICKY
        // Android 14: yansıtma izni kullanılmadan önce ön plan hizmeti (mediaProjection türü) başlamış olmalı
        bildirimGoster("Masa bekleniyor")
        try {
            val y = (getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager).getMediaProjection(sonuc, veri) ?: throw IllegalStateException("izin yok")
            yansitma = y
            y.registerCallback(object : MediaProjection.Callback() { override fun onStop() { ana.post { stopSelf() } } }, ana)
            val m = resources.displayMetrics
            val uzun = maxOf(m.widthPixels, m.heightPixels); val kisa = minOf(m.widthPixels, m.heightPixels)
            val w = minOf(1920, uzun) and 15.inv(); val h = (w.toLong() * kisa / uzun).toInt() and 15.inv()
            val v = YayinVerici(this, "Ekran · ${android.os.Build.MODEL}", w, h, mbps = 8, tally = {},
                durum = { d -> durum = d; ana.post { bildirimGoster(d); degisti?.invoke() } })
            v.baslat(); verici = v
            ekran = y.createVirtualDisplay("updated-ekran", w, h, m.densityDpi, DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, v.yuzey, null, ana)
            calisiyor = true; degisti?.invoke()
        } catch (e: Exception) {
            HataKaydi.not("ekran", e.stackTraceToString()); durum = "Başlatılamadı: ${e.message}"; stopSelf()
        }
        return START_NOT_STICKY
    }

    private fun bildirimGoster(d: String) {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(KANAL, "Ekranı Masa'ya gönder", NotificationManager.IMPORTANCE_LOW))
        val dur = PendingIntent.getService(this, 1, Intent(this, EkranYayini::class.java).putExtra(DURDUR, true), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val ac = PendingIntent.getActivity(this, 2, Intent(this, KameraActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val b = Notification.Builder(this, KANAL).setSmallIcon(R.drawable.ic_ag).setContentTitle("Ekran Masa'ya gidiyor").setContentText(d).setOngoing(true)
            .setContentIntent(ac).addAction(Notification.Action.Builder(null, "Durdur", dur).build()).build()
        if (android.os.Build.VERSION.SDK_INT >= 29) startForeground(BILDIRIM, b, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION) else startForeground(BILDIRIM, b)
    }

    override fun onDestroy() {
        runCatching { ekran?.release() }; ekran = null
        runCatching { verici?.durdur() }; verici = null
        runCatching { yansitma?.stop() }; yansitma = null
        calisiyor = false; durum = ""; degisti?.invoke()
        super.onDestroy()
    }
}
