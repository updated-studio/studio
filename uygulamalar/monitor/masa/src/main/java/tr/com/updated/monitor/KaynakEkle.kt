package tr.com.updated.monitor

import android.app.Activity
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * Multi Cam → Kaynak ekle (iOS MultiCam.swift KaynakEkleSayfasi / HariciKamera ile aynı bölümler ve metinler; Fatih 30 Ekim):
 * BU CİHAZ (arka / ön kamera), AKSİYON VE 360 KAMERALAR (marka satırı → adım adım rehber), DİĞER (Wi-Fi telefon, adresle ekle, USB).
 * Android'de aksiyon kameraları ayrıca kendi uygulamalarından canlı yayınla (RTMP) kablosuz bağlanır; rehberde adres ve Kopyala.
 */
class KaynakEkle(private val a: Activity, private val kok: FrameLayout, private val v: Veri) {
    /** Ekranın ihtiyaç duyduğu bilgiler ve işler (MasaActivity verir) */
    class Veri(
        val telefonKameralari: List<Triple<String, String, Boolean>>, // id, ad, ön mü
        val ekliKamera: (String) -> Boolean,
        val wifiBagli: Int,
        val bulunan: List<String>,
        val rtmpAdresi: (String) -> String,
        val kameraEkle: (String, String) -> Unit,
        val wifiEkle: (String) -> Unit,
        val adresleEkle: (String) -> Unit,
        val usbAra: () -> Unit,
        val lunaEkle: () -> Unit,
        val kopyala: (String) -> Unit,
    )

    /** Bağlanabilen aksiyon / 360 kameralar: yollar (rozet) ve adımlar; `rtmp` kablosuz canlı yayın adı (adresin sonu) */
    class Harici(val id: String, val ad: String, val alt: String, val simge: Int, val yollar: List<String>, val adimlar: List<String>, val rtmp: String? = null)

    companion object {
        val HEPSI = listOf(
            Harici("luna", "Insta360 Luna", "Kameranın kendi Wi-Fi'ı", R.drawable.ic_genis, listOf("WI-FI"), listOf(
                "Luna'yı aç; kamera kendi Wi-Fi ağını yayınlar.",
                "Bu cihazın Ayarlar → Wi-Fi bölümünden Luna'nın ağına bağlan (şifre kameranın ekranında ya da kutusunda).",
                "Buraya dön ve Bağlan'a dokun; kamera ekranında izin sorarsa onayla.",
                "Not: Luna'nın ağındayken aynı anda yalnız bu cihazın kamerası ve USB kameralar eklenebilir; Wi-Fi telefonlar başka ağda kalır.")),
            Harici("ace", "Ace Pro 2 · GO Ultra", "Insta360 · USB web kamerası ya da canlı yayın", R.drawable.ic_enst, listOf("USB", "RTMP"), listOf(
                "Kamerada USB modunu Web kamerası (UVC) yap: Ayarlar → USB → Web kamerası.",
                "Kamerayı USB-C kabloyla bu cihaza tak.",
                "Kamera kendiliğinden kaynak olarak eklenir; eklenmezse aşağıdaki Ara'ya dokun.",
                "Kablosuz: Insta360 uygulamasında Canlı yayın → RTMP'yi seç, aşağıdaki adresi yaz ve yayını başlat (kamera bu cihazla aynı Wi-Fi'da)."), "ace"),
            Harici("osmo", "Osmo Pocket 4 · 4P · Action", "DJI · USB web kamerası ya da canlı yayın", R.drawable.ic_odak, listOf("USB", "RTMP"), listOf(
                "Kamerayı USB-C kabloyla bu cihaza tak.",
                "Kameranın ekranında bağlantı türü sorulursa Web kamerası'nı seç.",
                "Kamera kendiliğinden kaynak olarak eklenir; eklenmezse aşağıdaki Ara'ya dokun.",
                "Kablosuz: DJI Mimo'da Canlı yayın → RTMP'yi seç, aşağıdaki adresi yaz ve yayını başlat (kamera bu cihazla aynı Wi-Fi'da)."), "osmo"),
            Harici("gopro", "GoPro", "USB web kamerası ya da canlı yayın", R.drawable.ic_video, listOf("USB", "RTMP"), listOf(
                "Kamerada Tercihler → Bağlantılar → USB bağlantısı → GoPro Connect / Web kamerası'nı seç.",
                "Kamerayı USB-C kabloyla bu cihaza tak; kaynak kendiliğinden eklenir.",
                "Kablosuz: GoPro Quik'te Canlı yayın → RTMP'yi seç, aşağıdaki adresi yaz ve yayını başlat."), "gopro"),
        )
        private val ZEMIN = Color.rgb(13, 13, 13); private val GRUP = Color.rgb(28, 28, 30); private val HAT = Color.argb(46, 255, 255, 255)
        private val IKINCIL = Color.argb(158, 255, 255, 255); private val YESIL = Color.rgb(52, 199, 89); private val SARI = Color.rgb(255, 214, 10)
    }

