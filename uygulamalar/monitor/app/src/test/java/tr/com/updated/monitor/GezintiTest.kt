package tr.com.updated.monitor

import android.app.Activity
import android.content.Context
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Gezinti testi (telefon olmadan "her özelliği dene"): Kamera ekranında görünen her düğmeye dokunur, açılan panodaki her düğmeye
 * de dokunur (iki kat), basılı tutulabilenlere basılı tutar; her modda ve AI Kadraj / stil açıkken tekrarlar. Çökme olursa
 * hangi yolda olduğunu yazar. Kamera yok: kameraya bağlı sayfalar "Kamera hazır değil" der, onlar kamerasız hâliyle denenir.
 * Çalıştırma: gradle testReleaseUnitTest --tests '*GezintiTest*'
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w393dp-h852dp-port-xxhdpi")
class GezintiTest {
    private val hatalar = mutableListOf<String>()
    private var dokunus = 0
    private val yollar = mutableListOf<String>()
    /** Uygulamadan çıkaran ya da başka ekrana geçirenler (ayrı denenir) ve dosya seçici */
    private val atla = setOf("Monitör", "MONİTÖR")

    private fun tercih() = ApplicationProvider.getApplicationContext<Context>().getSharedPreferences("kamera", Context.MODE_PRIVATE)
    private fun bekle() = shadowOf(android.os.Looper.getMainLooper()).idle()

    private fun etiket(v: View): String? = ((v as? TextView)?.text?.toString()?.takeIf { it.isNotBlank() } ?: v.contentDescription?.toString()?.takeIf { it.isNotBlank() })?.replace('\n', ' ')

    /** Görünen, dokunulabilen görünümler (etiketi kendinde ya da ilk yazılı çocuğunda) */
    private fun dugmeler(a: Activity): List<Pair<String, View>> {
        val l = ArrayList<Pair<String, View>>()
        fun gez(v: View, gorunur: Boolean) {
            val g = gorunur && v.visibility == View.VISIBLE
            if (!g) return
            if (v.isClickable && v.isEnabled && (v.hasOnClickListeners() || v.isLongClickable)) {
                val e = etiket(v) ?: (v as? ViewGroup)?.let { ilkYazi(it) } ?: "#${v.javaClass.simpleName}"
                l.add(e to v)
            }
            if (v is ViewGroup) for (i in 0 until v.childCount) gez(v.getChildAt(i), g)
        }
        gez(a.window.decorView, true)
        // Aynı adlılar sırayla numaralanır
        val say = HashMap<String, Int>()
        return l.map { (e, v) -> val n = say.merge(e, 1, Int::plus)!!; (if (n > 1) "$e[$n]" else e) to v }
    }
    private fun ilkYazi(g: ViewGroup): String? {
        for (i in 0 until g.childCount) { val c = g.getChildAt(i); etiket(c)?.let { return it }; if (c is ViewGroup) ilkYazi(c)?.let { return it } }
        return null
    }

    private fun dene(yol: String, is_: () -> Unit) {
        dokunus++; yollar.add(yol)
        try { is_(); bekle() } catch (t: Throwable) {
            val iz = generateSequence(t) { it.cause }.last().stackTrace.firstOrNull { it.className.startsWith("tr.com.updated") }
            hatalar.add("$yol → ${t.javaClass.simpleName}: ${t.message?.take(160)} @ $iz")
            runCatching { bekle() }
        }
    }

    private fun bul(a: Activity, ad: String) = dugmeler(a).firstOrNull { it.first == ad }?.second

    /** İki kat gezinti: ana ekrandaki her düğme, sonra açtığı panodaki her yeni düğme (ve basılı tutma) */
    private fun gez(baslik: String, hazirla: () -> Unit, derin: Boolean) {
        hazirla()
        val ilk = Robolectric.buildActivity(KameraActivity::class.java).setup().use { c -> bekle(); dugmeler(c.get()).map { it.first } }
        for (d1 in ilk) {
            if (d1 in atla) continue
            hazirla()
            Robolectric.buildActivity(KameraActivity::class.java).setup().use { c ->
                val a = c.get(); bekle()
                val once = dugmeler(a).map { it.first }.toSet()
                val v1 = bul(a, d1) ?: return@use
                dene("$baslik › $d1") { v1.performClick() }
                if (!derin) { bul(a, d1)?.takeIf { it.isLongClickable }?.let { v -> dene("$baslik › $d1 (basılı)") { v.performLongClick() } }; return@use }
                val yeni = dugmeler(a).map { it.first }.filter { it !in once && it !in atla }
                for (d2 in yeni.take(60)) {
                    // Pano kapandıysa yeniden aç
                    if (bul(a, d2) == null) bul(a, d1)?.let { dene("$baslik › $d1 (yeniden)") { it.performClick() } }
                    val v2 = bul(a, d2) ?: continue
                    dene("$baslik › $d1 › $d2") { v2.performClick() }
                    if (v2.isLongClickable) { if (bul(a, d2) == null) bul(a, d1)?.performClick(); bul(a, d2)?.let { v -> dene("$baslik › $d1 › $d2 (basılı)") { v.performLongClick() } } }
                }
            }
        }
    }

