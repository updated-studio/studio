package tr.com.updated.monitor

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.ContentValues
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.hardware.camera2.CameraMetadata
import android.net.Uri
import android.os.BatteryManager
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.os.StatFs
import android.provider.MediaStore
import android.util.Range
import android.util.Size
import android.view.Gravity
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.SeekBar
import android.widget.TextView
import android.widget.Toast
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.abs
import kotlin.math.log10
import kotlin.math.max

/**
 * UPDATED Monitör — yerleşim Blackmagic Camera düzeninde (ekip kendi tasarımına dönüştürecek; dağıtım yok, iç kullanım):
 * üstte parametre şeridi (KARE HIZI · ENSTANTANE · DİYAFRAM · zaman kodu · ISO · BEYAZ DENGESİ · EV; dokununca altta ayar şeridi),
 * solda kaynak/büyütme/odak/temiz sütunu, sağda ayarlar · kayıt düğmesi · son çekim · kalan süre, altta histogram · hızlı araçlar ·
 * ses göstergesi. Ayarlar üstte sekmeli tam ekran panel: KAYIT · MONİTÖR · KILAVUZ · LUT · ÖLÇÜM · SES · KAYNAK · KURULUM.
 */
class MainActivity : Activity() {
    enum class Kip(val ad: String) { TEK("Tek ekran"), OLCUM("Görüntü + ölçümler"), KARSILASTIR("LUT karşılaştırma"), IKI("İki kaynak") }
    enum class Sekme(val ad: String, val simge: Int) { KAYIT("KAYIT", R.drawable.ic_kayit), MONITOR("MONİTÖR", R.drawable.ic_monitor), KOMPOZISYON("KOMPOZİSYON", R.drawable.ic_kilavuz), KILAVUZ("KILAVUZ", R.drawable.ic_kadraj),
        LUT("LUT", R.drawable.ic_lut), OLCUM("ÖLÇÜM", R.drawable.ic_olcum), SES("SES", R.drawable.ic_ses), KAYNAK("KAYNAK", R.drawable.ic_kaynak), KURULUM("KURULUM", R.drawable.ic_bilgi) }
    enum class Param { FPS, ENSTANTANE, DIYAFRAM, ISO, WB, EV, ODAK, SAHNE }

    // Renkler (Blackmagic düzeni: siyah şeritler, gri etiket, beyaz değer, kırmızı kayıt)
    private val SIYAH = Color.BLACK; private val GRI = Color.rgb(140, 140, 140); private val KOYU = Color.rgb(30, 30, 30); private val KOYU2 = Color.rgb(44, 44, 44)
    private val KIRMIZI = Color.rgb(230, 40, 40); private val SARI = Color.rgb(255, 107, 26) /* UPDATED turuncusu */
    private val dar: Typeface by lazy { runCatching { resources.getFont(R.font.plex_kosul_600) }.getOrDefault(Typeface.create("sans-serif-condensed", Typeface.BOLD)) }
    /** PRO (telefon kamerası, Blackmagic düzeni) mı, Monitör (dış kamera: USB/HDMI, ağ yayını) mü; ikisi ayrı ayarlar tutar */
    private val proMod by lazy { intent.getStringExtra("mod") == "pro" }
    /** Geniş telefon (en dar kenar ≥ 400 dp): düğmelerde simgenin altında küçük ad da yazar; daha küçükte yalnız simge (basılı tutunca ad) */
    private val genisEkran: Boolean get() = resources.configuration.smallestScreenWidthDp >= 400
    private val dikeyEkran: Boolean get() = resources.configuration.orientation == android.content.res.Configuration.ORIENTATION_PORTRAIT
    private var tcDikey: TextView? = null

    private lateinit var ust: LinearLayout; private lateinit var alt: LinearLayout; private lateinit var sol: LinearLayout; private lateinit var sag: LinearLayout
    private lateinit var bolmeler: LinearLayout; private lateinit var orta: FrameLayout; private lateinit var serit: LinearLayout
    private lateinit var kose: OlcumGorunum; private lateinit var ses: SesGostergesi; private lateinit var kayitDugme: KayitDugmesi
    private lateinit var sonCekim: ImageView; private lateinit var kalanYazi: TextView; private lateinit var panel: FrameLayout; private lateinit var tcYazi: TextView

    private val monitorler = arrayOfNulls<MonitorGorunum>(2)
    private val kaynaklar = arrayOfNulls<Kaynak>(2)
    private val kaynakAdi = arrayOf("", "")
    /** Ağdaki Wi-Fi kameraları (Masa ile aynı yayın): ad → adres, kapı */
    private val wifiKameralar = LinkedHashMap<String, Pair<String, Int>>()
    private var wifiBulucu: KameraBulucu? = null
    private var cokluYayin: android.net.wifi.WifiManager.MulticastLock? = null
    private val ayarlar = arrayOf(Ayarlar(), Ayarlar())
    private val kamAyar = arrayOf(KameraAyari(), KameraAyari())
    private val sonYuzey = arrayOfNulls<android.view.Surface>(2)
    private val acici = arrayOfNulls<(() -> Unit)>(2)
    private var olcum: OlcumGorunum? = null
    private var kip = Kip.TEK; private var etkin = 0; private var arayuzAcik = true
    private var koseHisto = true; private var parlaklikTam = false; private var sesGosterge = true
    private var hevc = true; private var mbps = 50; private var sesKayit = true
    private var fotoMod = false; private var zamanlayici = 0; private var deklansorSesi = true; private var sonMime = "video/mp4"
    private var geriSayiliyor = false
    // Sahneler: seçili sahne, otomatik öneri, ışık izi süresi
    private var sahne = Sahne.KAPALI; private var sahneOto = false; private var izSure = 10
    @Volatile private var yercekimZ = 0f; @Volatile private var renkOrt = floatArrayOf(0f, 0f, 0f)
    private var sahneOnerisi: Sahne? = null
    private lateinit var sahneCip: TextView
    private lateinit var geriSayimYazi: TextView
    private val deklansor by lazy { android.media.MediaActionSound().also { it.load(android.media.MediaActionSound.SHUTTER_CLICK) } }
    private var kayitBas = 0L; private var kayitUri: Uri? = null; private var sonUri: Uri? = null
    private var acikParam: Param? = null
    /** USB görüntü ve ağ yayınının kaydı (telefon kamerası kendi MediaRecorder'ıyla kaydeder) */
    private var kaydedici: Kaydedici? = null
    private fun kayitSuruyor() = kamera()?.kayitta == true || kaydedici != null
    private lateinit var katman: FrameLayout
    private var onde = false
    // Kompozisyon (Fatih'in fikri): kılavuz, akıllı yardımcı (konu algılama + ibre), terazi, öneri
    private val kompler = arrayOfNulls<KompozisyonGorunum>(2)
    private val oneriCip = arrayOfNulls<TextView>(2)
    private var kompTur = KompTur.KAPALI; private var kompYon = 0; private var sonKomp = KompTur.SPIRAL
    private var asistanAcik = false; private var teraziAcik = false; private var oneriAcik = true
    private var asistan: Asistan? = null
    private val analiz = GoruntuAnaliz(); private var sonYuz: YuzBilgi? = null; private val ipucuSabit = IpucuSabitle()
    private var sonOneri: Pair<KompTur, Int>? = null
    private val sensorler by lazy { getSystemService(SENSOR_SERVICE) as android.hardware.SensorManager }
    private val teraziDinle = object : android.hardware.SensorEventListener {
        override fun onSensorChanged(e: android.hardware.SensorEvent) {
            @Suppress("DEPRECATION") val don = windowManager.defaultDisplay.rotation
            val (x, y) = e.values[0] to e.values[1]
            val aci = Math.toDegrees(if (don == android.view.Surface.ROTATION_270) kotlin.math.atan2(-y.toDouble(), -x.toDouble()) else kotlin.math.atan2(y.toDouble(), x.toDouble())).toFloat()
            kompler[etkin]?.egim = if (teraziAcik) aci else null
            yercekimZ = e.values[2]
        }
        override fun onAccuracyChanged(s: android.hardware.Sensor?, a: Int) {}
    }
    private val bekleyenAcma = booleanArrayOf(false, false)
    private var bekleyenKamera: Pair<Int, Pair<String, String>>? = null
    private val tercih by lazy { getSharedPreferences(if (proMod) "pro" else "monitor", MODE_PRIVATE) }
    private val dongu = Handler(Looper.getMainLooper())
    private val lutKlasoru by lazy { File(filesDir, "lut").also { it.mkdirs() } }
    private val sesOlcer = SesOlcer { l, r -> runOnUiThread { if (this::ses.isInitialized) ses.ayarla(l, r) } }

    private fun dp(v: Float) = Tema.dp(this, v)
    /** Görüntünün üstündeki yazılar: açık sahnede de okunsun diye yumuşak koyu gölge */
    private fun golge(t: TextView) = t.setShadowLayer(dp(3f).toFloat(), 0f, dp(1f).toFloat(), Color.argb(200, 0, 0, 0))
    private fun kamera(): KameraKaynak? = kaynaklar[etkin] as? KameraKaynak

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        // Masa açıkken takılan USB kamera masaya eklenir (MasaActivity kendisi dinler); Monitör üstüne açılmasın
        if (intent?.action == android.hardware.usb.UsbManager.ACTION_USB_DEVICE_ATTACHED && Ekranlar.masaAcik) { finish(); return }
        // Kamera uygulamasında Monitör yok (yalnız UpCam Studio'da); burada yalnız PRO ekranı açılır
        if (!proMod && !Ekranlar.masaUygulamasi(this) && android.os.Build.FINGERPRINT != "robolectric") { finish(); return }
        HataKaydi.kur(this)
        ayarlariOku()
        kip = runCatching { Kip.valueOf(tercih.getString("kip2", "TEK")!!) }.getOrDefault(Kip.TEK) // Monitör de tam ekran görüntüyle açılır (ölçümler DÜZEN'den)
        koseHisto = tercih.getBoolean("koseHisto", true); parlaklikTam = tercih.getBoolean("parlaklik", false); sesGosterge = tercih.getBoolean("sesGosterge", true)
        hevc = tercih.getBoolean("hevc", true); mbps = tercih.getInt("mbps", 50); sesKayit = tercih.getBoolean("sesKayit", true)
        sahne = runCatching { Sahne.valueOf(tercih.getString("sahne", "KAPALI")!!) }.getOrDefault(Sahne.KAPALI); sahneOto = tercih.getBoolean("sahneOto", false); izSure = tercih.getInt("izSure", 10)
        fotoMod = tercih.getBoolean("fotoMod", false); zamanlayici = tercih.getInt("zamanlayici", 0); deklansorSesi = tercih.getBoolean("deklansorSesi", true)
        kompTur = runCatching { KompTur.valueOf(tercih.getString("komp", "KAPALI")!!) }.getOrDefault(KompTur.KAPALI); kompYon = tercih.getInt("kompYon", 0)
        sonKomp = runCatching { KompTur.valueOf(tercih.getString("sonKomp", "SPIRAL")!!) }.getOrDefault(KompTur.SPIRAL)
        asistanAcik = tercih.getBoolean("asistan", false); teraziAcik = tercih.getBoolean("terazi", false); oneriAcik = tercih.getBoolean("oneri", true)

