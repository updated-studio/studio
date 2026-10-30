package tr.com.updated.monitor

import android.content.Context
import android.content.Intent

/**
 * Modüller arası ekran geçişi: Kamera (:kamera) ve Masa (:masa) ayrı modüllerde; ortak koddan ve birbirlerinden adlarıyla açılırlar.
 * Bugünkü tek uygulama ikisini de içerir; ikiye ayrılınca uygulamada olmayan ekran açılmaz (ac → false).
 */
object Ekranlar {
    const val MASA = "tr.com.updated.monitor.MasaActivity"
    /** Masa ekranı önde mi (USB görüntü takılınca Monitör açılmaz, görüntü Masa'ya gider) */
    @Volatile var masaAcik = false
    /** Ayrı UpCam Studio uygulaması mı (Masa + Monitör, Kamera'sız; açılış ekranı Masa) */
    fun masaUygulamasi(ctx: Context) = ctx.packageName == "tr.com.upcam.studio"
    fun ac(ctx: Context, ad: String): Boolean = runCatching { ctx.startActivity(Intent().setClassName(ctx, ad)); true }.getOrDefault(false)
}
