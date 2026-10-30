package tr.com.updated.monitor

import android.app.Activity
import android.content.Intent
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.Shader
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.WindowInsets
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView

/**
 * UpCam Studio açılışı (Fatih 30 Ekim, "A · Sahne"; tasarim/upcam-studio/1-giris.png): ışık lekeli koyu zemin, ortada simge ve
 * UPCAM STUDIO, ekranın alt yarısında (başparmak bölgesi) iki büyük kart: üstte Monitör, altta Multi Cam; en altta son kullanılan.
 * Tablette aynı düzen ortada dar sütunda. Kartın kendisi ne yaptığını gösterir (Multi Cam'de 2×2 küçük kaynak, kırmızı canlı, yeşil sıradaki).
 */
class StudioGiris : Activity() {
    private fun dp(v: Float) = Tema.dp(this, v)
    private val tercih by lazy { getSharedPreferences("kamera", MODE_PRIVATE) }
    private val kosul by lazy { runCatching { resources.getFont(R.font.plex_kosul_600) }.getOrDefault(Typeface.create("sans-serif-condensed", Typeface.BOLD)) }
    private val IKINCIL = Color.argb(158, 255, 255, 255)
    private val HAT = Color.argb(46, 255, 255, 255)
    private lateinit var sonYazi: TextView

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        HataKaydi.kur(this)
        if (b == null) Handler(Looper.getMainLooper()).postDelayed({ if (!isFinishing) Guncelleme.denetle(this, sessiz = true) }, 3000)
        val tablet = resources.configuration.smallestScreenWidthDp >= 600
        val kok = FrameLayout(this).apply { setBackgroundColor(Color.rgb(9, 9, 11)) }
        kok.addView(Lekeler(), FrameLayout.LayoutParams(-1, -1))
        val sutun = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL }
        sutun.addView(View(this), LinearLayout.LayoutParams(1, 0, 1f))
        sutun.addView(ImageView(this).apply { setImageDrawable(packageManager.getApplicationIcon(applicationInfo)); contentDescription = "UpCam Studio" }, LinearLayout.LayoutParams(dp(if (tablet) 112f else 84f), dp(if (tablet) 112f else 84f)))
        sutun.addView(TextView(this).apply { text = "UPCAM STUDIO"; textSize = if (tablet) 56f else 38f; typeface = kosul; setTextColor(Color.WHITE); gravity = Gravity.CENTER; letterSpacing = 0.02f; setPadding(0, dp(14f), 0, 0) })
        sutun.addView(TextView(this).apply { text = "Çok kameralı çekim, monitör ve kayıt"; textSize = 14f; setTextColor(IKINCIL); gravity = Gravity.CENTER; setPadding(0, dp(4f), 0, 0) })
        sutun.addView(View(this), LinearLayout.LayoutParams(1, 0, 1.15f))
        sutun.addView(kart("Monitör", "Tek kamerayı izle · ölç · kaydet", false) { ac("monitor") }, LinearLayout.LayoutParams(-1, dp(124f)))
        sutun.addView(kart("Multi Cam", "4 kameraya kadar geçiş ve ayrı kayıt", true) { ac("multicam") }, LinearLayout.LayoutParams(-1, dp(124f)).apply { topMargin = dp(12f) })
        sonYazi = TextView(this).apply { textSize = 12f; setTextColor(Color.argb(110, 255, 255, 255)); gravity = Gravity.CENTER; setPadding(0, dp(22f), 0, dp(8f)) }
        sutun.addView(sonYazi)
        kok.addView(sutun, FrameLayout.LayoutParams(if (tablet) dp(520f) else -1, -1, Gravity.CENTER_HORIZONTAL).apply { if (!tablet) { marginStart = dp(18f); marginEnd = dp(18f) } })
        kok.setOnApplyWindowInsetsListener { _, i ->
            val (u, a) = if (android.os.Build.VERSION.SDK_INT >= 30) i.getInsetsIgnoringVisibility(WindowInsets.Type.systemBars()).let { it.top to it.bottom } else 0 to 0
            sutun.setPadding(0, u + dp(24f), 0, a + dp(12f)); i
        }
        setContentView(kok)
    }

    override fun onResume() { super.onResume(); sonGoster() }

    private fun sonGoster() {
        val s = when (tercih.getString("studio.son", null)) { "monitor" -> "Monitör"; "multicam" -> "Multi Cam"; else -> null }
        sonYazi.text = s?.let { android.text.SpannableStringBuilder("Son kullanılan: ").append(it, android.text.style.ForegroundColorSpan(Color.WHITE), 0) } ?: ""
    }

    private fun ac(ne: String) {
        tercih.edit().putString("studio.son", ne).apply()
        if (ne == "monitor") startActivity(Intent(this, MainActivity::class.java).putExtra("mod", "monitor"))
        else startActivity(Intent(this, MasaActivity::class.java))
    }

    /** Kart: ışıklı koyu yüzey, solda ad ve açıklama, sağ altta ›; Multi Cam'de sağda 2×2 kaynak, Monitör'de yumuşak ışık */
    private fun kart(ad: String, alt: String, coklu: Boolean, tik: () -> Unit) = FrameLayout(this).apply {
        background = GradientDrawable(GradientDrawable.Orientation.TL_BR, if (coklu) intArrayOf(Color.rgb(17, 17, 20), Color.rgb(12, 12, 14)) else intArrayOf(Color.rgb(40, 30, 22), Color.rgb(20, 22, 32)))
            .apply { cornerRadius = dp(22f).toFloat(); setStroke(maxOf(1, dp(0.5f)), HAT) }
        clipToOutline = true; contentDescription = ad; isClickable = true; isFocusable = true
        foreground = android.graphics.drawable.RippleDrawable(android.content.res.ColorStateList.valueOf(Color.argb(40, 255, 255, 255)), null, GradientDrawable().apply { cornerRadius = dp(22f).toFloat(); setColor(Color.WHITE) })
        setOnClickListener { tik() }
        if (coklu) addView(LinearLayout(this@StudioGiris).apply { orientation = LinearLayout.VERTICAL
            for (s in 0..1) addView(LinearLayout(this@StudioGiris).apply { orientation = LinearLayout.HORIZONTAL
                for (k in 0..1) { val i = s * 2 + k
                    addView(View(this@StudioGiris).apply { background = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                        intArrayOf(listOf(Color.rgb(62, 44, 32), Color.rgb(28, 38, 66), Color.rgb(36, 34, 34), Color.rgb(70, 58, 52))[i], Color.rgb(18, 18, 20))).apply {
                        cornerRadius = dp(4f).toFloat(); setStroke(dp(if (i < 2) 1.5f else 0.5f), when (i) { 0 -> MasaActivity.KIRMIZI; 1 -> MasaActivity.YESIL; else -> HAT }) } },
                        LinearLayout.LayoutParams(dp(56f), dp(34f)).apply { if (k > 0) marginStart = dp(4f) }) } },
                LinearLayout.LayoutParams(-2, -2).apply { if (s > 0) topMargin = dp(4f) })
        }, FrameLayout.LayoutParams(-2, -2, Gravity.CENTER_VERTICAL or Gravity.END).apply { marginEnd = dp(56f) })
        else addView(View(this@StudioGiris).apply { background = GradientDrawable().apply { gradientType = GradientDrawable.RADIAL_GRADIENT; gradientRadius = dp(90f).toFloat()
            colors = intArrayOf(Color.argb(120, 214, 150, 90), Color.argb(0, 214, 150, 90)) } }, FrameLayout.LayoutParams(dp(180f), dp(180f), Gravity.END or Gravity.CENTER_VERTICAL).apply { marginEnd = dp(-20f) })
        addView(LinearLayout(this@StudioGiris).apply { orientation = LinearLayout.VERTICAL
            addView(TextView(this@StudioGiris).apply { text = ad; textSize = 22f; typeface = Typeface.create("sans-serif-medium", Typeface.BOLD); setTextColor(Color.WHITE) })
            addView(TextView(this@StudioGiris).apply { text = alt; textSize = 13f; setTextColor(IKINCIL); setPadding(0, dp(2f), 0, 0) })
        }, FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM or Gravity.START).apply { leftMargin = dp(18f); bottomMargin = dp(16f) })
        addView(TextView(this@StudioGiris).apply { text = "›"; textSize = 17f; setTextColor(Color.WHITE); gravity = Gravity.CENTER; background = Tema.kapsul(Color.argb(46, 255, 255, 255)) },
            FrameLayout.LayoutParams(dp(28f), dp(28f), Gravity.BOTTOM or Gravity.END).apply { marginEnd = dp(16f); bottomMargin = dp(16f) })
    }

    /** Zemin: sahne ışığı gibi bulanık lekeler (sıcak amber, mavi, bir küçük sarı) ve üstten koyulaşma */
    private inner class Lekeler : View(this@StudioGiris) {
        private val p = Paint(Paint.ANTI_ALIAS_FLAG)
        override fun onDraw(c: Canvas) {
            val w = width.toFloat(); val h = height.toFloat(); val r = minOf(w, h)
            fun leke(x: Float, y: Float, yc: Float, renk: Int, alfa: Int) {
                p.shader = RadialGradient(x, y, yc, Color.argb(alfa, Color.red(renk), Color.green(renk), Color.blue(renk)), Color.argb(0, Color.red(renk), Color.green(renk), Color.blue(renk)), Shader.TileMode.CLAMP)
                c.drawCircle(x, y, yc, p)
            }
            leke(w * 0.22f, h * 0.26f, r * 0.55f, Color.rgb(196, 120, 64), 70)
            leke(w * 0.86f, h * 0.16f, r * 0.45f, Color.rgb(54, 78, 150), 80)
            leke(w * 0.08f, h * 0.52f, r * 0.30f, Color.rgb(170, 90, 60), 46)
            leke(w * 0.66f, h * 0.38f, r * 0.12f, Color.rgb(200, 170, 60), 38)
            p.shader = android.graphics.LinearGradient(0f, h * 0.45f, 0f, h, Color.argb(0, 9, 9, 11), Color.argb(235, 9, 9, 11), Shader.TileMode.CLAMP)
            c.drawRect(0f, 0f, w, h, p)
        }
    }
}