    private fun dp(x: Float) = Tema.dp(a, x)
    private val gorunum = FrameLayout(a).apply { setBackgroundColor(ZEMIN); isClickable = true }
    private val baslik = TextView(a).apply { textSize = 17f; typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL); setTextColor(Color.WHITE); gravity = Gravity.CENTER; isSingleLine = true }
    private val geri = TextView(a).apply { textSize = 17f; setTextColor(Color.rgb(10, 132, 255)); gravity = Gravity.CENTER_VERTICAL; setPadding(dp(12f), 0, dp(12f), 0); text = "‹ Geri"; setOnClickListener { liste() } }
    private val kaydir = ScrollView(a).apply { isFillViewport = true }

    fun ac(ust: Int, alt: Int) {
        val bas = FrameLayout(a)
        bas.addView(baslik, FrameLayout.LayoutParams(-1, -1).apply { marginStart = dp(90f); marginEnd = dp(90f) })
        bas.addView(geri, FrameLayout.LayoutParams(-2, -1, Gravity.START))
        bas.addView(TextView(a).apply { text = "Kapat"; textSize = 17f; typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL); setTextColor(Color.rgb(10, 132, 255)); gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(12f), 0, dp(16f), 0); setOnClickListener { kapat() } }, FrameLayout.LayoutParams(-2, -1, Gravity.END))
        gorunum.setPadding(0, ust, 0, alt)
        gorunum.addView(bas, FrameLayout.LayoutParams(-1, dp(50f), Gravity.TOP))
        val tablet = a.resources.configuration.smallestScreenWidthDp >= 600
        gorunum.addView(kaydir, FrameLayout.LayoutParams(if (tablet) dp(560f) else -1, -1, Gravity.CENTER_HORIZONTAL).apply { topMargin = dp(50f) })
        kok.addView(gorunum, FrameLayout.LayoutParams(-1, -1))
        liste()
    }
    val acik get() = gorunum.parent != null
    fun kapat() { kok.removeView(gorunum) }

    private fun sayfa(ad: String, geriVar: Boolean): LinearLayout {
        baslik.text = ad; geri.visibility = if (geriVar) View.VISIBLE else View.INVISIBLE
        val s = LinearLayout(a).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(16f), dp(4f), dp(16f), dp(40f)) }
        kaydir.removeAllViews(); kaydir.addView(s); kaydir.scrollTo(0, 0)
        return s
    }
    private fun bolum(s: LinearLayout, ad: String?, not: String? = null): LinearLayout {
        ad?.let { s.addView(TextView(a).apply { text = it; textSize = 12f; letterSpacing = 0.08f; setTextColor(IKINCIL); setPadding(dp(16f), dp(18f), dp(16f), dp(7f)) }) }
        val g = LinearLayout(a).apply { orientation = LinearLayout.VERTICAL; background = GradientDrawable().apply { setColor(GRUP); cornerRadius = dp(14f).toFloat() }; clipToOutline = true }
        s.addView(g, LinearLayout.LayoutParams(-1, -2).apply { if (ad == null) topMargin = dp(18f) })
        not?.let { s.addView(TextView(a).apply { text = it; textSize = 12.5f; setTextColor(IKINCIL); setPadding(dp(16f), dp(7f), dp(16f), 0) }) }
        return g
    }
    /** Satır: simge kutusu, ad (yarı kalın) + açıklama, sağda verilen görünüm; dokunulabilirse dalga */
    private fun satir(g: LinearLayout, simge: Int?, ad: String, alt: String?, sag: View?, tik: (() -> Unit)?) {
        if (g.childCount > 0) g.addView(View(a).apply { setBackgroundColor(HAT) }, LinearLayout.LayoutParams(-1, maxOf(1, dp(0.5f))).apply { marginStart = dp(if (simge != null) 63f else 16f) })
        val r = LinearLayout(a).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; minimumHeight = dp(60f); setPadding(dp(16f), dp(10f), dp(14f), dp(10f))
            if (tik != null) { setOnClickListener { tik() }; background = android.graphics.drawable.RippleDrawable(ColorStateList.valueOf(Color.argb(40, 255, 255, 255)), null, null) } }
        simge?.let { r.addView(ImageView(a).apply { setImageResource(it); setColorFilter(Color.WHITE); setPadding(dp(8f), dp(8f), dp(8f), dp(8f))
            background = GradientDrawable().apply { setColor(Color.argb(20, 255, 255, 255)); cornerRadius = dp(9f).toFloat() } }, LinearLayout.LayoutParams(dp(34f), dp(34f)).apply { marginEnd = dp(13f) }) }
        r.addView(LinearLayout(a).apply { orientation = LinearLayout.VERTICAL
            addView(TextView(a).apply { text = ad; textSize = 15f; typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL); setTextColor(Color.WHITE) })
            alt?.let { addView(TextView(a).apply { text = it; textSize = 12f; setTextColor(IKINCIL); maxLines = 2 }) } }, LinearLayout.LayoutParams(0, -2, 1f))
        sag?.let { r.addView(it, LinearLayout.LayoutParams(-2, -2).apply { marginStart = dp(8f) }) }
        g.addView(r, LinearLayout.LayoutParams(-1, -2))
    }
    private fun yazi(m: String, renk: Int = IKINCIL, kalin: Boolean = true) = TextView(a).apply { text = m; textSize = 14f; setTextColor(renk); if (kalin) typeface = Typeface.create("sans-serif-medium", Typeface.BOLD) }
    private fun rozetler(l: List<String>) = LinearLayout(a).apply { orientation = LinearLayout.HORIZONTAL
        l.forEachIndexed { i, y -> addView(TextView(a).apply { text = y; textSize = 9.5f; letterSpacing = 0.05f; typeface = Typeface.DEFAULT_BOLD; setTextColor(IKINCIL); setPadding(dp(7f), dp(3f), dp(7f), dp(3f))
            background = GradientDrawable().apply { cornerRadius = dp(10f).toFloat(); setStroke(maxOf(1, dp(0.5f)), HAT) } }, LinearLayout.LayoutParams(-2, -2).apply { if (i > 0) marginStart = dp(4f) }) }
        addView(TextView(a).apply { text = "›"; textSize = 20f; setTextColor(Color.rgb(90, 90, 94)); setPadding(dp(8f), 0, 0, 0) }) }

    private fun liste() {
        val s = sayfa("Kaynak ekle", false)
        s.addView(TextView(a).apply { text = "Kameranı seç, bağlantıyı biz kuralım"; textSize = 13f; setTextColor(IKINCIL); gravity = Gravity.CENTER; setPadding(0, dp(6f), 0, 0) })
        val bu = if (v.telefonKameralari.isEmpty()) null else bolum(s, "BU CİHAZ")
        if (bu != null) v.telefonKameralari.forEach { (id, ad, on) ->
            val ekli = v.ekliKamera(id)
            satir(bu, if (on) R.drawable.ic_portre else R.drawable.ic_kamera, if (on) "Ön kamera" else ad.substringBefore(" ·"),
                if (on) "Konuşan kişi için · ayrı dosya" else "Bu cihaz · ayrı dosya, diğerleriyle aynı anda",
                if (ekli) yazi("Ekli") else yazi("Ekle", YESIL), if (ekli) null else ({ v.kameraEkle(id, ad); kapat() }))
        }
        val ak = bolum(s, "AKSİYON VE 360 KAMERALAR")
        HEPSI.forEach { k -> satir(ak, k.simge, k.ad, k.alt, rozetler(k.yollar)) { rehber(k) } }
        val d = bolum(s, "DİĞER")
        satir(d, R.drawable.ic_ag, "Updated Camera yüklü telefon", "Aynı Wi-Fi'da kendiliğinden gelir (telefonda Ayarlar → Multi Cam → Wi-Fi kamera ol)", yazi("${v.wifiBagli} bağlı", kalin = false), null)
        v.bulunan.forEach { ad -> satir(d, null, ad, "Bulundu · Wi-Fi kamera", yazi("Ekle", YESIL)) { v.wifiEkle(ad); kapat() } }
        val e = EditText(a).apply { hint = "Adresle ekle (ör. 192.168.1.20)"; textSize = 14f; setSingleLine(); setTextColor(Color.WHITE); setHintTextColor(Color.argb(90, 255, 255, 255)); background = null
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_URI }
        if (d.childCount > 0) d.addView(View(a).apply { setBackgroundColor(HAT) }, LinearLayout.LayoutParams(-1, maxOf(1, dp(0.5f))).apply { marginStart = dp(16f) })
        d.addView(LinearLayout(a).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(dp(16f), 0, dp(14f), 0)
            addView(e, LinearLayout.LayoutParams(0, dp(52f), 1f))
            addView(yazi("Ekle", Color.rgb(10, 132, 255)).apply { setPadding(dp(10f), dp(10f), 0, dp(10f)); setOnClickListener { val t = e.text.toString().trim(); if (t.isNotEmpty()) { v.adresleEkle(t); kapat() } } })
        }, LinearLayout.LayoutParams(-1, -2))
        satir(d, R.drawable.ic_usb, "USB kamera / yakalama kartı", "Takınca kendiliğinden eklenir", yazi("Ara", Color.rgb(10, 132, 255))) { v.usbAra(); kapat() }
    }

    /** Seçilen kameranın adım adım rehberi; kablosuz yolu varsa RTMP adresi ve Kopyala */
    private fun rehber(k: Harici) {
        val s = sayfa(k.ad, true)
        val g = bolum(s, null)
        k.adimlar.forEachIndexed { i, m ->
            if (i > 0) g.addView(View(a).apply { setBackgroundColor(HAT) }, LinearLayout.LayoutParams(-1, maxOf(1, dp(0.5f))).apply { marginStart = dp(46f) })
            g.addView(LinearLayout(a).apply { orientation = LinearLayout.HORIZONTAL; setPadding(dp(16f), dp(12f), dp(14f), dp(12f))
                addView(TextView(a).apply { text = "${i + 1}"; textSize = 13f; typeface = Typeface.DEFAULT_BOLD; setTextColor(SARI); fontFeatureSettings = "tnum" }, LinearLayout.LayoutParams(dp(30f), -2))
                addView(TextView(a).apply { text = m; textSize = 14f; setTextColor(Color.WHITE); setLineSpacing(0f, 1.1f) }, LinearLayout.LayoutParams(0, -2, 1f))
            })
        }
        k.rtmp?.let { ad ->
            val adres = v.rtmpAdresi(ad)
            val r = bolum(s, "CANLI YAYIN ADRESİ", "Her kamera için sondaki adı değiştirebilirsin (ace2, osmo-b…). Yayın başlayınca kamera burada kendiliğinden kaynak olur, ayrı kaydı da tutulur.")
            satir(r, null, adres, null, yazi("Kopyala", Color.rgb(10, 132, 255))) { v.kopyala(adres) }
        }
        val b = bolum(s, null)
        if (k.id == "luna") satir(b, R.drawable.ic_ag, "Bağlan", null, null) { v.lunaEkle(); kapat() }
        else satir(b, R.drawable.ic_usb, "USB kameraları ara", null, null) { v.usbAra(); kapat() }
    }
}
