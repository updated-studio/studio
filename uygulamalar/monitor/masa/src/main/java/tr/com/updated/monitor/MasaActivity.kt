package tr.com.updated.monitor

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.Surface
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import java.util.Locale

/**
 * Masa: telefon ya da tablet ATEM gibi çalışır. Kaynaklar: aynı ağdaki UPDATED Kamera'lar (Wi-Fi kamera, kendiliğinden bulunur)
 * ve USB'den takılan görüntü aygıtları (Sony "USB yayını", HDMI→USB çevirici, webcam modundaki aksiyon kamerası).
 * Üstte canlı (program), altta bütün kaynaklar; bir kaynağa dokununca canlıya geçer, canlıdaki Wi-Fi kamerasının ekranı kırmızı yanar.
 * Kayıt (iOS ile aynı kurallar): seçilen klasöre (harici SSD; yoksa telefona) "UPDATED Masa/<tarih>/" altında canlı görüntü
 * "Program.mp4" (en büyük kaynak 4K ise 4K, yoksa 1080p; 60 fps, H.265; ses USB'den gelen makine sesi, yoksa mikrofon) ve her
 * kaynağın ayrı dosyası (Wi-Fi kamera ve Luna yeniden kodlanmadan, USB kaynaklar H.265). SSD çıkarılırsa kayıt telefonda sürer.
 */
class MasaActivity : Activity() {
    companion object {
        val KIRMIZI = Color.rgb(229, 57, 53); val YESIL = Color.rgb(52, 199, 89); val TURUNCU = Color.rgb(255, 107, 26); val GRI = Color.rgb(169, 175, 184) }

    private val dongu = Handler(Looper.getMainLooper())
    private fun dp(v: Float) = Tema.dp(this, v)
    private fun tost(m: String) = Toast.makeText(this, m, Toast.LENGTH_LONG).show()
    private val kosul by lazy { runCatching { resources.getFont(R.font.plex_kosul_600) }.getOrDefault(Typeface.create("sans-serif-condensed", Typeface.BOLD)) }
    private val mono by lazy { runCatching { resources.getFont(R.font.plex_mono_500) }.getOrDefault(Typeface.MONOSPACE) }