    private fun temiz(mod: String = "FOTO", ek: (android.content.SharedPreferences.Editor) -> Unit = {}) {
        KameraActivity.girisSoruldu = true
        tercih().edit().clear().putString("mod", mod).also(ek).commit()
    }

    @Test fun herOzellik() {
        RuntimeEnvironment.setQualifiers("w393dp-h852dp-port-xxhdpi")
        gez("FOTO", { temiz() }, derin = true)
        gez("FOTO + AI Kadraj + stil", { temiz { it.putBoolean("k.aiKadraj", true).putString("stil", Stil(HazirStil.LC_KLASIK).json()) } }, derin = true)
        for (m in listOf("VIDEO", "PRO", "PORTRE", "TIMELAPSE")) gez(m, { temiz(m) }, derin = true)
        // Sabitlenen kısayolların hepsi (en çok 6'şar) üst şeritte: her birine dokun
        val tum = listOf("iso", "enst", "bd", "ev", "odak", "cozunurluk", "kodek", "renk", "sabitleme", "stil", "lut", "zebra", "falseColor", "peaking",
            "histogram", "monokrom", "flas", "zamanlayici", "kilavuz", "terazi", "yardimci", "ses")
        tum.chunked(6).forEachIndexed { i, p -> gez("Sabitlenen ${i + 1}", { temiz { it.putString("k.favoriler", org.json.JSONArray(p).toString()) } }, derin = false) }
        // Kontroller › her pano › panodaki her denetim (üç kat; Stiller'deki reçeteler, kılavuzlar, AI Kadraj anahtarı, Düzenle…)
        for ((ad, hz) in listOf<Pair<String, () -> Unit>>("FOTO" to { temiz() }, "AI+stil" to { temiz { it.putBoolean("k.aiKadraj", true).putString("stil", Stil(HazirStil.RETRO).json()) } }, "VIDEO" to { temiz("VIDEO") })) {
            hz()
            val panolar = Robolectric.buildActivity(KameraActivity::class.java).setup().use { c -> val a = c.get(); bekle(); val o = dugmeler(a).map { it.first }.toSet()
                bul(a, "Kontroller")?.performClick(); bekle(); dugmeler(a).map { it.first }.filter { it !in o } }
            for (pn in panolar) {
                hz()
                Robolectric.buildActivity(KameraActivity::class.java).setup().use { c ->
                    val a = c.get(); bekle(); bul(a, "Kontroller")?.performClick(); bekle()
                    val once = dugmeler(a).map { it.first }.toSet()
                    val v = bul(a, pn) ?: return@use
                    dene("$ad › Kontroller › $pn") { v.performClick() }
                    for (d in dugmeler(a).map { it.first }.filter { it !in once }.take(80)) {
                        if (bul(a, d) == null) { bul(a, "Kontroller")?.performClick(); bekle(); bul(a, pn)?.performClick(); bekle() }
                        val x = bul(a, d) ?: continue
                        dene("$ad › Kontroller › $pn › $d") { x.performClick() }
                        if (x.isLongClickable) bul(a, d)?.let { y -> dene("$ad › Kontroller › $pn › $d (basılı)") { y.performLongClick() } }
                    }
                }
            }
        }
        // Ayarlar: her sayfa ve sayfadaki her denetim (üç kat)
        temiz()
        val sayfalar = Robolectric.buildActivity(KameraActivity::class.java).setup().use { c -> val a = c.get(); bekle(); bul(a, "Kontroller")?.performClick(); bekle()
            bul(a, "Ayarlar")?.performClick(); bekle(); val ust = dugmeler(a).map { it.first }; ust }
        for (s in sayfalar) {
            temiz()
            Robolectric.buildActivity(KameraActivity::class.java).setup().use { c ->
                val a = c.get(); bekle(); bul(a, "Kontroller")?.performClick(); bekle(); bul(a, "Ayarlar")?.performClick(); bekle()
                val once = dugmeler(a).map { it.first }.toSet()
                val v = bul(a, s) ?: return@use
                dene("Ayarlar › $s") { v.performClick() }
                for (d in dugmeler(a).map { it.first }.filter { it !in once }.take(60)) bul(a, d)?.let { x -> dene("Ayarlar › $s › $d") { x.performClick() } }
            }
        }
        // Yatay
        RuntimeEnvironment.setQualifiers("w852dp-h393dp-land-xxhdpi")
        gez("FOTO yatay", { temiz() }, derin = false)
        println("Gezinti: $dokunus dokunuş, ${hatalar.size} hata")
        hatalar.forEach { println("HATA $it") }
        yollar.forEach { println("YOL $it") }
        assertTrue("Gezintide ${hatalar.size} hata:\n" + hatalar.joinToString("\n"), hatalar.isEmpty())
    }
}