        if (!proMod) fotoMod = false // Monitör: dış kaynak, yalnız video kaydı
        sonYon = resources.configuration.orientation
        iskelet()
        tamEkran(); parlaklik()
        kur()
        dongu.post(object : Runnable { override fun run() { tik(); dongu.postDelayed(this, 40) } })
    }

    /** Ekran düzeni: yatayda Blackmagic yerleşimi; dikeyde üstte zaman kodu + parametreler, görüntü, araçlar, altta kayıt sırası */
    private fun iskelet() {
        val d = dikeyEkran
        val kok = FrameLayout(this).apply { setBackgroundColor(SIYAH) }
        val dikey = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        orta = FrameLayout(this)
        // Görüntü bütün ekranı kaplar (güvenli alan payı yalnız düğmelere), şeritler üstünde
        kok.addView(orta, FrameLayout.LayoutParams(-1, -1))
        // Şeritlerin altında kenardan içeri doğru açılan saydam kararma: menüler ve yazılar her görüntüde okunur
        fun karartma(yon: GradientDrawable.Orientation, en: Int, boy: Int, yer: Int) = kok.addView(View(this).apply {
            background = GradientDrawable(yon, intArrayOf(Color.argb(170, 0, 0, 0), Color.argb(90, 0, 0, 0), Color.TRANSPARENT)) }, FrameLayout.LayoutParams(en, boy, yer))
        if (d) {
            karartma(GradientDrawable.Orientation.TOP_BOTTOM, -1, dp(130f), Gravity.TOP)
            karartma(GradientDrawable.Orientation.BOTTOM_TOP, -1, dp(290f), Gravity.BOTTOM)
        } else {
            karartma(GradientDrawable.Orientation.TOP_BOTTOM, -1, dp(100f), Gravity.TOP)
            karartma(GradientDrawable.Orientation.BOTTOM_TOP, -1, dp(110f), Gravity.BOTTOM)
            karartma(GradientDrawable.Orientation.LEFT_RIGHT, dp(120f), -1, Gravity.START)
            karartma(GradientDrawable.Orientation.RIGHT_LEFT, dp(150f), -1, Gravity.END)
        }
        kok.addView(dikey, FrameLayout.LayoutParams(-1, -1))
        if (d) {
            tcDikey = TextView(this).apply { textSize = 24f; typeface = runCatching { resources.getFont(R.font.plex_mono_500) }.getOrDefault(Typeface.MONOSPACE); setTextColor(Color.WHITE); gravity = Gravity.CENTER; golge(this) }
            dikey.addView(tcDikey, LinearLayout.LayoutParams(-1, dp(38f)))
        } else tcDikey = null
        ust = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        dikey.addView(ust, LinearLayout.LayoutParams(-1, dp(if (d) 48f else 54f)))
        val yatay = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        dikey.addView(yatay, LinearLayout.LayoutParams(-1, 0, 1f))
        sol = LinearLayout(this).apply { orientation = if (d) LinearLayout.HORIZONTAL else LinearLayout.VERTICAL; gravity = Gravity.CENTER
            if (d) setPadding(dp(8f), dp(4f), dp(8f), dp(6f)) else setPadding(0, dp(4f), 0, dp(4f)) }
        // Dikeyde sık kullanılan düğmeler altta, başparmağın ulaştığı yerde (üstte yalnız zaman kodu ve değerler)
        if (d) dikey.addView(sol, LinearLayout.LayoutParams(-1, dp(if (genisEkran) 58f else 50f))) else yatay.addView(sol, LinearLayout.LayoutParams(dp(72f), -1))
        bolmeler = LinearLayout(this).apply { orientation = if (d) LinearLayout.VERTICAL else LinearLayout.HORIZONTAL }
        orta.addView(bolmeler, FrameLayout.LayoutParams(-1, -1))
        // Şerit, geri sayım ve öneri etiketi şeritlerin arasındaki saydam alanda (dokunuş görüntüye geçer)
        katman = FrameLayout(this)
        // Ses göstergesi: küçük, alt şeridin hemen üstünde solda (görüntünün ortasını kapatmaz; ayar şeridi açılınca altında kalır)
        ses = SesGostergesi(this)
        katman.addView(ses, FrameLayout.LayoutParams(dp(if (d) 72f else 96f), dp(if (d) 14f else 16f), Gravity.BOTTOM or Gravity.START).apply { marginStart = dp(14f); bottomMargin = dp(10f) })
        serit = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(Color.argb(225, 18, 18, 18)); visibility = View.GONE; setPadding(dp(12f), dp(8f), dp(12f), dp(10f)); isClickable = true }
        katman.addView(serit, FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM))
        geriSayimYazi = TextView(this).apply { textSize = 96f; setTextColor(Color.WHITE); typeface = Typeface.create("sans-serif-condensed", Typeface.BOLD); setShadowLayer(12f, 0f, 0f, Color.BLACK); visibility = View.GONE }
        katman.addView(geriSayimYazi, FrameLayout.LayoutParams(-2, -2, Gravity.CENTER))
        sahneCip = TextView(this).apply { visibility = View.GONE; textSize = 13f; typeface = dar; setTextColor(Color.BLACK); setPadding(dp(14f), dp(8f), dp(14f), dp(8f)); background = Tema.kapsul(Color.rgb(120, 200, 255), dp(16f).toFloat())
            setOnClickListener { sahneOnerisi?.let { sahneSec(it) }; visibility = View.GONE } }
        Tema.simge(sahneCip, R.drawable.ic_sahne, Color.BLACK, 16f)
        katman.addView(sahneCip, FrameLayout.LayoutParams(-2, -2, Gravity.TOP or Gravity.START).apply { topMargin = dp(10f); marginStart = dp(10f) })
        yatay.addView(katman, LinearLayout.LayoutParams(0, -1, 1f))
        sag = LinearLayout(this).apply { orientation = if (d) LinearLayout.HORIZONTAL else LinearLayout.VERTICAL; gravity = if (d) Gravity.CENTER_VERTICAL else Gravity.CENTER_HORIZONTAL; if (d) setPadding(dp(10f), dp(10f), dp(10f), dp(10f)) else setPadding(dp(10f), dp(2f), dp(10f), dp(2f)) }
        alt = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(dp(10f), 0, dp(10f), 0) }
        if (d) { dikey.addView(alt, LinearLayout.LayoutParams(-1, dp(56f))); dikey.addView(sag, LinearLayout.LayoutParams(-1, dp(104f))) }
        else { yatay.addView(sag, LinearLayout.LayoutParams(dp(96f), -1)); dikey.addView(alt, LinearLayout.LayoutParams(-1, dp(62f))) }
        panel = FrameLayout(this).apply { visibility = View.GONE; setBackgroundColor(Color.rgb(22, 22, 22)); isClickable = true }
        kok.addView(panel, FrameLayout.LayoutParams(-1, -1))
        // Güvenli alan: çentik / kamera deliği ve gezinme çubuğu payı (her telefonun kendi değeri); Monitör'de görüntüye uygulanmaz
        kok.setOnApplyWindowInsetsListener { v, i ->
            val (l, t, r, b) = if (android.os.Build.VERSION.SDK_INT >= 30) {
                val c = i.getInsets(WindowInsets.Type.displayCutout()); val n = i.getInsetsIgnoringVisibility(WindowInsets.Type.navigationBars())
                listOf(maxOf(c.left, n.left), c.top, maxOf(c.right, n.right), maxOf(c.bottom, n.bottom))
            } else { val c = i.displayCutout; listOf(c?.safeInsetLeft ?: 0, c?.safeInsetTop ?: 0, c?.safeInsetRight ?: 0, c?.safeInsetBottom ?: 0) }
            dikey.setPadding(l, t, r, b); panel.setPadding(l, t, r, b)
            i
        }
        setContentView(kok)
        sagCiz(); altCiz()
    }

    private var sonYon = 0
    override fun onConfigurationChanged(c: android.content.res.Configuration) {
        super.onConfigurationChanged(c)
        if (c.orientation == sonYon) return
        if (kayitSuruyor()) return // kayıt sürerken düzen değişmez (görüntü yine doğru döner)
        sonYon = c.orientation
        val panelAcik = panel.visibility == View.VISIBLE
        kaynaklar.forEach { it?.durdur() }; kaynaklar.fill(null)
        monitorler.forEach { it?.onPause() }
        iskelet(); kur(); if (panelAcik) panelAc(sekme)
    }

    private fun tamEkran() {
        if (android.os.Build.VERSION.SDK_INT >= 30) window.insetsController?.let { it.hide(WindowInsets.Type.systemBars()); it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE }
        else @Suppress("DEPRECATION") { window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY }
    }
    private fun parlaklik() { window.attributes = window.attributes.apply { screenBrightness = if (parlaklikTam) 1f else -1f } }
    private fun tost(m: String) = Toast.makeText(this, m, Toast.LENGTH_LONG).show()

    /* ================= bölmeler ================= */
    private fun kur() {
        if (kayitSuruyor()) return tost("Kayıt sürerken görünüm değişmez.")
        kaynaklar.forEach { it?.durdur() }; kaynaklar.fill(null)
        monitorler.forEach { it?.onPause() }; monitorler.fill(null)
        bolmeler.removeAllViews(); olcum = null
        val sayi = if (kip == Kip.IKI) 2 else 1
        val d = dikeyEkran
        for (i in 0 until sayi) bolmeler.addView(bolmeYap(i), if (d) LinearLayout.LayoutParams(-1, 0, 1f) else LinearLayout.LayoutParams(0, -1, 1f))
        if (kip == Kip.OLCUM) { val o = OlcumGorunum(this); olcum = o; bolmeler.addView(o, if (d) LinearLayout.LayoutParams(-1, 0, 1.1f) else LinearLayout.LayoutParams(0, -1, 0.7f)) }
        monitorler[0]?.karsilastir = kip == Kip.KARSILASTIR
        etkin = 0; olcumBagla(); arayuzCiz()
        for (i in 0 until sayi) {
            when (tercih.getString("kaynak$i", null) ?: if (i == 0) "kamera" else null) {
                "kamera" -> {
                    // PRO: Kamera ekranında seçili telefon kamerası; Monitör: USB görüntü (HDMI çevirici)
                    val l = kaynakKameralari()
                    val id = (if (proMod && i == 0) intent.getStringExtra("kamera") else null) ?: tercih.getString("kamera$i", null)
                    val k = l.firstOrNull { it.first == id } ?: l.firstOrNull()
                    // Android'in harici kamera desteği yoksa doğrudan USB sürücüsüyle (UVC)
                    val uvc = if (!proMod && i == 0 && k == null) UvcKaynak.aygitlar(this).firstOrNull() else null
                    if (k != null) kameraAc(i, k) else if (uvc != null) uvcAc(i, uvc) else if (!proMod && i == 0) dongu.postDelayed({ usbTani() }, 600)
                }
                "ag" -> tercih.getString("ag$i", null)?.let { agAc(i, it) }
                "wifi" -> { val ad = tercih.getString("wifiAd$i", null); val h = tercih.getString("wifi$i", null)?.split(":")
                    if (ad != null && h != null && h.size == 2) wifiAc(i, ad, h[0], h[1].toIntOrNull() ?: AgYayin.KAPI) }
                "uvc" -> UvcKaynak.aygitlar(this).firstOrNull { "%04x:%04x".format(it.vendorId, it.productId) == tercih.getString("uvc$i", null) }?.let { uvcAc(i, it) }
                    ?: if (i == 0) UvcKaynak.aygitlar(this).firstOrNull()?.let { uvcAc(i, it) } else null
            }
            ayarlar[i].takeIf { it.lutAcik && it.lutAdi.isNotEmpty() }?.let { a -> runCatching { File(lutKlasoru, a.lutAdi).inputStream().use { Lut.oku(a.lutAdi, it) } }.getOrNull()?.let { monitorler[i]?.lutYukle(it) } }
        }
    }

    /** Yardımcıdan gelen konu: katmana, öneriye */
    /** Yön tarifi: konu, yüz ve görüntü analizinden tek satır (titremesin diye sabitlenir) */
    private fun ipucuGuncelle() {
        val kk = kompler[etkin] ?: return
        kk.ipucu = if (!asistanAcik || kamera()?.kayitta == true) null
            else ipucuSabit.ver(ipucuUret(kk.konu, kk.konuAdi, sonYuz.takeIf { kk.konuAdi == "Yüz" }, kk.analiz, kk.hedefNokta, kk.hizalama))
    }

    private fun asistanSonuc(r: android.graphics.RectF?, ad: String) {
        val kk = kompler[etkin] ?: return
        kk.konu = r; kk.konuAdi = ad
        if (kompTur == KompTur.KAPALI && r != null) { kompTur = sonKomp; kompUygula() } // yardımcı açıkken bir kılavuz gerekir
        val cip = oneriCip[etkin] ?: return
        val o = if (oneriAcik) kompozisyonOner(r, kompTur, kk.goruntuOrani(), kk.analiz) else null
        sonOneri = o
        if (o == null || kk.hizalama > 0.85f) cip.visibility = View.GONE
        else { cip.text = "ÖNERİ: ${o.first.ad}  ›  UYGULA"; cip.visibility = View.VISIBLE }
        ipucuGuncelle()
    }

    private fun kompUygula() {
        kompler.forEach { it?.apply { tur = kompTur; yon = kompYon; asistan = asistanAcik } }
        tercih.edit().putString("komp", kompTur.name).putInt("kompYon", kompYon).putString("sonKomp", sonKomp.name).putBoolean("asistan", asistanAcik).putBoolean("terazi", teraziAcik).putBoolean("oneri", oneriAcik).apply()
        teraziKaydi(); olcumBagla()
        if (this::alt.isInitialized) altCiz()
    }

    private fun teraziKaydi() {
        sensorler.unregisterListener(teraziDinle)
        if ((teraziAcik || sahneOto) && onde) sensorler.getDefaultSensor(android.hardware.Sensor.TYPE_GRAVITY)?.let { sensorler.registerListener(teraziDinle, it, android.hardware.SensorManager.SENSOR_DELAY_UI) }
        if (!teraziAcik) kompler.forEach { it?.egim = null }
    }

    private fun olcumBagla() {
        if (asistanAcik && asistan == null) asistan = Asistan { r, ad, yuz -> runOnUiThread { sonYuz = yuz; asistanSonuc(r, ad) } }
        if (!asistanAcik) { asistan?.kapat(); asistan = null; kompler.forEach { it?.konu = null; it?.analiz = null; it?.ipucu = null }; oneriCip.forEach { it?.visibility = View.GONE } }
        monitorler.forEachIndexed { i, m -> m?.olcumKaresi = if (i == etkin && (olcum != null || koseHisto || asistanAcik || sahneOto)) { buf, w, h -> olcum?.kare(buf, w, h); if (koseHisto) kose.kare(buf, w, h); if (ayarlar[i].zoom == 1f) { asistan?.kare(buf, w, h); if (asistanAcik) kompler[i]?.let { kk -> analiz.kare(buf, w, h, kk.goruntuOrani()) { s -> runOnUiThread { kk.analiz = s; ipucuGuncelle() } } } }; if (sahneOto) renkOlc(buf, w, h) } else null }
        if (this::kose.isInitialized) kose.visibility = if (koseHisto) View.VISIBLE else View.INVISIBLE
    }

    /** Kabaca ortalama renk (her 8. piksel): gün batımı önerisi için */
    private fun renkOlc(b: java.nio.ByteBuffer, w: Int, h: Int) {
        var r = 0L; var g = 0L; var bl = 0L; var n = 0
        var i = 0; val son = w * h * 4
        while (i < son) { r += b.get(i).toInt() and 255; g += b.get(i + 1).toInt() and 255; bl += b.get(i + 2).toInt() and 255; n++; i += 32 }
        if (n > 0) renkOrt = floatArrayOf(r / (255f * n), g / (255f * n), bl / (255f * n))
    }

    private fun sahneSec(s: Sahne) {
        sahne = s; tercih.edit().putString("sahne", s.name).apply()
        for (i in 0..1) (kaynaklar[i] as? KameraKaynak)?.let { it.sahne = s; it.ayarDegisti() }
        sahneCip.visibility = View.GONE
        if (s != Sahne.KAPALI && !fotoMod && s in setOf(Sahne.ISIK_IZI, Sahne.SAMANYOLU, Sahne.GECE)) tost("${s.ad}: en iyi sonuç FOTO modunda.")
        solCiz(); if (acikParam == Param.SAHNE) seritAc(Param.SAHNE)
    }

    /** Saniyede bir: otomatik sahne önerisi (yalnız otomatik pozlamada anlamlı) */
    private fun sahneDenetle() {
        if (!sahneOto) { if (this::sahneCip.isInitialized) sahneCip.visibility = View.GONE; return }
        val k = kamera() ?: return; val a = kamAyar[etkin]
        val otoPoz = a.iso == null && a.pozlamaNs == null && k.sonIso > 0 && k.sonPozNs > 0
        val r = renkOrt; val konu = kompler[etkin]
        val yuz = asistanAcik && konu?.konuAdi == "Yüz" && (konu.konu?.let { it.width() * it.height() } ?: 0f) > 0.05f
        val o = sahneOner(SahneOlcum(if (otoPoz) k.sonIso * k.sonPozNs / 1e9f else null, yercekimZ < -5f, 0.2126f * r[0] + 0.7152f * r[1] + 0.0722f * r[2], if (r[2] > 0.01f) r[0] / r[2] else 1f, yuz))
        sahneOnerisi = o
        if (o == null || o == sahne) sahneCip.visibility = View.GONE else { sahneCip.text = "SAHNE: ${o.ad}  ›  UYGULA"; sahneCip.visibility = View.VISIBLE }
    }

    private fun bolmeYap(i: Int): View {
        val m = MonitorGorunum(this).also { it.ayarlar = ayarlar[i]; it.doldur = true }
        monitorler[i] = m; sonYuzey[i] = null; acici[i] = null
        m.yuzeyHazir = { y -> sonYuzey[i] = y; acici[i]?.invoke() }
        val kutu = FrameLayout(this); kutu.addView(m, FrameLayout.LayoutParams(-1, -1))
        val kk = KompozisyonGorunum(this) { m.goruntuAlani() }.also { it.tur = kompTur; it.yon = kompYon; it.asistan = asistanAcik }
        kompler[i] = kk
        kutu.addView(kk, FrameLayout.LayoutParams(-1, -1))
        val cip = TextView(this).apply { visibility = View.GONE; textSize = 13f; typeface = dar; setTextColor(Color.BLACK); setPadding(dp(14f), dp(8f), dp(14f), dp(8f)); background = Tema.kapsul(SARI, dp(16f).toFloat())
            setOnClickListener { sonOneri?.let { (t, y) -> kompTur = t; kompYon = y; sonKomp = t; kompUygula(); visibility = View.GONE } } }
        oneriCip[i] = cip
        kutu.addView(cip, FrameLayout.LayoutParams(-2, -2, Gravity.TOP or Gravity.CENTER_HORIZONTAL).apply { topMargin = dp(10f) })
        m.setOnClickListener {
            when {
                serit.visibility == View.VISIBLE -> seritKapat()
                etkin != i && kip == Kip.IKI -> { etkin = i; olcumBagla(); arayuzCiz() }
                else -> { arayuzAcik = !arayuzAcik; arayuzCiz() }
            }
        }
        return kutu
    }

    private fun arayuzCiz() {
        val g = if (arayuzAcik) View.VISIBLE else View.INVISIBLE
        alt.visibility = g; sol.visibility = g
        ust.visibility = g; tcDikey?.visibility = g
        for (i in 0 until bolmeler.childCount) bolmeler.getChildAt(i).foreground = if (kip == Kip.IKI && i == etkin && monitorler.getOrNull(i) != null) GradientDrawable().apply { setStroke(dp(2f), SARI) } else null
        ustCiz(); solCiz(); altCiz()
    }

    /* ================= üst parametre şeridi ================= */
    private fun hucre(etiket: String, deger: String, agirlik: Float = 1f, p: Param? = null, renk: Int = Color.WHITE, buyuk: Boolean = false): TextView? {
        val k = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
            if (p != null) { setOnClickListener { if (acikParam == p) seritKapat() else seritAc(p) }; if (acikParam == p) setBackgroundColor(KOYU2) } }
        if (etiket.isNotEmpty()) k.addView(TextView(this).apply { text = etiket; textSize = 10f; setTextColor(Color.argb(215, 255, 255, 255)); typeface = dar; letterSpacing = 0.08f; gravity = Gravity.CENTER; isSingleLine = true; golge(this) })
        val v = TextView(this).apply { text = deger; gravity = Gravity.CENTER; textSize = if (buyuk) 24f else 17f; setTextColor(renk); typeface = if (buyuk) Typeface.create("sans-serif-condensed", Typeface.BOLD) else dar; isSingleLine = true; golge(this) }
        k.addView(v)
        ust.addView(k, LinearLayout.LayoutParams(0, -1, agirlik))
        return v
    }

    private fun ustCiz() {
        ust.removeAllViews()
        val k = kamera(); val a = kamAyar[etkin]
        val ag = kaynaklar[etkin] is AgKaynak || kaynaklar[etkin] is UvcKaynak || kaynaklar[etkin] is WifiKameraKaynak
        val fps = when { ag -> "—"; a.fps != null -> if (a.fps!!.lower == a.fps!!.upper) "${a.fps!!.upper}" else "${a.fps!!.lower}–${a.fps!!.upper}"; else -> "OTO" }
        val fpsSayi = a.fps?.upper ?: 30
        val ens = when { ag || k == null -> "—"; a.pozlamaNs == null -> "OTO"; else -> { val t = a.pozlamaNs!! / 1e9; val aci = 360.0 * fpsSayi * t; if (abs(aci - 180) < 6 && !fotoMod) "180°" else if (t >= 1) "${t.toInt()} sn" else "1/${(1 / t).toInt()}" } }
        val d = dikeyEkran
        hucre(if (d) "FPS" else "KARE HIZI", fps, p = Param.FPS)
        hucre(if (d) "ENST." else "ENSTANTANE", ens, p = Param.ENSTANTANE)
        hucre(if (d) "DİYAF." else "DİYAFRAM", k?.yetenek?.diyafram?.let { "f/" + "%.1f".format(it).replace('.', ',') } ?: "—", p = Param.DIYAFRAM)
        val tc = tcDikey
        if (d && tc != null) { tcYazi = tc; tc.setTextColor(if (kayitSuruyor()) KIRMIZI else Color.WHITE) }
        else tcYazi = hucre("", "00:00:00:00", 1.9f, renk = if (kayitSuruyor()) KIRMIZI else Color.WHITE, buyuk = true)!!
        hucre("ISO", if (ag || k == null) "—" else a.iso?.toString() ?: "OTO", p = Param.ISO)
        hucre(if (d) "BD" else "BEYAZ DENGESİ", if (ag || k == null) "—" else a.kelvin?.let { "${it}K" + if (a.ton != 0) (if (a.ton < 0) " Y${-a.ton}" else " M${a.ton}") else "" } ?: WB_ADLARI[a.awb] ?: "OTO", p = Param.WB)
        hucre(if (d) "POZ." else "POZLAMA", if (ag || k == null) "—" else if (a.ev == 0) "0" else "%+.1f".format(a.ev * (k.yetenek.evAdim.takeIf { it > 0 } ?: 1f)).replace('.', ','), p = Param.EV)
    }

    private val WB_ADLARI = mapOf(CameraMetadata.CONTROL_AWB_MODE_AUTO to "OTO", CameraMetadata.CONTROL_AWB_MODE_DAYLIGHT to "5600K", CameraMetadata.CONTROL_AWB_MODE_CLOUDY_DAYLIGHT to "6500K",
        CameraMetadata.CONTROL_AWB_MODE_INCANDESCENT to "3200K", CameraMetadata.CONTROL_AWB_MODE_FLUORESCENT to "4000K", CameraMetadata.CONTROL_AWB_MODE_SHADE to "7500K", CameraMetadata.CONTROL_AWB_MODE_TWILIGHT to "Alacakaranlık")

    /* ---------- ayar şeridi (parametreye dokununca altta açılır) ---------- */
    private fun seritKapat() { serit.visibility = View.GONE; acikParam = null; ustCiz(); solCiz() }

    private fun seritAc(p: Param) {
        acikParam = p; serit.removeAllViews(); serit.visibility = View.VISIBLE; ustCiz(); solCiz()
        val k = kamera()
        val baslik = mapOf(Param.FPS to "KARE HIZI", Param.ENSTANTANE to "ENSTANTANE", Param.DIYAFRAM to "DİYAFRAM", Param.ISO to "ISO", Param.WB to "BEYAZ DENGESİ", Param.EV to "POZLAMA TELAFİSİ", Param.ODAK to "ODAK", Param.SAHNE to "SAHNE")[p]!!
        serit.addView(TextView(this).apply { text = baslik; textSize = 11f; setTextColor(GRI); typeface = dar; letterSpacing = 0.1f; setPadding(0, 0, 0, dp(6f)) })
        if (k == null) { serit.addView(TextView(this).apply { text = "Bu ayar yalnız kamera ve USB kaynaklarında var."; setTextColor(Color.WHITE) }); return }
        val y = k.yetenek; val a = kamAyar[etkin]
        val satir = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        fun c(ad: String, secili: Boolean, is_: () -> Unit) = satir.addView(Tema.dugme(this, ad, secili, kucuk = true).apply {
            background = Tema.kapsul(if (secili) Color.WHITE else KOYU2, dp(6f).toFloat()); setTextColor(if (secili) Color.BLACK else Color.WHITE); typeface = dar
            setOnClickListener { is_(); kameraAyarKaydet(); seritAc(p) } }, LinearLayout.LayoutParams(-2, -2).apply { marginEnd = dp(6f) })
        when (p) {
            Param.SAHNE -> {
                c(if (sahneOto) "OTOMATİK ÖNERİ ✓" else "OTOMATİK ÖNERİ", sahneOto) { sahneOto = !sahneOto; tercih.edit().putBoolean("sahneOto", sahneOto).apply(); teraziKaydi(); olcumBagla() }
                Sahne.values().forEach { sh -> c(sh.ad, sahne == sh) { sahneSec(sh) } }
                serit.addView(HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false; addView(satir) })
                if (sahne == Sahne.ISIK_IZI) {
                    val sr = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setPadding(0, dp(6f), 0, 0) }
                    intArrayOf(5, 10, 20, 30, 60).forEach { sn -> sr.addView(Tema.dugme(this, "$sn sn", izSure == sn, kucuk = true).apply {
                        background = Tema.kapsul(if (izSure == sn) Color.WHITE else KOYU2, dp(6f).toFloat()); setTextColor(if (izSure == sn) Color.BLACK else Color.WHITE); typeface = dar
                        setOnClickListener { izSure = sn; tercih.edit().putInt("izSure", sn).apply(); seritAc(p) } }, LinearLayout.LayoutParams(-2, -2).apply { marginEnd = dp(6f) }) }
                    serit.addView(sr)
                }
                val ek = when (sahne) {
                    Sahne.SAMANYOLU -> if (k.uzunPozlamaVar) " Bu telefon uzun pozlama veriyor: tek çekim, en çok 15 sn." else " Bu telefon uzun pozlama vermiyor: 16 kare birleştirilir."
                    Sahne.GECE -> if (k.sahneModuVar(CameraMetadata.CONTROL_SCENE_MODE_NIGHT)) " Telefonun kendi gece modu kullanılıyor." else " 8 kare birleştirilir; telefonu sabit tut."
                    else -> ""
                }
                serit.addView(TextView(this).apply { text = sahne.aciklama + ek + if (sahneOto) " Otomatik öneri açık: uygun sahne üstte mavi etiketle önerilir." else ""; textSize = 12f; setTextColor(GRI); setPadding(0, dp(6f), 0, 0) })
                return
            }
            Param.FPS -> { c("OTO", a.fps == null) { a.fps = null; k.oturumYenile { w, h -> monitorler[etkin]?.tampon(w, h) } }
                y.fpsler.forEach { r -> c(if (r.lower == r.upper) "${r.upper}" else "${r.lower}–${r.upper}", a.fps == r) { a.fps = r; k.oturumYenile { w, h -> monitorler[etkin]?.tampon(w, h) } } } }
            Param.ENSTANTANE -> {
                if (!y.elleKontrol) satir.addView(TextView(this).apply { text = "Bu kamera el ile enstantaneyi desteklemiyor."; setTextColor(Color.WHITE) })
                else { c("OTO", a.pozlamaNs == null) { a.pozlamaNs = null; k.ayarDegisti() }
                    val fps = a.fps?.upper ?: 30
                    c("180° (1/${fps * 2})", a.pozlamaNs == 1_000_000_000L / (fps * 2)) { a.pozlamaNs = 1_000_000_000L / (fps * 2); k.ayarDegisti() }
                    intArrayOf(24, 30, 50, 60, 100, 125, 250, 500, 1000, 2000, 4000).map { 1_000_000_000L / it }.filter { y.pozlamaAralik?.contains(it) != false }.forEach { ns -> c("1/${1_000_000_000L / ns}", a.pozlamaNs == ns) { a.pozlamaNs = ns; k.ayarDegisti() } }
                    // Fotoğrafta uzun pozlama (gece, ışık izi): 1/15 – 30 sn
                    if (fotoMod) listOf(15 to "1/15", 8 to "1/8", 4 to "1/4", 2 to "1/2", -1 to "1 sn", -2 to "2 sn", -4 to "4 sn", -8 to "8 sn", -15 to "15 sn", -30 to "30 sn")
                        .map { (v, ad) -> (if (v > 0) 1_000_000_000L / v else -v * 1_000_000_000L) to ad }.filter { y.pozlamaAralik?.contains(it.first) == true }
                        .forEach { (ns, ad) -> c(ad, a.pozlamaNs == ns) { a.pozlamaNs = ns; k.ayarDegisti() } } }
            }
            Param.DIYAFRAM -> satir.addView(TextView(this).apply { text = y.diyafram?.let { "Bu kameranın diyaframı sabit: f/${"%.1f".format(it)}. Pozlamayı ISO, enstantane ve ND filtreyle ayarla." } ?: "Diyafram kameranın kendisinden ayarlanır (HDMI kaynağı)."; setTextColor(Color.WHITE) })
            Param.ISO -> {
                if (!y.elleKontrol) satir.addView(TextView(this).apply { text = "Bu kamera el ile ISO'yu desteklemiyor."; setTextColor(Color.WHITE) })
                else { c("OTO", a.iso == null) { a.iso = null; k.ayarDegisti() }
                    intArrayOf(50, 64, 100, 125, 200, 250, 400, 640, 800, 1250, 1600, 3200, 6400, 12800).filter { y.isoAralik?.contains(it) == true }.forEach { v -> c("$v", a.iso == v) { a.iso = v; k.ayarDegisti() } } }
            }
            Param.WB -> { listOf(CameraMetadata.CONTROL_AWB_MODE_AUTO, CameraMetadata.CONTROL_AWB_MODE_INCANDESCENT, CameraMetadata.CONTROL_AWB_MODE_FLUORESCENT, CameraMetadata.CONTROL_AWB_MODE_DAYLIGHT,
                CameraMetadata.CONTROL_AWB_MODE_CLOUDY_DAYLIGHT, CameraMetadata.CONTROL_AWB_MODE_SHADE, CameraMetadata.CONTROL_AWB_MODE_TWILIGHT).filter { it in y.awbModlari }
                .forEach { m -> c(WB_ADLARI[m] ?: "?", a.awb == m && a.kelvin == null) { a.awb = m; a.kelvin = null; a.ton = 0; k.ayarDegisti() } }
            // Elle: iki çubuk, üstte Kelvin, altta yeşil–macenta (ton); ikisi de canlı uygulanır (Kamera ile aynı motor, BeyazDenge)
            if (k.elleBdVar) {
                serit.addView(HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false; addView(satir) })
                fun cubuk(baslik: String, max: Int, deger: Int, yazi: (Int) -> String, degis: (Int) -> Unit) {
                    val etiket = TextView(this).apply { textSize = 12f; typeface = dar; setTextColor(Color.WHITE); text = "$baslik  ${yazi(deger)}"; setPadding(0, dp(4f), 0, 0) }
                    serit.addView(etiket)
                    serit.addView(SeekBar(this).apply { this.max = max; progress = deger
                        setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                            override fun onProgressChanged(s: SeekBar?, v: Int, kullanici: Boolean) { if (kullanici) { degis(v); etiket.text = "$baslik  ${yazi(v)}"; k.ayarDegisti() } }
                            override fun onStartTrackingTouch(s: SeekBar?) {}; override fun onStopTrackingTouch(s: SeekBar?) { kameraAyarKaydet(); ustCiz() }
                        }) }, LinearLayout.LayoutParams(-1, dp(36f)))
                }
                val adim = BeyazDenge.ADIM
                cubuk("KELVIN", (BeyazDenge.EN_COK - BeyazDenge.EN_AZ) / adim, ((a.kelvin ?: k.mevcutKelvin()) - BeyazDenge.EN_AZ) / adim, { "${BeyazDenge.EN_AZ + it * adim}K" }) { a.kelvin = BeyazDenge.EN_AZ + it * adim }
                cubuk("YEŞİL – MACENTA", 100, a.ton + 50, { (it - 50).let { t -> if (t == 0) "0" else if (t < 0) "Y ${-t}" else "M $t" } }) { if (a.kelvin == null) a.kelvin = k.mevcutKelvin(); a.ton = it - 50 }
                return
            } }
            Param.EV -> { val r = y.evAralik
                if (r == null || r.upper == 0) satir.addView(TextView(this).apply { text = "Bu kamerada pozlama telafisi yok."; setTextColor(Color.WHITE) })
                else (r.lower..r.upper).forEach { v -> c(if (v == 0) "0" else "%+.1f".format(v * y.evAdim).replace('.', ','), a.ev == v) { a.ev = v; k.ayarDegisti() } } }
            Param.ODAK -> {
                c("OTO (AF)", a.odakMesafe == null) { a.odakMesafe = null; k.ayarDegisti() }
                if (y.minOdak > 0f) {
                    c("Sonsuz", a.odakMesafe == 0f) { a.odakMesafe = 0f; k.ayarDegisti() }
                    serit.addView(HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false; addView(satir) })
                    serit.addView(SeekBar(this).apply { max = 1000; progress = ((a.odakMesafe ?: 0f) / y.minOdak * 1000).toInt()
                        setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                            override fun onProgressChanged(s: SeekBar?, v: Int, kullanici: Boolean) { if (kullanici) { a.odakMesafe = y.minOdak * v / 1000f; k.ayarDegisti() } }
                            override fun onStartTrackingTouch(s: SeekBar?) {}; override fun onStopTrackingTouch(s: SeekBar?) { kameraAyarKaydet(); solCiz() }
                        }) }, LinearLayout.LayoutParams(-1, dp(40f)))
                    serit.addView(TextView(this).apply { text = "Sola: sonsuz · sağa: en yakın. Odak yardımını (ODAK) açarak keskinliği gör."; textSize = 12f; setTextColor(GRI) })
                    return
                } else satir.addView(TextView(this).apply { text = "  Bu kaynakta el ile odak yok."; setTextColor(Color.WHITE) })
            }
        }
        serit.addView(HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false; addView(satir) })
    }

    /* ================= sol sütun ================= */
    private fun kare(ad: String, alt: String = "", secili: Boolean = false, simge: Int? = null, is_: () -> Unit) {
        sol.addView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
            background = Tema.kapsul(if (secili) Color.WHITE else Color.argb(170, 30, 30, 30), dp(8f).toFloat())
            if (simge != null) addView(ImageView(this@MainActivity).apply { setImageResource(simge); setColorFilter(if (secili) Color.BLACK else Color.WHITE) }, LinearLayout.LayoutParams(dp(20f), dp(20f)))
            else addView(TextView(this@MainActivity).apply { text = ad; textSize = 13f; typeface = dar; setTextColor(if (secili) Color.BLACK else Color.WHITE); gravity = Gravity.CENTER })
            if (alt.isNotEmpty() && genisEkran) addView(TextView(this@MainActivity).apply { text = alt; textSize = 9f; typeface = dar; setTextColor(if (secili) Color.DKGRAY else Color.argb(200, 255, 255, 255)); gravity = Gravity.CENTER })
            contentDescription = alt.ifEmpty { ad }; tooltipText = contentDescription
            setOnClickListener { is_() }
        }, // yatayda sütunu, dikeyde satırı eşit paylaşırlar (kısa ekranlarda taşmasınlar)
            if (dikeyEkran) LinearLayout.LayoutParams(0, -1, 1f).apply { marginStart = dp(3f); marginEnd = dp(3f) }
            else LinearLayout.LayoutParams(dp(56f), 0, 1f).apply { topMargin = dp(4f); bottomMargin = dp(4f) })
    }

    private fun solCiz() {
        sol.removeAllViews()
        val a = ayarlar[etkin]; val ka = kamAyar[etkin]
        kare("", "KAYNAK", simge = R.drawable.ic_kaynak) { kaynakSec() }
        kare(if (a.zoom > 1f) "${a.zoom.toInt()}x" else "1x", "BÜYÜT", a.zoom > 1f) { a.zoom = when (a.zoom) { 1f -> 2f; 2f -> 4f; else -> 1f }; kaydet(); solCiz(); ustCiz(); yenile() }
        kare(if (ka.odakMesafe == null) "AF" else "MF", "ODAK", acikParam == Param.ODAK) { if (acikParam == Param.ODAK) seritKapat() else seritAc(Param.ODAK) }
        if (proMod) kare(if (sahne == Sahne.KAPALI) (if (sahneOto) "OTO" else "") else sahne.ad.uppercase(Locale("tr")).take(6), "SAHNE", acikParam == Param.SAHNE || sahne != Sahne.KAPALI, if (sahne == Sahne.KAPALI && !sahneOto) R.drawable.ic_sahne else null) { if (acikParam == Param.SAHNE) seritKapat() else seritAc(Param.SAHNE) }
        kare("", "TEMİZ", a.temiz, R.drawable.ic_temiz) { a.temiz = !a.temiz; kaydet(); solCiz(); yenile() }
        kare("", "DÜZEN", simge = R.drawable.ic_duzen) { panelAc(Sekme.MONITOR) }
    }

    /* ================= sağ sütun ================= */
    private fun sagCiz() {
        sag.removeAllViews()
        val d = dikeyEkran
        sag.addView(ImageView(this).apply { setImageResource(R.drawable.ic_ayar); scaleType = ImageView.ScaleType.CENTER; contentDescription = "Ayarlar"; setOnClickListener { panelAc(Sekme.KAYIT) } }, LinearLayout.LayoutParams(dp(48f), dp(44f)))
        sag.addView(View(this), LinearLayout.LayoutParams(1, 0, 1f))
        // FOTO · VİDEO seçimi (kayıt sürerken değişmez)
        val modlar = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL }
        listOf(true to "FOTO", false to "VİDEO").forEach { (f, ad) -> modlar.addView(TextView(this).apply {
            text = ad; textSize = 12f; typeface = dar; letterSpacing = 0.08f; gravity = Gravity.CENTER; setPadding(dp(8f), dp(5f), dp(8f), dp(5f)); minHeight = dp(if (d) 44f else 40f)
            setTextColor(if (fotoMod == f) SARI else Color.argb(215, 255, 255, 255)); golge(this)
            setOnClickListener { modSec(f) } }, LinearLayout.LayoutParams(-1, -2)) }
        if (proMod) sag.addView(modlar, LinearLayout.LayoutParams(if (d) dp(70f) else -1, -2).apply { if (d) marginEnd = dp(10f) else bottomMargin = dp(6f) })
        kayitDugme = KayitDugmesi(this).apply {
            foto = fotoMod; kayitta = kayitSuruyor()
            setOnClickListener { if (fotoMod) fotoDugmesi() else kayitDugmesi() }; setOnLongClickListener { ekranGoruntusu(); true }
            contentDescription = if (fotoMod) "Fotoğraf çek (basılı tut: ekran görüntüsü)" else "Kaydı başlat/durdur (basılı tut: ekran görüntüsü)" }
        sag.addView(kayitDugme, LinearLayout.LayoutParams(dp(if (d) 76f else 60f), dp(if (d) 76f else 60f)))
        sag.addView(View(this), LinearLayout.LayoutParams(1, 0, 1f))
        sonCekim = ImageView(this).apply { scaleType = ImageView.ScaleType.CENTER_CROP; background = Tema.kapsul(KOYU, dp(6f).toFloat()); clipToOutline = true; setOnClickListener { sonUri?.let { u -> runCatching { startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(u, sonMime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)) } } ?: tost("Henüz kayıt yok.") } }
        sag.addView(sonCekim, LinearLayout.LayoutParams(dp(64f), dp(if (d) 40f else 28f)).apply { if (d) marginEnd = dp(8f) else bottomMargin = dp(3f) })
        kalanYazi = TextView(this).apply { textSize = 10f; setTextColor(Color.argb(215, 255, 255, 255)); typeface = dar; gravity = Gravity.CENTER; golge(this) }
        sag.addView(kalanYazi, LinearLayout.LayoutParams(if (d) -2 else -1, -2))
    }

    /* ================= alt şerit ================= */
    private fun altCiz() {
        alt.removeAllViews()
        kose = OlcumGorunum(this).apply { bindirme = true; gorunen = linkedSetOf(OlcumGorunum.Tur.HISTOGRAM); visibility = if (koseHisto) View.VISIBLE else View.INVISIBLE }
        val d = dikeyEkran
        alt.addView(kose, LinearLayout.LayoutParams(dp(if (d) 84f else 140f), dp(if (d) 40f else 48f)).apply { marginEnd = dp(if (d) 8f else 12f) })
        olcumBagla()
        val a = ayarlar[etkin]
        val orta = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
        // Sony makinelerindeki gibi simgeli: dar ekranda yalnız simge (basılı tutunca adı görünür), geniş ekranda altında küçük ad
        val g = genisEkran
        fun c(ad: String, simge: Int, secili: Boolean, is_: () -> Unit) = orta.addView(TextView(this).apply {
            text = if (g) ad else ""; textSize = 9f; typeface = dar; letterSpacing = 0.04f; isSingleLine = true; setTextColor(if (secili) Color.BLACK else Color.WHITE); gravity = Gravity.CENTER
            setPadding(dp(6f), dp(if (g) 7f else 0f), dp(6f), dp(if (g) 5f else 0f)); minWidth = dp(if (g) 58f else 46f); minHeight = dp(46f)
            if (g) Tema.simge(this, simge, if (secili) Color.BLACK else Color.WHITE, boy = 20f, ust = true)
            contentDescription = ad; tooltipText = ad
            val zemin = Tema.kapsul(if (secili) SARI else Color.argb(170, 30, 30, 30), dp(10f).toFloat())
            if (g) background = zemin else { background = android.graphics.drawable.LayerDrawable(arrayOf(zemin, getDrawable(simge)!!.mutate().apply { setTint(if (secili) Color.BLACK else Color.WHITE) }))
                .apply { val i = dp(13f); setLayerInset(1, i, i, i, i) } }
            setOnClickListener { is_(); kaydet(); altCiz(); ustCiz(); yenile() }
        }, LinearLayout.LayoutParams(-2, -2).apply { marginEnd = dp(6f) })
        c("KAMERA", R.drawable.ic_geri, false) { finish() }
        c("ODAK", R.drawable.ic_odak, a.peaking) { a.peaking = !a.peaking }
        c("ZEBRA", R.drawable.ic_zebra, a.zebra) { a.zebra = !a.zebra }
        c("FALSE", R.drawable.ic_renk, a.falseColor) { a.falseColor = !a.falseColor }
        c("LUT", R.drawable.ic_lut, a.lutAcik) { if (a.lutAdi.isEmpty()) panelAc(Sekme.LUT) else a.lutAcik = !a.lutAcik }
        c("KILAVUZ", R.drawable.ic_kadraj, a.kilavuz > 0f || a.izgara) { if (a.kilavuz > 0f || a.izgara) { a.kilavuz = 0f; a.izgara = false } else a.kilavuz = 2.39f }
        c(if (kompTur == KompTur.KAPALI) "KOMPOZİSYON" else kompTur.ad.uppercase(Locale("tr")), R.drawable.ic_kilavuz, kompTur != KompTur.KAPALI) { if (kompTur == KompTur.KAPALI) kompTur = sonKomp else { sonKomp = kompTur; kompTur = KompTur.KAPALI }; kompUygula() }
        c("YARDIMCI", R.drawable.ic_yardimci, asistanAcik) { asistanAcik = !asistanAcik; kompUygula() }
        c("TERAZİ", R.drawable.ic_terazi, teraziAcik) { teraziAcik = !teraziAcik; kompUygula() }
        alt.addView(HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false; addView(orta) }, LinearLayout.LayoutParams(0, -2, 1f))
        ses.visibility = if (sesGosterge && arayuzAcik) View.VISIBLE else View.INVISIBLE
    }

    /* ================= döngü: zaman kodu, ses, kalan süre ================= */
    private var sonSaniye = -1L
    private fun tik() {
        val k = kamera()
        if (kayitSuruyor()) {
            val ms = System.currentTimeMillis() - kayitBas; val fps = kamAyar[etkin].fps?.upper ?: (kaynaklar[etkin] as? UvcKaynak)?.fps ?: 30
            if (this::tcYazi.isInitialized) tcYazi.text = "%02d:%02d:%02d:%02d".format(ms / 3600000, ms / 60000 % 60, ms / 1000 % 60, (ms % 1000) * fps / 1000)
            if (sesGosterge) { val a = kaydedici?.sesDuzeyi ?: k?.sesDuzeyi() ?: 0; val db = if (a <= 0) -90f else (20 * log10(a / 32767.0)).toFloat(); ses.ayarla(db, db) }
        }
        val sn = System.currentTimeMillis() / 1000
        if (sn != sonSaniye) {
            sonSaniye = sn; sahneDenetle()
            if (!kayitSuruyor() && this::tcYazi.isInitialized) tcYazi.text = SimpleDateFormat("HH:mm:ss", Locale.US).format(Date()) + ":00"
            val bos = runCatching { StatFs(Environment.getExternalStorageDirectory().path).availableBytes }.getOrDefault(0L)
            val saniye = bos / max(1L, mbps * 1_000_000L / 8)
            val fk = kamera()?.takeIf { fotoMod }
            val fotoSayi = fk?.secilenFotoBoyut()?.let { b -> bos / max(1L, (b.width.toLong() * b.height * (if (fk.rawAcik) 23 else 3) / 10)) }
            val pil = registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))?.let { it.getIntExtra(BatteryManager.EXTRA_LEVEL, 0) * 100 / max(1, it.getIntExtra(BatteryManager.EXTRA_SCALE, 100)) }
            if (this::kalanYazi.isInitialized) kalanYazi.text = (if (fotoSayi != null) "$fotoSayi foto" else "${saniye / 3600}sa ${saniye / 60 % 60}dk") + (if (dikeyEkran) "\npil %" else " · pil %") + "${pil ?: 0}"
        }
    }

    /* ================= kayıt ================= */
    private fun kayitDugmesi() {
        val k = kamera() ?: return if (kaynaklar[etkin] != null || kaydedici != null) kaynakKaydi() else tost("Kaynak yok.")
        if (k.kayitta) {
            k.kayitDurdur { ok -> runOnUiThread {
                kayitUri?.let { u -> contentResolver.update(u, ContentValues().apply { put(MediaStore.Video.Media.IS_PENDING, 0) }, null, null); if (ok) { sonUri = u; sonMime = "video/mp4"; runCatching { sonCekim.setImageBitmap(contentResolver.loadThumbnail(u, Size(160, 100), null)) } } }
                kayitUri = null; kayitDugme.kayitta = false; tost(if (ok) "Kayıt galeride: Movies/UPDATED Monitör" else "Kayıt kaydedilemedi (çok kısa olabilir)."); ustCiz(); if (sesGosterge) sesOlcerBaslat()
            } }
            return
        }
        if (sesKayit && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) { requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 2); return }
        sesOlcer.durdur()
        val ad = "UPDATED_${SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())}.mp4"
        val d = ContentValues().apply { put(MediaStore.Video.Media.DISPLAY_NAME, ad); put(MediaStore.Video.Media.MIME_TYPE, "video/mp4"); put(MediaStore.Video.Media.RELATIVE_PATH, "Movies/UPDATED Monitör"); put(MediaStore.Video.Media.IS_PENDING, 1) }
        val uri = contentResolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, d) ?: return tost("Kayıt dosyası açılamadı.")
        val fd = contentResolver.openFileDescriptor(uri, "w") ?: return tost("Kayıt dosyası açılamadı.")
        kayitUri = uri
        k.kayitBasla(fd, hevc, mbps, sesKayit) { hata -> runOnUiThread {
            if (hata != null) { tost("Kayıt başlamadı: $hata"); contentResolver.delete(uri, null, null); kayitUri = null; return@runOnUiThread }
            kayitBas = System.currentTimeMillis(); kayitDugme.kayitta = true; ustCiz()
        } }
    }

    /** USB görüntü ya da ağ yayını: ekranda görünen kaynak (araçsız, LUT'suz) telefona MP4 olarak kaydedilir */
    private fun kaynakKaydi() {
        val m = monitorler[etkin] ?: return
        kaydedici?.let { y ->
            kaydedici = null; m.kayitYuzeyi = null; m.yenile()
            val u = kayitUri; kayitUri = null; kayitDugme.kayitta = false; ustCiz()
            Thread {
                Thread.sleep(200) // çizici kayıt yüzeyini bıraksın
                val ok = runCatching { y.bitir() }.getOrElse { HataKaydi.not("kayit", it.stackTraceToString()); false }
                runOnUiThread {
                    if (u != null) { if (ok) { contentResolver.update(u, ContentValues().apply { put(MediaStore.Video.Media.IS_PENDING, 0) }, null, null); sonUri = u; sonMime = "video/mp4"; runCatching { sonCekim.setImageBitmap(contentResolver.loadThumbnail(u, Size(160, 100), null)) } } else runCatching { contentResolver.delete(u, null, null) } }
                    tost(if (ok) "Kayıt galeride: Movies/UPDATED Monitör" else "Kayıt kaydedilemedi (çok kısa olabilir)."); if (sesGosterge) sesOlcerBaslat()
                }
            }.start()
            return
        }
        if (m.gelenKare == 0L) return tost("Kaynaktan görüntü gelmiyor; kayıt başlamadı.")
        if (sesKayit && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) { requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 2); return }
        sesOlcer.durdur()
        val ad = "UPDATED_${SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())}.mp4"
        val d = ContentValues().apply { put(MediaStore.Video.Media.DISPLAY_NAME, ad); put(MediaStore.Video.Media.MIME_TYPE, "video/mp4"); put(MediaStore.Video.Media.RELATIVE_PATH, "Movies/UPDATED Monitör"); put(MediaStore.Video.Media.IS_PENDING, 1) }
        val uri = contentResolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, d) ?: return tost("Kayıt dosyası açılamadı.")
        val fd = contentResolver.openFileDescriptor(uri, "w") ?: return tost("Kayıt dosyası açılamadı.")
        val (w, h) = m.kayitBoyutu()
        val fps = (kaynaklar[etkin] as? UvcKaynak)?.fps ?: 30
        // Bit hızı: ayardaki değer, kaynağın boyutuna göre sınırlı (720p25 ≈ 9 Mb/sn)
        val hiz = minOf(mbps, maxOf(6, (w.toLong() * h * fps * 0.4 / 1e6).toInt()))
        val y = runCatching { Kaydedici(this, fd, w, h, fps, hiz, hevc, sesKayit && checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED).also { it.baslat() } }
            .getOrElse { e -> runCatching { fd.close() }; contentResolver.delete(uri, null, null); HataKaydi.not("kayit", e.stackTraceToString()); return tost("Kayıt başlamadı: ${e.message}") }
        kaydedici = y; kayitUri = uri; m.kayitYuzeyi = y.yuzey
        kayitBas = System.currentTimeMillis(); kayitDugme.kayitta = true; ustCiz()
        tost("Kayıt başladı · ${w}×${h} · ses: ${y.sesKaynagi ?: "yok"}")
    }

    /* ================= fotoğraf ================= */
    private fun modSec(foto: Boolean) {
        if (fotoMod == foto) return
        if (kamera()?.kayitta == true) return tost("Kayıt sürerken mod değişmez.")
        fotoMod = foto; tercih.edit().putBoolean("fotoMod", foto).apply()
        for (i in 0..1) (kaynaklar[i] as? KameraKaynak)?.let { k -> k.modDegistir(foto) { w, h -> monitorler[i]?.tampon(w, h); runOnUiThread { kompler[i]?.invalidate() } } }
        sagCiz(); ustCiz(); if (panel.visibility == View.VISIBLE) panelCiz()
    }

    private fun fotoDugmesi() {
        val k = kamera() ?: return tost(if (kaynaklar[etkin] is AgKaynak) "Ağ yayınında fotoğraf yok; kamera ya da USB kaynağı seç." else "Kaynak yok.")
        monitorler[etkin]?.takeIf { it.birlestiriyor }?.let { it.birlestirmeIptal(); return }
        if (geriSayiliyor) { geriSayiliyor = false; geriSayimYazi.visibility = View.GONE; return } // ikinci dokunuş zamanlayıcıyı iptal eder
        if (zamanlayici == 0) return cek(k)
        geriSayiliyor = true; var kalan = zamanlayici
        fun adim() {
            if (!geriSayiliyor) return
            if (kalan == 0) { geriSayiliyor = false; geriSayimYazi.visibility = View.GONE; cek(k); return }
            geriSayimYazi.text = "$kalan"; geriSayimYazi.visibility = View.VISIBLE; kalan--
            dongu.postDelayed({ adim() }, 1000)
        }
        adim()
    }

    /** Sahne kare birleştirme istiyorsa türü (telefon kendisi yapabiliyorsa null) */
    private fun birlestirmeTuru(k: KameraKaynak): Sahne.Birlestir? = when (sahne) {
        Sahne.ISIK_IZI -> Sahne.Birlestir.MAX
        Sahne.SAMANYOLU -> if (k.uzunPozlamaVar) null else Sahne.Birlestir.ORT
        Sahne.GECE -> if (k.sahneModuVar(CameraMetadata.CONTROL_SCENE_MODE_NIGHT)) null else Sahne.Birlestir.ORT
        else -> null
    }

    private fun birlestirCek(m: MonitorGorunum, tur: Sahne.Birlestir) {
        kayitDugme.basili = true
        if (deklansorSesi) runCatching { deklansor.play(android.media.MediaActionSound.START_VIDEO_RECORDING) }
        geriSayimYazi.textSize = 40f; geriSayimYazi.text = "0%"; geriSayimYazi.visibility = View.VISIBLE
        val n = if (sahne == Sahne.SAMANYOLU) 16 else 8
        m.birlestir(MonitorGorunum.BirlestirmeIstegi(tur, n, izSure * 1000L, 1f, { o -> geriSayimYazi.text = "${sahne.ad.uppercase(Locale("tr"))}  ${(o * 100).toInt()}%" }) { bmp ->
            geriSayimYazi.visibility = View.GONE; geriSayimYazi.textSize = 96f; kayitDugme.basili = false
            if (bmp == null) return@BirlestirmeIstegi tost("Birleştirme durdu.")
            if (deklansorSesi) runCatching { deklansor.play(android.media.MediaActionSound.SHUTTER_CLICK) }
            Thread {
                val ad = "UPDATED_" + SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date()) + "_" + sahne.name.lowercase(Locale.US) + ".jpg"
                val u = galeriyeYaz(ad, "image/jpeg") { bmp.compress(Bitmap.CompressFormat.JPEG, 95, it) }
                runOnUiThread {
                    if (u == null) return@runOnUiThread tost("Fotoğraf kaydedilemedi.")
                    sonUri = u; sonMime = "image/jpeg"; runCatching { sonCekim.setImageBitmap(contentResolver.loadThumbnail(u, Size(160, 100), null)) }
                    tost("${sahne.ad}: ${bmp.width}×${bmp.height} kaydedildi.")
                }
            }.start()
        })
    }

    private fun cek(k: KameraKaynak) {
        val m = monitorler[etkin]
        if (m != null && m.birlestiriyor) { m.birlestirmeIptal(); return } // ikinci dokunuş birleştirmeyi durdurur
        birlestirmeTuru(k)?.let { t -> if (m != null) return birlestirCek(m, t) }
        kayitDugme.basili = true
        if (deklansorSesi) runCatching { deklansor.play(android.media.MediaActionSound.SHUTTER_CLICK) }
        monitorler[etkin]?.animate()?.alpha(0.2f)?.setDuration(60)?.withEndAction { monitorler[etkin]?.animate()?.alpha(1f)?.setDuration(160) }
        var ilk: Uri? = null
        k.fotoCek({ ad, mime, yaz -> galeriyeYaz(ad, mime, yaz)?.also { if (mime == "image/jpeg") ilk = it } != null }) { hata -> runOnUiThread {
            kayitDugme.basili = false
            if (hata != null) { tost(hata); return@runOnUiThread }
            ilk?.let { u -> sonUri = u; sonMime = "image/jpeg"; runCatching { sonCekim.setImageBitmap(contentResolver.loadThumbnail(u, Size(160, 100), null)) } }
        } }
    }

    /** Galeriye (Pictures/UPDATED Kamera) yazar; kamera iş parçacığından çağrılır */
    private fun galeriyeYaz(ad: String, mime: String, yaz: (java.io.OutputStream) -> Unit): Uri? {
        val d = ContentValues().apply { put(MediaStore.Images.Media.DISPLAY_NAME, ad); put(MediaStore.Images.Media.MIME_TYPE, mime); put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/UPDATED Kamera"); put(MediaStore.Images.Media.IS_PENDING, 1) }
        val uri = contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, d) ?: return null
        return try {
            contentResolver.openOutputStream(uri)!!.use { yaz(it) }
            contentResolver.update(uri, ContentValues().apply { put(MediaStore.Images.Media.IS_PENDING, 0) }, null, null); uri
        } catch (e: Exception) { runCatching { contentResolver.delete(uri, null, null) }; HataKaydi.not("foto", e.stackTraceToString()); null }
    }

    private var engelUyarisi = false
    /** Telefon kamerayı bu uygulamaya kapatmış (CAMERA_DISABLED): ne yapılacağını bir kez anlat */
    private fun kameraEngelli() {
        if (engelUyarisi || isFinishing) return; engelUyarisi = true
        AlertDialog.Builder(this).setTitle("Telefon kamerayı engelliyor").setMessage(
            "Android bu uygulamanın kamerayı açmasına izin vermiyor (\"disabled by policy\"). Genelde şunlardan biri:\n\n" +
            "• Bildirim panelindeki kamera erişimi düğmesi kapalı (hızlı ayarlarda \"Kamera erişimi\").\n" +
            "• Ayarlar → Gizlilik → İzin yöneticisi → Kamera → UPDATED Kamera: \"Yalnız kullanırken izin ver\" seçili olmalı.\n" +
            "• Uygulama klonlandı, Gizli alan / Çocuk alanı içinde ya da telefon bir kurum tarafından yönetiliyor.\n\n" +
            "Telefonun kendi kamera uygulaması açılıyor mu, bir bak. Düzelttikten sonra uygulamayı kapatıp aç.")
            .setPositiveButton("Uygulama ayarları") { _, _ -> runCatching { startActivity(Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))) } }
            .setNegativeButton("Tamam", null).show()
    }

    private fun sesOlcerBaslat() { if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED && kamera()?.kayitta != true) sesOlcer.baslat() }

    /* ================= ayarlar paneli ================= */
    private var sekme = Sekme.KAYIT
    private fun panelAc(s: Sekme) { sekme = s; panel.visibility = View.VISIBLE; panelCiz() }
    private fun panelKapat() { panel.visibility = View.GONE; kaydet(); arayuzCiz(); yenile() }

    private fun panelCiz() {
        panel.removeAllViews()
        val dk = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        panel.addView(dk, FrameLayout.LayoutParams(-1, -1))
        val sekmeler = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setBackgroundColor(SIYAH); setPadding(dp(8f), 0, dp(8f), 0) }
        Sekme.values().forEach { s -> sekmeler.addView(TextView(this).apply {
            text = s.ad; textSize = 14f; typeface = dar; letterSpacing = 0.06f; gravity = Gravity.CENTER; setPadding(dp(16f), dp(14f), dp(16f), dp(12f))
            setTextColor(if (s == sekme) Color.WHITE else GRI); Tema.simge(this, s.simge, boy = 16f)
            background = if (s == sekme) GradientDrawable().apply { setColor(SIYAH); setStroke(0, 0) }.also { } else null
            if (s == sekme) setCompoundDrawablesWithIntrinsicBounds(null, null, null, GradientDrawable().apply { setColor(Color.WHITE); setSize(dp(40f), dp(3f)) })
            setOnClickListener { sekme = s; panelCiz() } }) }
        sekmeler.addView(View(this), LinearLayout.LayoutParams(0, 1, 1f))
        sekmeler.addView(ImageView(this).apply { setImageResource(R.drawable.ic_kapat); scaleType = ImageView.ScaleType.CENTER; contentDescription = "Kapat"; setOnClickListener { panelKapat() } }, LinearLayout.LayoutParams(dp(56f), dp(48f)))
        dk.addView(HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false; isFillViewport = true; addView(sekmeler) }, LinearLayout.LayoutParams(-1, dp(52f)))
        val ic = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(28f), dp(12f), dp(28f), dp(28f)) }
        dk.addView(ScrollView(this).apply { addView(ic) }, LinearLayout.LayoutParams(-1, 0, 1f))
        val a = ayarlar[etkin]; val k = kamera(); val ka = kamAyar[etkin]
        if (kip == Kip.IKI && sekme != Sekme.KURULUM) aciklama(ic, "${etkin + 1}. bölmenin ayarları (bölmeye dokunarak değiştir)")
        when (sekme) {
            Sekme.KAYIT -> {
                if (k == null) aciklama(ic, "Kayıt yalnız kamera ve USB kaynağında. Ağ yayınında kayıt yok.")
                else if (fotoMod) {
                    secenek(ic, "MOD", listOf("FOTO", "VİDEO"), 0) { modSec(it == 0) }
                    val fb = k.fotoBoyutlari; val fs = k.secilenFotoBoyut()
                    if (fb.isNotEmpty()) secenek(ic, "FOTOĞRAF ÇÖZÜNÜRLÜĞÜ", fb.map { "${it.width}×${it.height} · ${"%.1f".format(it.width * it.height / 1e6).replace('.', ',')} MP" }, fb.indexOf(fs).coerceAtLeast(0)) {
                        ka.fotoBoyut = fb[it]; kameraAyarKaydet(); k.oturumYenile { w, h -> monitorler[etkin]?.tampon(w, h) } }
                    if (k.rawVar) anahtar(ic, "RAW (DNG) DA KAYDET", ka.raw) { ka.raw = it; kameraAyarKaydet(); k.oturumYenile { w, h -> monitorler[etkin]?.tampon(w, h) } }
                    else aciklama(ic, "Bu kamera RAW (DNG) vermiyor; fotoğraflar JPEG.")
                    secenek(ic, "ZAMANLAYICI", listOf("Kapalı", "3 sn", "10 sn"), when (zamanlayici) { 3 -> 1; 10 -> 2; else -> 0 }) { zamanlayici = intArrayOf(0, 3, 10)[it]; tercih.edit().putInt("zamanlayici", zamanlayici).apply() }
                    anahtar(ic, "DEKLANŞÖR SESİ", deklansorSesi) { deklansorSesi = it; tercih.edit().putBoolean("deklansorSesi", it).apply() }
                    aciklama(ic, "Fotoğraflar: Galeri → Pictures/UPDATED Kamera. Önizleme fotoğrafın en/boy oranına geçer. Odak yardımı, zebra, kılavuz ve LUT fotoğrafa girmez. El ile enstantanede uzun pozlama (30 sn'ye kadar, kamera izin veriyorsa) seçilebilir.")
                } else {
                    secenek(ic, "MOD", listOf("FOTO", "VİDEO"), 1) { modSec(it == 0) }
                    if (k.kayitta) aciklama(ic, "Kayıt sürerken çözünürlük ve kare hızı değişmez.")
                    val boyutlar = k.yetenek.boyutlar; val secili = k.secilenBoyut()
                    secenek(ic, "ÇÖZÜNÜRLÜK", boyutlar.map { "${it.width}×${it.height}" }, boyutlar.indexOf(secili)) { if (!k.kayitta) { ka.boyut = boyutlar[it]; k.oturumYenile { w, h -> monitorler[etkin]?.tampon(w, h) } } }
                    secenek(ic, "KARE HIZI", listOf("OTO") + k.yetenek.fpsler.map { if (it.lower == it.upper) "${it.upper}" else "${it.lower}–${it.upper}" }, ka.fps?.let { k.yetenek.fpsler.indexOf(it) + 1 } ?: 0) { if (!k.kayitta) { ka.fps = if (it == 0) null else k.yetenek.fpsler[it - 1]; k.oturumYenile { w, h -> monitorler[etkin]?.tampon(w, h) } } }
                    secenek(ic, "KODEK", listOf("H.264", "H.265 (HEVC)"), if (hevc) 1 else 0) { hevc = it == 1 }
                    val hizlar = listOf(10, 20, 35, 50, 80, 100, 150)
                    secenek(ic, "BİT HIZI", hizlar.map { "$it Mb/sn" }, hizlar.indexOf(mbps).coerceAtLeast(0)) { mbps = hizlar[it] }
                    anahtar(ic, "SES KAYDI", sesKayit) { sesKayit = it }
                    anahtar(ic, "GÖRÜNTÜ SABİTLEME", ka.sabit > 0) { ka.sabit = if (it) 1 else 0; k.ayarDegisti() }
                    aciklama(ic, "Kayıtlar: Galeri → Movies/UPDATED Monitör. Kayıt temizdir (odak, zebra, kılavuz ve LUT kayda girmez). Kayıt düğmesine basılı tutunca ekran görüntüsü alınır.")
                }
            }
            Sekme.MONITOR -> {
                secenek(ic, "EKRAN DÜZENİ", Kip.values().map { it.ad }, kip.ordinal) { kip = Kip.values()[it]; tercih.edit().putString("kip2", kip.name).apply(); kur() }
                anahtar(ic, "ODAK YARDIMI", a.peaking) { a.peaking = it }
                secenek(ic, "ODAK RENGİ", listOf("Kırmızı", "Mavi", "Beyaz", "Sarı"), a.peakRenk) { a.peakRenk = it }
                secenek(ic, "ODAK HASSASİYETİ", listOf("Hassas", "Normal", "Kaba"), when (a.peakEsik) { 0.1f -> 0; 0.3f -> 2; else -> 1 }) { a.peakEsik = floatArrayOf(0.1f, 0.18f, 0.3f)[it] }
                anahtar(ic, "ZEBRA", a.zebra) { a.zebra = it }
                val zeb = floatArrayOf(0.7f, 0.75f, 0.8f, 0.85f, 0.9f, 0.95f, 0.995f)
                secenek(ic, "ZEBRA SEVİYESİ", listOf("%70", "%75", "%80", "%85", "%90", "%95", "%100"), zeb.indexOfFirst { abs(it - a.zebraEsik) < 0.01f }.coerceAtLeast(0)) { a.zebraEsik = zeb[it] }
                anahtar(ic, "FALSE COLOR", a.falseColor) { a.falseColor = it }
                anahtar(ic, "SİYAH-BEYAZ", a.monokrom) { a.monokrom = it }
                anahtar(ic, "TEMİZ GÖRÜNTÜ", a.temiz) { a.temiz = it }
                secenek(ic, "BÜYÜTME", listOf("1x", "2x", "4x"), when (a.zoom) { 2f -> 1; 4f -> 2; else -> 0 }) { a.zoom = floatArrayOf(1f, 2f, 4f)[it] }
            }
            Sekme.KOMPOZISYON -> {
                secenek(ic, "KOMPOZİSYON KILAVUZU", KompTur.values().map { it.ad }, kompTur.ordinal) { kompTur = KompTur.values()[it]; if (kompTur != KompTur.KAPALI) sonKomp = kompTur; kompUygula() }
                if (kompTur == KompTur.SPIRAL || kompTur == KompTur.UCGEN) secenek(ic, "YÖN", listOf("Sağ alt", "Sol alt", "Sağ üst", "Sol üst"), kompYon) { kompYon = it; kompUygula() }
                anahtar(ic, "AKILLI YARDIMCI", asistanAcik) { asistanAcik = it; kompUygula() }
                aciklama(ic, "Yardımcı yüzü ya da en belirgin konuyu bulur, en yakın güçlü noktaya ok gösterir; konu yerine oturunca ibre yeşile döner. Telefonun içinde çalışır, internet gerekmez.")
                anahtar(ic, "KOMPOZİSYON ÖNERİSİ", oneriAcik) { oneriAcik = it; kompUygula() }
                aciklama(ic, "Konuya en az hareketle uyan kılavuzu üstte önerir; dokununca uygulanır.")
                anahtar(ic, "TERAZİ (UFUK)", teraziAcik) { teraziAcik = it; kompUygula() }
            }
            Sekme.KILAVUZ -> {
                val oran = floatArrayOf(0f, 2.39f, 2.35f, 2f, 1.85f, 16f / 9f, 4f / 3f, 0.8f, 9f / 16f, 1f)
                secenek(ic, "KADRAJ KILAVUZU", listOf("Kapalı", "2,39:1", "2,35:1", "2:1", "1,85:1", "16:9", "4:3", "4:5", "9:16", "1:1"), oran.indexOfFirst { abs(it - a.kilavuz) < 0.01f }.coerceAtLeast(0)) { a.kilavuz = oran[it] }
                anahtar(ic, "IZGARA (ÜÇTE BİR)", a.izgara) { a.izgara = it }
                anahtar(ic, "MERKEZ İŞARETİ", a.merkez) { a.merkez = it }
                secenek(ic, "GÜVENLİ ALAN", listOf("Kapalı", "%90", "%80"), when (a.guvenli) { 0.9f -> 1; 0.8f -> 2; else -> 0 }) { a.guvenli = floatArrayOf(0f, 0.9f, 0.8f)[it] }
            }
            Sekme.LUT -> {
                anahtar(ic, "EKRAN LUT'U", a.lutAcik) { a.lutAcik = it }
                val l = lutKlasoru.listFiles { f -> f.name.endsWith(".cube", true) }?.sortedBy { it.name.lowercase() }.orEmpty()
                aciklama(ic, if (l.isEmpty()) "Kitaplık boş. 3D .cube LUT ekle; eklediklerin burada saklanır. LUT yalnız ekrana uygulanır, kayda girmez." else "Kitaplık (${l.size}). Seçince etkin bölmeye uygulanır:")
                l.forEach { f -> satir(ic, f.name.removeSuffix(".cube"), f.name == a.lutAdi && a.lutAcik, simge = R.drawable.ic_lut, sil = { f.delete(); if (a.lutAdi == f.name) { a.lutAdi = ""; a.lutAcik = false }; panelCiz() }) {
                    runCatching { f.inputStream().use { Lut.oku(f.name, it) } }.onSuccess { lut -> a.lutAdi = f.name; monitorler[etkin]?.lutYukle(lut); kaydet(); panelCiz() }.onFailure { tost("LUT okunamadı: ${it.message}") } } }
                ic.addView(Tema.dugme(this, "LUT EKLE (.cube)").apply { typeface = dar; Tema.simge(this, R.drawable.ic_ekle, boy = 16f); setOnClickListener { lutSec() } }, LinearLayout.LayoutParams(-2, -2).apply { topMargin = dp(12f) })
            }
            Sekme.OLCUM -> {
                anahtar(ic, "HİSTOGRAM (ALT ŞERİT)", koseHisto) { koseHisto = it; tercih.edit().putBoolean("koseHisto", it).apply(); olcumBagla() }
                aciklama(ic, "Tam ölçüm paneli: MONİTÖR → EKRAN DÜZENİ → Görüntü + ölçümler. Panelde görünecekler:")
                val o = olcum
                OlcumGorunum.Tur.values().forEach { t -> anahtar(ic, t.ad.uppercase(Locale("tr")), o?.gorunen?.contains(t) ?: true) { ok -> o?.let { it.gorunen = LinkedHashSet(if (ok) it.gorunen + t else it.gorunen - t) } } }
            }
            Sekme.SES -> {
                anahtar(ic, "SES GÖSTERGESİ", sesGosterge) { sesGosterge = it; tercih.edit().putBoolean("sesGosterge", it).apply(); if (it) sesOlcerBaslat() else sesOlcer.durdur(); altCiz() }
                anahtar(ic, "SES KAYDI", sesKayit) { sesKayit = it }
                aciklama(ic, "Gösterge −60…0 dBFS, yeşil → sarı (−12) → kırmızı (−3). Mikrofon: telefonun kamera mikrofonu ya da USB ses girişi.")
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) satir(ic, "Mikrofon iznini ver", false) { requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 3) }
            }
            Sekme.KAYNAK -> {
                val kamlar = kaynakKameralari()
                kamlar.forEach { kk -> satir(ic, kk.second, kaynakAdi[etkin] == kk.second) { kameraAc(etkin, kk); panelCiz() } }
                if (!proMod) UvcKaynak.aygitlar(this).forEach { d -> val ad = "USB görüntü (doğrudan): " + (d.productName ?: d.manufacturerName ?: "aygıt")
                    satir(ic, ad, (kaynaklar[etkin] as? UvcKaynak)?.aygit?.deviceName == d.deviceName) { uvcAc(etkin, d); panelCiz() } }
                if (!proMod) satir(ic, "Ağ yayını (RTSP · RTMP · HLS)…", kaynaklar[etkin] is AgKaynak) { agSor() }
                if (!proMod) wifiKameralar.forEach { (ad, h) -> satir(ic, "Wi-Fi kamera: $ad", (kaynaklar[etkin] as? WifiKameraKaynak)?.ad == ad) { wifiAc(etkin, ad, h.first, h.second); panelCiz() } }
                if (!proMod) aciklama(ic, "Wi-Fi kamera: başka telefonda UPDATED Kamera → Ayarlar → Wi-Fi kamera ol (iPhone'da üstteki Wi-Fi simgesi). Aynı ağdaysa burada kendiliğinden listelenir.")
                if (!proMod && kamlar.none { it.second.startsWith("USB") } && UvcKaynak.aygitlar(this).isEmpty()) { aciklama(ic, "USB görüntü kaynağı yok. HDMI→USB çeviriciyi ya da kamerayı USB-C ile tak; fotoğraf makinesini \"USB yayını\" (USB Streaming) moduna al."); satir(ic, "Takılı USB aygıtını denetle", false) { taniGosterildi = false; usbTani() } }
                val ana = floatArrayOf(1f, 1.33f, 1.5f, 1.6f, 1.8f, 2f)
                secenek(ic, "ANAMORFİK AÇMA", listOf("Kapalı", "1,33x", "1,5x", "1,6x", "1,8x", "2x"), ana.indexOfFirst { abs(it - a.desqueeze) < 0.01f }.coerceAtLeast(0)) { a.desqueeze = ana[it] }
                secenek(ic, "DÖNDÜR", listOf("0°", "90°", "180°", "270°"), a.dondur / 90) { a.dondur = it * 90; monitorler[etkin]?.let { m -> m.tampon(m.kaynakBoyut[0], m.kaynakBoyut[1]) } }
                anahtar(ic, "AYNA", a.ayna) { a.ayna = it }
                anahtar(ic, "TERS ÇEVİR", a.cevir) { a.cevir = it }
            }
            Sekme.KURULUM -> {
                anahtar(ic, "EKRAN PARLAKLIĞI EN YÜKSEK", parlaklikTam) { parlaklikTam = it; tercih.edit().putBoolean("parlaklik", it).apply(); parlaklik() }
                satir(ic, "Yardım", false) { yardim() }
                aciklama(ic, "Çökme ve donmalar kendiliğinden UPDATED'a bildirilir (yalnız hata ayrıntısı ve cihaz modeli).")
                satir(ic, "Güncellemeleri denetle", false) { Guncelleme.denetle(this, sessiz = false) }
                aciklama(ic, "UPDATED Kamera ${packageManager.getPackageInfo(packageName, 0).versionName} · açılışta yeni sürüm kendiliğinden denetlenir.")
            }
        }
    }

    private fun aciklama(ic: LinearLayout, metin: String) = ic.addView(TextView(this).apply { text = metin; textSize = 13f; setTextColor(GRI); setPadding(0, dp(12f), 0, dp(6f)) })

    private fun etiket(r: LinearLayout, ad: String) = r.addView(TextView(this).apply { text = ad; textSize = 14f; typeface = dar; letterSpacing = 0.05f; setTextColor(Color.WHITE); Tema.simgeAdi(ad)?.let { Tema.simge(this, it, GRI) } }, LinearLayout.LayoutParams(dp(220f), -2))

    private fun anahtar(ic: LinearLayout, ad: String, acik: Boolean, degis: (Boolean) -> Unit) =
        secenek(ic, ad, listOf("KAPALI", "AÇIK"), if (acik) 1 else 0) { degis(it == 1) }

    private fun secenek(ic: LinearLayout, ad: String, l: List<String>, secili: Int, degis: (Int) -> Unit) {
        val r = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(0, dp(10f), 0, dp(10f)) }
        etiket(r, ad)
        val ch = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        l.forEachIndexed { i, s -> ch.addView(TextView(this).apply {
            text = s; textSize = 13f; typeface = dar; gravity = Gravity.CENTER; setPadding(dp(14f), dp(9f), dp(14f), dp(9f))
            setTextColor(if (i == secili) Color.BLACK else Color.WHITE); background = Tema.kapsul(if (i == secili) Color.WHITE else KOYU2, dp(5f).toFloat())
            setOnClickListener { degis(i); kaydet(); kameraAyarKaydet(); yenile(); panelCiz() }
        }, LinearLayout.LayoutParams(-2, -2).apply { marginEnd = dp(6f) }) }
        r.addView(HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false; addView(ch) }, LinearLayout.LayoutParams(0, -2, 1f))
        ic.addView(r); ic.addView(View(this).apply { setBackgroundColor(Color.rgb(44, 44, 44)) }, LinearLayout.LayoutParams(-1, 1))
    }

    private fun satir(ic: LinearLayout, ad: String, secili: Boolean, sil: (() -> Unit)? = null, simge: Int? = null, tik: () -> Unit) {
        val r = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(dp(14f), dp(12f), dp(14f), dp(12f)); background = Tema.kapsul(if (secili) Color.WHITE else KOYU, dp(6f).toFloat()) }
        r.addView(TextView(this).apply { text = ad; textSize = 15f; typeface = dar; setTextColor(if (secili) Color.BLACK else Color.WHITE); (simge ?: Tema.simgeAdi(ad))?.let { Tema.simge(this, it) } }, LinearLayout.LayoutParams(0, -2, 1f))
        sil?.let { s -> r.addView(TextView(this).apply { text = "SİL"; textSize = 12f; typeface = dar; setTextColor(if (secili) Color.DKGRAY else GRI); setPadding(dp(12f), 0, 0, 0); Tema.simge(this, R.drawable.ic_sil, boy = 15f); setOnClickListener { s() } }) }
        r.setOnClickListener { tik() }
        ic.addView(r, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(6f) })
    }

    /* ================= kaynaklar ================= */
    private fun kaynakSec() = panelAc(Sekme.KAYNAK)
    /** PRO yalnız telefon kameraları; Monitör yalnız dış kaynaklar (USB görüntü) */
    private fun kaynakKameralari() = kameralar(this).filter { if (proMod) !it.second.startsWith("USB") else it.second.startsWith("USB") }

    private fun kameraAc(i: Int, k: Pair<String, String>) {
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) { bekleyenKamera = i to k; requestPermissions(arrayOf(Manifest.permission.CAMERA), 1); return }
        val m = monitorler[i] ?: return
        if ((kaynaklar[i] as? KameraKaynak)?.kayitta == true) return tost("Kayıt sürerken kaynak değişmez.")
        tercih.edit().putString("kaynak$i", "kamera").putString("kamera$i", k.first).apply()
        kaynakAdi[i] = k.second
        kamAyar[i] = kameraAyarOku(k.first)
        acici[i] = acici@{
            // Uygulama tam öndeyken açılır (arka plandayken Android kamerayı "devre dışı" der); önceki kamera kapanınca yenisi
            if (!onde) { bekleyenAcma[i] = true; return@acici }
            val onceki = kaynaklar[i]; kaynaklar[i] = null
            if (onceki is KameraKaynak) { onceki.durdurVe { runOnUiThread { acici[i]?.invoke() } }; return@acici } else onceki?.durdur()
            val kaynak = runCatching { KameraKaynak(this, k.first, k.second, kamAyar[i]) }.getOrElse { e -> tost("Kamera açılamadı: ${e.message}"); HataKaydi.not("kamera", e.stackTraceToString()); null }
            if (kaynak != null) {
                kaynaklar[i] = kaynak; kaynak.fotoModu = fotoMod; kaynak.sahne = sahne
                kaynak.baslat(sonYuzey[i]!!, { w, h ->
                    m.tampon(w, h)
                    runOnUiThread { yonuAyarla() }
                    runOnUiThread { ustCiz() }
                }, { hata -> runOnUiThread { if (hata == "POLITIKA") kameraEngelli() else tost(hata) } })
            }
        }
        if (sonYuzey[i] != null) acici[i]?.invoke()
        ustCiz()
    }

    private fun agSor() {
        val e = EditText(this).apply { setText(tercih.getString("ag$etkin", "rtsp://")); setSingleLine() }
        AlertDialog.Builder(this).setTitle("Ağ yayını adresi").setMessage("Ör. rtsp://192.168.1.20:554/live · rtmp://… · https://…/index.m3u8")
            .setView(e).setPositiveButton("Bağlan") { _, _ -> agAc(etkin, e.text.toString().trim()); if (panel.visibility == View.VISIBLE) panelCiz() }.setNegativeButton("Vazgeç", null).show()
    }

    /** Doğrudan USB görüntü (UVC): Android'in harici kamera desteği gerekmez */
    private fun uvcAc(i: Int, d: android.hardware.usb.UsbDevice) {
        val m = monitorler[i] ?: return
        tercih.edit().putString("kaynak$i", "uvc").putString("uvc$i", "%04x:%04x".format(d.vendorId, d.productId)).apply()
        kaynakAdi[i] = "USB: " + (d.productName ?: d.manufacturerName ?: "Görüntü aygıtı"); m.ayarlar.dondur = 0; m.otoDondur = 0
        acici[i] = {
            kaynaklar[i]?.durdur()
            val y = UvcKaynak(this, d, { m.gelenKare }, { c -> runOnUiThread { tost("${kaynakAdi[i]} · $c") } }); kaynaklar[i] = y
            y.baslat(sonYuzey[i]!!, { w, h -> m.tampon(w, h); runOnUiThread { ustCiz() } }, { hata -> runOnUiThread { tost(hata) } })
        }
        if (sonYuzey[i] != null) acici[i]?.invoke()
        ustCiz()
    }

    /** USB'de görüntü aygıtı yoksa: takılı aygıtı söyle (fotoğraf makinesi yanlış USB modundaysa ne yapılacağını anlat) */
    private var taniGosterildi = false
    private fun usbTani() {
        val um = getSystemService(USB_SERVICE) as android.hardware.usb.UsbManager
        val l = um.deviceList.values.toList()
        l.forEach { HataKaydi.not("usb", UvcKaynak.usbOzet(it)) } // tanı kaydı (aynı aygıt bir kez)
        val ptp = l.firstOrNull { UvcKaynak.ptpMi(it) || it.deviceClass == android.hardware.usb.UsbConstants.USB_CLASS_MASS_STORAGE || (0 until it.interfaceCount).any { k -> it.getInterface(k).interfaceClass == android.hardware.usb.UsbConstants.USB_CLASS_MASS_STORAGE } }
        if (ptp != null && !taniGosterildi && !isFinishing) {
            taniGosterildi = true
            val ad = listOfNotNull(ptp.manufacturerName, ptp.productName).joinToString(" ").ifEmpty { "Fotoğraf makinesi" }
            AlertDialog.Builder(this).setTitle("$ad bağlı, ama görüntü vermiyor").setMessage(
                "Makine USB'de dosya aktarımı/uzaktan kumanda modunda. Görüntü için makineyi \"USB yayını\" moduna al:\n\n" +
                "• Sony (a7 IV, a7 V, a7S III, ZV serisi): MENÜ → Ağ (ya da Kurulum) → USB → USB Bağlantı Modu → \"USB Yayını\" (USB Streaming). Bazı modellerde kabloyu takınca çıkan soruda \"Canlı Yayın (USB Yayını)\"nı seç.\n" +
                "• Canon: menüde \"UVC/UAC\" ya da \"Web kamerası\" modu.\n" +
                "• Nikon/Fujifilm: menüde \"USB: Web kamerası (UVC)\".\n\n" +
                "Sonra kabloyu çıkarıp yeniden tak; Android \"USB aygıtına erişim\" sorarsa İzin ver.")
                .setPositiveButton("Tamam", null).show()
        } else if (l.isEmpty()) tost("USB görüntü kaynağı yok: kamerayı ya da HDMI→USB çeviriciyi tak ya da KAYNAK'tan ağ yayını aç.")
    }

    private val usbDinle = object : android.content.BroadcastReceiver() {
        override fun onReceive(c: android.content.Context, i: Intent) {
            if (proMod) return
            @Suppress("DEPRECATION") val d = i.getParcelableExtra<android.hardware.usb.UsbDevice>(android.hardware.usb.UsbManager.EXTRA_DEVICE) ?: return
            if (i.action == android.hardware.usb.UsbManager.ACTION_USB_DEVICE_ATTACHED) {
                HataKaydi.not("usb", UvcKaynak.usbOzet(d))
                if (UvcKaynak.gorunturVar(d)) { if (kaydedici == null && (kaynaklar[etkin] == null || kaynaklar[etkin] is UvcKaynak)) uvcAc(etkin, d) } else { taniGosterildi = false; dongu.postDelayed({ usbTani() }, 800) }
            } else if (i.action == android.hardware.usb.UsbManager.ACTION_USB_DEVICE_DETACHED) {
                val k = kaynaklar[etkin]; if (k is UvcKaynak && k.aygit.deviceName == d.deviceName) { if (kaydedici != null) kaynakKaydi(); k.durdur(); kaynaklar[etkin] = null; ustCiz() }
            }
        }
    }

    /** Wi-Fi kamera (Masa'daki gibi): telefonun duruşu görüntüye kendiliğinden uygulanır */
    private fun wifiAc(i: Int, ad: String, host: String, kapi: Int) {
        val m = monitorler[i] ?: return
        tercih.edit().putString("kaynak$i", "wifi").putString("wifiAd$i", ad).putString("wifi$i", "$host:$kapi").apply()
        kaynakAdi[i] = "Wi-Fi: $ad"; m.ayarlar.dondur = 0; m.otoDondur = 0
        acici[i] = {
            kaynaklar[i]?.durdur()
            val k = WifiKameraKaynak(host, kapi, ad); kaynaklar[i] = k
            // Wi-Fi kamera saat yönünde derece gönderir; monitör çizicisi ters yönde sayar
            k.yonDegisti = { d -> m.otoDondur = (360 - d) % 360; m.post { m.tampon(m.kaynakBoyut[0], m.kaynakBoyut[1]) } }
            k.baslat(sonYuzey[i]!!, { w, h -> m.tampon(w, h); runOnUiThread { ustCiz() } }, { hata -> runOnUiThread { tost(hata) } })
        }
        if (sonYuzey[i] != null) acici[i]?.invoke()
        ustCiz()
    }

    private fun wifiAramaBaslat() {
        if (proMod || wifiBulucu != null) return
        cokluYayin = runCatching { (applicationContext.getSystemService(WIFI_SERVICE) as android.net.wifi.WifiManager).createMulticastLock("monitor").apply { setReferenceCounted(false); acquire() } }.getOrNull()
        wifiBulucu = KameraBulucu(this) { ad, adres, kapi -> runOnUiThread {
            val yeni = wifiKameralar.put(ad, adres to kapi) == null
            if (yeni && panel.visibility == View.VISIBLE && sekme == Sekme.KAYNAK) panelCiz()
        } }.also { it.baslat() }
    }

    private fun wifiAramaDurdur() { wifiBulucu?.durdur(); wifiBulucu = null; runCatching { cokluYayin?.release() }; cokluYayin = null }

    private fun agAc(i: Int, adres: String) {
        val m = monitorler[i] ?: return
        tercih.edit().putString("kaynak$i", "ag").putString("ag$i", adres).apply()
        kaynakAdi[i] = adres; m.ayarlar.dondur = 0; m.otoDondur = 0
        acici[i] = {
            kaynaklar[i]?.durdur()
            val k = AgKaynak(this, adres); kaynaklar[i] = k
            k.baslat(sonYuzey[i]!!, { w, h -> m.tampon(w, h); runOnUiThread { ustCiz() } }, { hata -> runOnUiThread { tost(hata) } })
        }
        if (sonYuzey[i] != null) acici[i]?.invoke()
        ustCiz()
    }

    override fun onRequestPermissionsResult(k: Int, izin: Array<out String>, sonuc: IntArray) {
        super.onRequestPermissionsResult(k, izin, sonuc)
        val ok = sonuc.firstOrNull() == PackageManager.PERMISSION_GRANTED
        when (k) {
            1 -> { val b = bekleyenKamera; bekleyenKamera = null; if (ok && b != null) kameraAc(b.first, b.second) else tost("Kamera izni olmadan USB görüntü ve telefon kamerası açılamaz.") }
            2 -> if (ok) kayitDugmesi() else { sesKayit = false; tost("Mikrofon izni yok: kayıt sessiz alınacak."); kayitDugmesi() }
            3 -> { if (ok) sesOlcerBaslat(); if (panel.visibility == View.VISIBLE) panelCiz() }
        }
    }

    /* ================= LUT kitaplığı ================= */
    private fun lutSec() = startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply { addCategory(Intent.CATEGORY_OPENABLE); type = "*/*" }, 7)

    @Deprecated("Activity sonuç arayüzü (eklentisiz)")
    override fun onActivityResult(k: Int, s: Int, veri: Intent?) {
        super.onActivityResult(k, s, veri)
        val uri = veri?.data ?: return
        if (k != 7 || s != RESULT_OK) return
        try {
            val ad = (contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(0) else null } ?: "lut-${System.currentTimeMillis()}").let { if (it.endsWith(".cube", true)) it else "$it.cube" }
            val hedef = File(lutKlasoru, ad.replace(Regex("[^\\wçğıöşüÇĞİÖŞÜ .()-]"), "_"))
            contentResolver.openInputStream(uri)!!.use { g -> hedef.outputStream().use { g.copyTo(it) } }
            val lut = hedef.inputStream().use { Lut.oku(hedef.name, it) }
            val i = if (kip == Kip.KARSILASTIR) 0 else etkin
            ayarlar[i].lutAdi = hedef.name; ayarlar[i].lutAcik = true
            monitorler[i]?.lutYukle(lut); kaydet()
            tost("LUT kitaplığa eklendi (${lut.boyut}³)")
            if (panel.visibility == View.VISIBLE) panelCiz() else arayuzCiz()
        } catch (e: Exception) { tost("LUT okunamadı: ${e.message}") }
    }

    /* ================= ekran görüntüsü ================= */
    private fun ekranGoruntusu() { monitorler[etkin]?.ekranGoruntusu { bmp -> kaydetGorsel(bmp) } }

    private fun kaydetGorsel(bmp: Bitmap) {
        val ad = "UPDATED_Monitor_${SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())}.png"
        val d = ContentValues().apply { put(MediaStore.Images.Media.DISPLAY_NAME, ad); put(MediaStore.Images.Media.MIME_TYPE, "image/png"); put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/UPDATED Monitör") }
        val uri = contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, d) ?: return tost("Ekran görüntüsü kaydedilemedi.")
        val ok = runCatching { contentResolver.openOutputStream(uri)!!.use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) } }.getOrDefault(false)
        tost(if (ok) "Ekran görüntüsü: Galeri → Pictures/UPDATED Monitör" else "Ekran görüntüsü kaydedilemedi.")
    }

    private fun yardim() {
        AlertDialog.Builder(this).setTitle("UPDATED Monitör").setMessage(
            "• Kayıt: sağdaki kırmızı düğme (basılı tut: ekran görüntüsü). Kayıtlar Galeri → Movies/UPDATED Monitör.\n" +
            "• Fotoğraf: düğmenin üstünden FOTO'yu seç. JPEG, istersen RAW (DNG); zamanlayıcı ⚙ → KAYIT. Fotoğraflar Galeri → Pictures/UPDATED Kamera.\n" +
            "• Üst şeritteki değerlere (kare hızı, enstantane, ISO, beyaz dengesi, pozlama) dokununca altta ayar şeridi açılır.\n" +
            "• Solda: kaynak, büyütme, odak (AF/MF), temiz görüntü, ekran düzeni. Altta: odak yardımı, zebra, false color, LUT, kılavuz.\n" +
            "• ⚙: KAYIT (çözünürlük, kare hızı, kodek, bit hızı), MONİTÖR, KILAVUZ, LUT, ÖLÇÜM, SES, KAYNAK, KURULUM.\n" +
            "• HDMI: HDMI→USB çeviriciyle; KAYNAK sekmesinde 'USB görüntü' (Android 14+, harici kamera desteği)."
        ).setPositiveButton("Tamam", null).show()
    }

    private fun yenile() = monitorler.forEach { it?.yenile() }

    /* ================= ayarların saklanması ================= */
    private fun kameraAyarKaydet() {
        val i = etkin; val id = (kaynaklar[i] as? KameraKaynak)?.id ?: return; val a = kamAyar[i]
        tercih.edit().putString("kam_$id", JSONObject().apply {
            a.boyut?.let { put("w", it.width); put("h", it.height) }; a.fps?.let { put("fl", it.lower); put("fu", it.upper) }
            a.iso?.let { put("iso", it) }; a.pozlamaNs?.let { put("poz", it) }; put("ev", a.ev); put("awb", a.awb); a.kelvin?.let { put("kelvin", it) }; put("ton", a.ton); a.odakMesafe?.let { put("odak", it.toDouble()) }; put("sab", a.sabit > 0)
            a.fotoBoyut?.let { put("fw", it.width); put("fh", it.height) }; put("raw", a.raw)
        }.toString()).putBoolean("hevc", hevc).putInt("mbps", mbps).putBoolean("sesKayit", sesKayit).apply()
    }

    private fun kameraAyarOku(id: String): KameraAyari {
        val j = runCatching { JSONObject(tercih.getString("kam_$id", "{}")!!) }.getOrNull() ?: return KameraAyari()
        return KameraAyari(
            boyut = if (j.has("w")) Size(j.getInt("w"), j.getInt("h")) else null, fps = if (j.has("fl")) Range(j.getInt("fl"), j.getInt("fu")) else null,
            iso = if (j.has("iso")) j.getInt("iso") else null, pozlamaNs = if (j.has("poz")) j.getLong("poz") else null, ev = j.optInt("ev"),
            awb = j.optInt("awb", CameraMetadata.CONTROL_AWB_MODE_AUTO), kelvin = if (j.has("kelvin")) j.getInt("kelvin") else null, ton = j.optInt("ton").coerceIn(-50, 50), odakMesafe = if (j.has("odak")) j.getDouble("odak").toFloat() else null, sabit = if (j.optBoolean("sab", true)) 1 else 0,
            fotoBoyut = if (j.has("fw")) Size(j.getInt("fw"), j.getInt("fh")) else null, raw = j.optBoolean("raw"))
    }

    private fun kaydet() {
        val e = tercih.edit()
        ayarlar.forEachIndexed { i, a ->
            e.putString("ayar$i", JSONObject().apply {
                put("peaking", a.peaking); put("peakEsik", a.peakEsik.toDouble()); put("peakRenk", a.peakRenk); put("zebra", a.zebra); put("zebraEsik", a.zebraEsik.toDouble())
                put("falseColor", a.falseColor); put("desqueeze", a.desqueeze.toDouble()); put("kilavuz", a.kilavuz.toDouble()); put("izgara", a.izgara); put("merkez", a.merkez)
                put("guvenli", a.guvenli.toDouble()); put("ayna", a.ayna); put("cevir", a.cevir); put("monokrom", a.monokrom); put("temiz", a.temiz)
                put("lutAcik", a.lutAcik); put("lutAdi", a.lutAdi)
            }.toString())
        }
        e.putBoolean("hevc", hevc).putInt("mbps", mbps).putBoolean("sesKayit", sesKayit).apply()
    }

    private fun ayarlariOku() {
        for (i in 0..1) {
            val j = runCatching { JSONObject(tercih.getString("ayar$i", "{}")!!) }.getOrNull() ?: continue
            ayarlar[i].apply {
                peaking = j.optBoolean("peaking"); peakEsik = j.optDouble("peakEsik", 0.18).toFloat(); peakRenk = j.optInt("peakRenk")
                zebra = j.optBoolean("zebra"); zebraEsik = j.optDouble("zebraEsik", 0.95).toFloat(); falseColor = j.optBoolean("falseColor")
                desqueeze = j.optDouble("desqueeze", 1.0).toFloat(); kilavuz = j.optDouble("kilavuz", 0.0).toFloat(); izgara = j.optBoolean("izgara"); merkez = j.optBoolean("merkez")
                guvenli = j.optDouble("guvenli", 0.0).toFloat(); ayna = j.optBoolean("ayna"); cevir = j.optBoolean("cevir"); monokrom = j.optBoolean("monokrom"); temiz = j.optBoolean("temiz")
                lutAcik = j.optBoolean("lutAcik"); lutAdi = j.optString("lutAdi", "")
            }
        }
    }

    /** Telefon kamerası Android'den dik (telefonun kendi dik yönüne göre) gelir; ekran yan döndükçe görüntüyü ve kayıt yönünü ona göre ayarlar */
    private fun yonuAyarla() {
        @Suppress("DEPRECATION") val ekran = windowManager.defaultDisplay.rotation * 90
        for (i in 0..1) {
            val m = monitorler[i] ?: continue; val k = kaynaklar[i] as? KameraKaynak
            val w = kaynaklar[i] as? WifiKameraKaynak
            m.otoDondur = if (k != null && !k.haricimi) ekran else if (w != null) (360 - w.yon) % 360 else 0
            k?.ekranYonu = ekran
            m.tampon(m.kaynakBoyut[0], m.kaynakBoyut[1])
        }
        kompler.forEach { it?.invalidate() }
    }
    private val ekranDinle = object : android.hardware.display.DisplayManager.DisplayListener {
        override fun onDisplayAdded(id: Int) {}
        override fun onDisplayRemoved(id: Int) {}
        override fun onDisplayChanged(id: Int) { if (id == android.view.Display.DEFAULT_DISPLAY) yonuAyarla() }
    }

    @Deprecated("Geri tuşu: önce panel/şerit kapanır")
    override fun onBackPressed() {
        when { panel.visibility == View.VISIBLE -> panelKapat(); serit.visibility == View.VISIBLE -> seritKapat(); else -> @Suppress("DEPRECATION") super.onBackPressed() }
    }
    override fun onResume() {
        super.onResume(); onde = true; teraziKaydi(); yonuAyarla(); wifiAramaBaslat()
        if (!proMod) { val f = IntentFilter().apply { addAction(android.hardware.usb.UsbManager.ACTION_USB_DEVICE_ATTACHED); addAction(android.hardware.usb.UsbManager.ACTION_USB_DEVICE_DETACHED) }
            if (android.os.Build.VERSION.SDK_INT >= 33) registerReceiver(usbDinle, f, RECEIVER_EXPORTED) else registerReceiver(usbDinle, f) }
        (getSystemService(DISPLAY_SERVICE) as android.hardware.display.DisplayManager).registerDisplayListener(ekranDinle, null); tamEkran(); monitorler.forEach { it?.onResume() }; if (sesGosterge) sesOlcerBaslat()
        for (i in 0..1) if (bekleyenAcma[i]) { bekleyenAcma[i] = false; if (sonYuzey[i] != null) acici[i]?.invoke() }
    }
    override fun onPause() {
        super.onPause(); onde = false; sensorler.unregisterListener(teraziDinle); wifiAramaDurdur()
        if (!proMod) runCatching { unregisterReceiver(usbDinle) }
        (getSystemService(DISPLAY_SERVICE) as android.hardware.display.DisplayManager).unregisterDisplayListener(ekranDinle)
        if (kayitSuruyor()) kayitDugmesi() // arka plana geçerken kayıt güvenle kapanır
        sesOlcer.durdur(); monitorler.forEach { it?.onPause() }
    }
    override fun onDestroy() { super.onDestroy(); kaydedici?.let { y -> kaydedici = null; Thread { runCatching { y.bitir() } }.start() }; asistan?.kapat(); analiz.kapat(); dongu.removeCallbacksAndMessages(null); sesOlcer.durdur(); kaynaklar.forEach { it?.durdur() } }
}