    private lateinit var kok: FrameLayout
    private lateinit var masa: MasaGorunum
    private lateinit var katman: FrameLayout
    private lateinit var kayitDugme: KayitDugmesi
    private lateinit var sure: TextView
    private val kaynaklar = arrayOfNulls<Kaynak>(MasaGorunum.EN_COK)
    private val adlar = arrayOfNulls<String>(MasaGorunum.EN_COK)
    private var yuzeyler: List<Surface>? = null
    private var bulucu: KameraBulucu? = null
    /** RTMP alıcısı: kameralar kendi uygulamalarından canlı yayınla bağlanır (Rtmp.kt); ekran açık oldukça dinler */
    private var rtmp: RtmpSunucu? = null
    /** Bulunan ama eklenmemiş Wi-Fi kameraları: ad → (adres, kapı) */
    private val bulunan = LinkedHashMap<String, Pair<String, Int>>()
    private var kaydedici: Kaydedici? = null; private var kayitBas = 0L
    private var oturum: KayitOturumu? = null; private var programDosya: KayitOturumu.Dosya? = null
    /** Kaynakların ayrı kayıtları: yuva → bitir (dosya sağlamsa true) ve yazma hatası denetimi */
    private val isolar = HashMap<Int, Pair<() -> Boolean, () -> Boolean>>()
    private lateinit var yerYazi: TextView
    private lateinit var duzenYazi: TextView
    private var ustPay = 0; private var altPay = 0
    private var cokluYayin: android.net.wifi.WifiManager.MulticastLock? = null
    /** Tablet: yönetmen masası düzeni (iPad'deki gibi). Kaynağa dokun → önizleme, KES → canlı, çift dokun → hemen canlı */
    private val tablet by lazy { resources.configuration.smallestScreenWidthDp >= 600 }
    private val tercih by lazy { getSharedPreferences("kamera", MODE_PRIVATE) }
    private var hizli = false
    private lateinit var denetim: LinearLayout
    private lateinit var hizliYazi: TextView
    private val sonDokunus = LongArray(MasaGorunum.EN_COK)
    private lateinit var gecisYazi: TextView

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        HataKaydi.kur(this)
        rtmp = RtmpSunucu(yeni = { y -> runOnUiThread { rtmpEkle(y) } }, bitti = { y -> runOnUiThread {
            kaynaklar.indexOfFirst { it is RtmpKaynak && it.yayin === y }.takeIf { it >= 0 }?.let { i -> tost("${adlar[i]}: yayın bitti"); kaldir(i) } } }).also { it.baslat() }
        kok = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        masa = MasaGorunum(this)
        masa.yuzeylerHazir = { l -> yuzeyler = l; for (i in kaynaklar.indices) kaynaklar[i]?.let { baslat(i, it) } }
        kok.addView(masa, FrameLayout.LayoutParams(-1, -1))
        katman = FrameLayout(this)
        kok.addView(katman, FrameLayout.LayoutParams(-1, -1))
        // Üst: geri · MASA · süre · kaynak ekle; sağ altta kayıt
        val ust = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(dp(12f), 0, dp(12f), 0) }
        // Kamera uygulamasında Kamera'ya döner; ayrı Masa uygulamasında Monitör'ü açar (Monitör'den geri Masa'ya gelinir)
        if (Ekranlar.masaUygulamasi(this)) ust.addView(etiket("Monitör  ›", 15f).apply { setOnClickListener { startActivity(Intent(this@MasaActivity, MainActivity::class.java).putExtra("mod", "monitor")) }; contentDescription = "Monitörü aç" }, LinearLayout.LayoutParams(-2, dp(44f)))
        else ust.addView(etiket("‹  Kamera", 15f).apply { setOnClickListener { finish() }; contentDescription = "Kameraya dön" }, LinearLayout.LayoutParams(-2, dp(44f)))
        ust.addView(etiket("MULTI CAM", 16f, TURUNCU).apply { setPadding(dp(16f), 0, 0, 0) }, LinearLayout.LayoutParams(-2, dp(44f)))
        ust.addView(View(this), LinearLayout.LayoutParams(0, 1, 1f))
        hizli = tercih.getBoolean("masa.hizli", false)
        hizliYazi = etiket("", 14f).apply { setPadding(dp(12f), 0, dp(12f), 0); contentDescription = "Hızlı geçiş"; setOnClickListener { hizli = !hizli; tercih.edit().putBoolean("masa.hizli", hizli).apply(); duzen() } }
        if (tablet) ust.addView(hizliYazi, LinearLayout.LayoutParams(-2, dp(40f)).apply { marginEnd = dp(10f) })
        sure = etiket("", 15f).apply { typeface = mono; setPadding(dp(10f), 0, dp(10f), 0); background = Tema.kapsul(KIRMIZI, dp(12f).toFloat()); visibility = View.GONE }
        ust.addView(sure, LinearLayout.LayoutParams(-2, dp(30f)).apply { marginEnd = dp(10f) })
        masa.duzen = tercih.getInt("masa.duzen", 1).coerceIn(0, 5)
        masa.gecisTuru = tercih.getInt("masa.gecis", 1).coerceIn(0, 3); masa.gecisSure = tercih.getInt("masa.gecisSure", 600)
        katmanlariYukle()
        gecisYazi = etiket("", 13f).apply { background = Tema.kapsul(Color.argb(40, 255, 255, 255), dp(14f).toFloat()); setPadding(dp(12f), 0, dp(12f), 0)
            contentDescription = "Geçiş ve katmanlar"; setOnClickListener { gecisMenu() } }
        ust.addView(gecisYazi, LinearLayout.LayoutParams(-2, dp(34f)).apply { marginEnd = dp(8f) })
        gecisGoster()
        duzenYazi = etiket("", 13f).apply { background = Tema.kapsul(Color.argb(40, 255, 255, 255), dp(14f).toFloat()); setPadding(dp(12f), 0, dp(12f), 0)
            contentDescription = "Program düzeni"; setOnClickListener { duzenMenu() } }
        ust.addView(duzenYazi, LinearLayout.LayoutParams(-2, dp(34f)).apply { marginEnd = dp(8f) })
        duzenYazi.text = (if (tablet) "Düzen: " else "") + duzenAdi(masa.duzen)
        yerYazi = etiket("", 13f).apply { background = Tema.kapsul(Color.argb(40, 255, 255, 255), dp(14f).toFloat()); setPadding(dp(12f), 0, dp(12f), 0)
            contentDescription = "Kayıt yeri"; setOnClickListener { yerMenu() } }
        ust.addView(yerYazi, LinearLayout.LayoutParams(-2, dp(34f)).apply { marginEnd = dp(10f) })
        yerGoster()
        ust.addView(etiket(if (tablet) "+  Kaynak" else "+", if (tablet) 15f else 20f).apply { background = Tema.kapsul(Color.argb(60, 255, 255, 255), dp(14f).toFloat()); setPadding(dp(14f), 0, dp(14f), 0); contentDescription = "Kaynak ekle"; setOnClickListener { kaynakMenu() } },
            LinearLayout.LayoutParams(-2, dp(40f)))
        kok.addView(ust, FrameLayout.LayoutParams(-1, dp(52f), Gravity.TOP))
        kayitDugme = KayitDugmesi(this).apply { contentDescription = "Kayıt"; setOnClickListener { kayitDugmesi() } }
        kok.addView(kayitDugme, FrameLayout.LayoutParams(dp(72f), dp(72f), Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL).apply { bottomMargin = dp(16f) })
        // Tablet: altta denetim şeridi (kaynak düğmeleri 1–4, KES, KAYIT); telefondaki tek kayıt düğmesi gizli
        denetim = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(dp(12f), dp(12f), dp(12f), dp(12f))
            background = GradientDrawable().apply { setColor(Color.rgb(18, 18, 18)); cornerRadius = dp(20f).toFloat() }; visibility = if (tablet) View.VISIBLE else View.GONE }
        kok.addView(denetim, FrameLayout.LayoutParams(-1, dp(84f), Gravity.BOTTOM).apply { marginStart = dp(20f); marginEnd = dp(20f); bottomMargin = dp(12f) })
        if (tablet) { masa.tablet = true; kayitDugme.visibility = View.GONE }
        else { ust.visibility = View.GONE; kayitDugme.visibility = View.GONE; ninjaKur() }
        kok.setOnApplyWindowInsetsListener { _, i ->
            val (u, a) = if (android.os.Build.VERSION.SDK_INT >= 30) i.getInsetsIgnoringVisibility(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout()).let { it.top to it.bottom } else 0 to 0
            ustPay = maxOf(u, dp(8f)); altPay = maxOf(a, dp(8f))
            (ust.layoutParams as FrameLayout.LayoutParams).topMargin = ustPay; (kayitDugme.layoutParams as FrameLayout.LayoutParams).bottomMargin = altPay + dp(8f)
            (denetim.layoutParams as FrameLayout.LayoutParams).bottomMargin = altPay + dp(4f)
            if (!tablet) { solPay = if (android.os.Build.VERSION.SDK_INT >= 30) i.getInsetsIgnoringVisibility(WindowInsets.Type.displayCutout()).let { maxOf(it.left, it.right) } else 0 }
            kok.requestLayout(); duzen(); i
        }
        // Yuva yazıları boyut değişince yeniden kurulur (yerleşim bittikten sonra)
        kok.addOnLayoutChangeListener { _, l, t, r, b, ol, ot, or_, ob -> if (r - l != or_ - ol || b - t != ob - ot) kok.post { duzen() } }
        setContentView(kok)
        tamEkran()
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 3)
        // Takılı USB görüntü aygıtları kendiliğinden eklenir
        UvcKaynak.aygitlar(this).forEach { usbEkle(it) }
        registerReceiver(usbDinle, android.content.IntentFilter().apply { addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED); addAction(UsbManager.ACTION_USB_DEVICE_DETACHED) })
        dongu.post(object : Runnable { override fun run() { tik(); dongu.postDelayed(this, 500) } })
    }

    private fun etiket(m: String, boy: Float, renk: Int = Color.WHITE) = TextView(this).apply { text = m; textSize = boy; typeface = kosul; setTextColor(renk); gravity = Gravity.CENTER; isSingleLine = true
        setShadowLayer(dp(3f).toFloat(), 0f, dp(1f).toFloat(), Color.BLACK) }

    private fun tamEkran() {
        window.attributes = window.attributes.apply { layoutInDisplayCutoutMode = android.view.WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES }
        if (android.os.Build.VERSION.SDK_INT >= 30) window.insetsController?.let { it.hide(WindowInsets.Type.systemBars()); it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE }
    }

    /** Yuva çerçeveleri ve adları: GL'deki alanlarla aynı yerde. Canlı kırmızı, boş yuva "Kaynak ekle" */
    private fun duzen() {
        val w = kok.width.toFloat(); val h = kok.height.toFloat(); if (w <= 0f) return
        if (tablet) return tabletDuzen(w, h)
        return ninjaDuzen(w, h)
    }

    /* ================= telefon: "Ninja" düzeni (Fatih 30 Ekim seçimi; tasarim/upcam-studio/2-multicam-duzenler.png, 2) =================
     * Üstte tam genişlik koyu şerit: değer hücreleri (dokun: o ayar). Ortada program. Altta kaynak küçük resimleri (dokun: sıradaki,
     * sıradakine yeniden dokun: AUTO, basılı tut: menü) ve "+"; sağda CUT · AUTO · KATMAN · MENÜ ve REC. Dikeyde hücreler iki satır,
     * kaynaklar 2×2. Tablet ATEM düzeni ayrı (tabletDuzen). */
    private var solPay = 0; private var kurulanPay = -1
    private lateinit var ninjaUst: LinearLayout
    private lateinit var ninjaAlt: FrameLayout
    private val hucre = HashMap<String, Pair<LinearLayout, TextView>>()
    private var programYazi = "1080 60"
    private val SERIT = Color.argb(235, 10, 10, 12)
    private val HAT = Color.argb(46, 255, 255, 255)
    private val SARI = Color.rgb(255, 214, 10)

    private fun ninjaKur() {
        ninjaUst = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(SERIT) }
        kok.addView(ninjaUst, FrameLayout.LayoutParams(-1, -2, Gravity.TOP))
        // Alt şerit saydam: kaynak küçük resimleri arkadaki GL yüzeyinde çizilir (zemin zaten siyah); yalnız üstte ince hat
        ninjaAlt = FrameLayout(this).apply { background = android.graphics.drawable.LayerDrawable(arrayOf(android.graphics.drawable.ColorDrawable(HAT))).apply { setLayerHeight(0, maxOf(1, dp(0.5f))) } }
        kok.addView(ninjaAlt, FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM))
    }

    /** Üst şeridi kurar (satır sayısı yöne göre); hücre değerleri hucreleriYaz'da */
    private fun hucreleriKur(ikiSatir: Boolean) {
        ninjaUst.removeAllViews(); hucre.clear()
        val l = listOf<Triple<String, String, () -> Unit>>(
            Triple("KAYIT", "KAYIT", { kayitDugmesi(); duzen() }), Triple("CANLI", "CANLI", { if (masa.dolu[masa.canli]) yuvaMenu(masa.canli) }),
            Triple("GECIS", "GEÇİŞ", { gecisMenu() }), Triple("DUZEN", "DÜZEN", { duzenMenu() }),
            Triple("PROGRAM", "PROGRAM", { tost("Program kaydı $programYazi (çoklu düzende 4K tuval).") }), Triple("YER", "SSD", { yerMenu() }), Triple("SES", "SES", {}))
        val satirlar = if (ikiSatir) listOf(l.take(4), l.drop(4)) else listOf(l)
        satirlar.forEachIndexed { si, s ->
            if (si > 0) ninjaUst.addView(View(this).apply { setBackgroundColor(HAT) }, LinearLayout.LayoutParams(-1, maxOf(1, dp(0.5f))))
            val satir = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setPadding(solPay, 0, solPay, 0) }
            s.forEachIndexed { i, (anahtar, ad, tik) ->
                if (i > 0) satir.addView(View(this).apply { setBackgroundColor(HAT) }, LinearLayout.LayoutParams(maxOf(1, dp(0.5f)), -1).apply { topMargin = dp(9f); bottomMargin = dp(9f) })
                val deger = etiket("", 14f).apply { gravity = Gravity.START or Gravity.CENTER_VERTICAL; setShadowLayer(0f, 0f, 0f, 0); typeface = kosul; fontFeatureSettings = "tnum"; isSingleLine = true; ellipsize = android.text.TextUtils.TruncateAt.END }
                val k = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_VERTICAL; setPadding(dp(12f), 0, dp(8f), 0); contentDescription = ad
                    addView(etiket(ad, 8.5f, Color.argb(107, 255, 255, 255)).apply { gravity = Gravity.START; letterSpacing = 0.14f; setShadowLayer(0f, 0f, 0f, 0) })
                    if (anahtar == "SES") addView(SesCubuklari(), LinearLayout.LayoutParams(dp(22f), dp(16f)).apply { topMargin = dp(2f) }) else addView(deger)
                    setOnClickListener { tik() } }
                satir.addView(k, LinearLayout.LayoutParams(0, -1, if (anahtar == "SES") 0.6f else 1f))
                hucre[anahtar] = k to deger
            }
            ninjaUst.addView(satir, LinearLayout.LayoutParams(-1, dp(46f)))
        }
        hucreleriYaz()
    }

    private fun kisaAd(i: Int) = adlar[i]?.substringAfter(": ")?.substringAfter("· ") ?: "—"

    private fun hucreleriYaz() {
        if (tablet || hucre.isEmpty()) return
        hucre["KAYIT"]?.let { (k, d) ->
            val ms = System.currentTimeMillis() - kayitBas
            d.text = if (kaydedici != null) "● %02d:%02d:%02d".format(ms / 3600000, ms / 60000 % 60, ms / 1000 % 60) else "HAZIR"
            d.setTextColor(if (kaydedici != null) KIRMIZI else Color.argb(158, 255, 255, 255))
            k.setBackgroundColor(if (kaydedici != null) Color.argb(36, 229, 57, 53) else Color.TRANSPARENT)
        }
        hucre["CANLI"]?.second?.text = if (masa.dolu[masa.canli]) (if (masa.etkinDuzen > 1) duzenAdi(masa.etkinDuzen).uppercase(Locale("tr")) else kisaAd(masa.canli)) else "—"
        hucre["GECIS"]?.second?.let { d -> d.text = GECISLER[masa.gecisTuru] + (if (masa.gecisTuru != 0) " %.1f".format(Locale("tr"), masa.gecisSure / 1000f) else "") + (if (masa.karart) " · FTB" else "")
            d.setTextColor(if (masa.karart) KIRMIZI else SARI) }
        hucre["DUZEN"]?.second?.text = duzenAdi(masa.duzen).uppercase(Locale("tr"))
        hucre["PROGRAM"]?.second?.text = if (kaydedici != null) "${if (masa.kayitH >= 2160) "4K" else "${masa.kayitH}"}" else programYazi
        val k = klasor()
        hucre["YER"]?.let { (kutu, d) -> (kutu.getChildAt(0) as TextView).text = if (k != null) "SSD" else "TELEFON"; d.text = bosAlan(k)?.let { "%.0f GB".format(it / 1e9) } ?: "—" }
    }

    /** SES hücresi: program kaydının ses düzeyi, iki kısa çubuk (kayıt yokken soluk) */
    private inner class SesCubuklari : View(this@MasaActivity) {
        private val p = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG)
        override fun onDraw(c: android.graphics.Canvas) {
            val d = (kaydedici?.sesDuzeyi ?: 0) / 32767f
            val db = if (d <= 0f) -60f else (20 * kotlin.math.log10(d)).coerceAtLeast(-60f)
            val o = ((db + 60f) / 60f).coerceIn(0f, 1f); val gw = width / 5f
            for (i in 0..1) {
                val x = i * gw * 2.2f
                p.color = Color.argb(40, 255, 255, 255); c.drawRoundRect(x, 0f, x + gw, height.toFloat(), gw / 2, gw / 2, p)
                if (kaydedici != null) { p.color = if (o > 0.92f) KIRMIZI else if (o > 0.75f) SARI else YESIL; c.drawRoundRect(x, height * (1 - o), x + gw, height.toFloat(), gw / 2, gw / 2, p) }
            }
            if (isAttachedToWindow) postInvalidateDelayed(if (kaydedici != null) 80 else 500)
        }
    }

    private fun aracKutusu(ad: String, vurgu: Boolean = false, dolu: Boolean = false, tik: () -> Unit) = etiket(ad, 10f, if (dolu) SIYAH_YAZI else if (vurgu) SARI else Color.WHITE).apply {
        typeface = Typeface.DEFAULT_BOLD; letterSpacing = 0.1f; setShadowLayer(0f, 0f, 0f, 0); contentDescription = ad
        background = GradientDrawable().apply { cornerRadius = dp(10f).toFloat(); setColor(if (dolu) Color.WHITE else Color.argb(16, 255, 255, 255)); setStroke(maxOf(1, dp(if (vurgu) 1f else 0.5f)), if (vurgu) Color.argb(160, 255, 214, 10) else HAT) }
        setOnClickListener { tik() }
    }

    private fun ninjaMenu() {
        val l = ArrayList<Pair<String, () -> Unit>>()
        l.add("Kaynak ekle" to { kaynakMenu() })
        l.add("Kamera bağla (DJI, Insta360, GoPro)" to { kameraBagla() })
        l.add("Kayıt yeri" to { yerMenu() })
        if (Ekranlar.masaUygulamasi(this)) {
            l.add("Monitör" to { startActivity(Intent(this, MainActivity::class.java).putExtra("mod", "monitor")) })
            l.add("Güncellemeleri denetle" to { Guncelleme.denetle(this, sessiz = false) })
        } else l.add("Kameraya dön" to { finish() })
        AlertDialog.Builder(this).setTitle("Multi Cam").setItems(l.map { it.first }.toTypedArray()) { _, i -> l[i].second() }.setNegativeButton("Kapat", null).show()
    }

    /** Telefon kaynağına dokunuş: sıradakine al; zaten sıradakiyse AUTO */
    private fun ninjaDokun(i: Int) {
        if (!masa.dolu[i] || i == masa.canli) return
        if (i == masa.siradaki) oto() else { masa.siradaki = i; duzen() }
    }

    private fun ninjaDuzen(w: Float, h: Float) {
        val yatay = w > h
        val satirSayisi = if (yatay) 1 else 2
        if (ninjaUst.childCount != satirSayisi * 2 - 1 || kurulanPay != solPay) { kurulanPay = solPay; hucreleriKur(!yatay) }
        programYazi = runCatching { programBoyutu().let { (_, ph, f) -> "${if (ph >= 2160) "4K" else "$ph"} $f" } }.getOrDefault(programYazi)
        (ninjaUst.layoutParams as FrameLayout.LayoutParams).topMargin = if (yatay) 0 else ustPay
        ninjaUst.setPadding(0, if (yatay) maxOf(0, ustPay - dp(8f)) else 0, 0, 0)
        val ustH = (if (yatay) maxOf(0, ustPay - dp(8f)) else ustPay) + dp(46f) * satirSayisi + (satirSayisi - 1)
        katman.removeAllViews(); ninjaAlt.removeAllViews()
        if (masa.siradaki >= 0 && (!masa.dolu[masa.siradaki] || masa.siradaki == masa.canli)) masa.siradaki = -1
        val ara = dp(8f).toFloat(); val kenar = dp(12f).toFloat() + solPay
        val kh: Float; val kw: Float; val prog: android.graphics.RectF
        val kucuk = MutableList(MasaGorunum.EN_COK) { android.graphics.RectF() }
        val dolular = (0 until MasaGorunum.EN_COK).filter { masa.dolu[it] }
        // Araçlar: CUT · AUTO · KATMAN · MENÜ, REC
        val aracW = dp(56f).toFloat(); val aracH = dp(58f).toFloat(); val recW = dp(58f).toFloat()
        val katmanVar = masa.karart || masa.logoAcik || masa.altYaziAcik
        val araclar = listOf(Triple("CUT", false, { kes() }), Triple("AUTO", false, { oto() }), Triple("KATMAN", katmanVar, { gecisMenu() }), Triple("MENÜ", false, { ninjaMenu() }))
        if (yatay) {
            val altH = dp(74f) + altPay - dp(8f)
            (ninjaAlt.layoutParams as FrameLayout.LayoutParams).height = altH
            prog = android.graphics.RectF(solPay.toFloat(), ustH.toFloat(), w - solPay, h - altH)
            val sagW = 4 * aracW + 3 * dp(6f) + ara + recW + kenar
            val solW = w - sagW - kenar - ara * 2
            val artiW = if (dolular.size < MasaGorunum.EN_COK) dp(58f).toFloat() + ara else 0f
            kw = minOf(dp(96f).toFloat(), (solW - artiW - ara * 3) / 4); kh = minOf(aracH, kw * 9 / 16 + dp(4f))
            val y0 = dp(8f).toFloat()
            dolular.forEachIndexed { j, i -> val x = kenar + j * (kw + ara); kucuk[i] = android.graphics.RectF(x, h - altH + y0, x + kw, h - altH + y0 + kh) }
            if (artiW > 0) ninjaAlt.addView(etiket("+", 22f, Color.WHITE).apply { setShadowLayer(0f, 0f, 0f, 0); contentDescription = "Kaynak ekle"
                background = cerceve(HAT, 0.5f, 10f, Color.argb(16, 255, 255, 255), kesik = true); setOnClickListener { kaynakMenu() } },
                FrameLayout.LayoutParams(dp(58f), kh.toInt()).apply { leftMargin = (kenar + dolular.size * (kw + ara)).toInt(); topMargin = y0.toInt() })
            var x = w - kenar - recW - ara - 4 * aracW - 3 * dp(6f)
            araclar.forEach { (ad, vurgu, tik) -> ninjaAlt.addView(aracKutusu(ad, vurgu) { tik() }, FrameLayout.LayoutParams(aracW.toInt(), aracH.toInt()).apply { leftMargin = x.toInt(); topMargin = y0.toInt() }); x += aracW + dp(6f) }
            ninjaAlt.addView(KayitDugmesi(this).apply { kayitta = kaydedici != null; contentDescription = "Kayıt"; setOnClickListener { kayitDugmesi(); duzen() } },
                FrameLayout.LayoutParams(recW.toInt(), recW.toInt()).apply { leftMargin = (w - kenar - recW).toInt(); topMargin = y0.toInt() })
        } else {
            // Dikey: program üstte (16:9), altında 2×2 kaynaklar, en altta araçlar + REC
            val altH = dp(82f) + altPay
            (ninjaAlt.layoutParams as FrameLayout.LayoutParams).height = altH
            val pw = w; val ph = pw * 9 / 16
            prog = android.graphics.RectF(0f, ustH.toFloat(), pw, ustH + ph)
            kw = (w - 2 * kenar - ara) / 2; kh = minOf(kw * 9 / 16, (h - altH - prog.bottom - 3 * ara) / 2)
            for (i in 0 until MasaGorunum.EN_COK) { val x = kenar + (i % 2) * (kw + ara); val y = prog.bottom + ara * 1.5f + (i / 2) * (kh + ara); kucuk[i] = android.graphics.RectF(x, y, x + kw, y + kh) }
            val y0 = dp(12f).toFloat(); var x = kenar
            val aw = (w - 2 * kenar - recW - 4 * dp(6f)) / 4
            araclar.forEach { (ad, vurgu, tik) -> ninjaAlt.addView(aracKutusu(ad, vurgu) { tik() }, FrameLayout.LayoutParams(aw.toInt(), aracH.toInt()).apply { leftMargin = x.toInt(); topMargin = y0.toInt() }); x += aw + dp(6f) }
            ninjaAlt.addView(KayitDugmesi(this).apply { kayitta = kaydedici != null; contentDescription = "Kayıt"; setOnClickListener { kayitDugmesi(); duzen() } },
                FrameLayout.LayoutParams(recW.toInt(), recW.toInt()).apply { leftMargin = (w - kenar - recW).toInt(); topMargin = y0.toInt() })
        }
        masa.ozelAlan = prog to kucuk; masa.requestRender()
        // Kaynak çerçeveleri, numara, tally (kırmızı canlı, yeşil sıradaki); boş yuva (dikeyde) "+"
        kucuk.forEachIndexed { i, r ->
            if (r.width() <= 0f) return@forEachIndexed
            val dolu = masa.dolu[i]; val canlimi = dolu && i == masa.canli; val sirada = dolu && i == masa.siradaki
            val v = FrameLayout(this).apply {
                background = if (dolu) cerceve(if (canlimi) KIRMIZI else if (sirada) YESIL else HAT, if (canlimi || sirada) 2f else 0.5f, 8f) else cerceve(HAT, 0.5f, 8f, Color.argb(16, 255, 255, 255), kesik = true)
                contentDescription = if (dolu) "${i + 1}: ${adlar[i]}" else "Kaynak ekle"
                setOnClickListener { if (dolu) ninjaDokun(i) else kaynakMenu() }
                setOnLongClickListener { if (dolu) yuvaMenu(i); true }
                if (dolu) {
                    addView(etiket("${i + 1}", 10f, if (canlimi || sirada) SIYAH_YAZI else Color.WHITE).apply { typeface = Typeface.DEFAULT_BOLD; setShadowLayer(0f, 0f, 0f, 0)
                        background = Tema.kapsul(if (canlimi) KIRMIZI else if (sirada) YESIL else Color.argb(150, 0, 0, 0), dp(4f).toFloat()) },
                        FrameLayout.LayoutParams(dp(16f), dp(16f), Gravity.BOTTOM or Gravity.START).apply { leftMargin = dp(5f); bottomMargin = dp(5f) })
                    if (!yatay) addView(etiket(kisaAd(i), 11f).apply { setShadowLayer(dp(2f).toFloat(), 0f, 0f, Color.BLACK) },
                        FrameLayout.LayoutParams(-2, dp(16f), Gravity.BOTTOM or Gravity.START).apply { leftMargin = dp(26f); bottomMargin = dp(5f) })
                    if (i in isolar) addView(View(this@MasaActivity).apply { background = Tema.kapsul(KIRMIZI) }, FrameLayout.LayoutParams(dp(6f), dp(6f), Gravity.TOP or Gravity.END).apply { topMargin = dp(5f); marginEnd = dp(5f) })
                } else addView(etiket("+  Kaynak ${i + 1}", 12f, GRI).apply { setShadowLayer(0f, 0f, 0f, 0) }, FrameLayout.LayoutParams(-1, -1))
            }
            katman.addView(v, FrameLayout.LayoutParams(r.width().toInt(), r.height().toInt()).apply { leftMargin = r.left.toInt(); topMargin = r.top.toInt() })
        }
        if (!masa.dolu[masa.canli]) katman.addView(etiket("Kaynak yok · aşağıdan \"+\" ile ekle", 14f, GRI).apply { setShadowLayer(0f, 0f, 0f, 0) },
            FrameLayout.LayoutParams(prog.width().toInt(), prog.height().toInt()).apply { leftMargin = prog.left.toInt(); topMargin = prog.top.toInt() })
        hucreleriYaz()
    }

    private val SIYAH_YAZI = Color.BLACK
    private fun cerceve(renk: Int, kalin: Float, kose: Float = 12f, dolgu: Int = Color.TRANSPARENT, kesik: Boolean = false) = GradientDrawable().apply {
        cornerRadius = dp(kose).toFloat(); setColor(dolgu); if (kesik) setStroke(dp(kalin), renk, dp(6f).toFloat(), dp(5f).toFloat()) else setStroke(dp(kalin), renk) }

    /** Tablet: ÖNİZLEME (yeşil) ve PROGRAM (kırmızı) monitörleri, numaralı kaynak hücreleri, denetim şeridi */
    private fun tabletDuzen(w: Float, h: Float) {
        val u = ustPay + dp(52f).toFloat(); val a = altPay + dp(108f).toFloat()
        masa.ustPay = u; masa.altPay = a
        if (masa.siradaki >= 0 && !masa.dolu[masa.siradaki]) masa.siradaki = -1
        val (oniz, prog, kucukler) = masa.tabletAlanlar(w, h, u, a)
        katman.removeAllViews()
        fun monitor(r: android.graphics.RectF, baslik: String, renk: Int, i: Int, bos: String) {
            val var_ = i >= 0 && masa.dolu[i]
            katman.addView(LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
                addView(etiket(baslik, 12f, renk).apply { letterSpacing = 0.12f; typeface = Typeface.DEFAULT_BOLD; setShadowLayer(0f, 0f, 0f, 0) })
                if (var_) addView(etiket(adlar[i] ?: "", 12f, GRI).apply { setPadding(dp(8f), 0, 0, 0); setShadowLayer(0f, 0f, 0f, 0) }) },
                FrameLayout.LayoutParams(-2, dp(20f)).apply { leftMargin = r.left.toInt(); topMargin = (r.top - dp(22f)).toInt() })
            katman.addView(FrameLayout(this).apply { background = cerceve(if (var_) renk else Color.argb(40, 255, 255, 255), if (var_) 3f else 1f)
                if (!var_) addView(etiket(bos, 14f, GRI).apply { setShadowLayer(0f, 0f, 0f, 0); isSingleLine = false; setPadding(dp(20f), 0, dp(20f), 0) }, FrameLayout.LayoutParams(-1, -1)) },
                FrameLayout.LayoutParams(r.width().toInt(), r.height().toInt()).apply { leftMargin = r.left.toInt(); topMargin = r.top.toInt() })
        }
        monitor(oniz, "ÖNİZLEME", YESIL, masa.siradaki, if (hizli) "Hızlı geçiş açık: kaynağa dokununca doğrudan canlıya geçer" else "Bir kaynağa dokun, burada hazırlanır")
        monitor(prog, if (masa.etkinDuzen > 1) "PROGRAM · ${duzenAdi(masa.etkinDuzen).uppercase(Locale("tr"))}" else "PROGRAM", KIRMIZI, if (masa.dolu[masa.canli]) masa.canli else -1, "Canlıda kaynak yok")
        kucukler.forEachIndexed { i, r ->
            val dolu = masa.dolu[i]; val canlimi = dolu && i == masa.canli; val sirada = dolu && i == masa.siradaki
            val k = FrameLayout(this).apply {
                background = if (dolu) cerceve(if (canlimi) KIRMIZI else if (sirada) YESIL else Color.argb(40, 255, 255, 255), if (canlimi || sirada) 3f else 1f, 10f)
                    else cerceve(Color.argb(40, 255, 255, 255), 1f, 10f, kesik = true)
                contentDescription = if (dolu) "${i + 1}: ${adlar[i]}" else "Kaynak ekle"
                setOnClickListener { if (dolu) dokun(i) else kaynakMenu() }
                setOnLongClickListener { if (dolu) yuvaMenu(i); true }
            }
            if (dolu) k.addView(LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(dp(4f), dp(3f), dp(10f), dp(3f))
                background = Tema.kapsul(Color.argb(150, 0, 0, 0))
                addView(etiket("${i + 1}", 12f, if (canlimi || sirada) SIYAH_YAZI else Color.WHITE).apply { typeface = Typeface.DEFAULT_BOLD; setShadowLayer(0f, 0f, 0f, 0)
                    background = Tema.kapsul(if (canlimi) KIRMIZI else if (sirada) YESIL else Color.argb(64, 255, 255, 255), dp(5f).toFloat()) }, LinearLayout.LayoutParams(dp(20f), dp(20f)))
                addView(etiket(adlar[i] ?: "", 12f).apply { setPadding(dp(6f), 0, 0, 0); setShadowLayer(0f, 0f, 0f, 0) })
            }, FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM or Gravity.START).apply { leftMargin = dp(8f); bottomMargin = dp(8f) })
            else k.addView(etiket("+\nKaynak ${i + 1}", 13f, GRI).apply { isSingleLine = false; setShadowLayer(0f, 0f, 0f, 0) }, FrameLayout.LayoutParams(-1, -1))
            if (dolu && i in isolar) k.addView(kayitRozeti(), FrameLayout.LayoutParams(-2, dp(20f), Gravity.TOP or Gravity.END).apply { topMargin = dp(6f); marginEnd = dp(6f) })
            katman.addView(k, FrameLayout.LayoutParams(r.width().toInt(), r.height().toInt()).apply { leftMargin = r.left.toInt(); topMargin = r.top.toInt() })
        }
        hizliYazi.text = if (hizli) "●  Hızlı geçiş" else "○  Hızlı geçiş"; hizliYazi.setTextColor(if (hizli) YESIL else Color.WHITE)
        hizliYazi.background = Tema.kapsul(Color.argb(if (hizli) 50 else 30, 255, 255, 255), dp(14f).toFloat())
        denetimCiz()
    }

    private fun denetimCiz() {
        denetim.removeAllViews()
        for (i in 0 until MasaGorunum.EN_COK) {
            val dolu = masa.dolu[i]; val canlimi = dolu && i == masa.canli; val sirada = dolu && i == masa.siradaki
            denetim.addView(LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
                background = Tema.kapsul(if (canlimi) KIRMIZI else if (sirada) YESIL else Color.rgb(28, 28, 30), dp(12f).toFloat()); alpha = if (dolu) 1f else 0.4f
                contentDescription = "Kaynak ${i + 1}"; if (dolu) setOnClickListener { sec(i) }
                addView(etiket("${i + 1}", 22f, if (canlimi || sirada) SIYAH_YAZI else Color.WHITE).apply { typeface = Typeface.DEFAULT_BOLD; setShadowLayer(0f, 0f, 0f, 0) })
                addView(etiket(adlar[i]?.substringAfter(": ")?.substringAfter("· ") ?: "—", 10f, if (canlimi || sirada) SIYAH_YAZI else GRI).apply { setShadowLayer(0f, 0f, 0f, 0); setPadding(dp(4f), 0, dp(4f), 0) })
            }, LinearLayout.LayoutParams(dp(84f), -1).apply { marginEnd = dp(12f) })
        }
        denetim.addView(View(this), LinearLayout.LayoutParams(0, 1, 1f))
        val kesVar = masa.siradaki >= 0 && masa.dolu[masa.siradaki]
        denetim.addView(etiket("KES", 20f, SIYAH_YAZI).apply { typeface = Typeface.DEFAULT_BOLD; letterSpacing = 0.06f; setShadowLayer(0f, 0f, 0f, 0)
            background = Tema.kapsul(if (kesVar) Color.WHITE else Color.argb(76, 255, 255, 255), dp(12f).toFloat()); contentDescription = "Önizlemeyi canlıya al"
            setOnClickListener { kes() } }, LinearLayout.LayoutParams(dp(120f), -1).apply { marginEnd = dp(12f) })
        denetim.addView(etiket("AUTO", 18f, SIYAH_YAZI).apply { typeface = Typeface.DEFAULT_BOLD; letterSpacing = 0.06f; setShadowLayer(0f, 0f, 0f, 0)
            background = Tema.kapsul(if (kesVar) Color.WHITE else Color.argb(76, 255, 255, 255), dp(12f).toFloat()); contentDescription = "Önizlemeyi geçişle canlıya al"
            setOnClickListener { oto() } }, LinearLayout.LayoutParams(dp(100f), -1).apply { marginEnd = dp(12f) })
        denetim.addView(etiket("FTB", 16f, if (masa.karart) Color.WHITE else GRI).apply { typeface = Typeface.DEFAULT_BOLD; setShadowLayer(0f, 0f, 0f, 0)
            background = Tema.kapsul(if (masa.karart) KIRMIZI else Color.rgb(28, 28, 30), dp(12f).toFloat()); contentDescription = "Siyaha in"
            setOnClickListener { masa.karart = !masa.karart; gecisGoster(); denetimCiz() } }, LinearLayout.LayoutParams(dp(76f), -1).apply { marginEnd = dp(12f) })
        denetim.addView(LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER; setPadding(dp(14f), 0, dp(18f), 0)
            background = Tema.kapsul(Color.rgb(28, 28, 30), dp(12f).toFloat()); contentDescription = if (kaydedici != null) "Kaydı durdur" else "Kaydı başlat"; setOnClickListener { kayitDugmesi(); denetimCiz() }
            addView(KayitDugmesi(this@MasaActivity).apply { kayitta = kaydedici != null; isClickable = false }, LinearLayout.LayoutParams(dp(40f), dp(40f)))
            addView(etiket(if (kaydedici != null) "DURDUR" else "KAYIT", 17f).apply { typeface = Typeface.DEFAULT_BOLD; setPadding(dp(10f), 0, 0, 0); setShadowLayer(0f, 0f, 0f, 0) })
        }, LinearLayout.LayoutParams(-2, -1))
    }

    /** Tablet: kaynağa dokunuş (önizlemeye; hızlı geçişte doğrudan canlıya); çift dokunuş hemen canlıya */
    private fun dokun(i: Int) {
        val simdi = System.currentTimeMillis()
        if (simdi - sonDokunus[i] < 350) { sonDokunus[i] = 0; canliYap(i); return }
        sonDokunus[i] = simdi; sec(i)
    }
    private fun sec(i: Int) { if (!masa.dolu[i]) return; if (hizli || !tablet) canliYap(i) else { masa.siradaki = i; duzen() } }
    /** KES: önizlemedeki canlıya, canlıdaki önizlemeye (ATEM gibi) */
    private fun kes() {
        val s = masa.siradaki; if (s < 0 || !masa.dolu[s]) return
        val eski = masa.canli; canliYap(s, 0); masa.siradaki = if (masa.dolu[eski] && eski != s) eski else -1; duzen()
    }
    /** AUTO: önizlemedekini seçili geçişle canlıya alır (seçili geçiş kesmeyse MIX) */
    private fun oto() {
        val s = masa.siradaki; if (s < 0 || !masa.dolu[s]) return
        val eski = masa.canli; canliYap(s, masa.gecisTuru.takeIf { it != 0 } ?: 1); masa.siradaki = if (masa.dolu[eski] && eski != s) eski else -1; duzen()
    }

    /* ================= geçiş ve katmanlar ================= */
    private val GECISLER = listOf("KES", "MIX", "DIP", "WIPE")
    private fun gecisGoster() {
        if (!tablet && this::ninjaUst.isInitialized) duzen()
        val ek = buildList { if (masa.karart) add("FTB"); if (masa.logoAcik) add("LOGO"); if (masa.altYaziAcik) add("ALT YAZI") }
        gecisYazi.text = GECISLER[masa.gecisTuru] + (if (masa.gecisTuru != 0) " %.1f".format(Locale("tr"), masa.gecisSure / 1000f) else "") + ek.joinToString("") { " · $it" }
        gecisYazi.setTextColor(if (masa.karart) KIRMIZI else Color.WHITE)
    }

    /** Geçiş türü ve süresi; katmanlar: FTB (siyaha in), logo, alt yazı. Hepsi program ekranında ve kayıtta */
    private fun gecisMenu() {
        val p = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(20f), dp(8f), dp(20f), dp(4f)) }
        fun baslik(m: String) = p.addView(etiket(m, 11f, GRI).apply { gravity = Gravity.START; letterSpacing = 0.12f; setShadowLayer(0f, 0f, 0f, 0); setPadding(0, dp(14f), 0, dp(6f)) })
        fun sira(l: List<Pair<String, Boolean>>, sec: (Int) -> Unit) = p.addView(LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL
            l.forEachIndexed { i, (ad, secili) -> addView(etiket(ad, 13f, if (secili) SIYAH_YAZI else Color.WHITE).apply { setShadowLayer(0f, 0f, 0f, 0)
                background = Tema.kapsul(if (secili) Color.WHITE else Color.argb(40, 255, 255, 255), dp(10f).toFloat()); setOnClickListener { sec(i) } },
                LinearLayout.LayoutParams(0, dp(38f), 1f).apply { if (i > 0) marginStart = dp(6f) }) } })
        lateinit var ciz: () -> Unit
        ciz = {
            p.removeAllViews()
            baslik("GEÇİŞ")
            sira(GECISLER.mapIndexed { i, a -> a to (masa.gecisTuru == i) }) { masa.gecisTuru = it; tercih.edit().putInt("masa.gecis", it).apply(); gecisGoster(); ciz() }
            if (masa.gecisTuru != 0 || masa.karart) {
                baslik("SÜRE")
                val sureler = listOf(300, 600, 1000, 2000)
                sira(sureler.map { "%.1f sn".format(Locale("tr"), it / 1000f) to (masa.gecisSure == it) }) { masa.gecisSure = sureler[it]; tercih.edit().putInt("masa.gecisSure", sureler[it]).apply(); gecisGoster(); ciz() }
            }
            baslik("KATMANLAR")
            sira(listOf("FTB" to masa.karart, "LOGO" to masa.logoAcik, "ALT YAZI" to masa.altYaziAcik)) { i ->
                when (i) {
                    0 -> masa.karart = !masa.karart
                    1 -> if (masa.logo == null) logoSec() else masa.logoAcik = !masa.logoAcik
                    else -> if (masa.altYazi == null) altYaziSor() else masa.altYaziAcik = !masa.altYaziAcik
                }
                gecisGoster(); ciz(); if (tablet) denetimCiz()
            }
            p.addView(LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setPadding(0, dp(8f), 0, 0)
                addView(etiket("Logo seç", 13f, GRI).apply { setShadowLayer(0f, 0f, 0f, 0); setOnClickListener { logoSec() } }, LinearLayout.LayoutParams(0, dp(36f), 1f))
                addView(etiket("Alt yazıyı düzenle", 13f, GRI).apply { setShadowLayer(0f, 0f, 0f, 0); setOnClickListener { altYaziSor() } }, LinearLayout.LayoutParams(0, dp(36f), 1f))
            })
            p.addView(etiket("Kaynağa dokununca seçili geçişle canlıya geçer. Tablette KES her zaman kesme, AUTO seçili geçiş. Geçiş tek düzende çalışır.", 11f, GRI).apply {
                isSingleLine = false; gravity = Gravity.START; setShadowLayer(0f, 0f, 0f, 0); setPadding(0, dp(10f), 0, 0) })
        }
        ciz()
        AlertDialog.Builder(this).setTitle("Geçiş ve katmanlar").setView(android.widget.ScrollView(this).apply { addView(p) }).setPositiveButton("Kapat", null).show()
    }

    private fun logoSec() = runCatching {
        @Suppress("DEPRECATION") startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/*"), 9)
    }.onFailure { tost("Resim seçici açılamadı.") }

    private fun altYaziSor() {
        val p = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(20f), dp(8f), dp(20f), 0) }
        val ad = EditText(this).apply { hint = "Ad (örn. Ayşe Yılmaz)"; setText(tercih.getString("masa.altYazi1", "")); isSingleLine = true }
        val unvan = EditText(this).apply { hint = "Unvan (isteğe bağlı)"; setText(tercih.getString("masa.altYazi2", "")); isSingleLine = true }
        p.addView(ad); p.addView(unvan)
        AlertDialog.Builder(this).setTitle("Alt yazı").setView(p)
            .setPositiveButton("Göster") { _, _ ->
                tercih.edit().putString("masa.altYazi1", ad.text.toString().trim()).putString("masa.altYazi2", unvan.text.toString().trim()).apply()
                masa.altYazi = altYaziResmi(); masa.altYaziAcik = masa.altYazi != null; gecisGoster(); if (tablet) denetimCiz()
            }.setNegativeButton("Vazgeç", null).show()
    }

    /** Alt yazı plakası: siyah %72 zemin, solda ince beyaz çizgi, ad (yarı kalın) ve unvan (%70 beyaz); boşsa null */
    private fun altYaziResmi(): android.graphics.Bitmap? {
        val a = tercih.getString("masa.altYazi1", "").orEmpty(); val u = tercih.getString("masa.altYazi2", "").orEmpty()
        if (a.isEmpty() && u.isEmpty()) return null
        val buyuk = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE; textSize = 88f; typeface = kosul }
        val kucuk = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(178, 255, 255, 255); textSize = 54f; typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.NORMAL) }
        val pay = 56f; val cizgi = 8f
        val w = (maxOf(buyuk.measureText(a), kucuk.measureText(u)) + 2 * pay + cizgi).toInt().coerceIn(400, 3000)
        val h = if (a.isNotEmpty() && u.isNotEmpty()) 240 else 160
        val b = android.graphics.Bitmap.createBitmap(w, h, android.graphics.Bitmap.Config.ARGB_8888)
        val c = android.graphics.Canvas(b)
        c.drawColor(Color.argb(184, 0, 0, 0))
        c.drawRect(0f, 0f, cizgi, h.toFloat(), android.graphics.Paint().apply { color = Color.WHITE })
        var y = if (a.isNotEmpty()) 108f else 102f
        if (a.isNotEmpty()) { c.drawText(a, cizgi + pay, y, buyuk); y += 82f }
        if (u.isNotEmpty()) c.drawText(u, cizgi + pay, y, kucuk)
        return b
    }

    private fun logoResmi(u: Uri): android.graphics.Bitmap? = runCatching {
        val o = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
        contentResolver.openInputStream(u)?.use { android.graphics.BitmapFactory.decodeStream(it, null, o) }
        var s = 1; while (o.outHeight / (s * 2) >= 360) s *= 2
        contentResolver.openInputStream(u)?.use { android.graphics.BitmapFactory.decodeStream(it, null, android.graphics.BitmapFactory.Options().apply { inSampleSize = s }) }
    }.getOrNull()

    private fun katmanlariYukle() {
        masa.altYazi = altYaziResmi()
        tercih.getString("masa.logo", null)?.let { Uri.parse(it) }?.takeIf { u -> contentResolver.persistedUriPermissions.any { it.uri == u } }?.let { masa.logo = logoResmi(it) }
    }

    /** Tablet klavyesi: 1–4 kaynak, boşluk KES, Enter AUTO, F FTB, R kayıt */
    override fun onKeyDown(k: Int, e: android.view.KeyEvent?): Boolean {
        when (k) {
            in android.view.KeyEvent.KEYCODE_1..android.view.KeyEvent.KEYCODE_4 -> { sec(k - android.view.KeyEvent.KEYCODE_1); return true }
            android.view.KeyEvent.KEYCODE_SPACE -> { kes(); return true }
            android.view.KeyEvent.KEYCODE_ENTER -> { oto(); return true }
            android.view.KeyEvent.KEYCODE_F -> { masa.karart = !masa.karart; gecisGoster(); if (tablet) denetimCiz(); return true }
            android.view.KeyEvent.KEYCODE_R -> { kayitDugmesi(); duzen(); return true }
        }
        return super.onKeyDown(k, e)
    }

    /** Yalnız ekran testi: kaynak yokken yuvaların görünüşü için örnek adlar */
    fun ornekDoldur() {
        listOf("USB: Sony ILCE-7M5", "UPDATED · Pixel 8", "UPDATED · Galaxy S24").forEachIndexed { i, a -> adlar[i] = a }
        masa.dolu = booleanArrayOf(true, true, true, false); masa.canli = 0; if (tablet) masa.siradaki = 1; duzen()
    }

    /** Canlıya alır: `tur` geçiş türü (varsayılan seçili geçiş; KES her zaman kesme) */
    private fun canliYap(i: Int, tur: Int = masa.gecisTuru) {
        masa.gecis(i, tur); if (masa.siradaki == i) masa.siradaki = -1; duzen()
        kaynaklar.forEachIndexed { j, k -> (k as? WifiKameraKaynak)?.tally(j == i) }
    }

    /* ================= kaynaklar ================= */
    private fun bosYuva() = kaynaklar.indexOfFirst { it == null }

    private fun ekle(k: Kaynak, ad: String): Int {
        val i = bosYuva(); if (i < 0) { k.durdur(); tost("En çok ${MasaGorunum.EN_COK} kaynak."); return -1 }
        kaynaklar[i] = k; adlar[i] = ad; masa.yuvalar[i].dondur = 0
        masa.dolu = masa.dolu.copyOf().also { it[i] = true }
        if (!masa.dolu[masa.canli]) masa.canli = i
        baslat(i, k); duzen()
        kaynaklar.forEachIndexed { j, kk -> (kk as? WifiKameraKaynak)?.tally(j == masa.canli) }
        return i
    }

    private fun baslat(i: Int, k: Kaynak) {
        val y = yuzeyler?.getOrNull(i) ?: return // GL hazır olunca yuzeylerHazir başlatır
        val yuva = masa.yuvalar[i]
        if (k is WifiKameraKaynak) k.yonDegisti = { d -> yuva.dondur = d; masa.requestRender() }
        if (k is KameraKaynak) { yuva.dondur = (360 - ekranDonusu()) % 360; k.ekranYonu = ekranDonusu() }
        k.baslat(y, { w, h -> yuva.tampon(w, h) }, { hata -> runOnUiThread { tost(hata) } })
    }

    private fun kaldir(i: Int) {
        if (kaydedici != null && i == masa.canli) return tost("Kayıt sürerken canlıdaki kaynak kaldırılamaz.")
        isoBitir(i)
        kaynaklar[i]?.durdur(); kaynaklar[i] = null; adlar[i] = null
        masa.dolu = masa.dolu.copyOf().also { it[i] = false }
        if (i == masa.canli) masa.dolu.indexOfFirst { it }.takeIf { it >= 0 }?.let { masa.canli = it }
        duzen()
    }

    private fun wifiEkle(ad: String, adres: String, kapi: Int) {
        if (kaynaklar.any { it is WifiKameraKaynak && it.host == adres && it.port == kapi }) return
        bulunan.remove(ad)
        ekle(WifiKameraKaynak(adres, kapi, ad), ad)
    }

    @Suppress("DEPRECATION") private fun ekranDonusu() = windowManager.defaultDisplay.rotation * 90

    /** Bu cihazın kendi kamerası (arka/ön): Multi Cam'de öteki kaynaklarla birlikte, ayrı kaydıyla. Aynı anda tek telefon kamerası */
    private fun telefonKamerasiEkle(id: String, ad: String) {
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            bekleyenKamera = id to ad; requestPermissions(arrayOf(Manifest.permission.CAMERA), 4); return
        }
        kaynaklar.indexOfFirst { it is KameraKaynak }.takeIf { it >= 0 }?.let { kaldir(it) }
        val k = runCatching { KameraKaynak(this, id, ad) }.getOrElse { e -> HataKaydi.not("masa", "telefon kamerası: ${e.stackTraceToString()}"); return tost("Kamera açılamadı: ${e.message}") }
        ekle(k, ad)
    }
    private var bekleyenKamera: Pair<String, String>? = null

    override fun onRequestPermissionsResult(istek: Int, izinler: Array<out String>, sonuc: IntArray) {
        super.onRequestPermissionsResult(istek, izinler, sonuc)
        if (istek == 4) bekleyenKamera?.let { (id, ad) -> bekleyenKamera = null
            if (sonuc.firstOrNull() == PackageManager.PERMISSION_GRANTED) telefonKamerasiEkle(id, ad) else tost("Kamera izni verilmedi.") }
    }

    /** Ekran dönünce telefon kamerasının görüntüsü dik kalır */
    override fun onConfigurationChanged(c: android.content.res.Configuration) {
        super.onConfigurationChanged(c)
        kaynaklar.forEachIndexed { i, k -> if (k is KameraKaynak) { masa.yuvalar[i].dondur = (360 - ekranDonusu()) % 360; k.ekranYonu = ekranDonusu(); masa.requestRender() } }
    }

    /** RTMP ile gelen yayın: boş yuvaya kendiliğinden kaynak olur */
    private fun rtmpEkle(y: RtmpYayin) {
        if (bosYuva() < 0) { y.kapat(); return tost("${y.ad}: yer yok (en çok ${MasaGorunum.EN_COK} kaynak)") }
        ekle(RtmpKaynak(y), "RTMP: ${y.ad}"); tost("${y.ad} bağlandı (RTMP)")
    }

    private fun ipAdresi(): String? = runCatching {
        java.net.NetworkInterface.getNetworkInterfaces().toList().filter { it.isUp && !it.isLoopback }.flatMap { it.inetAddresses.toList() }
            .firstOrNull { it is java.net.Inet4Address && it.isSiteLocalAddress }?.hostAddress
    }.getOrNull()

    /** Kamera bağlama yardımı: markaya göre en kolay yol (Wi-Fi yayını, USB webcam, Luna) */
    private fun kameraBagla() {
        val ip = ipAdresi()
        val adres = "rtmp://${ip ?: "<bu cihazın IP'si>"}:${Rtmp.KAPI}/${Rtmp.UYGULAMA}/kamera1"
        AlertDialog.Builder(this).setTitle("Kamera bağla")
            .setMessage("Canlı yayın yapabilen kameralar (DJI Osmo Pocket / Action, Insta360 Ace Pro 2 / GO Ultra / X serisi, GoPro…):\n" +
                "1) Kamera ve bu cihaz aynı Wi-Fi'da olsun (telefonun erişim noktası da olur).\n" +
                "2) Kameranın kendi uygulamasında Canlı yayın → RTMP (özel) seç.\n" +
                "3) Adres: $adres\n   (her kamera için sondaki adı değiştir: kamera2, osmo…)\n" +
                "4) Yayını başlat: kamera burada kendiliğinden kaynak olur, ayrı kaydı da tutulur.\n\n" +
                "USB: çoğu kamerada \"Webcam / USB yayını\" modu var; açıp tak.\n" +
                "Insta360 Luna: menüdeki Luna satırı (kameranın kendi Wi-Fi'ı).")
            .setPositiveButton("Adresi kopyala") { _, _ ->
                getSystemService(android.content.ClipboardManager::class.java).setPrimaryClip(android.content.ClipData.newPlainText("RTMP", adres)); tost("Kopyalandı: $adres") }
            .setNegativeButton("Kapat", null).show()
    }

    private fun usbEkle(d: UsbDevice) {
        if (kaynaklar.any { it is UvcKaynak && it.aygit.deviceName == d.deviceName }) return
        val ad = d.productName ?: d.manufacturerName ?: "USB görüntü"
        val i = bosYuva(); if (i < 0) return tost("En çok ${MasaGorunum.EN_COK} kaynak.")
        val yuva = masa.yuvalar[i]
        ekle(UvcKaynak(this, d, { yuva.kare }, { c -> runOnUiThread { tost("$ad · $c") } }), "USB: $ad")
    }

    private val usbDinle = object : android.content.BroadcastReceiver() {
        override fun onReceive(c: android.content.Context, i: Intent) {
            @Suppress("DEPRECATION") val d = i.getParcelableExtra<UsbDevice>(UsbManager.EXTRA_DEVICE) ?: return
            if (i.action == UsbManager.ACTION_USB_DEVICE_ATTACHED) { if (UvcKaynak.gorunturVar(d)) usbEkle(d) else tost("USB aygıtı görüntü vermiyor: makineyi \"USB yayını\" (USB Streaming) moduna al.") }
            else kaynaklar.indexOfFirst { it is UvcKaynak && it.aygit.deviceName == d.deviceName }.takeIf { it >= 0 }?.let { kaldir(it) }
        }
    }

    /** Kaynak ekle ekranı (KaynakEkle.kt; iOS KaynakEkleSayfasi ile aynı) */
    private fun kaynakMenu() {
        val kameralar = runCatching { kameralar(this) }.getOrDefault(emptyList()).filter { !it.second.startsWith("USB") }.mapNotNull { (id, ad) ->
            val on = runCatching { getSystemService(android.hardware.camera2.CameraManager::class.java).getCameraCharacteristics(id)
                .get(android.hardware.camera2.CameraCharacteristics.LENS_FACING) == android.hardware.camera2.CameraCharacteristics.LENS_FACING_FRONT }.getOrDefault(false)
            Triple(id, ad, on) }.let { l -> listOfNotNull(l.firstOrNull { !it.third }, l.firstOrNull { it.third }) }
        KaynakEkle(this, kok, KaynakEkle.Veri(
            telefonKameralari = kameralar,
            ekliKamera = { id -> kaynaklar.any { it is KameraKaynak && it.id == id } },
            wifiBagli = kaynaklar.count { it is WifiKameraKaynak },
            bulunan = bulunan.keys.toList(),
            rtmpAdresi = { ad -> "rtmp://${ipAdresi() ?: "<bu cihazın IP'si>"}:${Rtmp.KAPI}/${Rtmp.UYGULAMA}/$ad" },
            kameraEkle = { id, ad -> telefonKamerasiEkle(id, ad) },
            wifiEkle = { ad -> bulunan[ad]?.let { (a, k) -> wifiEkle(ad, a, k) } },
            adresleEkle = { t -> val (a, k) = t.split(":").let { it[0] to (it.getOrNull(1)?.toIntOrNull() ?: AgYayin.KAPI) }; wifiEkle(a, a, k) },
            usbAra = { val l = UvcKaynak.aygitlar(this).filter { d -> kaynaklar.none { it is UvcKaynak && it.aygit.deviceName == d.deviceName } }
                if (l.isEmpty()) tost("USB görüntü aygıtı bulunamadı. Kamerayı web kamerası / USB yayını moduna al ve tak.") else l.forEach { usbEkle(it) } },
            lunaEkle = { lunaEkle() },
            kopyala = { m -> getSystemService(android.content.ClipboardManager::class.java).setPrimaryClip(android.content.ClipData.newPlainText("RTMP", m)); tost("Kopyalandı: $m") },
        )).also { kaynakSayfasi = it }.ac(ustPay, altPay)
    }
    private var kaynakSayfasi: KaynakEkle? = null
    @Deprecated("onBackPressed") override fun onBackPressed() { kaynakSayfasi?.takeIf { it.acik }?.let { it.kapat(); return }; @Suppress("DEPRECATION") super.onBackPressed() }

    /** Luna: telefon kameranın Wi-Fi'ına bağlıyken doğrudan kaynak (Insta360 uygulaması kapalı olmalı; kamera tek bağlantı kabul eder) */
    private fun lunaEkle() {
        if (LunaKaynak.ag(this) == null) AlertDialog.Builder(this).setTitle("Insta360 Luna")
            .setMessage("Telefonu kameranın Wi-Fi'ına bağla: Ayarlar → Wi-Fi → \"Luna Ultra…\" (şifre kameranın ekranında ya da Insta360 uygulamasında yazar). " +
                "Başka telefonda Insta360 uygulaması açıksa kapat. Bağlanınca kaynak kendiliğinden görüntü verir; ilk seferde kameranın ekranında onay istenebilir.")
            .setPositiveButton("Wi-Fi ayarları") { _, _ -> runCatching { startActivity(Intent(android.provider.Settings.ACTION_WIFI_SETTINGS)) }; ekle(LunaKaynak(this), "Insta360 Luna") }
            .setNegativeButton("Vazgeç", null).show()
        else ekle(LunaKaynak(this), "Insta360 Luna")
    }

    private fun adresSor() {
        val e = EditText(this).apply { hint = "192.168.1.20"; setSingleLine() }
        AlertDialog.Builder(this).setTitle("Wi-Fi kameranın adresi").setMessage("Kamera telefonunda Ayarlar → Wi-Fi kamera satırında yazar.").setView(e)
            .setPositiveButton("Bağlan") { _, _ -> val t = e.text.toString().trim(); if (t.isNotEmpty()) { val (a, k) = t.split(":").let { it[0] to (it.getOrNull(1)?.toIntOrNull() ?: AgYayin.KAPI) }; wifiEkle(a, a, k) } }
            .setNegativeButton("Vazgeç", null).show()
    }

    private fun yuvaMenu(i: Int) {
        val y = masa.yuvalar[i]
        AlertDialog.Builder(this).setTitle(adlar[i])
            .setItems(arrayOf("Canlıya al (CUT)", "Döndür (90°)", "Kaldır")) { _, s -> when (s) { 0 -> canliYap(i, 0); 1 -> { y.dondur = (y.dondur + 90) % 360; masa.requestRender() }; else -> kaldir(i) } }
            .setNegativeButton("Kapat", null).show()
    }

    /* ================= kayıt ================= */
    /** Seçilen kayıt klasörü (SSD); izni düşmüşse null */
    private fun klasor(): Uri? = tercih.getString("masa.klasor", null)?.let { Uri.parse(it) }
        ?.takeIf { u -> contentResolver.persistedUriPermissions.any { it.uri == u && it.isWritePermission } }

    /** Kaynak hücresinde: bu kaynak ayrıca kendi dosyasına kaydediliyor */
    private fun kayitRozeti() = etiket("●  KAYIT", 10f, KIRMIZI).apply { setShadowLayer(0f, 0f, 0f, 0); letterSpacing = 0.08f
        setPadding(dp(7f), 0, dp(8f), 0); background = Tema.kapsul(Color.argb(170, 0, 0, 0), dp(10f).toFloat()) }

    private fun yerGoster() {
        val k = klasor()
        // Telefonda üst şerit dar: kısa yazı
        val bos = bosAlan(k)?.let { " · ${"%.0f".format(it / 1e9)} GB" + if (tablet) " boş" else "" } ?: ""
        yerYazi.text = (if (tablet) "Kayıt: " else "") + (k?.let { klasorAdi(it) } ?: if (tablet) "telefon" else "Telefon") + bos
        hucreleriYaz()
    }

    /** Kayıt yerindeki boş alan (bayt); SSD'nin bölümü bulunamazsa null */
    private fun bosAlan(k: Uri?): Long? = runCatching {
        val dizin: java.io.File? = if (k == null) android.os.Environment.getExternalStorageDirectory() else {
            val kimlik = android.provider.DocumentsContract.getTreeDocumentId(k).substringBefore(':')
            if (kimlik == "primary") android.os.Environment.getExternalStorageDirectory()
            else if (android.os.Build.VERSION.SDK_INT >= 30) (getSystemService(STORAGE_SERVICE) as android.os.storage.StorageManager).storageVolumes
                .firstOrNull { it.uuid.equals(kimlik, true) }?.directory else null
        }
        dizin?.let { android.os.StatFs(it.path).availableBytes }
    }.getOrNull()
    private fun klasorAdi(u: Uri) = runCatching { android.provider.DocumentsContract.getTreeDocumentId(u).substringAfterLast(':').ifEmpty { "SSD" } }.getOrDefault("SSD")
        .let { if (it.length > 18) it.take(17) + "…" else it }

    private fun yerMenu() {
        if (kaydedici != null) return tost("Kayıt sürerken kayıt yeri değişmez.")
        val k = klasor()
        AlertDialog.Builder(this).setTitle("Kayıt yeri")
            .setMessage((if (k != null) "Şu an: ${klasorAdi(k)}\n\n" else "Şu an: telefon (Movies/UPDATED Masa)\n\n") +
                "Harici SSD için: SSD'yi tak (hub ya da doğrudan), \"SSD seç\"e dokun, SSD'yi ve bir klasörü seç. Her kayıt orada \"UPDATED Masa/<tarih>\" klasörüne gider: Program.mp4 ve her kaynak ayrı dosya.")
            .setPositiveButton("SSD seç") { _, _ -> runCatching { startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION), 7) }.onFailure { tost("Klasör seçici açılmadı.") } }
            .setNeutralButton("Telefona kaydet") { _, _ -> tercih.edit().remove("masa.klasor").apply(); yerGoster() }
            .setNegativeButton("Kapat", null).show()
    }

    @Suppress("OVERRIDE_DEPRECATION", "DEPRECATION")
    override fun onActivityResult(istek: Int, sonuc: Int, veri: Intent?) {
        super.onActivityResult(istek, sonuc, veri)
        val u = veri?.data ?: return
        if (istek == 9 && sonuc == RESULT_OK) {
            runCatching { contentResolver.takePersistableUriPermission(u, Intent.FLAG_GRANT_READ_URI_PERMISSION) }
            val b = logoResmi(u) ?: return tost("Resim açılamadı.")
            tercih.edit().putString("masa.logo", u.toString()).apply(); masa.logo = b; masa.logoAcik = true; gecisGoster(); if (tablet) denetimCiz(); return
        }
        if (istek != 7 || sonuc != RESULT_OK) return
        runCatching { contentResolver.takePersistableUriPermission(u, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION) }
            .onFailure { return tost("Bu klasöre yazma izni alınamadı.") }
        tercih.edit().putString("masa.klasor", u.toString()).apply(); yerGoster(); tost("Kayıtlar buraya gidecek: ${klasorAdi(u)}")
    }

    private fun kayitDugmesi() {
        if (kaydedici != null) { kayitBitir(true); return }
        if (!masa.dolu[masa.canli]) return tost("Önce bir kaynak ekle.")
        val o = KayitOturumu(this, klasor())
        if (klasor() != null && !o.harici) tost("SSD'ye ulaşılamadı; kayıt telefona yapılıyor.")
        kayitBaslat(o)
    }

    private fun duzenAdi(d: Int) = when (d) { 0 -> "Oto"; 2 -> "2'li"; 3 -> "3'lü"; 4 -> "4'lü"; 5 -> "PiP"; else -> "Tek" }

    /** Program düzeni: Tek (canlı kaynak), 2'li, 3'lü, 4'lü; 4K tuvalde her 1080p kaynak kendi yerinde tam boyutta. Kayıt sırasında da değişir */
    private fun duzenMenu() {
        val l = listOf(0 to "Oto: kaynak sayısına göre", 1 to "Tek: canlı kaynak tam ekran", 2 to "2'li: yan yana", 3 to "3'lü: üstte iki, altta bir", 4 to "4'lü: 2×2 ızgara", 5 to "PiP: canlı tam ekran, ikinci kaynak sağ altta")
        AlertDialog.Builder(this).setTitle("Program düzeni")
            .setSingleChoiceItems(l.map { it.second }.toTypedArray(), masa.duzen) { d, i ->
                masa.duzen = l[i].first; tercih.edit().putInt("masa.duzen", masa.duzen).apply(); duzenYazi.text = (if (tablet) "Düzen: " else "") + duzenAdi(masa.duzen); duzen(); d.dismiss()
                if (kaydedici != null && masa.etkinDuzen > 1 && masa.kayitW < 3840) tost("Bu kayıt ${masa.kayitW}×${masa.kayitH} başladı; 4K çoklu kayıt için düzeni kayıttan önce seç.")
            }.setNegativeButton("Kapat", null).show()
    }

    /** Program boyutu: çoklu düzende 4K tuval; tek düzende en büyük kaynak 4K ise 4K, yoksa 1080p (cihaz kodlayabiliyorsa; 60 fps, yoksa 30) */
    private fun programBoyutu(): Triple<Int, Int, Int> {
        val enBuyuk = if (masa.etkinDuzen > 1) 2160 else masa.yuvalar.filterIndexed { i, _ -> masa.dolu[i] }.maxOfOrNull { minOf(it.boyut[0], it.boyut[1]) } ?: 1080
        if (enBuyuk >= 2160) for (fps in intArrayOf(60, 30)) if (KayitOturumu.kodlayiciVar(android.media.MediaFormat.MIMETYPE_VIDEO_HEVC, 3840, 2160, fps)) return Triple(3840, 2160, fps)
        return Triple(1920, 1080, 60)
    }

    private fun kayitBaslat(o: KayitOturumu) {
        val (pw, ph, pfps) = programBoyutu()
        val d = o.ac("Program") ?: return tost("Kayıt dosyası açılamadı.")
        val ses = checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        val k = runCatching { Kaydedici(this, d.pfd, pw, ph, pfps, if (pw > 1920) 60 else 20, true, sesIste = ses).also { it.baslat() } }
            .getOrElse { e -> d.bitti(false); HataKaydi.not("masa", e.stackTraceToString()); return tost("Kayıt başlamadı: ${e.message}") }
        kaydedici = k; programDosya = d; oturum = o; if (kayitBas == 0L) kayitBas = System.currentTimeMillis()
        masa.kayitW = pw; masa.kayitH = ph; masa.kayitYuzeyi = k.yuzey; masa.requestRender()
        var iso = 0
        kaynaklar.forEachIndexed { i, kk -> if (kk != null && isoBaslat(o, i, kk)) iso++ }
        kayitDugme.kayitta = true; sure.visibility = View.VISIBLE; duzen()
        tost("Kayıt: ${if (o.harici) "SSD" else "telefon"} · Program ${if (pw > 1920) "4K" else "1080p"}$pfps + $iso kaynak ayrı" + (k.sesKaynagi?.let { " · ses: $it" } ?: ""))
    }

    /** Kaynağın ayrı dosyası: ağdan gelen akış olduğu gibi, USB görüntü ve telefon kamerası H.265 ile kodlanarak */
    private fun isoBaslat(o: KayitOturumu, i: Int, k: Kaynak): Boolean {
        val ad = "${i + 1} - ${(adlar[i] ?: k.ad).substringAfter("USB: ").substringAfter("RTMP: ").substringAfter("UPDATED · ")}"
        when (k) {
            is WifiKameraKaynak -> {
                if (k.genislik <= 0) return false
                val d = o.ac(ad) ?: return false
                val a = runCatching { AkisKaydi(d, false, k.genislik, k.yukseklik, o.bas) }.getOrElse { d.bitti(false); return false }
                k.sonAyar?.let { a.ayarVer(it) }; k.kayit = a; k.anahtarIste()
                isolar[i] = { k.kayit = null; a.bitir() } to { a.bozuk }
            }
            is RtmpKaynak -> {
                val y = masa.yuvalar[i]
                val w = k.yayin.genislik.takeIf { it > 0 } ?: y.boyut[0]; val h = k.yayin.yukseklik.takeIf { it > 0 } ?: y.boyut[1]
                val d = o.ac(ad) ?: return false
                val a = runCatching { AkisKaydi(d, k.yayin.hevc, w, h, o.bas) }.getOrElse { d.bitti(false); return false }
                k.yayin.sonAyar?.let { a.ayarVer(it) }; k.kayit = a
                isolar[i] = { k.kayit = null; a.bitir() } to { a.bozuk }
            }
            is LunaKaynak -> {
                val d = o.ac(ad) ?: return false
                val a = runCatching { AkisKaydi(d, true, 1280, 720, o.bas) }.getOrElse { d.bitti(false); return false }
                k.kayit = a
                isolar[i] = { k.kayit = null; a.bitir() } to { a.bozuk }
            }
            is UvcKaynak, is KameraKaynak -> {
                // Ekranda göründüğü yönde (telefon kamerası dik dururken dik dosya)
                val y = masa.yuvalar[i]; val uzun = maxOf(y.boyut[0], y.boyut[1]); val kisa = minOf(y.boyut[0], y.boyut[1])
                val w = (if (y.oran() >= 1f) uzun else kisa) and 15.inv(); val h = (if (y.oran() >= 1f) kisa else uzun) and 15.inv()
                val fps = (k as? UvcKaynak)?.fps ?: 30
                if (w <= 0 || h <= 0) return false
                val d = o.ac(ad) ?: return false
                val kd = runCatching { Kaydedici(this, d.pfd, w, h, fps, if (minOf(w, h) >= 2160) 60 else 20, true, sesIste = false).also { it.baslat() } }
                    .getOrElse { e -> d.bitti(false); HataKaydi.not("masa", "ISO kodlayıcı: ${e.message}"); tost("${adlar[i]}: ayrı kayıt açılamadı (cihazın kodlayıcısı yetmiyor)"); return false }
                masa.isoHedef[i] = Triple(kd.yuzey, w, h); masa.requestRender()
                isolar[i] = { masa.isoHedef[i] = null; Thread.sleep(100); kd.bitir().also { d.bitti(it) } } to { kd.yazmaHatasi }
            }
            else -> return false
        }
        return true
    }

    private fun isoBitir(i: Int) { val b = isolar.remove(i) ?: return; Thread { runCatching { b.first() } }.start() }

    /** Kaydı kapatır; `son` false ise (SSD çıktı) hemen telefonda yeni oturum açılır */
    private fun kayitBitir(son: Boolean) {
        val k = kaydedici ?: return; val d = programDosya; val o = oturum
        kaydedici = null; programDosya = null; oturum = null; masa.kayitYuzeyi = null; masa.requestRender()
        val bitecek = isolar.values.map { it.first }; isolar.clear()
        if (son) { kayitDugme.kayitta = false; sure.visibility = View.GONE; kayitBas = 0L; duzen(); yerGoster() }
        Thread {
            Thread.sleep(150)
            val ok = runCatching { k.bitir() }.getOrDefault(false); d?.bitti(ok)
            val iso = bitecek.count { runCatching { it() }.getOrDefault(false) }
            if (son) runOnUiThread {
                if (ok) tost("Kayıt bitti: ${if (o?.harici == true) "SSD" else "telefon"} · UPDATED Masa/${o?.ad} · Program + $iso kaynak")
                else tost("Kayıt kaydedilemedi (görüntü gelmedi).")
            }
        }.start()
    }

    private var ssdUyarildi = false
    private fun tik() {
        hucreleriYaz()
        if (kaydedici != null) { val ms = System.currentTimeMillis() - kayitBas; sure.text = "●  %02d:%02d".format(ms / 60000, ms / 1000 % 60) + (if (isolar.isNotEmpty()) "  ·  ${isolar.size} KAMERA + PROGRAM" else "") }
        // SSD çıkarıldı / doldu: kayıt telefonda yeni klasörde sürer
        val k = kaydedici ?: return
        if (oturum?.harici == true && (k.yazmaHatasi || isolar.values.any { it.second() })) {
            if (!ssdUyarildi) { ssdUyarildi = true; tost("SSD'ye yazılamıyor (çıkarıldı ya da doldu). Kayıt telefonda sürüyor.") }
            kayitBitir(false); kayitBaslat(KayitOturumu(this, null)); ssdUyarildi = false
        }
    }

    /* ================= yaşam döngüsü ================= */
    override fun onResume() {
        super.onResume(); Ekranlar.masaAcik = true; masa.onResume(); tamEkran()
        // Bazı telefonlar Wi-Fi'da çoklu yayın paketlerini kilit olmadan atar (kameralar bulunmaz)
        cokluYayin = runCatching { (applicationContext.getSystemService(WIFI_SERVICE) as android.net.wifi.WifiManager).createMulticastLock("masa").apply { setReferenceCounted(false); acquire() } }.getOrNull()
        bulucu = KameraBulucu(this) { ad, adres, kapi -> runOnUiThread {
            if (kaynaklar.any { it is WifiKameraKaynak && it.host == adres && it.port == kapi }) return@runOnUiThread
            // Yeni Wi-Fi kamerası: yer varsa kendiliğinden eklenir
            if (bosYuva() >= 0) { wifiEkle(ad, adres, kapi); tost("Wi-Fi kamera bağlandı: $ad") } else bulunan[ad] = adres to kapi
        } }.also { it.baslat() }
    }
    override fun onPause() {
        super.onPause(); Ekranlar.masaAcik = false; bulucu?.durdur(); bulucu = null; runCatching { cokluYayin?.release() }; cokluYayin = null
        if (kaydedici != null) kayitBitir(true)
        masa.onPause()
    }
    override fun onDestroy() {
        super.onDestroy(); dongu.removeCallbacksAndMessages(null); rtmp?.durdur(); runCatching { unregisterReceiver(usbDinle) }
        kaynaklar.forEach { (it as? WifiKameraKaynak)?.tally(false) }
        dongu.postDelayed({ kaynaklar.forEach { it?.durdur() } }, 0)
    }
}
