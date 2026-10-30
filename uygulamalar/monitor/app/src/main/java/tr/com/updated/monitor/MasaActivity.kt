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
        /** Masa ön plandayken MainActivity USB takılınca açılmaz */
        @Volatile var acik = false
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

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        HataKaydi.kur(this)
        kok = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        masa = MasaGorunum(this)
        masa.yuzeylerHazir = { l -> yuzeyler = l; for (i in kaynaklar.indices) kaynaklar[i]?.let { baslat(i, it) } }
        kok.addView(masa, FrameLayout.LayoutParams(-1, -1))
        katman = FrameLayout(this)
        kok.addView(katman, FrameLayout.LayoutParams(-1, -1))
        // Üst: geri · MASA · süre · kaynak ekle; sağ altta kayıt
        val ust = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(dp(12f), 0, dp(12f), 0) }
        ust.addView(etiket("‹  Kamera", 15f).apply { setOnClickListener { finish() }; contentDescription = "Kameraya dön" }, LinearLayout.LayoutParams(-2, dp(44f)))
        ust.addView(etiket("MASA", 16f, TURUNCU).apply { setPadding(dp(16f), 0, 0, 0) }, LinearLayout.LayoutParams(-2, dp(44f)))
        ust.addView(View(this), LinearLayout.LayoutParams(0, 1, 1f))
        hizli = tercih.getBoolean("masa.hizli", false)
        hizliYazi = etiket("", 14f).apply { setPadding(dp(12f), 0, dp(12f), 0); contentDescription = "Hızlı geçiş"; setOnClickListener { hizli = !hizli; tercih.edit().putBoolean("masa.hizli", hizli).apply(); duzen() } }
        if (tablet) ust.addView(hizliYazi, LinearLayout.LayoutParams(-2, dp(40f)).apply { marginEnd = dp(10f) })
        sure = etiket("", 15f).apply { typeface = mono; setPadding(dp(10f), 0, dp(10f), 0); background = Tema.kapsul(KIRMIZI, dp(12f).toFloat()); visibility = View.GONE }
        ust.addView(sure, LinearLayout.LayoutParams(-2, dp(30f)).apply { marginEnd = dp(10f) })
        masa.duzen = tercih.getInt("masa.duzen", 1).coerceIn(0, 4)
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
        kok.setOnApplyWindowInsetsListener { _, i ->
            val (u, a) = if (android.os.Build.VERSION.SDK_INT >= 30) i.getInsetsIgnoringVisibility(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout()).let { it.top to it.bottom } else 0 to 0
            ustPay = maxOf(u, dp(8f)); altPay = maxOf(a, dp(8f))
            (ust.layoutParams as FrameLayout.LayoutParams).topMargin = ustPay; (kayitDugme.layoutParams as FrameLayout.LayoutParams).bottomMargin = altPay + dp(8f)
            (denetim.layoutParams as FrameLayout.LayoutParams).bottomMargin = altPay + dp(4f)
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
        val u = ustPay + dp(56f).toFloat(); val a = altPay + dp(96f).toFloat()
        masa.ustPay = u; masa.altPay = a
        val (canliA, kucukler) = masa.alanlar(w, h, u, a)
        katman.removeAllViews()
        katman.addView(View(this).apply { background = GradientDrawable().apply { setStroke(dp(2f), if (masa.dolu[masa.canli]) KIRMIZI else Color.argb(60, 255, 255, 255)) } },
            FrameLayout.LayoutParams(canliA.width().toInt(), canliA.height().toInt()).apply { leftMargin = canliA.left.toInt(); topMargin = canliA.top.toInt() })
        katman.addView(etiket(if (masa.dolu[masa.canli]) (if (masa.etkinDuzen > 1) "CANLI · ${duzenAdi(masa.etkinDuzen)} düzen" else "CANLI · ${adlar[masa.canli]}") else "Canlı: kaynak yok", 13f, if (masa.dolu[masa.canli]) KIRMIZI else GRI).apply { gravity = Gravity.START },
            FrameLayout.LayoutParams(-2, -2).apply { leftMargin = canliA.left.toInt() + dp(10f); topMargin = canliA.top.toInt() + dp(8f) })
        kucukler.forEachIndexed { i, r ->
            val dolu = masa.dolu[i]; val canlimi = dolu && i == masa.canli
            val k = FrameLayout(this).apply {
                background = GradientDrawable().apply { cornerRadius = dp(6f).toFloat(); setColor(if (dolu) Color.TRANSPARENT else Color.argb(28, 255, 255, 255))
                    setStroke(dp(if (canlimi) 3f else 1f), if (canlimi) KIRMIZI else Color.argb(70, 255, 255, 255)) }
                contentDescription = if (dolu) "${i + 1}: ${adlar[i]}" else "Kaynak ekle"
                setOnClickListener { if (dolu) canliYap(i) else kaynakMenu() }
                setOnLongClickListener { if (dolu) yuvaMenu(i); true }
            }
            k.addView(etiket(if (dolu) "${i + 1}  ${adlar[i]}" else "+  Kaynak ekle", 12f, if (canlimi) KIRMIZI else if (dolu) Color.WHITE else GRI).apply {
                if (dolu) { gravity = Gravity.START; setPadding(dp(8f), dp(5f), dp(8f), 0) } },
                FrameLayout.LayoutParams(if (dolu) -2 else -1, if (dolu) -2 else -1, Gravity.TOP or Gravity.START))
            if (dolu && i in isolar) k.addView(kayitRozeti(), FrameLayout.LayoutParams(-2, dp(20f), Gravity.TOP or Gravity.END).apply { topMargin = dp(6f); marginEnd = dp(6f) })
            katman.addView(k, FrameLayout.LayoutParams(r.width().toInt(), r.height().toInt()).apply { leftMargin = r.left.toInt(); topMargin = r.top.toInt() })
        }
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
        val eski = masa.canli; canliYap(s); masa.siradaki = if (masa.dolu[eski] && eski != s) eski else -1; duzen()
    }

    /** Tablet klavyesi: 1–4 kaynak, boşluk KES, R kayıt */
    override fun onKeyDown(k: Int, e: android.view.KeyEvent?): Boolean {
        when (k) {
            in android.view.KeyEvent.KEYCODE_1..android.view.KeyEvent.KEYCODE_4 -> { sec(k - android.view.KeyEvent.KEYCODE_1); return true }
            android.view.KeyEvent.KEYCODE_SPACE -> { kes(); return true }
            android.view.KeyEvent.KEYCODE_R -> { kayitDugmesi(); duzen(); return true }
        }
        return super.onKeyDown(k, e)
    }

    /** Yalnız ekran testi: kaynak yokken yuvaların görünüşü için örnek adlar */
    internal fun ornekDoldur() {
        listOf("USB: Sony ILCE-7M5", "UPDATED · Pixel 8", "UPDATED · Galaxy S24").forEachIndexed { i, a -> adlar[i] = a }
        masa.dolu = booleanArrayOf(true, true, true, false); masa.canli = 0; if (tablet) masa.siradaki = 1; duzen()
    }

    private fun canliYap(i: Int) {
        masa.canli = i; if (masa.siradaki == i) masa.siradaki = -1; duzen()
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

    private fun kaynakMenu() {
        val secenekler = ArrayList<Pair<String, () -> Unit>>()
        bulunan.forEach { (ad, a) -> secenekler.add("Wi-Fi kamera: $ad" to { wifiEkle(ad, a.first, a.second) }) }
        UvcKaynak.aygitlar(this).filter { d -> kaynaklar.none { it is UvcKaynak && it.aygit.deviceName == d.deviceName } }
            .forEach { d -> secenekler.add("USB: ${d.productName ?: d.manufacturerName ?: "görüntü aygıtı"}" to { usbEkle(d) }) }
        if (kaynaklar.none { it is LunaKaynak }) secenekler.add("Insta360 Luna (kameranın Wi-Fi'ı)" to { lunaEkle() })
        secenekler.add("Adresle bağlan (ör. 192.168.1.20)" to { adresSor() })
        AlertDialog.Builder(this).setTitle("Kaynak ekle")
            .setMessage(if (bulunan.isEmpty()) "Wi-Fi kamerası: öteki telefonda UPDATED Kamera → Ayarlar → \"Wi-Fi kamera ol\". Aynı Wi-Fi'da olunca burada kendiliğinden görünür.\nUSB: makineyi \"USB yayını\" moduna alıp tak." else null)
            .setItems(secenekler.map { it.first }.toTypedArray()) { _, i -> secenekler[i].second() }
            .setNegativeButton("Kapat", null).show()
    }

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
            .setItems(arrayOf("Canlıya al", "Döndür (90°)", "Kaldır")) { _, s -> when (s) { 0 -> canliYap(i); 1 -> { y.dondur = (y.dondur + 90) % 360; masa.requestRender() }; else -> kaldir(i) } }
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

    private fun duzenAdi(d: Int) = when (d) { 0 -> "Oto"; 2 -> "2'li"; 3 -> "3'lü"; 4 -> "4'lü"; else -> "Tek" }

    /** Program düzeni: Tek (canlı kaynak), 2'li, 3'lü, 4'lü; 4K tuvalde her 1080p kaynak kendi yerinde tam boyutta. Kayıt sırasında da değişir */
    private fun duzenMenu() {
        val l = listOf(0 to "Oto: kaynak sayısına göre", 1 to "Tek: canlı kaynak tam ekran", 2 to "2'li: yan yana", 3 to "3'lü: üstte iki, altta bir", 4 to "4'lü: 2×2 ızgara")
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

    /** Kaynağın ayrı dosyası: ağdan gelen akış olduğu gibi, USB görüntü H.265 ile kodlanarak */
    private fun isoBaslat(o: KayitOturumu, i: Int, k: Kaynak): Boolean {
        val ad = "${i + 1} - ${(adlar[i] ?: k.ad).substringAfter("USB: ").substringAfter("UPDATED · ")}"
        when (k) {
            is WifiKameraKaynak -> {
                if (k.genislik <= 0) return false
                val d = o.ac(ad) ?: return false
                val a = runCatching { AkisKaydi(d, false, k.genislik, k.yukseklik, o.bas) }.getOrElse { d.bitti(false); return false }
                k.sonAyar?.let { a.ayarVer(it) }; k.kayit = a; k.anahtarIste()
                isolar[i] = { k.kayit = null; a.bitir() } to { a.bozuk }
            }
            is LunaKaynak -> {
                val d = o.ac(ad) ?: return false
                val a = runCatching { AkisKaydi(d, true, 1280, 720, o.bas) }.getOrElse { d.bitti(false); return false }
                k.kayit = a
                isolar[i] = { k.kayit = null; a.bitir() } to { a.bozuk }
            }
            is UvcKaynak -> {
                val y = masa.yuvalar[i]; val w = y.boyut[0] and 15.inv(); val h = y.boyut[1] and 15.inv()
                if (w <= 0 || h <= 0) return false
                val d = o.ac(ad) ?: return false
                val kd = runCatching { Kaydedici(this, d.pfd, w, h, k.fps, if (minOf(w, h) >= 2160) 60 else 20, true, sesIste = false).also { it.baslat() } }
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
        super.onResume(); acik = true; masa.onResume(); tamEkran()
        // Bazı telefonlar Wi-Fi'da çoklu yayın paketlerini kilit olmadan atar (kameralar bulunmaz)
        cokluYayin = runCatching { (applicationContext.getSystemService(WIFI_SERVICE) as android.net.wifi.WifiManager).createMulticastLock("masa").apply { setReferenceCounted(false); acquire() } }.getOrNull()
        bulucu = KameraBulucu(this) { ad, adres, kapi -> runOnUiThread {
            if (kaynaklar.any { it is WifiKameraKaynak && it.host == adres && it.port == kapi }) return@runOnUiThread
            // Yeni Wi-Fi kamerası: yer varsa kendiliğinden eklenir
            if (bosYuva() >= 0) { wifiEkle(ad, adres, kapi); tost("Wi-Fi kamera bağlandı: $ad") } else bulunan[ad] = adres to kapi
        } }.also { it.baslat() }
    }
    override fun onPause() {
        super.onPause(); acik = false; bulucu?.durdur(); bulucu = null; runCatching { cokluYayin?.release() }; cokluYayin = null
        if (kaydedici != null) kayitBitir(true)
        masa.onPause()
    }
    override fun onDestroy() {
        super.onDestroy(); dongu.removeCallbacksAndMessages(null); runCatching { unregisterReceiver(usbDinle) }
        kaynaklar.forEach { (it as? WifiKameraKaynak)?.tally(false) }
        dongu.postDelayed({ kaynaklar.forEach { it?.durdur() } }, 0)
    }
}
