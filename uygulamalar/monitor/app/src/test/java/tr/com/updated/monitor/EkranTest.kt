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

    private fun kaydet(a: Activity, ad: String, don: Int = 0) {
        shadowOf(android.os.Looper.getMainLooper()).idle()
        val v: View = a.window.decorView
        val w = v.width.takeIf { it > 0 } ?: a.resources.displayMetrics.widthPixels; val h = v.height.takeIf { it > 0 } ?: a.resources.displayMetrics.heightPixels
        v.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY)); v.layout(0, 0, w, h)
        var b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888); v.draw(Canvas(b))
        if (don != 0) b = Bitmap.createBitmap(b, 0, 0, w, h, android.graphics.Matrix().apply { postRotate(don.toFloat()) }, true)
        File(klasor, "$ad.png").outputStream().use { b.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    /** Kamera yok: görüntü alanına örnek bir sahne (gök, ufuk, zemin) koyar ki saydam şeritler görülsün */
    private fun ornekGoruntu(a: Activity, parlak: Boolean = false) {
        val kok = (a.findViewById<android.view.ViewGroup>(android.R.id.content).getChildAt(0) as android.view.ViewGroup)
        val alan = kok.getChildAt(0) as android.view.ViewGroup
        alan.addView(View(a).apply { background = android.graphics.drawable.GradientDrawable(android.graphics.drawable.GradientDrawable.Orientation.TOP_BOTTOM,
            if (parlak) intArrayOf(android.graphics.Color.rgb(236, 242, 248), android.graphics.Color.rgb(250, 236, 205), android.graphics.Color.rgb(222, 226, 214), android.graphics.Color.rgb(246, 246, 240))
            else intArrayOf(android.graphics.Color.rgb(96, 140, 190), android.graphics.Color.rgb(214, 170, 120), android.graphics.Color.rgb(70, 82, 60), android.graphics.Color.rgb(40, 46, 36))) }, 0,
            android.widget.FrameLayout.LayoutParams(-1, -1))
    }

    private fun tercih(ad: String) = ApplicationProvider.getApplicationContext<Context>().getSharedPreferences(ad, Context.MODE_PRIVATE)

    @Test fun kamera() {
        for ((ad, q) in boyutlar) {
            RuntimeEnvironment.setQualifiers(nitelik(q, false))
            KameraActivity.girisSoruldu = false; tercih("kamera").edit().clear().commit()
            Robolectric.buildActivity(KameraActivity::class.java).setup().use { c -> kaydet(c.get(), "kamera-giris-$ad") }
            KameraActivity.girisSoruldu = true
            Robolectric.buildActivity(KameraActivity::class.java).setup().use { c ->
                val a = c.get(); ornekGoruntu(a); kaydet(a, "kamera-$ad")
                a.window.decorView.findViewWithText("Kontroller")?.performClick(); kaydet(a, "kamera-kontroller-$ad")
                a.window.decorView.findViewWithText("Kılavuz")?.performClick(); kaydet(a, "kamera-kilavuz-$ad")
                a.window.decorView.findViewWithText("Biçim")?.performClick(); kaydet(a, "kamera-bicim-$ad")
                a.window.decorView.findViewWithText("Kapat")?.performClick()
                a.window.decorView.findViewWithText("Ayarlar")?.performClick(); kaydet(a, "kamera-ayarlar-$ad")
                a.window.decorView.findViewWithText("Bitti")?.performClick()
                // Yan tutuş: ekran dikey sabit, ikonlar döner; görüntü telefonun tutulduğu gibi çevrilip kaydedilir
                a.testYon(270); kaydet(a, "kamera-yan-$ad", don = 270)
            }
            tercih("kamera").edit().putString("mod", "TIMELAPSE").commit()
            Robolectric.buildActivity(KameraActivity::class.java).setup().use { c -> val a = c.get(); ornekGoruntu(a); kaydet(a, "kamera-timelapse-$ad") }
        }
    }

    /** PRO MODLAR: mod kartları ve Özelleştir paneli (orta boy dikey) */
    @Test fun proModlar() {
        RuntimeEnvironment.setQualifiers(nitelik(boyutlar[1].second, false))
        KameraActivity.girisSoruldu = true
        tercih("kamera").edit().clear().putString("mod", "PRO").commit()
        Robolectric.buildActivity(KameraActivity::class.java).setup().use { c ->
            val a = c.get(); ornekGoruntu(a)
            a.window.decorView.findViewWithText("PRO MODLAR")?.performClick(); kaydet(a, "kamera-promod-kartlar")
            a.window.decorView.findViewWithText("Yıldız izi")?.performClick(); kaydet(a, "kamera-promod-uyari")
            a.window.decorView.findViewWithText("Açıklamalar")?.performClick(); kaydet(a, "kamera-promod-yardim")
            a.window.decorView.findViewWithText("Açıklamalar")?.performClick()
            KameraActivity.ornekBazIso = 50
            a.window.decorView.findViewWithText("PRO MODLAR")?.performClick(); a.window.decorView.findViewWithText("İpeksi su")?.performClick()
            a.window.decorView.findViewWithText("PRO mod ayarları")?.performClick(); kaydet(a, "kamera-promod-ozellestir")
            KameraActivity.ornekBazIso = null
        }
    }

    /** Kompozisyon katmanı: konu, ok, ibre, ufuk, öncü çizgiler ve yön tarifi gri bir görüntünün üstünde */
    @Test fun masa() {
        for (yatay in listOf(false, true)) {
            RuntimeEnvironment.setQualifiers(nitelik(boyutlar[1].second, yatay))
            Robolectric.buildActivity(MasaActivity::class.java).setup().use { c -> val a = c.get(); kaydet(a, "masa-${if (yatay) "land" else "port"}"); a.ornekDoldur(); kaydet(a, "masa-${if (yatay) "land" else "port"}") }
        }
        // Android tablet (yönetmen masası): 1280×800 dp
        for (yatay in listOf(true, false)) {
            RuntimeEnvironment.setQualifiers(if (yatay) "w1280dp-h800dp-land-xhdpi" else "w800dp-h1280dp-port-xhdpi")
            Robolectric.buildActivity(MasaActivity::class.java).setup().use { c -> val a = c.get(); a.ornekDoldur(); kaydet(a, "masa-tablet-${if (yatay) "land" else "port"}") }
        }
    }

    @Test fun katman() {
        RuntimeEnvironment.setQualifiers(nitelik(boyutlar[1].second, false))
        val c = ApplicationProvider.getApplicationContext<Context>()
        val w = 1179; val h = 1572
        for ((ad, tur) in listOf("spiral" to KompTur.SPIRAL, "oncu" to KompTur.ONCU)) {
            val v = KompozisyonGorunum(c) { android.graphics.RectF(0f, 0f, w.toFloat(), h.toFloat()) }
            v.tur = tur; v.asistan = true
            v.konu = android.graphics.RectF(0.2f, 0.35f, 0.4f, 0.6f); v.konuAdi = "Yüz"; v.egim = 2.4f
            v.analiz = AnalizSonuc(Cizgi(N(0f, 0.55f), N(1f, 0.52f), 2f, 0.2f), listOf(Cizgi(N(0f, 1f), N(0.5f, 0.4f), 50f, 0.1f), Cizgi(N(1f, 1f), N(0.5f, 0.4f), -50f, 0.1f)), N(0.5f, 0.4f), 0.4f, N(0.5f, 0.5f))
            v.ipucu = "Telefonu biraz sola çevir"
            v.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY)); v.layout(0, 0, w, h)
            val b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888); val cv = Canvas(b); cv.drawColor(android.graphics.Color.rgb(58, 64, 73)); v.draw(cv)
            File(klasor, "katman-$ad.png").outputStream().use { b.compress(Bitmap.CompressFormat.PNG, 100, it) }
        }
    }

    /** Ses göstergesinde örnek düzey (sol −14, sağ −7 dB) ki çizgilerin renkleri görülsün */
    private fun ornekSes(v: View) { if (v is SesGostergesi) v.ayarla(-14f, -7f) else if (v is android.view.ViewGroup) for (i in 0 until v.childCount) ornekSes(v.getChildAt(i)) }

    @Test fun proVeMonitor() {
        for ((ad, q) in boyutlar) for (yon in listOf("port", "land")) for (mod in listOf("pro", "monitor")) {
            RuntimeEnvironment.setQualifiers(nitelik(q, yon == "land"))
            val i = Intent(ApplicationProvider.getApplicationContext(), MainActivity::class.java).putExtra("mod", mod)
            Robolectric.buildActivity(MainActivity::class.java, i).setup().use { c -> val a = c.get(); ornekGoruntu(a); ornekSes(a.window.decorView); kaydet(a, "$mod-$yon-$ad") }
            // Parlak sahne (kar, beyaz duvar): küçük yazılar ve göstergeler yine okunmalı
            if (ad == "orta" && mod == "pro") Robolectric.buildActivity(MainActivity::class.java, i).setup().use { c -> val a = c.get(); ornekGoruntu(a, parlak = true); ornekSes(a.window.decorView); kaydet(a, "$mod-$yon-parlak") }
        }
    }
}

private fun View.findViewWithText(t: String): View? {
    if (contentDescription?.toString() == t) return this
    if (this is android.view.ViewGroup) for (k in 0 until childCount) getChildAt(k).findViewWithText(t)?.let { return it }
    return null
}
