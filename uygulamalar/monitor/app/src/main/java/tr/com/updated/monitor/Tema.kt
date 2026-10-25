package tr.com.updated.monitor

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.widget.TextView

/** UPDATED Monitör görünümü: koyu cam yüzeyler, turuncu vurgu (UPDATED marka rengi), monospace değerler. */
object Tema {
    val ZEMIN = Color.rgb(12, 13, 16)
    val YUZEY = Color.argb(215, 22, 24, 28)
    val YUZEY2 = Color.argb(255, 34, 37, 43)
    val CIZGI = Color.argb(40, 255, 255, 255)
    val METIN = Color.WHITE
    val METIN2 = Color.argb(170, 255, 255, 255)
    val VURGU = Color.rgb(255, 107, 26)
    val MAVI = Color.rgb(37, 99, 235)
    val MONO: Typeface = Typeface.MONOSPACE
    fun dp(c: Context, v: Float) = (v * c.resources.displayMetrics.density).toInt()

    fun kapsul(renk: Int, kose: Float = 999f, cerceve: Int = 0) = GradientDrawable().apply { cornerRadius = kose; setColor(renk); if (cerceve != 0) setStroke(2, cerceve) }

    /** Yazılı düğme: açıksa turuncu zemin + siyah yazı */
    fun dugme(c: Context, metin: String, acik: Boolean = false, kucuk: Boolean = false): TextView = TextView(c).apply {
        text = metin; textSize = if (kucuk) 12f else 14f; typeface = Typeface.DEFAULT_BOLD; gravity = Gravity.CENTER
        setTextColor(if (acik) Color.BLACK else METIN)
        background = kapsul(if (acik) VURGU else Color.argb(50, 255, 255, 255), dp(c, 10f).toFloat())
        val y = dp(c, if (kucuk) 6f else 10f); val x = dp(c, if (kucuk) 10f else 14f); setPadding(x, y, x, y)
    }
}
