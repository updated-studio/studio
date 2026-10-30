package tr.com.updated.monitor

import android.app.Activity
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.SeekBar
import android.widget.TextView

/**
 * Genel Ayarlar ekranı (iPhone'daki KameraAyarlar ile aynı düzen; Apple Ayarlar / Final Cut Camera gibi): siyah zemin, gruplu
 * yuvarlak köşeli listeler, tek renk simgeli satırlar alt sayfa açar, üstte "‹ Geri" ve "Bitti". Bir ayar değişince sayfa yeniden çizilir
 * (`yenile`); kaydırma yeri korunur. Desteklenmeyen seçenek soluk görünür, altında nedeni yazar.
 */
class AyarEkrani(private val a: Activity, private val kok: FrameLayout, private val ust: Int, private val alt: Int, private val kapandi: () -> Unit) {
    companion object {
        val ZEMIN = Color.BLACK
        val GRUP = Color.rgb(28, 28, 30)
        val AYIRAC = Color.rgb(56, 56, 58)
        val IKINCIL = Color.rgb(142, 142, 147)
        val MAVI = Color.rgb(10, 132, 255)
        val SARI = Color.rgb(255, 214, 10)
        val YESIL = Color.rgb(48, 209, 88)
    }

    private fun dp(v: Float) = (v * a.resources.displayMetrics.density).toInt()
    private val yig = ArrayList<Pair<String, Sayfa.() -> Unit>>()
    private val gorunum = FrameLayout(a).apply { setBackgroundColor(ZEMIN); isClickable = true; setPadding(0, ust, 0, alt) }
    private val baslik = TextView(a).apply { textSize = 17f; typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL); setTextColor(Color.WHITE); gravity = Gravity.CENTER; isSingleLine = true }
    private val geriYazi = TextView(a).apply { textSize = 17f; setTextColor(MAVI); gravity = Gravity.CENTER_VERTICAL; setPadding(dp(8f), 0, dp(12f), 0); setOnClickListener { geri() } }
    private val kaydir = ScrollView(a).apply { isVerticalScrollBarEnabled = false; isFillViewport = true }
    val acik: Boolean get() = gorunum.parent != null

    init {
        val bas = FrameLayout(a)
        bas.addView(baslik, FrameLayout.LayoutParams(-1, -1).apply { marginStart = dp(96f); marginEnd = dp(96f) })
        bas.addView(geriYazi, FrameLayout.LayoutParams(-2, -1, Gravity.START))
        bas.addView(TextView(a).apply { text = "Bitti"; contentDescription = "Bitti"; textSize = 17f; typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL); setTextColor(MAVI); gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(12f), 0, dp(16f), 0); setOnClickListener { kapat() } }, FrameLayout.LayoutParams(-2, -1, Gravity.END))
        gorunum.addView(bas, FrameLayout.LayoutParams(-1, dp(50f), Gravity.TOP))
        gorunum.addView(kaydir, FrameLayout.LayoutParams(-1, -1).apply { topMargin = dp(50f) })
    }

    fun ac(ad: String, kur: Sayfa.() -> Unit) {
        yig.clear(); yig.add(ad to kur)
        if (gorunum.parent == null) { kok.addView(gorunum, FrameLayout.LayoutParams(-1, -1)); gorunum.alpha = 0f; gorunum.animate().alpha(1f).setDuration(160) }
        ciz(0)
    }
    fun git(ad: String, kur: Sayfa.() -> Unit) { yig.add(ad to kur); ciz(0) }
    fun geri() { if (yig.size > 1) { yig.removeAt(yig.size - 1); ciz(0) } else kapat() }
    /** Ayar değişti: aynı sayfa, aynı kaydırma yeri */
    fun yenile() { if (acik) ciz(kaydir.scrollY) }
    fun kapat() { if (gorunum.parent == null) return; kok.removeView(gorunum); yig.clear(); kapandi() }

    private fun ciz(y: Int) {
        val (ad, kur) = yig.last()
        baslik.text = ad
        geriYazi.text = if (yig.size > 1) "‹ ${yig[yig.size - 2].first}" else ""
        geriYazi.visibility = if (yig.size > 1) View.VISIBLE else View.INVISIBLE
        val s = Sayfa(); s.kur()
        kaydir.removeAllViews(); kaydir.addView(s.kutu)
        kaydir.post { kaydir.scrollTo(0, y) }
    }

    inner class Sayfa {
        val kutu = LinearLayout(a).apply { orientation = LinearLayout.VERTICAL; setPadding(0, dp(6f), 0, dp(40f)) }

        fun grup(ad: String? = null, not: String? = null, icerik: Grup.() -> Unit) {
            ad?.let { kutu.addView(TextView(a).apply { text = it.uppercase(java.util.Locale("tr")); textSize = 13f; setTextColor(IKINCIL); setPadding(dp(32f), dp(18f), dp(32f), dp(7f)) }) }
                ?: kutu.addView(View(a), LinearLayout.LayoutParams(-1, dp(18f)))
            val g = Grup(); g.icerik()
            kutu.addView(g.liste, LinearLayout.LayoutParams(-1, -2).apply { marginStart = dp(16f); marginEnd = dp(16f) })
            not?.let { kutu.addView(TextView(a).apply { text = it; textSize = 13f; setTextColor(IKINCIL); setLineSpacing(0f, 1.1f); setPadding(dp(32f), dp(7f), dp(32f), 0) }) }
        }
    }

    inner class Grup {
        val liste = LinearLayout(a).apply { orientation = LinearLayout.VERTICAL; background = GradientDrawable().apply { setColor(GRUP); cornerRadius = dp(12f).toFloat() }; clipToOutline = true }

        private fun satirKutu(etkin: Boolean, tik: (() -> Unit)?): LinearLayout {
            if (liste.childCount > 0) liste.addView(View(a).apply { setBackgroundColor(AYIRAC) }, LinearLayout.LayoutParams(-1, maxOf(1, dp(0.5f))).apply { marginStart = dp(16f) })
            val s = LinearLayout(a).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; minimumHeight = dp(46f); setPadding(dp(16f), dp(8f), dp(14f), dp(8f))
                alpha = if (etkin) 1f else 0.38f
                if (etkin && tik != null) { setOnClickListener { tik() }; background = android.graphics.drawable.RippleDrawable(ColorStateList.valueOf(Color.argb(40, 255, 255, 255)), null, null) } }
            liste.addView(s, LinearLayout.LayoutParams(-1, -2))
            return s
        }
        private fun yazilar(s: LinearLayout, ad: String, alt: String?, renk: Int = Color.WHITE) {
            s.addView(LinearLayout(a).apply { orientation = LinearLayout.VERTICAL
                addView(TextView(a).apply { text = ad; textSize = 16f; setTextColor(renk) })
                alt?.let { addView(TextView(a).apply { text = it; textSize = 12.5f; setTextColor(IKINCIL); setPadding(0, dp(1f), 0, 0) }) }
            }, LinearLayout.LayoutParams(0, -2, 1f))
        }
        /**
         * Satır simgesi (Fatih 30 Ekim: renkli kutulu simgeler "saçma"; iOS KameraAyarlar ile aynı): kameranın dili, tek renk ince simge,
         * %7 beyaz dolgulu, yarım piksel hatlı koyu kutu. `renk` eski çağrılar için durur, kullanılmaz.
         */
        @Suppress("UNUSED_PARAMETER")
        private fun simge(s: LinearLayout, res: Int, renk: Int) {
            s.addView(ImageView(a).apply { setImageResource(res); setColorFilter(Color.argb(235, 255, 255, 255)); scaleType = ImageView.ScaleType.FIT_CENTER; setPadding(dp(6.5f), dp(6.5f), dp(6.5f), dp(6.5f))
                background = GradientDrawable().apply { setColor(Color.argb(18, 255, 255, 255)); cornerRadius = dp(8f).toFloat(); setStroke(maxOf(1, dp(0.5f)), Color.argb(46, 255, 255, 255)) } },
                LinearLayout.LayoutParams(dp(30f), dp(30f)).apply { marginEnd = dp(13f) })
        }

        /** Alt sayfa açan satır: renkli simge, ad, sağda değer ve › */
        fun git(res: Int?, renk: Int, ad: String, deger: String = "", alt: String? = null, tik: () -> Unit) {
            val s = satirKutu(true, tik)
            res?.let { simge(s, it, renk) }
            yazilar(s, ad, alt)
            s.addView(TextView(a).apply { text = deger; textSize = 15f; setTextColor(IKINCIL); isSingleLine = true; fontFeatureSettings = "tnum"; setPadding(dp(8f), 0, dp(6f), 0) })
            s.addView(TextView(a).apply { text = "›"; textSize = 22f; setTextColor(Color.rgb(90, 90, 94)) })
        }

        /** Seçenek satırı: seçiliyse sağda ✓ (sarı); `etkin` değilse soluk ve dokunulmaz */
        fun secenek(ad: String, secili: Boolean, alt: String? = null, etkin: Boolean = true, tik: () -> Unit) {
            val s = satirKutu(etkin, { tik(); yenile() })
            yazilar(s, ad, alt)
            s.addView(TextView(a).apply { text = if (secili) "✓" else ""; textSize = 18f; typeface = Typeface.DEFAULT_BOLD; setTextColor(SARI); gravity = Gravity.CENTER }, LinearLayout.LayoutParams(dp(24f), -2))
        }

        /** Açık/kapalı */
        fun anahtar(ad: String, acik: Boolean, alt: String? = null, etkin: Boolean = true, degisti: (Boolean) -> Unit) {
            val s = satirKutu(etkin, null)
            yazilar(s, ad, alt)
            s.addView(android.widget.Switch(a).apply {
                isChecked = acik; isEnabled = etkin
                thumbTintList = ColorStateList.valueOf(Color.WHITE)
                trackTintList = ColorStateList(arrayOf(intArrayOf(android.R.attr.state_checked), intArrayOf()), intArrayOf(YESIL, Color.rgb(57, 57, 61)))
                setOnCheckedChangeListener { _, b -> degisti(b); yenile() }
            })
        }

        /** Bilgi satırı (dokunulmaz ya da düğme gibi) */
        fun deger(ad: String, deger: String = "", renk: Int = Color.WHITE, alt: String? = null, tik: (() -> Unit)? = null) {
            val s = satirKutu(true, tik)
            yazilar(s, ad, alt, renk)
            if (deger.isNotEmpty()) s.addView(TextView(a).apply { text = deger; textSize = 16f; setTextColor(IKINCIL); isSingleLine = true })
        }

        /** Bölümlü seçim (Apple'ın segmented control'ü) */
        fun bolumlu(secenekler: List<String>, secili: Int, sec: (Int) -> Unit) {
            val s = satirKutu(true, null)
            val kap = LinearLayout(a).apply { orientation = LinearLayout.HORIZONTAL; setPadding(dp(2f), dp(2f), dp(2f), dp(2f))
                background = GradientDrawable().apply { setColor(Color.rgb(58, 58, 60)); cornerRadius = dp(9f).toFloat() } }
            secenekler.forEachIndexed { i, o -> kap.addView(TextView(a).apply { text = o; textSize = 14f; gravity = Gravity.CENTER; setTextColor(Color.WHITE)
                typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
                if (i == secili) background = GradientDrawable().apply { setColor(Color.rgb(99, 99, 102)); cornerRadius = dp(7f).toFloat() }
                setOnClickListener { sec(i); yenile() } }, LinearLayout.LayoutParams(0, dp(30f), 1f)) }
            s.addView(kap, LinearLayout.LayoutParams(-1, -2))
        }

        /** Kaydırıcı: ad, sağda canlı değer; bırakınca `bitti` */
        fun kaydirici(ad: String, en: Int, simdi: Int, yazi: (Int) -> String, degisti: (Int) -> Unit, bitti: () -> Unit = {}) {
            val s = satirKutu(true, null).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.NO_GRAVITY }
            val ust = LinearLayout(a).apply { orientation = LinearLayout.HORIZONTAL }
            ust.addView(TextView(a).apply { text = ad; textSize = 16f; setTextColor(Color.WHITE) }, LinearLayout.LayoutParams(0, -2, 1f))
            val d = TextView(a).apply { text = yazi(simdi); textSize = 16f; setTextColor(SARI); typeface = Typeface.MONOSPACE }
            ust.addView(d); s.addView(ust)
            s.addView(SeekBar(a).apply {
                max = en; progress = simdi; setPadding(dp(6f), dp(10f), dp(6f), dp(4f))
                progressTintList = ColorStateList.valueOf(SARI); thumbTintList = ColorStateList.valueOf(Color.WHITE)
                progressBackgroundTintList = ColorStateList.valueOf(Color.rgb(72, 72, 74))
                setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                    override fun onProgressChanged(b: SeekBar?, v: Int, k: Boolean) { if (k) { d.text = yazi(v); degisti(v) } }
                    override fun onStartTrackingTouch(b: SeekBar?) {}
                    override fun onStopTrackingTouch(b: SeekBar?) { bitti() }
                })
            }, LinearLayout.LayoutParams(-1, -2))
        }

        /** Özel görünüm (satır içinde) */
        fun ozel(v: View) { satirKutu(true, null).addView(v, LinearLayout.LayoutParams(-1, -2)) }
    }
}
