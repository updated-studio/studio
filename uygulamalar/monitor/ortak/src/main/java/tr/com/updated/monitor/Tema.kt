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

    /** Yazının önüne (ust: üstüne) tek renkli simge; renk verilmezse yazının rengi */
    fun simge(tv: TextView, res: Int, renk: Int = tv.currentTextColor, boy: Float = 18f, ust: Boolean = false): TextView {
        val d = tv.context.getDrawable(res)?.mutate() ?: return tv
        val b = dp(tv.context, boy); d.setBounds(0, 0, b, b); d.setTint(renk)
        if (ust) tv.setCompoundDrawablesRelative(null, d, null, null) else tv.setCompoundDrawablesRelative(d, null, null, null)
        tv.compoundDrawablePadding = dp(tv.context, if (ust) 3f else 7f)
        return tv
    }

    /** Ayar adına uyan simge (ayar satırları ve menüler için; ilk eşleşen anahtar kelime) */
    private val SIMGELER = listOf(
        "FOTOĞRAF ÇÖZ" to R.drawable.ic_foto, "ÇÖZÜNÜRLÜK" to R.drawable.ic_film, "RAW" to R.drawable.ic_dosya, "ZAMANLAYICI" to R.drawable.ic_zaman,
        "DEKLANŞÖR" to R.drawable.ic_hoparlor, "KARE HIZI" to R.drawable.ic_hiz, "KODEK" to R.drawable.ic_kodek, "BİT HIZI" to R.drawable.ic_hiz,
        "SES GÖSTERGESİ" to R.drawable.ic_olcum, "SES KAYDI" to R.drawable.ic_ses, "SABİTLEME" to R.drawable.ic_sabit, "EKRAN DÜZENİ" to R.drawable.ic_duzen,
        "ODAK RENGİ" to R.drawable.ic_renk, "ODAK" to R.drawable.ic_odak, "ZEBRA" to R.drawable.ic_zebra, "FALSE" to R.drawable.ic_renk,
        "SİYAH-BEYAZ" to R.drawable.ic_mono, "TEMİZ" to R.drawable.ic_temiz, "BÜYÜTME" to R.drawable.ic_buyut, "KOMPOZİSYON ÖNERİSİ" to R.drawable.ic_oneri,
        "KILAVUZ ÖNERİSİ" to R.drawable.ic_oneri, "SAHNE ÖNERİSİ" to R.drawable.ic_sahne, "KOMPOZİSYON" to R.drawable.ic_kilavuz, "YÖN" to R.drawable.ic_dondur,
        "AKILLI" to R.drawable.ic_yardimci, "TERAZİ" to R.drawable.ic_terazi, "KADRAJ" to R.drawable.ic_kadraj, "IZGARA" to R.drawable.ic_izgara,
        "MERKEZ" to R.drawable.ic_merkez, "GÜVENLİ" to R.drawable.ic_guvenli, "LUT" to R.drawable.ic_lut, "HİSTOGRAM" to R.drawable.ic_olcum,
        "ANAMORFİK" to R.drawable.ic_genis, "DÖNDÜR" to R.drawable.ic_dondur, "AYNA" to R.drawable.ic_ayna, "TERS" to R.drawable.ic_ayna,
        "PARLAKLI" to R.drawable.ic_parlak, "AÇILIŞTA" to R.drawable.ic_monitor, "GÜNCELLEME" to R.drawable.ic_guncelle, "YARDIM" to R.drawable.ic_yardim,
        "AĞ YAYINI" to R.drawable.ic_ag, "USB" to R.drawable.ic_usb, "MİKROFON" to R.drawable.ic_ses, "MOD" to R.drawable.ic_foto,
        "DALGA" to R.drawable.ic_olcum, "VEKTÖR" to R.drawable.ic_olcum, "PARADE" to R.drawable.ic_olcum, "ARKA KAM" to R.drawable.ic_kamera, "ÖN KAM" to R.drawable.ic_kamera, "KAMERA" to R.drawable.ic_kamera,
    )
    fun simgeAdi(ad: String): Int? { val b = ad.uppercase(java.util.Locale("tr")); return SIMGELER.firstOrNull { b.contains(it.first) }?.second }

    /** Yazılı düğme: açıksa turuncu zemin + siyah yazı */
    fun dugme(c: Context, metin: String, acik: Boolean = false, kucuk: Boolean = false): TextView = TextView(c).apply {
        text = metin; textSize = if (kucuk) 12f else 14f; typeface = Typeface.DEFAULT_BOLD; gravity = Gravity.CENTER
        setTextColor(if (acik) Color.BLACK else METIN)
        background = kapsul(if (acik) VURGU else Color.argb(50, 255, 255, 255), dp(c, 10f).toFloat())
        val y = dp(c, if (kucuk) 6f else 10f); val x = dp(c, if (kucuk) 10f else 14f); setPadding(x, y, x, y)
    }
}
