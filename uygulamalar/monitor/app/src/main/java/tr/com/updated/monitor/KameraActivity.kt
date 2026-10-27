package tr.com.updated.monitor

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.ContentUris
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.hardware.camera2.CameraMetadata
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.util.Range
import android.util.Size
import android.view.GestureDetector
import android.view.Gravity
import android.view.MotionEvent
import android.view.OrientationEventListener
import android.view.ScaleGestureDetector
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.widget.CheckBox
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.abs
import kotlin.math.atan2

/**
 * UPDATED Kamera: telefonun normal kamerası (iPhone kamerası sadeliğinde, Final Cut Camera'nın araç şeridiyle). Üstte yuvarlak düğmeler ve
 * biçim etiketi, altta araç şeridi (dokununca cetvel açılır), mod şeridi ve deklanşör. Ekran dikey sabit; telefon döndükçe yalnız ikonlar döner.
 * Modlar altta kaydırılır (Timelapse · Video · Foto · PRO modlar · Portre · Monitör); gece, ışık izi ve Samanyolu PRO MODLAR'ın içinde (ProModlar.kt). PRO düğmesi Blackmagic düzenini
 * (MainActivity, mod=pro), Monitör dış kamera izlemeyi (MainActivity, mod=monitor) açar. Uygulama baştan açılınca hangisi
 * olacağı sorulur; alta alınıp geri gelince sorulmaz.
 */
class KameraActivity : Activity() {
    enum class KMod(val ad: String, val foto: Boolean, val sahne: Sahne) {
        TIMELAPSE("TIMELAPSE", false, Sahne.KAPALI), VIDEO("VİDEO", false, Sahne.KAPALI), FOTO("FOTO", true, Sahne.KAPALI), PRO("PRO MODLAR", true, Sahne.KAPALI), PORTRE("PORTRE", true, Sahne.PORTRE),
        MONITOR("MONİTÖR", false, Sahne.KAPALI)
    }

    companion object {
        /** Bu süreçte açılış sorusu soruldu mu (uygulama tamamen kapanınca sıfırlanır) */
        var girisSoruldu = false
        /** Yalnız ekran testi: kamera olmadığında baz ISO işaretini göstermek için örnek değer */
        internal var ornekBazIso: Int? = null
        val TURUNCU = Color.rgb(255, 107, 26); val SARI = Color.rgb(255, 204, 0); val MAVI_ACIK = Color.rgb(106, 152, 248); val YESIL = Color.rgb(52, 199, 89)
        val GRI = Color.rgb(169, 175, 184); val CAM = Color.argb(170, 38, 42, 48); val ZEMIN = Color.rgb(15, 17, 20)
    }

    private val tercih by lazy { getSharedPreferences("kamera", MODE_PRIVATE) }
    private val dongu = Handler(Looper.getMainLooper())
    private val kosul by lazy { runCatching { resources.getFont(R.font.plex_kosul_600) }.getOrDefault(Typeface.create("sans-serif-condensed", Typeface.BOLD)) }
    private val kosulKalin by lazy { runCatching { resources.getFont(R.font.plex_kosul_700) }.getOrDefault(Typeface.create("sans-serif-condensed", Typeface.BOLD)) }
    private val mono by lazy { runCatching { resources.getFont(R.font.plex_mono_500) }.getOrDefault(Typeface.MONOSPACE) }
    private fun dp(v: Float) = Tema.dp(this, v)
    private fun tost(m: String) = Toast.makeText(this, m, Toast.LENGTH_LONG).show()

    private lateinit var kok: FrameLayout
    private lateinit var kutu: FrameLayout
    private lateinit var monitor: MonitorGorunum
    private lateinit var komp: KompozisyonGorunum
    private lateinit var ustSerit: LinearLayout
    /** Final Cut Camera tarzı araç şeridi: pozlama, beyaz denge, odak, kılavuz, yardımcı, terazi (simge + kısa yazı) */
    private lateinit var aracSerit: LinearLayout
    private lateinit var modSerit: LinearLayout
    private lateinit var modKaydir: HorizontalScrollView
    private lateinit var altSira: FrameLayout
    private lateinit var deklansorDugme: KayitDugmesi
    private lateinit var sonResim: ImageView
    private lateinit var zoomSira: LinearLayout
    private lateinit var sureSira: LinearLayout
    private lateinit var bilgiCip: TextView
    private lateinit var oneriCip: TextView
    private lateinit var sahneCip: TextView
    /** PRO MODLAR: seçili hazır mod ve ayarları (ProModlar.kt); üstteki etikete dokununca Özelleştir açılır */
    private lateinit var proCip: TextView
    private var proMod = ProMod.SAMANYOLU
    /** "?" düğmesi: ekrandaki düğmelerin yanında tek cümlelik açıklama (görünüm → açıklama) */
    private val aciklamalar = ArrayList<Pair<View, String>>()
    private var yardimKatman: View? = null
    private lateinit var kayitCip: TextView
    private lateinit var ortaYazi: TextView
    private lateinit var odakKare: View
    private lateinit var flasIkon: ImageView
    private lateinit var flasHarf: TextView
    private var acilir: View? = null

    private var kaynak: KameraKaynak? = null
    private var yuzey: android.view.Surface? = null
    private var kamListe: List<Pair<String, String>> = emptyList()
    private var kamIndex = 0
    private var ayar = KameraAyari()
    private var mod = KMod.FOTO
    private var onde = false
    private var secimYapildi = false
    private var ustBosluk = 0; private var altBosluk = 0

    // Kompozisyon ve sahne
    private var kompTur = KompTur.KAPALI; private var kompYon = 0; private var sonKomp = KompTur.SPIRAL
    private var asistanAcik = false; private var teraziAcik = false; private var oneriAcik = true; private var sahneOto = true
    private var asistan: Asistan? = null
    private val analiz = GoruntuAnaliz(); private var sonYuz: YuzBilgi? = null; private val ipucuSabit = IpucuSabitle()
    private var sonOneri: Pair<KompTur, Int>? = null
    private var sahneOnerisi: Sahne? = null
    @Volatile private var renkOrt = floatArrayOf(0f, 0f, 0f); @Volatile private var yercekimZ = 0f
    private var zamanlayici = 0; private var deklansorSesi = true
    /** PRO MODLAR seri çekimi: deklanşör basılı tutuldukça */
    private var seriSuruyor = false; private var seriSayi = 0
    // Timelapse (Timelapse.kt): kare aralığı, çekim süresi sınırı (dk, 0 = sınırsız), pozlama kilidi
    private var tlAralik = 2000L; private var tlSure = 0; private var tlPozSabit = true
    private var tlKaydedici: Kaydedici? = null; private var tlUri: Uri? = null
    private fun kayitSuruyor() = kaynak?.kayitta == true || tlKaydedici != null
    private val deklansor by lazy { android.media.MediaActionSound().also { it.load(android.media.MediaActionSound.SHUTTER_CLICK) } }

    // Yön: telefonun fiziksel dönüşü (0/90/180/270, saat yönünde); ikonlar ters yönde döner
    private var fizikselYon = 0
    private val donenler = ArrayList<View>()
    private val yonDinle by lazy { object : OrientationEventListener(this) {
        override fun onOrientationChanged(o: Int) {
            if (o < 0) return
            val fark = abs(((o - fizikselYon + 540) % 360) - 180)
            if (fark < 60) return // eşik: titreyip durmasın
            val yeni = ((o + 45) / 90 * 90) % 360
            if (yeni != fizikselYon) { fizikselYon = yeni; yonUygula() }
        }
    } }
    private val sensorler by lazy { getSystemService(SENSOR_SERVICE) as android.hardware.SensorManager }
    private val yercekimDinle = object : android.hardware.SensorEventListener {
        override fun onSensorChanged(e: android.hardware.SensorEvent) {
            yercekimZ = e.values[2]
            if (!teraziAcik) return
            // Ufuk açısı (ekranda, saat yönünün tersine): yerçekiminin dik yönü
            val ufuk = Math.toDegrees(atan2(e.values[1].toDouble(), e.values[0].toDouble())).toFloat() - 90f
            val taban = Math.round(ufuk / 90f) * 90f
            komp.egimTaban = taban; komp.egim = ufuk - taban
        }
        override fun onAccuracyChanged(s: android.hardware.Sensor?, a: Int) {}
    }

