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
                a.window.decorView.findViewWithText("Kontroller")?.performClick(); kaydet(a, "kamera-denetimler-$ad")
                a.window.decorView.findViewWithText("Düzenle")?.performClick(); kaydet(a, "kamera-duzenle-$ad")
                a.window.decorView.findViewWithText("Bitti")?.performClick()
                a.window.decorView.findViewWithText("Kontroller")?.performClick()
                a.window.decorView.findViewWithText("Stiller")?.performClick(); kaydet(a, "kamera-stil-$ad")
                a.window.decorView.findViewWithText("Kontroller")?.performClick()
                a.window.decorView.findViewWithText("Kontroller")?.performClick()
                a.window.decorView.findViewWithText("Kılavuz")?.performClick(); kaydet(a, "kamera-kilavuz-$ad")
                if (ad == "orta") {
                    // Beyaz denge ton çubuğu (kamera yokken pano açılmaz; satır tek başına çizilir)
                    a.window.decorView.findViewWithText("Kapat")?.performClick()
                    val m = KameraActivity::class.java.getDeclaredMethod("tonSatiri", Function1::class.java).apply { isAccessible = true }
                    val kutu = android.widget.LinearLayout(a).apply { orientation = android.widget.LinearLayout.VERTICAL; setBackgroundColor(android.graphics.Color.rgb(40, 40, 42)); setPadding(40, 40, 40, 40) }
                    kutu.addView(m.invoke(a, { _: Int -> Unit }) as android.view.View, android.widget.LinearLayout.LayoutParams(-1, 130))
                    (a.window.decorView as android.view.ViewGroup).addView(kutu, android.widget.FrameLayout.LayoutParams(-1, -2, android.view.Gravity.CENTER))
                    kaydet(a, "kamera-ton-$ad")
                    (a.window.decorView as android.view.ViewGroup).removeView(kutu)
                    a.window.decorView.findViewWithText("Kontroller")?.performClick(); a.window.decorView.findViewWithText("Kılavuz")?.performClick()
                }
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

    /** Multi Cam → Kaynak ekle: liste ve bir marka rehberi (telefon dikey) */
    @Test fun kaynakEkle() {
        RuntimeEnvironment.setQualifiers(nitelik(boyutlar[1].second, false))
        Robolectric.buildActivity(MasaActivity::class.java).setup().use { c ->
            val a = c.get(); MasaActivity::class.java.getDeclaredMethod("kaynakMenu").apply { isAccessible = true }.invoke(a)
            kaydet(a, "studio-kaynak-ekle")
            val sayfa = MasaActivity::class.java.getDeclaredField("kaynakSayfasi").apply { isAccessible = true }.get(a) as KaynakEkle
            KaynakEkle::class.java.getDeclaredMethod("rehber", KaynakEkle.Harici::class.java).apply { isAccessible = true }.invoke(sayfa, KaynakEkle.HEPSI[2])
            kaydet(a, "studio-kaynak-rehber")
        }
    }

    /** UpCam Studio açılışı (telefon dikey, tablet) */
    @Test fun studioGiris() {
        RuntimeEnvironment.setQualifiers(nitelik(boyutlar[1].second, false))
        tercih("kamera").edit().putString("studio.son", "multicam").commit()
        Robolectric.buildActivity(StudioGiris::class.java).setup().use { c -> kaydet(c.get(), "studio-giris") }
        RuntimeEnvironment.setQualifiers("w1024dp-h1366dp-port-xhdpi")
        Robolectric.buildActivity(StudioGiris::class.java).setup().use { c -> kaydet(c.get(), "studio-giris-tablet") }
    }

    /** Genel Ayarlar ana sayfası, kamera varmış gibi bütün satırlar (simgelerin görünüşü için; satırlar KameraActivity.genelAyarlar ile aynı) */
    @Test fun genelAyarlar() {
        RuntimeEnvironment.setQualifiers(nitelik(boyutlar[1].second, false))
        KameraActivity.girisSoruldu = true
        Robolectric.buildActivity(KameraActivity::class.java).setup().use { c ->
            val a = c.get(); val kok = a.findViewById<android.view.ViewGroup>(android.R.id.content).getChildAt(0) as android.widget.FrameLayout
            AyarEkrani(a, kok, 0, 0) {}.ac("Ayarlar") {
                grup("Çözünürlük") {
                    git(R.drawable.ic_film, 0, "Video", "4K") {}; git(R.drawable.ic_hiz, 0, "Kare hızı", "30 fps") {}; git(R.drawable.ic_foto, 0, "Fotoğraf", "12 MP") {}
                }
                grup {
                    git(R.drawable.ic_kayit_daire, 0, "Kayıt", "HEVC · SDR") {}; git(R.drawable.ic_artieksi, 0, "Pozlama", "Süre") {}; git(R.drawable.ic_pozlama, 0, "Renk ve beyaz denge", "5600K") {}
                    git(R.drawable.ic_dalga, 0, "Ses", "Otomatik") {}; git(R.drawable.ic_enst, 0, "Fotoğraf", "JPEG") {}; git(R.drawable.ic_olcum, 0, "Göstergeler", "") {}
                    git(R.drawable.ic_timelapse, 0, "Timelapse", "2 sn") {}; git(R.drawable.ic_raptiye, 0, "Sabitlenenler", "5") {}
                }
                grup { git(R.drawable.ic_bolum4, 0, "Multi Cam (çok kamera)", "") {}; git(R.drawable.ic_bilgi, 0, "Uygulama", "0.17.5") {} }
            }
            kaydet(a, "kamera-genel-ayarlar")
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
        // Program düzeni 4'lü (tercih) ile telefon dikey
        RuntimeEnvironment.setQualifiers(nitelik(boyutlar[1].second, false))
        ApplicationProvider.getApplicationContext<android.content.Context>().getSharedPreferences("kamera", android.content.Context.MODE_PRIVATE).edit().putInt("masa.duzen", 4).commit()
        Robolectric.buildActivity(MasaActivity::class.java).setup().use { c -> val a = c.get(); a.ornekDoldur(); kaydet(a, "masa-duzen4") }
        ApplicationProvider.getApplicationContext<android.content.Context>().getSharedPreferences("kamera", android.content.Context.MODE_PRIVATE).edit().remove("masa.duzen").commit()
    }

    @Test fun katman() {
        RuntimeEnvironment.setQualifiers(nitelik(boyutlar[1].second, false))
        val c = ApplicationProvider.getApplicationContext<Context>()
        val w = 1179; val h = 1572
        // "secili": AI Kadraj'da dokunarak seçilmiş konu güçlü noktada (sarı köşe çentikleri, "Yüz · AF", yeşil kılavuz)
        for ((ad, tur) in listOf("spiral" to KompTur.SPIRAL, "oncu" to KompTur.ONCU, "secili" to KompTur.UCTE_BIR)) {
            val v = KompozisyonGorunum(c) { android.graphics.RectF(0f, 0f, w.toFloat(), h.toFloat()) }
            v.tur = tur; v.asistan = true
            v.konu = if (ad == "secili") android.graphics.RectF(0.25f, 0.23f, 0.42f, 0.44f) else android.graphics.RectF(0.2f, 0.35f, 0.4f, 0.6f); v.konuAdi = "Yüz"; v.egim = 2.4f
            v.konuSecili = ad == "secili"
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

    /** Monitör ayarları: 6 sekme, başlıklı gruplar (iPhone'daki sekmeIcerik); STİLLER'de seçili stil ve sıfırla görünür */
    @Test fun monitorAyarlar() {
        RuntimeEnvironment.setQualifiers("w1180dp-h820dp-land-xhdpi")
        val i = Intent(ApplicationProvider.getApplicationContext(), MainActivity::class.java).putExtra("mod", "monitor")
        Robolectric.buildActivity(MainActivity::class.java, i).setup().use { c -> val a = c.get()
            val ac = MainActivity::class.java.getDeclaredMethod("panelAc", MainActivity.Sekme::class.java).apply { isAccessible = true }
            val ayar = MainActivity::class.java.getDeclaredField("ayarlar").apply { isAccessible = true }.get(a) as Array<*>
            (ayar[0] as Ayarlar).stil = Stil(HazirStil.KLASIK_NEGATIF, x = 0.2f, doygunluk = -0.1f)
            MainActivity.Sekme.values().forEach { s -> ac.invoke(a, s); kaydet(a, "monitor-ayar-${s.name.lowercase()}") }
            ac.invoke(a, MainActivity.Sekme.STILLER); shadowOf(android.os.Looper.getMainLooper()).idle()
            check(a.window.decorView.findViewWithText("LUT ekle") != null) { "LUT ekle kutusu yok" }
        }
        RuntimeEnvironment.setQualifiers(nitelik(boyutlar[1].second, false))
        Robolectric.buildActivity(MainActivity::class.java, i).setup().use { c -> val a = c.get()
            val ac = MainActivity::class.java.getDeclaredMethod("panelAc", MainActivity.Sekme::class.java).apply { isAccessible = true }
            listOf(MainActivity.Sekme.STILLER, MainActivity.Sekme.GORUNTU).forEach { s -> ac.invoke(a, s); kaydet(a, "monitor-ayar-tel-${s.name.lowercase()}") }
        }
    }
}

private fun View.findViewWithText(t: String): View? {
    if (visibility != View.VISIBLE) return null
    if (contentDescription?.toString() == t) return this
    if (this is android.view.ViewGroup) for (k in 0 until childCount) getChildAt(k).findViewWithText(t)?.let { return it }
    return null
}
