package tr.com.updated.monitor

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import androidx.test.core.app.ApplicationProvider
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

/**
 * Ekran görüntüleri (telefon olmadan): her ekran birkaç telefon boyutunda çizilip build/ekranlar/ altına PNG olarak yazılır.
 * Kamera yok, görüntü alanı boş görünür; amaç yerleşim, taşma ve boşlukları görmek.
 * Çalıştırma: gradle testReleaseUnitTest --tests '*EkranTest*'
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34])
class EkranTest {
    private val klasor = File(System.getProperty("ekranlar") ?: "build/ekranlar").also { it.mkdirs() }
    private val boyutlar = listOf("kucuk" to Triple(360, 740, "xhdpi"), "orta" to Triple(393, 852, "xxhdpi"), "buyuk" to Triple(430, 932, "xxhdpi"))
    private fun nitelik(b: Triple<Int, Int, String>, yatay: Boolean) = if (yatay) "w${b.second}dp-h${b.first}dp-land-${b.third}" else "w${b.first}dp-h${b.second}dp-port-${b.third}"

    private fun kaydet(a: Activity, ad: String) {
        shadowOf(android.os.Looper.getMainLooper()).idle()
        val v: View = a.window.decorView
        val w = v.width.takeIf { it > 0 } ?: a.resources.displayMetrics.widthPixels; val h = v.height.takeIf { it > 0 } ?: a.resources.displayMetrics.heightPixels
        v.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY)); v.layout(0, 0, w, h)
        val b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888); v.draw(Canvas(b))
        File(klasor, "$ad.png").outputStream().use { b.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    private fun tercih(ad: String) = ApplicationProvider.getApplicationContext<Context>().getSharedPreferences(ad, Context.MODE_PRIVATE)

    @Test fun kamera() {
        for ((ad, q) in boyutlar) {
            RuntimeEnvironment.setQualifiers(nitelik(q, false))
            KameraActivity.girisSoruldu = false; tercih("kamera").edit().clear().commit()
            Robolectric.buildActivity(KameraActivity::class.java).setup().use { c -> kaydet(c.get(), "kamera-giris-$ad") }
            KameraActivity.girisSoruldu = true
            Robolectric.buildActivity(KameraActivity::class.java).setup().use { c ->
                val a = c.get(); kaydet(a, "kamera-$ad")
                a.window.decorView.findViewWithText("Kompozisyon kılavuzu")?.performClick(); kaydet(a, "kamera-kilavuz-$ad")
                a.window.decorView.findViewWithText("Ayarlar")?.performClick(); kaydet(a, "kamera-ayarlar-$ad")
            }
        }
    }

    @Test fun proVeMonitor() {
        for ((ad, q) in boyutlar) for (yon in listOf("port", "land")) for (mod in listOf("pro", "monitor")) {
            RuntimeEnvironment.setQualifiers(nitelik(q, yon == "land"))
            val i = Intent(ApplicationProvider.getApplicationContext(), MainActivity::class.java).putExtra("mod", mod)
            Robolectric.buildActivity(MainActivity::class.java, i).setup().use { c -> kaydet(c.get(), "$mod-$yon-$ad") }
        }
    }
}

private fun View.findViewWithText(t: String): View? {
    if (contentDescription?.toString() == t) return this
    if (this is android.view.ViewGroup) for (k in 0 until childCount) getChildAt(k).findViewWithText(t)?.let { return it }
    return null
}