    // Kayıt
    private var kayitUri: Uri? = null; private var kayitBas = 0L
    private var sonUri: Uri? = null; private var sonMime = "image/jpeg"
    private var geriSayiliyor = false

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        HataKaydi.kur(this)
        if (b == null) dongu.postDelayed({ Guncelleme.denetle(this, sessiz = true) }, 3000)
        ayarlariOku()
        kamListe = kameralar(this).filter { !it.second.startsWith("USB") }.let { l -> listOfNotNull(l.firstOrNull { it.second.startsWith("Arka") }, l.firstOrNull { it.second.startsWith("Ön") }) }
        if (kamIndex >= kamListe.size) kamIndex = 0
        ayar = kamListe.getOrNull(kamIndex)?.let { ayarOku(it.first) } ?: KameraAyari()
        iskelet()
        tamEkran()
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) requestPermissions(arrayOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO), 1)
        // Açılış sorusu: uygulama baştan açıldıysa (bu süreçte sorulmadıysa) ve hatırlanan seçim yoksa
        val hatirlanan = tercih.getString("giris", null)
        when {
            girisSoruldu -> secimYapildi = true
            hatirlanan == "monitor" -> { girisSoruldu = true; secimYapildi = true; monitoreGec() }
            hatirlanan == "kamera" -> { girisSoruldu = true; secimYapildi = true }
            else -> girisGoster()
        }
        dongu.post(object : Runnable { override fun run() { tik(); dongu.postDelayed(this, 250) } })
    }

    private fun tamEkran() {
        window.attributes = window.attributes.apply { layoutInDisplayCutoutMode = android.view.WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES }
        if (android.os.Build.VERSION.SDK_INT >= 30) window.insetsController?.let { it.hide(WindowInsets.Type.systemBars()); it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE }
        else @Suppress("DEPRECATION") { window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY }
    }

    /* ================= iskelet ================= */
    private fun cam(kose: Float) = GradientDrawable().apply { cornerRadius = kose; setColor(CAM); setStroke(1, Color.argb(26, 255, 255, 255)) }
    /** Açılır paneller: arkadaki düğmeler karışmasın diye neredeyse opak */
    private fun pano(kose: Float) = GradientDrawable().apply { cornerRadius = kose; setColor(Color.rgb(30, 33, 38)); setStroke(1, Color.argb(26, 255, 255, 255)) }
    /** PRO MODLAR panelleri: koyu yarı saydam, görüntü arkadan sezilir */
    private fun saydamPano(kose: Float) = GradientDrawable().apply { cornerRadius = kose; setColor(Color.argb(176, 12, 14, 18)); setStroke(1, Color.argb(36, 255, 255, 255)) }

    private fun ikon(res: Int, aciklama: String, is_: () -> Unit) = ImageView(this).apply {
        setImageResource(res); contentDescription = aciklama; scaleType = ImageView.ScaleType.CENTER
        setOnClickListener { is_() }; donenler.add(this)
    }

    private fun etiket(metin: String, boy: Float, renk: Int = Color.WHITE) = TextView(this).apply { text = metin; textSize = boy; typeface = kosul; setTextColor(renk); letterSpacing = 0.04f; gravity = Gravity.CENTER; isSingleLine = true }

    private fun iskelet() {
        kok = FrameLayout(this).apply { setBackgroundColor(ZEMIN) }
        // Güvenli alan: çentik, kamera deliği, durum çubuğu ve hareket çubuğu payı (her telefonun kendi değeri)
        kok.setOnApplyWindowInsetsListener { _, i ->
            val (ust, alt) = if (android.os.Build.VERSION.SDK_INT >= 30) {
                val s = i.getInsetsIgnoringVisibility(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout()); s.top to s.bottom
            } else @Suppress("DEPRECATION") { maxOf(i.stableInsetTop, i.displayCutout?.safeInsetTop ?: 0) to maxOf(i.stableInsetBottom, i.displayCutout?.safeInsetBottom ?: 0) }
            val u = maxOf(ust, dp(24f)); val a = maxOf(alt, dp(16f))
            if (u != ustBosluk || a != altBosluk) { ustBosluk = u; altBosluk = a; yerlestir() }
            i
        }
        // Görüntü kutusu
        kutu = FrameLayout(this).apply { clipChildren = true }
        monitor = MonitorGorunum(this).apply { ayarlar = Ayarlar() }
        monitor.yuzeyHazir = { y -> yuzey = y; kameraAc() }
        kutu.addView(monitor, FrameLayout.LayoutParams(-1, -1))
        komp = KompozisyonGorunum(this) { monitor.goruntuAlani() }.also { it.tur = kompTur; it.yon = kompYon; it.asistan = asistanAcik }
        kutu.addView(komp, FrameLayout.LayoutParams(-1, -1))
        odakKare = View(this).apply { background = GradientDrawable().apply { setColor(Color.TRANSPARENT); setStroke(dp(1.5f), TURUNCU); cornerRadius = dp(6f).toFloat() }; visibility = View.GONE }
        kutu.addView(odakKare, FrameLayout.LayoutParams(dp(72f), dp(72f)))
        oneriCip = cip(MAVI_ACIK).apply { setOnClickListener { sonOneri?.let { (t, y) -> kompTur = t; kompYon = y; sonKomp = t; kompUygula() }; visibility = View.GONE } }
        kutu.addView(oneriCip, FrameLayout.LayoutParams(-2, -2, Gravity.TOP or Gravity.CENTER_HORIZONTAL).apply { topMargin = dp(12f) })
        Tema.simge(oneriCip, R.drawable.ic_oneri, MAVI_ACIK, 16f)
        kayitCip = TextView(this).apply { textSize = 15f; typeface = mono; setTextColor(Color.WHITE); gravity = Gravity.CENTER; setPadding(dp(12f), dp(5f), dp(12f), dp(5f)); background = Tema.kapsul(Color.rgb(229, 72, 77), dp(14f).toFloat()); visibility = View.GONE }
        sahneCip = cip(MAVI_ACIK).apply { setOnClickListener { sahneUygula(); visibility = View.GONE } }
        Tema.simge(sahneCip, R.drawable.ic_sahne, MAVI_ACIK, 16f)
        kutu.addView(sahneCip, FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM or Gravity.START).apply { bottomMargin = dp(64f); marginStart = dp(12f) })
        proCip = cip(TURUNCU).apply { contentDescription = "PRO mod ayarları"; setOnClickListener { proOzellestir() } }
        aciklamalar.add(proCip to "Dokun: ISO, S, WB")
        Tema.simge(proCip, R.drawable.ic_ayar, TURUNCU, 15f)
        kutu.addView(proCip, FrameLayout.LayoutParams(-2, -2, Gravity.TOP or Gravity.CENTER_HORIZONTAL).apply { topMargin = dp(12f) })
        bilgiCip = TextView(this).apply { textSize = 12f; typeface = mono; setTextColor(Color.WHITE); gravity = Gravity.CENTER; setPadding(dp(12f), dp(6f), dp(12f), dp(6f)); background = cam(dp(14f).toFloat()); setOnClickListener { ayarlarAc() }; contentDescription = "Biçim" }
        zoomSira = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
        kutu.addView(zoomSira, FrameLayout.LayoutParams(-1, dp(48f), Gravity.BOTTOM).apply { bottomMargin = dp(10f) })
        sureSira = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER; visibility = View.GONE }
        kutu.addView(sureSira, FrameLayout.LayoutParams(-1, dp(40f), Gravity.BOTTOM).apply { bottomMargin = dp(60f) })
        ortaYazi = TextView(this).apply { textSize = 88f; typeface = kosulKalin; setTextColor(Color.WHITE); setShadowLayer(12f, 0f, 0f, Color.BLACK); visibility = View.GONE; gravity = Gravity.CENTER }
        donenler.add(ortaYazi)
        kutu.addView(ortaYazi, FrameLayout.LayoutParams(-2, -2, Gravity.CENTER))
        kok.addView(kutu)
        dokunmaKur()

        // Üst sıra (iPhone gibi): solda Monitör ve flaş, ortada biçim (kayıtta süre), sağda PRO ve ayarlar; hepsi yuvarlak cam düğme
        ustSerit = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(dp(4f), 0, dp(4f), 0) }
        fun ekle(v: View, w: Int = dp(40f)) = ustSerit.addView(v, LinearLayout.LayoutParams(w, dp(40f)).apply { marginEnd = dp(8f) })
        fun bosluk() = ustSerit.addView(View(this), LinearLayout.LayoutParams(0, 1, 1f))
        ekle(ikon(R.drawable.ic_monitor, "Monitör") { monitoreGec() }.apply { setColorFilter(MAVI_ACIK); background = Tema.kapsul(CAM); aciklamalar.add(this to "Harici kamera (USB)") })
        val flasKutu = FrameLayout(this).apply { setOnClickListener { flasDegistir() }; contentDescription = "Flaş"; background = Tema.kapsul(CAM) }
        flasIkon = ImageView(this).apply { setImageResource(R.drawable.ic_flas_yok); scaleType = ImageView.ScaleType.CENTER }
        flasHarf = TextView(this).apply { text = "A"; textSize = 9f; typeface = kosulKalin; setTextColor(Color.WHITE); visibility = View.GONE }
        flasKutu.addView(flasIkon, FrameLayout.LayoutParams(-1, -1)); flasKutu.addView(flasHarf, FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM or Gravity.END).apply { marginEnd = dp(8f); bottomMargin = dp(6f) })
        donenler.add(flasKutu); ekle(flasKutu); bosluk(); aciklamalar.add(flasKutu to "Flaş")
        val orta = FrameLayout(this)
        orta.addView(bilgiCip, FrameLayout.LayoutParams(-2, dp(30f), Gravity.CENTER)); orta.addView(kayitCip, FrameLayout.LayoutParams(-2, dp(30f), Gravity.CENTER))
        ustSerit.addView(orta, LinearLayout.LayoutParams(-2, dp(40f))); bosluk(); aciklamalar.add(orta to "Çözünürlük ve biçim")
        val pro = etiket("PRO", 14f).apply { background = Tema.kapsul(CAM); setOnClickListener { proyaGec() }; contentDescription = "PRO" }
        donenler.add(pro); ustSerit.addView(pro, LinearLayout.LayoutParams(dp(56f), dp(40f)).apply { marginEnd = dp(8f) }); aciklamalar.add(pro to "Elle ayar ekranı")
        val yardim = etiket("?", 17f).apply { typeface = kosulKalin; background = Tema.kapsul(CAM); contentDescription = "Açıklamalar"; setOnClickListener { yardimAcKapat() } }
        donenler.add(yardim); ustSerit.addView(yardim, LinearLayout.LayoutParams(dp(40f), dp(40f)).apply { marginEnd = dp(8f) }); aciklamalar.add(yardim to "Açıklamalar")
        ustSerit.addView(ikon(R.drawable.ic_ayar, "Ayarlar") { ayarlarAc() }.apply { background = Tema.kapsul(CAM); aciklamalar.add(this to "Ayarlar") }, LinearLayout.LayoutParams(dp(40f), dp(40f)))
        kok.addView(ustSerit)

        // Araç şeridi (Final Cut Camera gibi): simge + kısa yazı; pozlama, beyaz denge ve odakta cetvel açılır
        aracSerit = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER; setPadding(dp(8f), 0, dp(8f), 0) }
        fun arac(res: Int, ad: String, etiketi: String, is_: () -> Unit) {
            val k = LinearLayout(this).apply { aciklamalar.add(this to when (etiketi) { "poz" -> "Parlaklık"; "bd" -> "Renk sıcaklığı"; "odak" -> "Odak"
                    "kilavuz" -> "Kadraj çizgileri"; "yardimci" -> "Kadraj önerisi"; else -> "Eğim" })
                orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; contentDescription = ad; tag = etiketi; setOnClickListener { is_() } }
            k.addView(ImageView(this).apply { setImageResource(res); donenler.add(this) }, LinearLayout.LayoutParams(dp(22f), dp(22f)))
            k.addView(TextView(this).apply { textSize = 11f; typeface = kosul; setTextColor(Color.WHITE); gravity = Gravity.CENTER; isSingleLine = true; setPadding(0, dp(3f), 0, 0) })
            aracSerit.addView(k, LinearLayout.LayoutParams(0, -1, 1f))
        }
        arac(R.drawable.ic_pozlama, "Pozlama", "poz") { cetvelAc(Cetvel.POZ) }
        arac(R.drawable.ic_beyaz, "Beyaz denge", "bd") { cetvelAc(Cetvel.BD) }
        arac(R.drawable.ic_odak, "Odak", "odak") { cetvelAc(Cetvel.ODAK) }
        arac(R.drawable.ic_kilavuz, "Kompozisyon kılavuzu", "kilavuz") { kilavuzMenu() }
        arac(R.drawable.ic_yardimci, "Akıllı yardımcı", "yardimci") { asistanAcik = !asistanAcik; kompUygula() }
        arac(R.drawable.ic_terazi, "Terazi", "terazi") { teraziAcik = !teraziAcik; kompUygula() }
        kok.addView(aracSerit)

        // Mod şeridi
        modSerit = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        modKaydir = HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false; addView(modSerit) }
        kok.addView(modKaydir); aciklamalar.add(modKaydir to "Kaydır: çekim modu")
        modlariCiz()

        // Alt sıra: son çekim · deklanşör · çevir
        altSira = FrameLayout(this)
        sonResim = ImageView(this).apply { scaleType = ImageView.ScaleType.CENTER_CROP; background = GradientDrawable().apply { cornerRadius = dp(12f).toFloat(); setColor(Color.rgb(74, 81, 92)); setStroke(1, Color.argb(50, 255, 255, 255)) }; clipToOutline = true
            contentDescription = "Son çekim"; setOnClickListener { sonuAc() } }
        donenler.add(sonResim); aciklamalar.add(sonResim to "Son çekim")
        altSira.addView(sonResim, FrameLayout.LayoutParams(dp(52f), dp(52f), Gravity.START or Gravity.CENTER_VERTICAL).apply { marginStart = dp(34f) })
        deklansorDugme = KayitDugmesi(this).apply { setOnClickListener { deklansorBasildi() }; contentDescription = "Çek"
            setOnLongClickListener { seriBasla() }
            setOnTouchListener { _, e -> if (e.actionMasked == MotionEvent.ACTION_UP || e.actionMasked == MotionEvent.ACTION_CANCEL) seriBitir(); false } }; aciklamalar.add(deklansorDugme to "Çek")
        altSira.addView(deklansorDugme, FrameLayout.LayoutParams(dp(82f), dp(82f), Gravity.CENTER))
        val cevir = ikon(R.drawable.ic_cevir, "Kamerayı çevir") { kameraCevir() }.apply { background = Tema.kapsul(CAM) }; aciklamalar.add(cevir to "Ön / arka")
        altSira.addView(cevir, FrameLayout.LayoutParams(dp(52f), dp(52f), Gravity.END or Gravity.CENTER_VERTICAL).apply { marginEnd = dp(34f) })
        kok.addView(altSira)

        setContentView(kok)
        yerlestir(); kompUygula(); modUygula(ilk = true); sonCekimiBul()
    }

    /** Güvenli alana göre konumlar */
    private fun yerlestir() {
        if (!this::kok.isInitialized) return
        val u = if (ustBosluk == 0) dp(32f) else ustBosluk; val a = if (altBosluk == 0) dp(16f) else altBosluk
        ustSerit.layoutParams = FrameLayout.LayoutParams(-1, dp(48f), Gravity.TOP).apply { topMargin = u + dp(4f); marginStart = dp(14f); marginEnd = dp(14f) }
        altSira.layoutParams = FrameLayout.LayoutParams(-1, dp(96f), Gravity.BOTTOM).apply { bottomMargin = a + dp(8f) }
        modKaydir.layoutParams = FrameLayout.LayoutParams(-1, dp(40f), Gravity.BOTTOM).apply { bottomMargin = a + dp(8f) + dp(100f) }
        aracSerit.layoutParams = FrameLayout.LayoutParams(-1, dp(52f), Gravity.BOTTOM).apply { bottomMargin = a + dp(8f) + dp(142f) }
        kutu.layoutParams = FrameLayout.LayoutParams(-1, -1).apply { topMargin = u + dp(56f); bottomMargin = a + dp(8f) + dp(198f) }
        kok.requestLayout()
    }

    private fun cip(renk: Int) = TextView(this).apply {
        textSize = 13f; typeface = kosul; setTextColor(Color.WHITE); setPadding(dp(12f), dp(7f), dp(12f), dp(7f)); background = cam(dp(16f).toFloat()); visibility = View.GONE
        tag = renk
    }

    /* ================= modlar ================= */
    private fun modlariCiz() {
        modSerit.removeAllViews()
        val ekranG = resources.displayMetrics.widthPixels
        modSerit.addView(View(this), LinearLayout.LayoutParams(ekranG / 2 - dp(40f), 1))
        KMod.values().forEach { m -> modSerit.addView(etiket(m.ad, 15f, if (m == mod) (if (m == KMod.MONITOR) MAVI_ACIK else TURUNCU) else Color.argb(160, 255, 255, 255)).apply {
            setPadding(dp(10f), dp(6f), dp(10f), dp(6f)); tag = m; contentDescription = m.ad; setOnClickListener { modSec(m) } }) }
        modSerit.addView(View(this), LinearLayout.LayoutParams(ekranG / 2 - dp(40f), 1))
        modKaydir.post { (0 until modSerit.childCount).map { modSerit.getChildAt(it) }.firstOrNull { it.tag == mod }?.let { v -> modKaydir.smoothScrollTo(v.left + v.width / 2 - modKaydir.width / 2, 0) } }
    }

    private fun modSec(m: KMod, kartlar: Boolean = true) {
        if (m == mod) { if (m == KMod.PRO && kartlar) proKartlar(); return }
        if (kayitSuruyor()) return tost("Kayıt sürerken mod değişmez.")
        if (m == KMod.MONITOR) { monitoreGec(); return }
        mod = m; tercih.edit().putString("mod", m.name).apply()
        modlariCiz(); modUygula()
        if (m == KMod.PRO && kartlar) proKartlar()
    }

    private fun modUygula(ilk: Boolean = false) {
        val k = kaynak
        deklansorDugme.foto = mod.foto; deklansorDugme.kayitta = kayitSuruyor()
        sureSira.visibility = if (mod == KMod.TIMELAPSE) View.VISIBLE else View.GONE
        if (mod == KMod.TIMELAPSE) sureCiz()
        sahneOnerisi = null; sahneCip.visibility = View.GONE
        proCiz()
        if (!ilk && k != null) {
            k.sahne = mod.sahne; k.pro = proIstek()
            if (k.fotoModu != mod.foto) k.modDegistir(mod.foto) { w, h -> monitor.tampon(w, h); runOnUiThread { bilgiCiz(); komp.invalidate() } } else k.ayarDegisti()
        }
        bilgiCiz(); flasCiz()
    }

    /* ================= PRO MODLAR: hazır çekim modları ================= */
    private fun proIstek() = if (mod == KMod.PRO) proMod to proMod.oku(tercih) else null
    /** Seçili PRO modun ayarları kameraya gider */
    private fun proGonder() { kaynak?.let { it.pro = proIstek(); it.ayarDegisti() } }
    /** Başka yerden (sahne önerisi) bir PRO mod seçilir */
    private fun proSec(m: ProMod) {
        proMod = m; tercih.edit().putString("proMod", m.name).apply()
        if (mod != KMod.PRO) modSec(KMod.PRO, kartlar = false) else { proCiz(); proGonder() }
        if (m.tele) kaynak?.zoomAralik?.let { zoomAyarla(minOf(it.upper, 3f)) } // kuş/uçak: en uzun objektif (3× ve üstü telefoto)
        proUyari(m)
    }

    private fun proCiz() {
        val acik = mod == KMod.PRO
        proCip.visibility = if (acik) View.VISIBLE else View.GONE
        if (acik) proCip.text = proMod.ozet(proMod.oku(tercih)) + "  ›"
        (oneriCip.layoutParams as FrameLayout.LayoutParams).topMargin = dp(if (acik) 54f else 12f)
    }

    /** 3×3 kart: simge, ad, tek satır ipucu; seçili kart turuncu çerçeveli */
    private fun proKartlar() {
        val p = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; background = saydamPano(dp(26f).toFloat()); setPadding(dp(14f), dp(16f), dp(14f), dp(14f)); isClickable = true }
        p.addView(etiket("PRO MODLAR", 18f).apply { gravity = Gravity.START or Gravity.CENTER_VERTICAL; typeface = kosulKalin; setPadding(dp(4f), 0, 0, dp(12f)); Tema.simge(this, R.drawable.ic_sahne, Color.WHITE, 20f) })
        ProMod.values().toList().chunked(3).forEach { sira ->
            val s = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            sira.forEach { m ->
                val secili = m == proMod
                val k = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL; setPadding(dp(6f), dp(12f), dp(6f), dp(10f)); contentDescription = m.ad
                    background = GradientDrawable().apply { cornerRadius = dp(16f).toFloat(); setColor(if (secili) Color.argb(60, 255, 107, 26) else Color.argb(26, 255, 255, 255)); if (secili) setStroke(dp(1.5f), TURUNCU) }
                    setOnClickListener { acilirKapat(); proSec(m) } }
                k.addView(ImageView(this).apply { setImageResource(m.simge); setColorFilter(if (secili) TURUNCU else Color.WHITE) }, LinearLayout.LayoutParams(dp(26f), dp(26f)))
                k.addView(etiket(m.ad, 14f, if (secili) TURUNCU else Color.WHITE).apply { setPadding(0, dp(6f), 0, dp(2f)) })
                k.addView(TextView(this).apply { text = m.ipucu; textSize = 10.5f; setTextColor(GRI); gravity = Gravity.CENTER; maxLines = 2; ellipsize = android.text.TextUtils.TruncateAt.END })
                s.addView(k, LinearLayout.LayoutParams(0, dp(118f), 1f).apply { marginStart = dp(4f); marginEnd = dp(4f) })
            }
            p.addView(s, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(8f) })
        }
        p.addView(TextView(this).apply { text = "Seçtikten sonra üstteki etikete dokunarak ayarları değiştirebilirsin."; textSize = 12f; setTextColor(GRI); gravity = Gravity.CENTER; setPadding(0, dp(4f), 0, 0) })
        acilirAc(p, ustTan = false); altGizle(true)
    }

    /** Mod seçilince kısa uyarı (tripod, sabitleme…); pencerenin dışına dokununca kapanır */
    private fun proUyari(m: ProMod) {
        acilirKapat()
        val perde = FrameLayout(this).apply { setBackgroundColor(Color.argb(110, 0, 0, 0)); setOnClickListener { acilirKapat() } }
        val k = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL; background = saydamPano(dp(24f).toFloat()); setPadding(dp(22f), dp(20f), dp(22f), dp(16f)); isClickable = true }
        k.addView(ImageView(this).apply { setImageResource(m.simge); setColorFilter(TURUNCU) }, LinearLayout.LayoutParams(dp(30f), dp(30f)))
        k.addView(etiket(m.ad, 18f).apply { typeface = kosulKalin; setPadding(0, dp(8f), 0, dp(6f)) })
        k.addView(TextView(this).apply { text = m.uyari; textSize = 15f; setTextColor(Color.WHITE); gravity = Gravity.CENTER; setLineSpacing(0f, 1.15f) })
        k.addView(TextView(this).apply { text = "Kapatmak için boşluğa dokun"; textSize = 11f; setTextColor(GRI); gravity = Gravity.CENTER; setPadding(0, dp(12f), 0, 0) })
        perde.addView(k, FrameLayout.LayoutParams(-1, -2, Gravity.CENTER).apply { marginStart = dp(36f); marginEnd = dp(36f) })
        kok.addView(perde, FrameLayout.LayoutParams(-1, -1)); acilir = perde
    }

    /**
     * "?": her düğmenin hemen yanında kısa açıklama; tekrar "?" ya da boşluğa dokununca kapanır.
     * Kutu düğmenin ortasına hizalı ve komşu düğmeye taşmayacak kadar dar; üstteki düğmelerinki altında, araç şeridininki üstünde,
     * deklanşör sırasınınki altında durur. Yer yoksa bir sıra öteye geçer; düğmeye kısa bir çizgi bağlar. Mod şeridinin ipucu ortada.
     */
    private fun yardimAcKapat() {
        yardimKatman?.let { kok.removeView(it); yardimKatman = null; return }
        acilirKapat()
        val kat = FrameLayout(this).apply { setBackgroundColor(Color.argb(130, 0, 0, 0)); setOnClickListener { yardimAcKapat() } }
        val kokYer = IntArray(2).also { kok.getLocationInWindow(it) }
        fun yer(v: View) = IntArray(2).also { v.getLocationInWindow(it); it[0] -= kokYer[0]; it[1] -= kokYer[1] }
        val g = kok.width; val pay = dp(6f)
        class Yer(val v: View, val metin: String, val x: Int, val y: Int) { val cx get() = x + v.width / 2; val cy get() = y + v.height / 2; val alt get() = y + v.height
            fun degerMi(l: Int, t: Int, r: Int, b: Int) = l < x + v.width && x < r && t < alt && y < b }
        // PRO etiketi biçim yazısının tam altında: ikisinin kutusu üst üste gelmesin diye o varken biçimin açıklaması yok
        val gorunen = aciklamalar.filter { it.first.isShown && it.first !== modKaydir && !(it.first === bilgiCip.parent && proCip.isShown) }.map { (v, m) -> yer(v).let { Yer(v, m, it[0], it[1]) } }
        val altSiradakiler = gorunen.filter { it.v.parent === altSira }
        val (ustler, altlar) = (gorunen - altSiradakiler.toSet()).partition { it.cy < kok.height / 2 }
        class Kutu(val cx: Int, val sol: Int, val sag: Int, val r: Int)
        val kutular = ArrayList<Pair<View, FrameLayout.LayoutParams>>() // çizgilerden sonra eklenir: çizgi kutunun arkasından geçer
        fun diz(grup: List<Yer>, asagi: Boolean) {
            if (grup.isEmpty()) return
            val taban = if (asagi) grup.maxOf { it.alt } + pay else grup.minOf { it.y } - pay
            val konan = ArrayList<Pair<Kutu, IntArray>>()
            grup.sortedBy { it.cx }.forEach { o ->
                // Aynı sıradaki komşu düğmeye kadar olan yer: kutu ona taşmasın
                val komsu = grup.filter { it !== o && abs(it.cy - o.cy) < dp(30f) }.minOfOrNull { abs(it.cx - o.cx) } ?: g
                val en = minOf((g - pay * 4) / 3, maxOf(komsu - pay, dp(92f)))
                val b = TextView(this).apply { text = o.metin; textSize = 11.5f; setTextColor(Color.WHITE); maxLines = 3; gravity = Gravity.CENTER
                    setPadding(dp(7f), dp(4f), dp(7f), dp(4f)); background = Tema.kapsul(Color.rgb(30, 33, 38), dp(9f).toFloat(), TURUNCU) }
                b.measure(View.MeasureSpec.makeMeasureSpec(en, View.MeasureSpec.AT_MOST), View.MeasureSpec.UNSPECIFIED)
                val bw = b.measuredWidth; val bh = b.measuredHeight
                val bx = (o.cx - bw / 2).coerceIn(pay, g - pay - bw)
                fun by(r: Int) = if (asagi) taban + r * (bh + pay) else taban - r * (bh + pay) - bh
                fun bos(r: Int, cizgiyeBak: Boolean): Boolean { val t = by(r)
                    return konan.none { (k, d) -> bx < k.sag + pay && k.sol < bx + bw + pay && t < d[1] + pay && d[0] < t + bh + pay } &&  // başka kutu
                        gorunen.none { it !== o && it.degerMi(bx, t, bx + bw, t + bh) } &&                                                 // başka düğme
                        (!cizgiyeBak || konan.none { (k, _) -> k.r < r && o.cx in (k.sol - pay)..(k.sag + pay) }) }                         // çizgisi önceki kutudan geçmesin
                val r = (0 until 12).firstOrNull { bos(it, true) } ?: (0 until 12).firstOrNull { bos(it, false) } ?: 0
                val t = by(r); konan.add(Kutu(o.cx, bx, bx + bw, r) to intArrayOf(t, t + bh))
                val cizgiUst = if (asagi) o.alt else t + bh; val cizgiAlt = if (asagi) t else o.y
                if (cizgiAlt > cizgiUst) kat.addView(View(this).apply { setBackgroundColor(Color.argb(170, 255, 107, 26)) },
                    FrameLayout.LayoutParams(dp(1f), cizgiAlt - cizgiUst).apply { leftMargin = o.cx; topMargin = cizgiUst })
                kutular.add(b to FrameLayout.LayoutParams(bw, bh).apply { leftMargin = bx; topMargin = t })
            }
        }
        diz(ustler, asagi = true); diz(altlar, asagi = false)
        // Deklanşör sırası: altında yer varsa altına, yoksa üstüne
        val altBos = altSiradakiler.maxOfOrNull { kok.height - it.alt } ?: 0
        diz(altSiradakiler, asagi = altBos >= dp(30f))
        kutular.forEach { (b, lp) -> kat.addView(b, lp) }
        if (modKaydir.isShown) kat.addView(TextView(this).apply { text = "Mod değiştirmek için alttaki şeridi ya da görüntüyü yana kaydır.\nKapatmak için herhangi bir yere dokun."
            textSize = 13f; setTextColor(Color.WHITE); gravity = Gravity.CENTER; setLineSpacing(0f, 1.2f); setShadowLayer(dp(3f).toFloat(), 0f, dp(1f).toFloat(), Color.BLACK) },
            FrameLayout.LayoutParams(-2, -2, Gravity.CENTER).apply { marginStart = dp(32f); marginEnd = dp(32f) })
        kok.addView(kat, FrameLayout.LayoutParams(-1, -1)); yardimKatman = kat
    }

    /** Özelleştir: her ayar tek satır hazır seçenek (kaydırıcı yok); değişiklik bu mod için saklanır */
    private fun proOzellestir() {
        val m = proMod; val a = m.oku(tercih)
        val ic = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(18f), dp(16f), dp(18f), dp(14f)) }
        ic.addView(etiket(m.ad.uppercase(Locale("tr")), 18f).apply { gravity = Gravity.START or Gravity.CENTER_VERTICAL; typeface = kosulKalin; Tema.simge(this, m.simge, TURUNCU, 20f) })
        ic.addView(TextView(this).apply { text = m.ipucu; textSize = 12f; setTextColor(GRI); setPadding(0, dp(4f), 0, dp(4f)) })
        fun degistir(y: ProAyar) { m.yaz(tercih, y); proCiz(); proGonder(); proOzellestir() }
        // Başlık: Pro modlardaki kısaltma (ISO, S, EV, WB, AF/MF) ve yanında tek kelime Türkçe karşılığı
        fun <T> satir(kisa: String, ad: String, secenekler: List<T>, secili: T, yazi: (T) -> String, vurgu: T? = null, sec: (T) -> ProAyar) {
            ic.addView(TextView(this).apply { textSize = 13f; setTextColor(Color.WHITE); setPadding(0, dp(12f), 0, dp(6f)); contentDescription = ad
                text = android.text.SpannableString("$kisa  $ad").apply {
                    setSpan(android.text.style.StyleSpan(Typeface.BOLD), 0, kisa.length, 0); setSpan(android.text.style.RelativeSizeSpan(1.15f), 0, kisa.length, 0)
                    setSpan(android.text.style.ForegroundColorSpan(GRI), kisa.length, length, 0) } })
            val s = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            var seciliGorunum: View? = null
            secenekler.forEach { o -> val ac = o == secili
                val vurgulu = vurgu != null && o == vurgu
                s.addView(etiket(yazi(o), 13f, if (ac) Color.BLACK else if (vurgulu) SARI else Color.WHITE).apply {
                    background = Tema.kapsul(if (ac) TURUNCU else if (vurgulu) Color.argb(36, 255, 204, 0) else Color.argb(26, 255, 255, 255), dp(10f).toFloat(), if (vurgulu && !ac) SARI else 0)
                    setPadding(dp(12f), 0, dp(12f), 0); minWidth = dp(48f)
                    setOnClickListener { degistir(sec(o)) }; if (ac) seciliGorunum = this }, LinearLayout.LayoutParams(-2, dp(40f)).apply { marginEnd = dp(6f) }) }
            val k = HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false; addView(s) }
            ic.addView(k); seciliGorunum?.let { v -> k.post { k.scrollTo((v.left - dp(60f)).coerceAtLeast(0), 0) } }
        }
        val baz = kaynak?.bazIso ?: ornekBazIso
        val isolar = if (baz == null || baz in ProMod.ISOLAR) ProMod.ISOLAR else (ProMod.ISOLAR + baz).sortedBy { it ?: 0 }
        // Baz ISO (en temiz): seçeneklerde sarı renkte ve yanında "baz" yazısıyla
        satir("ISO", "Duyarlılık", isolar, a.iso, { if (it != null && it == baz) "$it baz" else ProMod.isoYazi(it) }, vurgu = baz) { a.copy(iso = it) }
        if (m != ProMod.GECE_SEHIR) satir("S", "Enstantane", ProMod.ENSTLER, a.enstNs, ProMod::enstYazi) { a.copy(enstNs = it) }
        if (a.iso == null || a.enstNs == null) satir("EV", "Pozlama telafisi", ProMod.EVLER, a.ev, ProMod::evYazi) { a.copy(ev = it) }
        satir("WB", "Beyaz dengesi", ProMod.BDLER, a.bd, ProMod::bdYazi) { a.copy(bd = it) }
        satir("AF/MF", "Odak", ProMod.ODAKLAR, a.odak, ProMod::odakYazi) { a.copy(odak = it) }
        if (m.sureVar) satir("T", "Toplam süre", ProMod.SURELER, a.sureSn, ProMod::sureYazi) { a.copy(sureSn = it) }
        satir("⏱", "Zamanlayıcı", ProMod.ZAMANLAR, a.zamanlayici, ProMod::zamanYazi) { a.copy(zamanlayici = it) }
        val alt = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(0, dp(16f), 0, 0) }
        alt.addView(TextView(this).apply { text = "Varsayılana dön"; textSize = 15f; setTextColor(if (a == m.varsayilan) GRI else MAVI_ACIK); gravity = Gravity.CENTER_VERTICAL; minHeight = dp(44f)
            Tema.simge(this, R.drawable.ic_geri, currentTextColor, 16f); setOnClickListener { if (a != m.varsayilan) degistir(m.varsayilan) } }, LinearLayout.LayoutParams(0, -2, 1f))
        alt.addView(etiket("Tamam", 15f, Color.BLACK).apply { background = Tema.kapsul(Color.WHITE, dp(12f).toFloat()); setPadding(dp(22f), 0, dp(22f), 0); setOnClickListener { acilirKapat() } }, LinearLayout.LayoutParams(-2, dp(44f)))
        ic.addView(alt)
        val p = ScrollView(this).apply { background = saydamPano(dp(26f).toFloat()); addView(ic); isClickable = true; clipToOutline = true }
        acilirAc(p, ustTan = false); altGizle(true)
        p.post { val en = (resources.displayMetrics.heightPixels * 0.7f).toInt(); if (p.height > en) p.layoutParams = (p.layoutParams as FrameLayout.LayoutParams).apply { height = en } }
    }

    /** Mod şeridinin üstündeki hızlı seçim: timelapse'te kare aralığı */
    private fun sureCiz() {
        sureSira.removeAllViews()
        Timelapse.HIZLI.forEach { ms -> sureSira.addView(TextView(this).apply {
            text = Timelapse.aralikYazi(ms); textSize = 13f; typeface = kosul; gravity = Gravity.CENTER; setTextColor(if (tlAralik == ms) Color.BLACK else Color.WHITE)
            background = Tema.kapsul(if (tlAralik == ms) TURUNCU else CAM, dp(14f).toFloat()); setPadding(dp(12f), 0, dp(12f), 0); contentDescription = "Kare aralığı ${text}"
            setOnClickListener { if (tlKaydedici != null) return@setOnClickListener; tlAralik = ms; tercih.edit().putLong("tlAralik", ms).apply(); sureCiz(); bilgiCiz() } }, LinearLayout.LayoutParams(-2, dp(32f)).apply { marginEnd = dp(6f) }) }
    }

    /* ================= dokunma: odak, kaydırma (mod), iki parmak (yakınlaştırma) ================= */
    private fun dokunmaKur() {
        val olcek = ScaleGestureDetector(this, object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
            override fun onScale(d: ScaleGestureDetector): Boolean { zoomAyarla(ayar.zoomOrani * d.scaleFactor); return true }
        })
        val jest = GestureDetector(this, object : GestureDetector.SimpleOnGestureListener() {
            override fun onDown(e: MotionEvent) = true
            override fun onSingleTapUp(e: MotionEvent): Boolean { odakDokun(e.x, e.y); return true }
            override fun onLongPress(e: MotionEvent) { kaynak?.odakSerbest(); odakKare.visibility = View.GONE; tost("Otomatik odak") }
            override fun onFling(a: MotionEvent?, b: MotionEvent, vx: Float, vy: Float): Boolean {
                if (a == null || abs(vx) < abs(vy) * 1.5f || abs(b.x - a.x) < dp(60f)) return false
                val modlar = KMod.values().filter { it != KMod.MONITOR }; val i = modlar.indexOf(mod)
                val j = if (vx < 0) i + 1 else i - 1
                if (j in modlar.indices) modSec(modlar[j]); return true
            }
        })
        monitor.setOnTouchListener { _, e -> olcek.onTouchEvent(e); if (!olcek.isInProgress) jest.onTouchEvent(e); true }
    }

    private fun odakDokun(x: Float, y: Float) {
        val r = monitor.goruntuAlani(); if (!r.contains(x, y)) return
        val k = kaynak ?: return
        k.odakla((x - r.left) / r.width(), (y - r.top) / r.height(), 0)
        odakKare.translationX = x - dp(36f); odakKare.translationY = y - dp(36f)
        odakKare.visibility = View.VISIBLE; odakKare.alpha = 1f; odakKare.scaleX = 1.3f; odakKare.scaleY = 1.3f
        odakKare.animate().scaleX(1f).scaleY(1f).setDuration(180).withEndAction { odakKare.animate().alpha(0.5f).setStartDelay(1200).setDuration(400) }
    }

    /* ================= yakınlaştırma ================= */
    private fun zoomAyarla(v: Float) {
        val z = kaynak?.zoomAralik ?: return
        ayar.zoomOrani = v.coerceIn(z.lower, minOf(z.upper, 10f)); kaynak?.ayarDegisti(); zoomCiz()
    }

    private fun zoomCiz() {
        (0 until zoomSira.childCount).forEach { donenler.remove(zoomSira.getChildAt(it)) }
        zoomSira.removeAllViews()
        val z = kaynak?.zoomAralik ?: return
        val duraklar = ArrayList<Float>()
        if (z.lower < 0.95f) duraklar.add(z.lower)
        duraklar.add(1f); if (z.upper >= 2f) duraklar.add(2f); if (z.upper >= 5f) duraklar.add(5f)
        val yakin = duraklar.minByOrNull { abs(it - ayar.zoomOrani) }
        duraklar.forEach { d ->
            val secili = d == yakin
            val yazi = if (secili) (if (abs(ayar.zoomOrani - d) < 0.05f) fmt(d) + "×" else fmt(ayar.zoomOrani) + "×") else fmt(d)
            zoomSira.addView(TextView(this).apply {
                text = yazi; textSize = if (secili) 14f else 13f; typeface = kosulKalin; gravity = Gravity.CENTER; setTextColor(if (secili) TURUNCU else Color.WHITE)
                background = Tema.kapsul(Color.argb(158, 20, 22, 26)); setOnClickListener { zoomAyarla(d) }; donenler.add(this); rotation = -fizikselYon.toFloat()
            }, LinearLayout.LayoutParams(dp(if (secili) 44f else 38f), dp(if (secili) 44f else 38f)).apply { marginStart = dp(5f); marginEnd = dp(5f) })
        }
    }
    private fun fmt(v: Float) = if (v < 1f) ".${(v * 10).toInt()}" else if (v % 1f == 0f) "${v.toInt()}" else "%.1f".format(v).replace('.', ',')

    /* ================= flaş ================= */
    private fun flasDegistir() {
        if (kaynak?.flasVar != true) return tost("Bu kamerada flaş yok.")
        ayar.flas = if (mod.foto) (when (ayar.flas) { 0 -> 1; 1 -> 2; else -> 0 }) else (if (ayar.flas == 3) 0 else 3)
        ayarKaydet(); kaynak?.ayarDegisti(); flasCiz()
        tost(when (ayar.flas) { 1 -> "Flaş: otomatik"; 2 -> "Flaş: açık"; 3 -> "Fener açık"; else -> "Flaş kapalı" })
    }
    private fun flasCiz() {
        if (!this::flasIkon.isInitialized) return
        if (!mod.foto && ayar.flas in 1..2) { ayar.flas = 0; kaynak?.ayarDegisti() }
        if (mod.foto && ayar.flas == 3) { ayar.flas = 0; kaynak?.ayarDegisti() }
        flasIkon.setImageResource(if (ayar.flas == 0) R.drawable.ic_flas_yok else R.drawable.ic_flas)
        flasIkon.setColorFilter(if (ayar.flas >= 2) TURUNCU else Color.WHITE)
        flasHarf.visibility = if (ayar.flas == 1) View.VISIBLE else View.GONE
    }

    /* ================= kompozisyon ================= */
    private fun kompUygula() {
        komp.tur = kompTur; komp.yon = kompYon; komp.asistan = asistanAcik
        tercih.edit().putString("komp", kompTur.name).putInt("kompYon", kompYon).putString("sonKomp", sonKomp.name).putBoolean("asistan", asistanAcik)
            .putBoolean("terazi", teraziAcik).putBoolean("oneri", oneriAcik).putBoolean("sahneOto", sahneOto).apply()
        if (asistanAcik && asistan == null) asistan = Asistan { r, ad, yuz -> runOnUiThread { sonYuz = yuz; asistanSonuc(r, ad) } }
        if (!asistanAcik) { asistan?.kapat(); asistan = null; komp.konu = null; oneriCip.visibility = View.GONE }
        if (!teraziAcik) komp.egim = null
        sensorKaydi()
        if (!asistanAcik) { komp.analiz = null; komp.ipucu = null }
        monitor.olcumKaresi = if (asistanAcik || sahneOto) { buf, w, h -> asistan?.kare(buf, w, h); if (sahneOto) renkOlc(buf, w, h)
            if (asistanAcik) { val oran = komp.goruntuOrani(); analiz.kare(buf, w, h, oran) { s -> runOnUiThread { komp.analiz = s; ipucuGuncelle() } } } } else null
        if (this::aracSerit.isInitialized) aracCiz()
    }

    private fun sensorKaydi() {
        sensorler.unregisterListener(yercekimDinle)
        if ((teraziAcik || sahneOto) && onde) sensorler.getDefaultSensor(android.hardware.Sensor.TYPE_GRAVITY)?.let { sensorler.registerListener(yercekimDinle, it, android.hardware.SensorManager.SENSOR_DELAY_UI) }
    }

    private fun asistanSonuc(r: RectF?, ad: String) {
        komp.konu = r; komp.konuAdi = ad
        if (kompTur == KompTur.KAPALI && r != null) { kompTur = sonKomp; kompUygula() }
        val o = if (oneriAcik) kompozisyonOner(r, kompTur, komp.goruntuOrani(), komp.analiz) else null
        sonOneri = o
        if (o == null || komp.hizalama > 0.85f || kayitCip.visibility == View.VISIBLE) oneriCip.visibility = View.GONE
        else { oneriCip.text = "Öneri: ${o.first.ad}  ›  Uygula"; oneriCip.visibility = View.VISIBLE }
        ipucuGuncelle()
    }

    /** Yön tarifi: konu, yüz ve görüntü analizinden tek satır (titremesin diye sabitlenir) */
    private fun ipucuGuncelle() {
        komp.ipucu = if (!asistanAcik || kayitCip.visibility == View.VISIBLE) null
            else ipucuSabit.ver(ipucuUret(komp.konu, komp.konuAdi, sonYuz.takeIf { komp.konuAdi == "Yüz" }, komp.analiz, komp.hedefNokta, komp.hizalama))
    }

    private fun renkOlc(b: java.nio.ByteBuffer, w: Int, h: Int) {
        var r = 0L; var g = 0L; var bl = 0L; var n = 0; var i = 0; val son = w * h * 4
        while (i < son) { r += b.get(i).toInt() and 255; g += b.get(i + 1).toInt() and 255; bl += b.get(i + 2).toInt() and 255; n++; i += 32 }
        if (n > 0) renkOrt = floatArrayOf(r / (255f * n), g / (255f * n), bl / (255f * n))
    }

    /** Kılavuz menüsü: ayarlara gitmeden kılavuz, yön, yardımcı, öneri, terazi */
    private fun kilavuzMenu() {
        if (acilir != null) return acilirKapat()
        val p = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; background = pano(dp(26f).toFloat()); setPadding(dp(16f), dp(14f), dp(16f), dp(10f)); isClickable = true }
        p.addView(etiket("KOMPOZİSYON KILAVUZU", 13f, GRI).apply { gravity = Gravity.START or Gravity.CENTER_VERTICAL; setPadding(dp(4f), 0, 0, dp(10f)); Tema.simge(this, R.drawable.ic_kilavuz, GRI, 16f) })
        val izgara = android.widget.GridLayout(this).apply { columnCount = 4 }
        KompTur.values().forEach { t ->
            val h = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL; setPadding(dp(3f), dp(4f), dp(3f), dp(6f)); setOnClickListener { kompTur = t; if (t != KompTur.KAPALI) sonKomp = t; kompUygula(); acilirKapat(); kilavuzMenu() } }
            val on = FrameLayout(this).apply { background = GradientDrawable().apply { cornerRadius = dp(10f).toFloat(); setColor(Color.rgb(58, 64, 73)); setStroke(dp(if (t == kompTur) 2f else 1f), if (t == kompTur) TURUNCU else Color.argb(30, 255, 255, 255)) }; clipToOutline = true }
            if (t != KompTur.KAPALI) on.addView(KompozisyonGorunum(this) { RectF(0f, 0f, dp(72f).toFloat(), dp(54f).toFloat()) }.also { it.tur = t; it.yon = kompYon }, FrameLayout.LayoutParams(-1, -1))
            h.addView(on, LinearLayout.LayoutParams(dp(72f), dp(54f)))
            h.addView(TextView(this).apply { text = t.ad; textSize = 11f; setTextColor(if (t == kompTur) TURUNCU else Color.WHITE); gravity = Gravity.CENTER; setPadding(0, dp(4f), 0, 0) })
            izgara.addView(h)
        }
        p.addView(izgara)
        if (kompTur == KompTur.SPIRAL || kompTur == KompTur.UCGEN) {
            val yonler = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(dp(4f), dp(8f), 0, dp(4f)) }
            yonler.addView(TextView(this).apply { text = "Yön"; textSize = 13f; setTextColor(GRI); setPadding(0, 0, dp(10f), 0) })
            listOf("↘", "↙", "↗", "↖").forEachIndexed { i, ok -> yonler.addView(etiket(ok, 14f, if (i == kompYon) Color.BLACK else Color.WHITE).apply {
                background = Tema.kapsul(if (i == kompYon) TURUNCU else Color.argb(26, 255, 255, 255), dp(10f).toFloat()); setOnClickListener { kompYon = i; kompUygula(); acilirKapat(); kilavuzMenu() } }, LinearLayout.LayoutParams(dp(46f), dp(34f)).apply { marginEnd = dp(8f) }) }
            p.addView(yonler)
        }
        p.addView(View(this).apply { setBackgroundColor(Color.argb(20, 255, 255, 255)) }, LinearLayout.LayoutParams(-1, 1).apply { topMargin = dp(10f); bottomMargin = dp(4f) })
        p.addView(anahtar("Akıllı yardımcı (ibre)", asistanAcik) { asistanAcik = it; kompUygula() })
        p.addView(anahtar("Otomatik kılavuz önerisi", oneriAcik) { oneriAcik = it; kompUygula() })
        p.addView(anahtar("Terazi", teraziAcik) { teraziAcik = it; kompUygula() })
        acilirAc(p, ustTan = true)
    }

    private fun anahtar(ad: String, acik: Boolean, degis: (Boolean) -> Unit): View {
        val s = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(dp(4f), dp(8f), dp(4f), dp(8f)) }
        s.addView(TextView(this).apply { text = ad; textSize = 15f; setTextColor(Color.WHITE); Tema.simgeAdi(ad)?.let { Tema.simge(this, it, GRI) } }, LinearLayout.LayoutParams(0, -2, 1f))
        val sw = android.widget.Switch(this).apply { isChecked = acik; thumbTintList = android.content.res.ColorStateList.valueOf(Color.WHITE)
            trackTintList = android.content.res.ColorStateList(arrayOf(intArrayOf(android.R.attr.state_checked), intArrayOf()), intArrayOf(TURUNCU, Color.argb(70, 255, 255, 255))); trackTintMode = android.graphics.PorterDuff.Mode.SRC
            setOnCheckedChangeListener { _, b -> degis(b) } }
        s.addView(sw)
        return s
    }

    private fun acilirAc(v: View, ustTan: Boolean, altPay: Int = 0) {
        acilirKapat()
        val perde = FrameLayout(this).apply { setOnClickListener { acilirKapat() } }
        val lp = FrameLayout.LayoutParams(-1, -2, if (ustTan) Gravity.TOP else Gravity.BOTTOM).apply {
            marginStart = dp(12f); marginEnd = dp(12f)
            if (ustTan) topMargin = (ustSerit.layoutParams as FrameLayout.LayoutParams).topMargin + dp(54f) else bottomMargin = (if (altBosluk == 0) dp(16f) else altBosluk) + dp(12f) + altPay
        }
        perde.addView(v, lp)
        kok.addView(perde, FrameLayout.LayoutParams(-1, -1)); acilir = perde
    }
    private fun acilirKapat() { acilir?.let { kok.removeView(it) }; acilir = null; if (this::aracSerit.isInitialized) { aracCiz(); altGizle(false) } }
    /** Yarı saydam PRO panelleri açıkken arkadaki alt düğmeler görünmesin (yazılar birbirine karışmasın) */
    private fun altGizle(gizle: Boolean) = listOf(aracSerit, modKaydir, altSira).forEach { it.visibility = if (gizle) View.INVISIBLE else View.VISIBLE }

    /* ================= cetvel: pozlama, beyaz denge, odak (Final Cut Camera gibi alttan) ================= */
    enum class Cetvel { POZ, BD, ODAK }
    private val BD_ADLARI = linkedMapOf(CameraMetadata.CONTROL_AWB_MODE_AUTO to "Oto", CameraMetadata.CONTROL_AWB_MODE_INCANDESCENT to "3200K",
        CameraMetadata.CONTROL_AWB_MODE_FLUORESCENT to "4000K", CameraMetadata.CONTROL_AWB_MODE_DAYLIGHT to "5600K", CameraMetadata.CONTROL_AWB_MODE_CLOUDY_DAYLIGHT to "6500K", CameraMetadata.CONTROL_AWB_MODE_SHADE to "7500K")
    private val BD_ACIKLAMA = mapOf(CameraMetadata.CONTROL_AWB_MODE_INCANDESCENT to "Ampul", CameraMetadata.CONTROL_AWB_MODE_FLUORESCENT to "Floresan", CameraMetadata.CONTROL_AWB_MODE_DAYLIGHT to "Gün ışığı",
        CameraMetadata.CONTROL_AWB_MODE_CLOUDY_DAYLIGHT to "Bulutlu", CameraMetadata.CONTROL_AWB_MODE_SHADE to "Gölge")
    private fun evYazi(ev: Int, adim: Float) = if (ev == 0) "±0" else "%+.1f".format(ev * adim).replace('.', ',')

    private fun cetvelAc(c: Cetvel) {
        if (mod == KMod.PRO) return proOzellestir() // PRO MODLAR'da pozlama, beyaz denge ve odak modun ayarlarında
        val k = kaynak ?: return tost("Kamera hazır değil.")
        val y = k.yetenek
        val p = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; background = pano(dp(22f).toFloat()); setPadding(dp(16f), dp(12f), dp(16f), dp(12f)); isClickable = true }
        val bas = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        val baslik = TextView(this).apply { textSize = 15f; typeface = kosul; setTextColor(Color.WHITE) }
        val deger = TextView(this).apply { textSize = 15f; typeface = mono; setTextColor(TURUNCU); setPadding(dp(10f), 0, 0, 0) }
        bas.addView(baslik); bas.addView(deger); bas.addView(View(this), LinearLayout.LayoutParams(0, 1, 1f))
        val oto = etiket("OTO", 13f, Color.BLACK).apply { setPadding(dp(14f), 0, dp(14f), 0) }
        bas.addView(oto, LinearLayout.LayoutParams(-2, dp(30f)))
        p.addView(bas)
        fun otoCiz(acik: Boolean) { oto.background = Tema.kapsul(if (acik) TURUNCU else Color.argb(36, 255, 255, 255)); oto.setTextColor(if (acik) Color.BLACK else Color.WHITE) }
        fun cubuk(en: Int, simdi: Int, degisti: (Int) -> Unit) = p.addView(android.widget.SeekBar(this).apply {
            max = en; progress = simdi
            progressTintList = android.content.res.ColorStateList.valueOf(TURUNCU); thumbTintList = android.content.res.ColorStateList.valueOf(Color.WHITE)
            progressBackgroundTintList = android.content.res.ColorStateList.valueOf(Color.argb(90, 255, 255, 255))
            setOnSeekBarChangeListener(object : android.widget.SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(s: android.widget.SeekBar?, v: Int, kullanici: Boolean) { if (kullanici) degisti(v) }
                override fun onStartTrackingTouch(s: android.widget.SeekBar?) {}
                override fun onStopTrackingTouch(s: android.widget.SeekBar?) { ayarKaydet() }
            }) }, LinearLayout.LayoutParams(-1, dp(44f)).apply { topMargin = dp(6f) })
        fun not(t: String) = p.addView(TextView(this).apply { text = t; textSize = 12f; setTextColor(GRI); setPadding(0, dp(4f), 0, 0) })
        when (c) {
            Cetvel.POZ -> {
                Tema.simge(baslik, R.drawable.ic_pozlama, Color.WHITE); baslik.text = "Pozlama"
                val r = y.evAralik
                if (r == null || r.upper == 0) { deger.text = ""; oto.visibility = View.GONE; not("Bu kamerada pozlama telafisi yok.") }
                else {
                    deger.text = evYazi(ayar.ev, y.evAdim); otoCiz(ayar.ev == 0)
                    cubuk(r.upper - r.lower, ayar.ev - r.lower) { v -> ayar.ev = v + r.lower; k.ayarDegisti(); deger.text = evYazi(ayar.ev, y.evAdim); otoCiz(ayar.ev == 0) }
                    oto.setOnClickListener { ayar.ev = 0; k.ayarDegisti(); ayarKaydet(); cetvelAc(c) }
                    not("Sola: daha karanlık · sağa: daha aydınlık")
                }
            }
            Cetvel.BD -> {
                Tema.simge(baslik, R.drawable.ic_beyaz, Color.WHITE); baslik.text = "Beyaz denge"
                deger.text = BD_ADLARI[ayar.awb] ?: "Oto"; oto.visibility = View.GONE
                val satir = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
                BD_ADLARI.keys.filter { it in y.awbModlari }.forEach { m ->
                    val sec = ayar.awb == m
                    satir.addView(LinearLayout(this).apply {
                        orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; setPadding(dp(12f), dp(6f), dp(12f), dp(6f))
                        background = Tema.kapsul(if (sec) TURUNCU else Color.argb(30, 255, 255, 255), dp(12f).toFloat())
                        addView(etiket(BD_ADLARI[m]!!, 13f, if (sec) Color.BLACK else Color.WHITE))
                        BD_ACIKLAMA[m]?.let { addView(etiket(it, 10f, if (sec) Color.DKGRAY else GRI)) }
                        setOnClickListener { ayar.awb = m; k.ayarDegisti(); ayarKaydet(); cetvelAc(c) }
                    }, LinearLayout.LayoutParams(-2, dp(48f)).apply { marginEnd = dp(6f) })
                }
                p.addView(HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false; addView(satir) }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10f) })
            }
            Cetvel.ODAK -> {
                Tema.simge(baslik, R.drawable.ic_odak, Color.WHITE); baslik.text = "Odak"
                fun yaz() { deger.text = ayar.odakMesafe?.let { if (it <= 0f) "Sonsuz" else "%.2f m".format(1f / it).replace('.', ',') } ?: "Oto"; otoCiz(ayar.odakMesafe == null) }
                yaz()
                oto.setOnClickListener { ayar.odakMesafe = null; k.ayarDegisti(); k.odakSerbest(); ayarKaydet(); cetvelAc(c) }
                if (y.minOdak > 0f) {
                    cubuk(1000, ((ayar.odakMesafe ?: 0f) / y.minOdak * 1000).toInt()) { v -> ayar.odakMesafe = y.minOdak * v / 1000f; k.ayarDegisti(); yaz() }
                    not("Sola: uzak (sonsuz) · sağa: yakın. Ekrana dokunmak da odaklar.")
                } else not("Bu kamerada el ile odak yok; ekrana dokunarak odakla.")
            }
        }
        acilirAc(p, ustTan = false, altPay = dp(194f))
        aracCiz(c)
    }

    /** Araç şeridinin yazıları ve renkleri: ayar değişmişse değeri turuncu yazar */
    private fun aracCiz(acik: Cetvel? = null) {
        val k = kaynak; val evAdim = k?.yetenek?.evAdim?.takeIf { it > 0 } ?: 1f
        for (i in 0 until aracSerit.childCount) {
            val v = aracSerit.getChildAt(i) as LinearLayout
            val ikon = v.getChildAt(0) as ImageView; val yazi = v.getChildAt(1) as TextView
            val (metin, etkin) = when (v.tag) {
                "poz" -> (if (ayar.ev == 0) "Pozlama" else evYazi(ayar.ev, evAdim)) to (ayar.ev != 0 || acik == Cetvel.POZ)
                "bd" -> (if (ayar.awb == CameraMetadata.CONTROL_AWB_MODE_AUTO) "Beyaz" else BD_ADLARI[ayar.awb] ?: "Beyaz") to (ayar.awb != CameraMetadata.CONTROL_AWB_MODE_AUTO || acik == Cetvel.BD)
                "odak" -> (if (ayar.odakMesafe == null) "Odak" else "MF") to (ayar.odakMesafe != null || acik == Cetvel.ODAK)
                "kilavuz" -> (if (kompTur == KompTur.KAPALI) "Kılavuz" else kompTur.ad) to (kompTur != KompTur.KAPALI)
                "yardimci" -> "Yardımcı" to asistanAcik
                "terazi" -> "Terazi" to teraziAcik
                else -> "" to false
            }
            yazi.text = metin; val renk = if (etkin) TURUNCU else Color.WHITE
            yazi.setTextColor(renk); ikon.setColorFilter(renk)
        }
    }

    /* ================= ayarlar ================= */
    private fun ayarlarAc() {
        if (tlKaydedici != null) return tost("Timelapse sürerken ayarlar değişmez.")
        val k = kaynak
        val ic = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(18f), dp(16f), dp(18f), dp(16f)) }
        fun baslik(t: String, simge: Int) = ic.addView(etiket(t, 13f, GRI).apply { gravity = Gravity.START or Gravity.CENTER_VERTICAL; setPadding(0, dp(14f), 0, dp(6f)); Tema.simge(this, simge, GRI, 16f) })
        fun secim(ad: String, secenekler: List<String>, secili: Int, sec: (Int) -> Unit) {
            ic.addView(TextView(this).apply { text = ad; textSize = 14f; setTextColor(Color.WHITE); setPadding(0, dp(8f), 0, dp(6f)); Tema.simgeAdi(ad)?.let { Tema.simge(this, it, GRI) } })
            val s = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            secenekler.forEachIndexed { i, o -> s.addView(etiket(o, 13f, if (i == secili) Color.BLACK else Color.WHITE).apply {
                background = Tema.kapsul(if (i == secili) TURUNCU else Color.argb(26, 255, 255, 255), dp(10f).toFloat()); setPadding(dp(12f), 0, dp(12f), 0)
                setOnClickListener { sec(i); ayarlarAc() } }, LinearLayout.LayoutParams(-2, dp(36f)).apply { marginEnd = dp(6f) }) }
            ic.addView(HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false; addView(s) })
        }
        if (k != null) {
            baslik("FOTOĞRAF", R.drawable.ic_foto)
            val fb = k.fotoBoyutlari.distinctBy { it.width * 10 / it.height }.take(2) + k.fotoBoyutlari.take(4)
            val liste = fb.distinct().sortedByDescending { it.width * it.height }.take(5); val fs = k.secilenFotoBoyut()
            if (liste.isNotEmpty()) secim("Fotoğraf çözünürlüğü", liste.map { "%.0f MP · %s".format(it.width * it.height / 1e6, oran(it)) }, liste.indexOf(fs).coerceAtLeast(0)) {
                ayar.fotoBoyut = liste[it]; ayarKaydet(); k.oturumYenile { w, h -> monitor.tampon(w, h); runOnUiThread { bilgiCiz() } } }
            if (k.rawVar) ic.addView(anahtar("RAW (DNG) da kaydet", ayar.raw) { ayar.raw = it; ayarKaydet(); k.oturumYenile { w, h -> monitor.tampon(w, h); runOnUiThread { bilgiCiz() } } })
            secim("Zamanlayıcı", listOf("Kapalı", "3 sn", "10 sn"), when (zamanlayici) { 3 -> 1; 10 -> 2; else -> 0 }) { zamanlayici = intArrayOf(0, 3, 10)[it]; tercih.edit().putInt("zamanlayici", zamanlayici).apply() }
            ic.addView(anahtar("Deklanşör sesi", deklansorSesi) { deklansorSesi = it; tercih.edit().putBoolean("deklansor", it).apply() })
            baslik("VİDEO", R.drawable.ic_video)
            val vb = listOf(Size(1280, 720), Size(1920, 1080), Size(3840, 2160)).filter { it in k.yetenek.boyutlar }
            if (vb.isNotEmpty()) secim("Çözünürlük", vb.map { when (it.height) { 720 -> "720p"; 1080 -> "1080p"; else -> "4K" } }, vb.indexOf(ayar.boyut ?: Size(1920, 1080)).coerceAtLeast(0)) {
                ayar.boyut = vb[it]; ayarKaydet(); if (!mod.foto) k.oturumYenile { w, h -> monitor.tampon(w, h); runOnUiThread { bilgiCiz() } } }
            val fpsler = listOfNotNull(Range(30, 30).takeIf { it in k.yetenek.fpsler }, Range(60, 60).takeIf { it in k.yetenek.fpsler })
            if (fpsler.size > 1) secim("Kare hızı", fpsler.map { "${it.upper} fps" }, if (ayar.fps == Range(60, 60)) 1 else 0) {
                ayar.fps = fpsler[it]; ayarKaydet(); if (!mod.foto) k.oturumYenile { w, h -> monitor.tampon(w, h); runOnUiThread { bilgiCiz() } } }
            baslik("TIMELAPSE", R.drawable.ic_zaman)
            secim("Kare aralığı", Timelapse.ARALIKLAR.map { Timelapse.aralikYazi(it) }, Timelapse.ARALIKLAR.indexOf(tlAralik).coerceAtLeast(0)) {
                tlAralik = Timelapse.ARALIKLAR[it]; tercih.edit().putLong("tlAralik", tlAralik).apply(); if (mod == KMod.TIMELAPSE) { sureCiz(); bilgiCiz() } }
            secim("Çekim süresi", Timelapse.SURELER.map { Timelapse.sureYazi(it) }, Timelapse.SURELER.indexOf(tlSure).coerceAtLeast(0)) {
                tlSure = Timelapse.SURELER[it]; tercih.edit().putInt("tlSure", tlSure).apply() }
            ic.addView(anahtar("Pozlamayı başta sabitle", tlPozSabit) { tlPozSabit = it; tercih.edit().putBoolean("tlPozSabit", it).apply() })
            ic.addView(TextView(this).apply { textSize = 12f; setTextColor(GRI); setPadding(0, dp(4f), 0, 0)
                text = "Açıkken parlaklık kareden kareye oynamaz (titreme olmaz). Gün batımı gibi ışığın değiştiği çekimlerde kapat. Tripod kullan; ekran açık kalır." })
        }
        baslik("YARDIMCILAR", R.drawable.ic_yardimci)
        ic.addView(anahtar("Otomatik sahne önerisi", sahneOto) { sahneOto = it; kompUygula() })
        baslik("UYGULAMA", R.drawable.ic_bilgi)
        ic.addView(anahtar("Açılışta Kamera / Monitör sor", tercih.getString("giris", null) == null) { if (it) tercih.edit().remove("giris").apply() else tercih.edit().putString("giris", "kamera").apply() })
        ic.addView(TextView(this).apply { text = "Güncellemeleri denetle"; textSize = 15f; setTextColor(MAVI_ACIK); setPadding(0, dp(12f), 0, dp(8f)); Tema.simge(this, R.drawable.ic_guncelle, MAVI_ACIK); setOnClickListener { Guncelleme.denetle(this@KameraActivity, sessiz = false) } })
        ic.addView(TextView(this).apply { text = "UPDATED Kamera ${packageManager.getPackageInfo(packageName, 0).versionName} · çökme ve donmalar kendiliğinden bildirilir (yalnız hata ayrıntısı ve cihaz modeli)."; textSize = 12f; setTextColor(GRI); setPadding(0, dp(6f), 0, 0) })
        ic.addView(etiket("AYARLAR", 18f).apply { gravity = Gravity.START or Gravity.CENTER_VERTICAL; typeface = kosulKalin; setPadding(0, 0, 0, dp(2f)); Tema.simge(this, R.drawable.ic_ayar, Color.WHITE, 20f) }, 0)
        val p = ScrollView(this).apply { background = pano(dp(26f).toFloat()); addView(ic); isClickable = true; clipToOutline = true }
        acilirAc(p, ustTan = false)
        // İçerik kadar yükseklik; uzunsa ekranın %62'sinde kayar
        p.post { val en = (resources.displayMetrics.heightPixels * 0.62f).toInt(); if (p.height > en) p.layoutParams = (p.layoutParams as FrameLayout.LayoutParams).apply { height = en } }
    }
    private fun oran(s: Size): String { val r = s.width.toFloat() / s.height; return when { abs(r - 4f / 3) < 0.03f -> "4:3"; abs(r - 16f / 9) < 0.03f -> "16:9"; abs(r - 1f) < 0.03f -> "1:1"; else -> "%.2f".format(r) } }

    /* ================= kamera ================= */
    private fun kameraAc() {
        val y = yuzey ?: return
        if (!onde || !secimYapildi || checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) return
        val onceki = kaynak; kaynak = null
        if (onceki != null) { onceki.durdurVe { runOnUiThread { kameraAc() } }; return }
        val (id, ad) = kamListe.getOrNull(kamIndex) ?: return tost("Telefonda kamera bulunamadı.")
        ayar = ayarOku(id)
        val k = runCatching { KameraKaynak(this, id, ad, ayar) }.getOrElse { e -> tost("Kamera açılamadı: ${e.message}"); HataKaydi.not("kamera", e.stackTraceToString()); return }
        k.fotoModu = mod.foto; k.sahne = mod.sahne; k.pro = proIstek(); k.ekranYonu = (360 - fizikselYon) % 360
        @Suppress("DEPRECATION") monitor.otoDondur = windowManager.defaultDisplay.rotation * 90
        kaynak = k
        k.baslat(y, { w, h -> monitor.tampon(w, h); runOnUiThread { bilgiCiz(); zoomCiz(); flasCiz(); aracCiz() } }, { hata -> runOnUiThread { if (hata == "POLITIKA") engelli() else tost(hata) } })
    }

    private fun kameraCevir() {
        if (kamListe.size < 2) return tost("Tek kamera var.")
        if (kayitSuruyor()) return
        kamIndex = (kamIndex + 1) % kamListe.size; tercih.edit().putInt("kamIndex", kamIndex).apply()
        monitor.animate().alpha(0f).setDuration(120).withEndAction { monitor.animate().alpha(1f).setStartDelay(350).setDuration(200) }
        kameraAc()
    }

    private var engelUyarisi = false
    private fun engelli() {
        if (engelUyarisi || isFinishing) return; engelUyarisi = true
        AlertDialog.Builder(this).setTitle("Telefon kamerayı engelliyor").setMessage(
            "Android bu uygulamanın kamerayı açmasına izin vermiyor (\"disabled by policy\"). Genelde şunlardan biri:\n\n" +
            "• Bildirim panelindeki kamera erişimi düğmesi kapalı.\n" +
            "• Ayarlar → Gizlilik → İzin yöneticisi → Kamera → UPDATED Kamera: \"Yalnız kullanırken izin ver\" seçili olmalı.\n" +
            "• Uygulama klonlandı, Gizli alan / Çocuk alanı içinde ya da telefon bir kurum tarafından yönetiliyor.\n\n" +
            "Telefonun kendi kamera uygulaması açılıyor mu, bir bak. Düzelttikten sonra uygulamayı kapatıp aç.")
            .setPositiveButton("Uygulama ayarları") { _, _ -> runCatching { startActivity(Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))) } }
            .setNegativeButton("Tamam", null).show()
    }

    private fun bilgiCiz() {
        if (!this::bilgiCip.isInitialized) return
        val k = kaynak
        bilgiCip.text = when {
            k == null -> ""
            mod.foto -> k.secilenFotoBoyut()?.let { "%.0f MP · %s".format(it.width * it.height / 1e6, if (k.rawAcik) "RAW" else "JPEG") } ?: "FOTO"
            mod == KMod.TIMELAPSE -> { val b = k.secilenBoyut(); "${when { b.height >= 2160 -> "4K"; b.height >= 1080 -> "1080p"; else -> "${b.height}p" }} · ${Timelapse.aralikYazi(tlAralik)} · ${Timelapse.hiz(tlAralik).toInt()}× hızlı" }
            else -> { val b = k.secilenBoyut(); "${when { b.height >= 2160 -> "4K"; b.height >= 1080 -> "1080p"; else -> "${b.height}p" }} · ${ayar.fps?.upper ?: 30}" }
        }
        bilgiCip.visibility = if (k == null || kayitCip.visibility == View.VISIBLE) View.INVISIBLE else View.VISIBLE
    }

    /* ================= çekim ================= */
    private fun deklansorBasildi() {
        acilirKapat()
        val k = kaynak ?: return tost("Kamera hazır değil.")
        if (mod == KMod.TIMELAPSE) return timelapseDugmesi(k)
        if (!mod.foto) return videoDugmesi(k)
        if (monitor.birlestiriyor) { monitor.birlestirmeIptal(); return }
        if (geriSayiliyor) { geriSayiliyor = false; ortaYazi.visibility = View.GONE; return }
        val gecikme = if (mod == KMod.PRO) proMod.oku(tercih).zamanlayici else zamanlayici
        if (gecikme == 0) return cek(k)
        geriSayiliyor = true; var kalan = gecikme
        fun adim() {
            if (!geriSayiliyor) return
            if (kalan == 0) { geriSayiliyor = false; ortaYazi.visibility = View.GONE; cek(k); return }
            ortaYazi.textSize = 88f; ortaYazi.text = "$kalan"; ortaYazi.visibility = View.VISIBLE; kalan--
            dongu.postDelayed({ adim() }, 1000)
        }
        adim()
    }

    private fun cek(k: KameraKaynak) {
        k.ekranYonu = (360 - fizikselYon) % 360
        var uzunNs = 0L
        if (mod == KMod.PRO) {
            val a = proMod.oku(tercih)
            proMod.birlestirme(a, k.yetenek.elleKontrol, k.yetenek.pozlamaAralik?.upper ?: 0L)?.let { return birlestirCek(it, proMod.kareSayisi(a), a.sureSn * 1000L, proMod.ad) }
            if (a.iso != null && a.enstNs != null && a.enstNs >= 1_000_000_000L) uzunNs = a.enstNs
        }
        deklansorDugme.basili = true
        // Uzun pozlama: süre ekranda geri sayar
        if (uzunNs > 0) { val bit = System.currentTimeMillis() + uzunNs / 1_000_000L; ortaYazi.textSize = 34f; ortaYazi.visibility = View.VISIBLE
            fun say() { val kalan = bit - System.currentTimeMillis(); if (kalan <= 0 || !deklansorDugme.basili) return; ortaYazi.text = "Pozlama  ${(kalan + 999) / 1000} sn"; dongu.postDelayed({ say() }, 250) }
            say() }
        if (deklansorSesi) runCatching { deklansor.play(android.media.MediaActionSound.SHUTTER_CLICK) }
        monitor.animate().alpha(0.2f).setDuration(60).withEndAction { monitor.animate().alpha(1f).setDuration(160) }
        var ilk: Uri? = null
        k.fotoCek({ ad, mime, yaz -> galeriyeYaz(ad, mime, yaz)?.also { if (mime == "image/jpeg") ilk = it } != null }) { hata -> runOnUiThread {
            deklansorDugme.basili = false; if (uzunNs > 0) ortaYazi.visibility = View.GONE
            if (hata != null) { seriSuruyor = false; tost(hata); return@runOnUiThread }
            ilk?.let { u -> sonUri = u; sonMime = "image/jpeg"; kucukResim(u) }
            if (seriSuruyor) { seriSayi++; ortaYazi.textSize = 34f; ortaYazi.text = "$seriSayi"; ortaYazi.visibility = View.VISIBLE; cek(k) }
        } }
    }

    /** Seri çekim (PRO MODLAR: Spor, Kuş ve uçak): deklanşör basılı tutuldukça art arda; bırakınca durur */
    private fun seriBasla(): Boolean {
        val k = kaynak ?: return false
        if (mod != KMod.PRO || !proMod.seri || seriSuruyor || geriSayiliyor) return false
        acilirKapat(); seriSuruyor = true; seriSayi = 0; cek(k); return true
    }
    private fun seriBitir() {
        if (!seriSuruyor) return
        seriSuruyor = false; dongu.postDelayed({ if (!seriSuruyor) ortaYazi.visibility = View.GONE }, 600)
        if (seriSayi > 0) tost("$seriSayi kare çekildi")
    }

    private fun birlestirCek(tur: Sahne.Birlestir, n: Int, sureMs: Long, adSahne: String) {
        deklansorDugme.basili = true
        if (deklansorSesi) runCatching { deklansor.play(android.media.MediaActionSound.START_VIDEO_RECORDING) }
        ortaYazi.textSize = 34f; ortaYazi.text = "0%"; ortaYazi.visibility = View.VISIBLE
        val yon = fizikselYon
        // Uzun birleştirmede (yıldız izi dakikalarca) ekran kapanmasın
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        monitor.birlestir(MonitorGorunum.BirlestirmeIstegi(tur, n, sureMs, 1f, { o -> ortaYazi.text = "$adSahne  ${(o * 100).toInt()}%" }) { bmp ->
            ortaYazi.visibility = View.GONE; deklansorDugme.basili = false
            if (tlKaydedici == null) window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            if (bmp == null) return@BirlestirmeIstegi tost("Birleştirme durdu.")
            if (deklansorSesi) runCatching { deklansor.play(android.media.MediaActionSound.SHUTTER_CLICK) }
            Thread {
                // Ekran dikey sabit: telefon yan tutulduysa sonuç dik çevrilir
                val dik = if (yon == 0) bmp else Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, android.graphics.Matrix().apply { postRotate(yon.toFloat()) }, true)
                val ad = "UPDATED_" + SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date()) + "_" + (if (mod == KMod.PRO) proMod.name else mod.name).lowercase(Locale.US) + ".jpg"
                val u = galeriyeYaz(ad, "image/jpeg") { dik.compress(Bitmap.CompressFormat.JPEG, 95, it) }
                runOnUiThread { if (u == null) tost("Fotoğraf kaydedilemedi.") else { sonUri = u; sonMime = "image/jpeg"; kucukResim(u) } }
            }.start()
        })
    }

    private fun videoDugmesi(k: KameraKaynak) {
        if (k.kayitta) {
            k.kayitDurdur { ok -> runOnUiThread {
                kayitUri?.let { u -> contentResolver.update(u, ContentValues().apply { put(MediaStore.Video.Media.IS_PENDING, 0) }, null, null); if (ok) { sonUri = u; sonMime = "video/mp4"; kucukResim(u) } else contentResolver.delete(u, null, null) }
                kayitUri = null; deklansorDugme.kayitta = false; kayitCip.visibility = View.GONE; bilgiCiz()
                if (!ok) tost("Kayıt kaydedilemedi (çok kısa olabilir).")
            } }
            return
        }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) { requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 2); return }
        k.ekranYonu = (360 - fizikselYon) % 360
        val ad = "UPDATED_${SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())}.mp4"
        val d = ContentValues().apply { put(MediaStore.Video.Media.DISPLAY_NAME, ad); put(MediaStore.Video.Media.MIME_TYPE, "video/mp4"); put(MediaStore.Video.Media.RELATIVE_PATH, "Movies/UPDATED Kamera"); put(MediaStore.Video.Media.IS_PENDING, 1) }
        val uri = contentResolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, d) ?: return tost("Kayıt dosyası açılamadı.")
        val fd = contentResolver.openFileDescriptor(uri, "w") ?: return tost("Kayıt dosyası açılamadı.")
        kayitUri = uri
        val b = k.secilenBoyut(); val fps = ayar.fps?.upper ?: 30
        val mbps = when { b.height >= 2160 -> 50; b.height >= 1080 -> if (fps > 30) 30 else 20; else -> 12 }
        k.kayitBasla(fd, false, mbps, true) { hata -> runOnUiThread {
            if (hata != null) { tost("Kayıt başlamadı: $hata"); contentResolver.delete(uri, null, null); kayitUri = null; return@runOnUiThread }
            kayitBas = System.currentTimeMillis(); deklansorDugme.kayitta = true; kayitCip.text = "●  00:00"; kayitCip.visibility = View.VISIBLE; bilgiCip.visibility = View.INVISIBLE; oneriCip.visibility = View.GONE
        } }
    }

    /**
     * Timelapse: ekrandaki görüntü her `tlAralik`'ta bir kodlayıcıya çizilir (MonitorGorunum.kayitAraligiNs), video 30 fps oynar, ses yok.
     * Pozlama isteğe göre başta kilitlenir; ekran açık kalır; süre sınırı varsa kendiliğinden biter.
     */
    private fun timelapseDugmesi(k: KameraKaynak) {
        tlKaydedici?.let { y -> timelapseBitir(y); return }
        val ad = "UPDATED_${SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())}_timelapse.mp4"
        val d = ContentValues().apply { put(MediaStore.Video.Media.DISPLAY_NAME, ad); put(MediaStore.Video.Media.MIME_TYPE, "video/mp4"); put(MediaStore.Video.Media.RELATIVE_PATH, "Movies/UPDATED Kamera"); put(MediaStore.Video.Media.IS_PENDING, 1) }
        val uri = contentResolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, d) ?: return tost("Kayıt dosyası açılamadı.")
        val fd = contentResolver.openFileDescriptor(uri, "w") ?: run { contentResolver.delete(uri, null, null); return tost("Kayıt dosyası açılamadı.") }
        val (w, h) = monitor.kayitBoyutu()
        val mbps = when { maxOf(w, h) >= 3840 -> 50; maxOf(w, h) >= 1920 -> 24; else -> 12 }
        val y = runCatching { Kaydedici(this, fd, w, h, Timelapse.FPS, mbps, false, sesIste = false, yon = fizikselYon).also { it.baslat() } }
            .getOrElse { e -> runCatching { fd.close() }; contentResolver.delete(uri, null, null); HataKaydi.not("timelapse", e.stackTraceToString()); return tost("Timelapse başlamadı: ${e.message}") }
        tlKaydedici = y; tlUri = uri
        k.pozKilit = tlPozSabit; k.ayarDegisti()
        monitor.kayitAraligiNs = tlAralik * 1_000_000L; monitor.kayitYuzeyi = y.yuzey; monitor.yenile()
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (deklansorSesi) runCatching { deklansor.play(android.media.MediaActionSound.START_VIDEO_RECORDING) }
        kayitBas = System.currentTimeMillis(); deklansorDugme.kayitta = true
        kayitCip.text = "●  0:00"; kayitCip.visibility = View.VISIBLE; bilgiCip.visibility = View.INVISIBLE; oneriCip.visibility = View.GONE
    }

    private fun timelapseBitir(y: Kaydedici) {
        tlKaydedici = null; monitor.kayitYuzeyi = null; monitor.kayitAraligiNs = 0L; monitor.yenile()
        kaynak?.let { it.pozKilit = false; it.ayarDegisti() }
        window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val u = tlUri; tlUri = null; deklansorDugme.kayitta = false; kayitCip.visibility = View.GONE; bilgiCiz()
        if (deklansorSesi) runCatching { deklansor.play(android.media.MediaActionSound.STOP_VIDEO_RECORDING) }
        Thread {
            // Kodlayıcı GL iş parçacığı kayıt yüzeyini bırakınca kapanır
            Thread.sleep(150)
            val ok = runCatching { y.bitir() }.getOrElse { HataKaydi.not("timelapse", it.stackTraceToString()); false }
            runOnUiThread {
                if (u == null) return@runOnUiThread
                if (ok) { contentResolver.update(u, ContentValues().apply { put(MediaStore.Video.Media.IS_PENDING, 0) }, null, null); sonUri = u; sonMime = "video/mp4"; kucukResim(u); tost("Timelapse galeride: Movies/UPDATED Kamera") }
                else { contentResolver.delete(u, null, null); tost("Timelapse kaydedilemedi (hiç kare alınmadı).") }
            }
        }.start()
    }

    /** Galeriye (Pictures/UPDATED Kamera) yazar; kamera iş parçacığından da çağrılır */
    private fun galeriyeYaz(ad: String, mime: String, yaz: (java.io.OutputStream) -> Unit): Uri? {
        val d = ContentValues().apply { put(MediaStore.Images.Media.DISPLAY_NAME, ad); put(MediaStore.Images.Media.MIME_TYPE, mime); put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/UPDATED Kamera"); put(MediaStore.Images.Media.IS_PENDING, 1) }
        val uri = contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, d) ?: return null
        return try {
            contentResolver.openOutputStream(uri)!!.use { yaz(it) }
            contentResolver.update(uri, ContentValues().apply { put(MediaStore.Images.Media.IS_PENDING, 0) }, null, null); uri
        } catch (e: Exception) { runCatching { contentResolver.delete(uri, null, null) }; HataKaydi.not("foto", e.stackTraceToString()); null }
    }

    private fun kucukResim(u: Uri) { runCatching { sonResim.setImageBitmap(contentResolver.loadThumbnail(u, Size(160, 160), null)) } }

    private fun sonuAc() {
        val u = sonUri ?: return tost("Henüz çekim yok.")
        runCatching { startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(u, sonMime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)) }
    }

    /** Açılışta galerideki son UPDATED çekimi (küçük resim için) */
    private fun sonCekimiBul() {
        Thread {
            fun bul(tablo: Uri, mime: String): Triple<Uri, Long, String>? = runCatching {
                contentResolver.query(tablo, arrayOf(MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DATE_ADDED), "${MediaStore.MediaColumns.RELATIVE_PATH} LIKE ?", arrayOf("%UPDATED Kamera%"), "${MediaStore.MediaColumns.DATE_ADDED} DESC")?.use { c ->
                    if (c.moveToFirst()) Triple(ContentUris.withAppendedId(tablo, c.getLong(0)), c.getLong(1), mime) else null }
            }.getOrNull()
            val son = listOfNotNull(bul(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, "image/jpeg"), bul(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, "video/mp4")).maxByOrNull { it.second } ?: return@Thread
            runOnUiThread { if (sonUri == null) { sonUri = son.first; sonMime = son.third; kucukResim(son.first) } }
        }.start()
    }

    /* ================= sahne önerisi ================= */
    private fun sahneDenetle() {
        if (!sahneOto || mod != KMod.FOTO || kayitSuruyor()) { sahneCip.visibility = View.GONE; return }
        val k = kaynak ?: return
        val otoPoz = ayar.iso == null && ayar.pozlamaNs == null && k.sonIso > 0 && k.sonPozNs > 0
        val r = renkOrt
        val yuz = asistanAcik && komp.konuAdi == "Yüz" && (komp.konu?.let { it.width() * it.height() } ?: 0f) > 0.05f
        val o = sahneOner(SahneOlcum(if (otoPoz) k.sonIso * k.sonPozNs / 1e9f else null, yercekimZ < -5f, 0.2126f * r[0] + 0.7152f * r[1] + 0.0722f * r[2], if (r[2] > 0.01f) r[0] / r[2] else 1f, yuz))
        sahneOnerisi = o
        if (o == null || o == k.sahne) sahneCip.visibility = View.GONE else { sahneCip.text = "Sahne: ${o.ad}  ›  Uygula"; sahneCip.visibility = View.VISIBLE }
    }
    private fun sahneUygula() {
        val o = sahneOnerisi ?: return
        when (o) { Sahne.GECE -> proSec(ProMod.GECE_SEHIR); Sahne.SAMANYOLU -> proSec(ProMod.SAMANYOLU); Sahne.PORTRE -> modSec(KMod.PORTRE); else -> { kaynak?.sahne = o; kaynak?.ayarDegisti(); tost("${o.ad} ayarları uygulandı") } }
    }

    /* ================= döngü ================= */
    private var sonSaniye = -1L
    private fun tik() {
        val k = kaynak
        if (k?.kayitta == true) { val ms = System.currentTimeMillis() - kayitBas; kayitCip.text = "●  %02d:%02d".format(ms / 60000, ms / 1000 % 60) }
        tlKaydedici?.let { y ->
            // Timelapse: geçen süre · çıkacak video süresi; süre sınırı dolunca biter
            val ms = System.currentTimeMillis() - kayitBas
            kayitCip.text = "●  ${Timelapse.saat(ms)}  →  ${Timelapse.saat(Timelapse.videoMs(monitor.kayitKareSayisi))}"
            if (tlSure > 0 && ms >= tlSure * 60_000L) timelapseBitir(y)
        }
        val sn = System.currentTimeMillis() / 1000
        if (sn != sonSaniye) { sonSaniye = sn; sahneDenetle() }
    }

    /* ================= yön: ikonlar döner, düzen sabit ================= */
    private fun yonUygula() {
        val hedef = -fizikselYon.toFloat()
        for (v in donenler) {
            var simdi = v.rotation % 360f; var fark = hedef - simdi
            while (fark > 180f) fark -= 360f; while (fark < -180f) fark += 360f
            v.animate().rotation(simdi + fark).setDuration(220).start()
        }
        kaynak?.ekranYonu = (360 - fizikselYon) % 360
    }

    /* ================= PRO ve Monitör ================= */
    private fun proyaGec() {
        if (kayitSuruyor()) return tost("Önce kaydı durdur.")
        startActivity(Intent(this, MainActivity::class.java).putExtra("mod", "pro").putExtra("kamera", kamListe.getOrNull(kamIndex)?.first))
    }
    private fun monitoreGec() {
        if (kayitSuruyor()) return tost("Önce kaydı durdur.")
        startActivity(Intent(this, MainActivity::class.java).putExtra("mod", "monitor"))
    }

    /** Açılış: Kamera mı Monitör mü (uygulama baştan açılınca bir kez) */
    private fun girisGoster() {
        val p = FrameLayout(this).apply { setBackgroundColor(Color.rgb(27, 30, 35)); isClickable = true }
        val ic = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_VERTICAL; setPadding(dp(24f), dp(48f), dp(24f), dp(48f)) }
        ic.addView(TextView(this).apply { text = "UPDATED"; textSize = 30f; setTextColor(Color.WHITE); typeface = runCatching { Typeface.create("sans-serif-condensed", Typeface.BOLD) }.getOrNull(); letterSpacing = 0.04f })
        ic.addView(TextView(this).apply { text = "Ne yapmak istiyorsun?"; textSize = 15f; setTextColor(Color.rgb(201, 205, 211)); setPadding(0, dp(6f), 0, dp(28f)) })
        val hatirla = CheckBox(this).apply { text = "Seçimimi hatırla (ayarlardan değişir)"; setTextColor(Color.rgb(201, 205, 211)); buttonTintList = android.content.res.ColorStateList.valueOf(Color.rgb(37, 99, 235)) }
        fun kart(ikonRes: Int, renk: Int, baslik: String, aciklama: String, sec: () -> Unit) = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; setPadding(dp(24f), dp(22f), dp(24f), dp(22f))
            background = GradientDrawable().apply { cornerRadius = dp(26f).toFloat(); setColor(Color.argb(168, 46, 50, 57)); setStroke(1, Color.argb(23, 255, 255, 255)) }
            addView(ImageView(this@KameraActivity).apply { setImageResource(ikonRes); setColorFilter(renk); scaleX = 1.4f; scaleY = 1.4f }, LinearLayout.LayoutParams(dp(34f), dp(34f)))
            addView(TextView(this@KameraActivity).apply { text = baslik; textSize = 26f; typeface = kosulKalin; setTextColor(Color.WHITE); setPadding(0, dp(10f), 0, dp(4f)) })
            addView(TextView(this@KameraActivity).apply { text = aciklama; textSize = 14f; setTextColor(Color.rgb(201, 205, 211)) })
            setOnClickListener { sec() }
        }
        ic.addView(kart(R.drawable.ic_kamera, TURUNCU, "Kamera", "Fotoğraf, video, timelapse; gece, ışık izi, Samanyolu PRO modlarda.") {
            girisSoruldu = true; secimYapildi = true; if (hatirla.isChecked) tercih.edit().putString("giris", "kamera").apply(); kok.removeView(p); kameraAc()
        }, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(16f) })
        ic.addView(kart(R.drawable.ic_monitor, MAVI_ACIK, "Monitör", "Dış kamerayı izle: HDMI/USB ya da ağ yayını. Ölçümler, LUT, iki kaynak.") {
            girisSoruldu = true; secimYapildi = true; if (hatirla.isChecked) tercih.edit().putString("giris", "monitor").apply(); kok.removeView(p); monitoreGec()
        }, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(12f) })
        ic.addView(hatirla)
        p.addView(ScrollView(this).apply { isFillViewport = true; addView(ic, FrameLayout.LayoutParams(-1, -1)) }, FrameLayout.LayoutParams(-1, -1))
        kok.addView(p, FrameLayout.LayoutParams(-1, -1))
    }

    /* ================= ayarların saklanması ================= */
    private fun ayarlariOku() {
        // 0.11'e kadar ayrı olan Gece / Işık izi / Samanyolu modları artık PRO MODLAR'ın içinde
        val eski = mapOf("GECE" to ProMod.GECE_SEHIR, "ISIK_IZI" to ProMod.ARAC_IZI, "SAMANYOLU" to ProMod.SAMANYOLU)[tercih.getString("mod", null)]
        if (eski != null) tercih.edit().putString("mod", KMod.PRO.name).putString("proMod", eski.name).apply()
        mod = runCatching { KMod.valueOf(tercih.getString("mod", "FOTO")!!) }.getOrDefault(KMod.FOTO).let { if (it == KMod.MONITOR) KMod.FOTO else it }
        kamIndex = tercih.getInt("kamIndex", 0)
        kompTur = runCatching { KompTur.valueOf(tercih.getString("komp", "KAPALI")!!) }.getOrDefault(KompTur.KAPALI); kompYon = tercih.getInt("kompYon", 0)
        sonKomp = runCatching { KompTur.valueOf(tercih.getString("sonKomp", "SPIRAL")!!) }.getOrDefault(KompTur.SPIRAL)
        asistanAcik = tercih.getBoolean("asistan", false); teraziAcik = tercih.getBoolean("terazi", false); oneriAcik = tercih.getBoolean("oneri", true); sahneOto = tercih.getBoolean("sahneOto", true)
        proMod = runCatching { ProMod.valueOf(tercih.getString("proMod", "SAMANYOLU")!!) }.getOrDefault(ProMod.SAMANYOLU)
        zamanlayici = tercih.getInt("zamanlayici", 0); deklansorSesi = tercih.getBoolean("deklansor", true)
        tlAralik = tercih.getLong("tlAralik", 2000L); tlSure = tercih.getInt("tlSure", 0); tlPozSabit = tercih.getBoolean("tlPozSabit", true)
    }
    private fun ayarOku(id: String): KameraAyari {
        val j = runCatching { JSONObject(tercih.getString("kam_$id", "{}")!!) }.getOrNull() ?: return KameraAyari()
        return KameraAyari(boyut = if (j.has("vw")) Size(j.getInt("vw"), j.getInt("vh")) else null, fps = if (j.has("fps")) Range(j.getInt("fps"), j.getInt("fps")) else null,
            fotoBoyut = if (j.has("fw")) Size(j.getInt("fw"), j.getInt("fh")) else null, raw = j.optBoolean("raw"), flas = j.optInt("flas"))
    }
    private fun ayarKaydet() {
        val id = kamListe.getOrNull(kamIndex)?.first ?: return
        tercih.edit().putString("kam_$id", JSONObject().apply {
            ayar.boyut?.let { put("vw", it.width); put("vh", it.height) }; ayar.fps?.let { put("fps", it.upper) }
            ayar.fotoBoyut?.let { put("fw", it.width); put("fh", it.height) }; put("raw", ayar.raw); put("flas", ayar.flas)
        }.toString()).apply()
    }

    /* ================= yaşam döngüsü ================= */
    override fun onResume() {
        super.onResume(); onde = true; tamEkran(); monitor.onResume(); sensorKaydi()
        if (yonDinle.canDetectOrientation()) yonDinle.enable()
        if (acilir == null) modlariCiz()
        kameraAc()
    }
    override fun onPause() {
        super.onPause(); onde = false; yonDinle.disable(); sensorler.unregisterListener(yercekimDinle)
        geriSayiliyor = false; seriSuruyor = false; ortaYazi.visibility = View.GONE
        if (monitor.birlestiriyor) monitor.birlestirmeIptal()
        kaynak?.let { k -> if (k.kayitta) videoDugmesi(k) }
        tlKaydedici?.let { timelapseBitir(it) } // alta alınınca kamera kapanır: o ana kadarki kareler kaydedilir
        dongu.postDelayed({ if (!onde) { kaynak?.durdur(); kaynak = null } }, if (kaynak?.kayitta == true) 600 else 0)
        monitor.onPause()
    }
    override fun onRequestPermissionsResult(r: Int, izinler: Array<out String>, sonuclar: IntArray) {
        super.onRequestPermissionsResult(r, izinler, sonuclar)
        if (r == 1 && checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) kameraAc()
        if (r == 1 && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) tost("Kamera izni olmadan görüntü yok. Ayarlar → Uygulamalar → UPDATED Kamera → İzinler.")
    }
    @Deprecated("Geri: açık menü önce kapanır")
    override fun onBackPressed() { if (acilir != null) acilirKapat() else @Suppress("DEPRECATION") super.onBackPressed() }
    override fun onDestroy() { super.onDestroy(); asistan?.kapat(); analiz.kapat(); dongu.removeCallbacksAndMessages(null); kaynak?.durdur() }
}
