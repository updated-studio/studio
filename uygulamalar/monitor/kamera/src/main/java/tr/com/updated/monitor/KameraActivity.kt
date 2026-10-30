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
import android.view.ViewGroup
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
 * UPDATED Kamera: telefonun normal kamerası, Apple Kamera'nın (iOS 26) düzeninde (iPhone sürümüyle aynı, Fatih 28 Ekim):
 * üstte ve altta siyah bant, görüntünün üstünde ortada biçim bilgisi (dokununca BİÇİM), deklanşörün üstünde mercek durakları,
 * solunda flaş (PRO'da mod), sağında "⋯" kontroller; alt bantta son çekim · kapsül mod seçici · çevir. Paneller alttan cam pano (✕ + başlık).
 * Ekran dikey sabit; telefon döndükçe yalnız ikonlar döner (yan tutuşta deklanşör kenarda ortada kalır).
 * Modlar altta kaydırılır (Timelapse · Video · Foto · PRO modlar · Portre · Monitör); gece, ışık izi ve Samanyolu PRO MODLAR'ın içinde (ProModlar.kt). PRO düğmesi Blackmagic düzenini
 * (MainActivity, mod=pro), Monitör dış kamera izlemeyi (MainActivity, mod=monitor) açar. Uygulama baştan açılınca hangisi
 * olacağı sorulur; alta alınıp geri gelince sorulmaz.
 */
class KameraActivity : Activity() {
    enum class KMod(val ad: String, val foto: Boolean, val sahne: Sahne) {
        TIMELAPSE("TIMELAPSE", false, Sahne.KAPALI), VIDEO("VİDEO", false, Sahne.KAPALI), FOTO("FOTO", true, Sahne.KAPALI), PRO("PRO MODLAR", true, Sahne.KAPALI), PORTRE("PORTRE", true, Sahne.PORTRE)
    }

    companion object {
        /** Bu süreçte açılış sorusu soruldu mu (uygulama tamamen kapanınca sıfırlanır) */
        var girisSoruldu = false
        /** Yalnız ekran testi: kamera olmadığında baz ISO işaretini göstermek için örnek değer */
        var ornekBazIso: Int? = null
        /*
         * Tasarım dili (Fatih 29 Ekim onayı; iPhone 0.10.0 ile aynı): tek yazı ailesi (Inter, tablo rakamları); metin beyaz / %62 / %28;
         * yüzeyler siyah %34 + 0,5 px beyaz %18 hat; sarı yalnız elle değiştirilmiş değerde, yeşil onay, kırmızı kayıt; başka renk yok.
         */
        val METIN2 = Color.argb(158, 255, 255, 255); val METIN3 = Color.argb(71, 255, 255, 255); val BOLUM = Color.argb(115, 255, 255, 255)
        val YUZEY = Color.argb(87, 0, 0, 0); val HAT = Color.argb(46, 255, 255, 255); val SECILI = Color.argb(31, 255, 255, 255); val DOLGU = Color.argb(18, 255, 255, 255)
        val YESIL = Color.rgb(52, 199, 89); val KIRMIZI = Color.rgb(255, 69, 58)
        val TURUNCU = YESIL; val SARI = Color.rgb(255, 214, 10); val MAVI_ACIK = Color.WHITE
        val GRI = METIN2; val CAM = YUZEY; val ZEMIN = Color.rgb(15, 17, 20)
        /** Elle değiştirilmiş değer (Apple Kamera sarısı); dairesel düğmelerin zemini */
        val VURGU = Color.rgb(255, 214, 10); val DAIRE = YUZEY
        /** Cam yüzeyin üst ve alt tonu, kenarı (cam() ve daire()) */
        val CAM_UST = Color.argb(70, 120, 120, 128); val CAM_ALT = Color.argb(120, 0, 0, 0); val CAM_KENAR = Color.argb(64, 255, 255, 255)
    }

    private val tercih by lazy { getSharedPreferences("kamera", MODE_PRIVATE) }
    private val dongu = Handler(Looper.getMainLooper())
    // Tek yazı ailesi: Inter (rakamlar tablo genişliğinde; yazıYay her yazıya uygular)
    private val inter400 by lazy { runCatching { resources.getFont(R.font.inter_400) }.getOrDefault(Typeface.DEFAULT) }
    private val kosul by lazy { runCatching { resources.getFont(R.font.inter_500) }.getOrDefault(Typeface.DEFAULT) }
    private val kosulKalin by lazy { runCatching { resources.getFont(R.font.inter_600) }.getOrDefault(Typeface.DEFAULT_BOLD) }
    private val mono get() = kosul
    private val yazilar by lazy { setOf(inter400, kosul, kosulKalin) }
    /** Bu ekrandaki her yazı Inter olsun (kod içinde yazı tipi verilmemiş TextView'ler de; kalın olanlar yarı kalın) ve rakamlar tablo genişliğinde */
    private fun yaziYay(v: View) {
        if (v is TextView && v.getTag(R.id.yazi_tamam) == null) {
            if (v.typeface !in yazilar) v.typeface = if (v.typeface?.isBold == true) kosulKalin else inter400
            v.fontFeatureSettings = "tnum"; v.setTag(R.id.yazi_tamam, true)
        }
        if (v is ViewGroup) for (i in 0 until v.childCount) yaziYay(v.getChildAt(i))
    }
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
    /** Görüntünün üstünde ortada: biçim ve elle değişen değerler (sarı); dokununca BİÇİM */
    private lateinit var bilgiSira: LinearLayout
    /** Okuma şeridinin altında sabitlenenler (24 dp kapsüller) */
    private lateinit var favSira: LinearLayout
    private lateinit var tam: FrameLayout
    private lateinit var ustKarartma: View
    private lateinit var altKarartma: View
    /** Deklanşör sırası: solda flaş (PRO'da mod), ortada deklanşör, sağda ⋯ kontroller */
    private lateinit var deklansorSira: FrameLayout
    private lateinit var solDugme: FrameLayout
    private lateinit var proIkon: ImageView
    private lateinit var kontrolDugme: FrameLayout
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
    /** AI Kadraj (konu algılama, yön tarifi, kompozisyon ve sahne önerisi); kapalıyken ekranda hiçbiri görünmez */
    private var asistanAcik = false; private var teraziAcik = false; private var sahneOto = true
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
    private fun kayitSuruyor() = kaynak?.kayitta == true || tlKaydedici != null || lutKaydedici != null
    /** LUT'lu video çekimi: kamera → GPU (stil/LUT) → kodlayıcı; kayıttan sonra işleme beklemesi yok */
    private var lutKaydedici: Kaydedici? = null
    /**
     * Vlog (çift kamera, iOS ile aynı kural): VİDEO'da arka + ön kamera aynı anda; ön kamera sağ altta küçük pencere (aynalı önizleme).
     * Kayıtta iki ayrı dosya (ön: "<ad>_on.mp4", sessiz) ve kayıttan sonra birleşik dosya ("<ad> vlog.mp4", VideoIsleme). Android 11+ ve
     * telefonun eşzamanlı kamera desteği gerekir; açıkken ana kamera en çok 1080p.
     */
    private var vlog = false; private var onKaynak: KameraKaynak? = null; private var onPencere: android.view.TextureView? = null
    private var onUri: Uri? = null; private var kayitKok = ""
    private var vlogBekleyen = 0; private var vlogArkaOk = false; private var vlogOnOk = false; private var vlogArka: Uri? = null; private var vlogOnDosya: Uri? = null
    private val vlogAcik get() = vlog && mod == KMod.VIDEO && vlogOnId() != null
    /** Wi-Fi kamera (MasaActivity'ye görüntü gönderir; AgYayin.kt). Açıkken ekrandaki görüntü kodlayıcıya da çizilir */
    private var verici: YayinVerici? = null
    private var wifiKamera = false
    private lateinit var tallyCerceve: View
    private lateinit var masaCip: TextView
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
    /** FOTO'da elle uzun enstantane: BULB (deklanşöre yeniden basılana kadar) ve kareleri birleştirme yolu (ort: ipeksi, top: aydınlat, max: ışık izi) */
    private var bulb = false
    private var uzunYol = "ort"
    private var birlestirmeIstegi: MonitorGorunum.BirlestirmeIstegi? = null

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
        // Fatih 30 Ekim "Kaldır": Monitör ve Multi Cam yalnız UpCam Studio'da; açılış sorusu yok, Kamera doğrudan açılır (eski "giris" ayarı yok sayılır)
        girisSoruldu = true; secimYapildi = true
        dongu.post(object : Runnable { override fun run() { tik(); dongu.postDelayed(this, 250) } })
    }

    private fun tamEkran() {
        window.attributes = window.attributes.apply { layoutInDisplayCutoutMode = android.view.WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES }
        if (android.os.Build.VERSION.SDK_INT >= 30) window.insetsController?.let { it.hide(WindowInsets.Type.systemBars()); it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE }
        else @Suppress("DEPRECATION") { window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY }
    }

    /* ================= iskelet ================= */
    /** İnce hat: 0,5 dp (en az 1 piksel) */
    private val ince get() = maxOf(1, (resources.displayMetrics.density * 0.5f).toInt())
    /** Yüzey: siyah %34 + beyaz %18 ince hat (cam değil) */
    /**
     * Cam yüzey (Fatih 30 Ekim: "arayüz iOS 27'den uzaklaşmış"; iOS 26+ Apple cam malzemesi gibi, iPhone CamYuzey ile aynı his):
     * üstte hafif aydınlık, altta koyulaşan yarı saydam dolgu ve parlak ince kenar. Android canlı görüntünün arkasını bulanıklaştıramaz;
     * okunurluk koyu alt tondan gelir.
     */
    private fun cam(kose: Float) = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(CAM_UST, CAM_ALT)).apply { cornerRadius = kose; setStroke(ince, CAM_KENAR) }
    /** Açılır paneller: koyu yüzey (görüntü bulanıklaştırılamadığı için daha koyu), köşe 30, ince hat */
    private fun pano(@Suppress("UNUSED_PARAMETER") kose: Float) = GradientDrawable().apply { cornerRadius = dp(30f).toFloat(); setColor(Color.argb(214, 14, 14, 15)); setStroke(ince, HAT) }
    private fun saydamPano(kose: Float) = pano(kose)
    /** Dairesel düğme zemini (yüzey + ince hat); elle değişmiş bir değer varsa sarı halka */
    private fun daire(etkin: Boolean, renk: Int = DAIRE) = (if (renk == YUZEY) GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(CAM_UST, CAM_ALT)) else GradientDrawable().apply { setColor(renk) }).apply {
        shape = GradientDrawable.OVAL; if (etkin) setStroke(dp(1.5f), VURGU) else if (renk == YUZEY) setStroke(ince, CAM_KENAR) }
    /** Seçenek kapsülü: seçili = beyaz %12 dolgu + sarı yarım hat (sarı dolgu yok), diğerleri beyaz %7 */
    private fun secenek(secili: Boolean, kose: Float = 999f) = GradientDrawable().apply { cornerRadius = kose; setColor(if (secili) SECILI else DOLGU); if (secili) setStroke(ince, Color.argb(128, 255, 214, 10)) }
    private fun secenekYazi(secili: Boolean) = if (secili) VURGU else Color.argb(217, 255, 255, 255)
    /** Bölüm başlığı: 10 sp, büyük harf, aralık 0,12em, beyaz %45 */
    private fun bolumBasligi(t: String) = TextView(this).apply { text = t; textSize = 10f; typeface = kosulKalin; letterSpacing = 0.12f; setTextColor(BOLUM); isSingleLine = true }

    private fun ikon(res: Int, aciklama: String, is_: () -> Unit) = ImageView(this).apply {
        setImageResource(res); contentDescription = aciklama; scaleType = ImageView.ScaleType.CENTER
        setOnClickListener { is_() }; donenler.add(this)
    }

    private fun etiket(metin: String, boy: Float, renk: Int = Color.WHITE) = TextView(this).apply { text = metin; textSize = boy; typeface = kosul; setTextColor(renk); letterSpacing = 0.04f; gravity = Gravity.CENTER; isSingleLine = true }

    private fun iskelet() {
        kok = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
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
        monitor = MonitorGorunum(this).apply { ayarlar = Ayarlar(peaking = tercih.getBoolean("g_peak", false), zebra = tercih.getBoolean("g_zebra", false), zebraEsik = tercih.getFloat("g_zebraEsik", 0.95f),
            falseColor = tercih.getBoolean("g_fc", false), monokrom = tercih.getBoolean("g_mono", false)) }
        histoAcik = tercih.getBoolean("g_histo", false)
        favOku()
        EkranYayini.degisti = { runOnUiThread { ayarEkrani?.yenile() } }
        stil = Stil.oku(tercih.getString("stil", null))
        tercih.getString("g_lut", null)?.let { lutUygula(it) } ?: renkGuncelle()
        monitor.yuzeyHazir = { y -> yuzey = y; kameraAc() }
        // Tam ekran önizleme (Fatih 29 Ekim 12:39): görüntü tüm ekranı doldurur (kenarlar ekranda kırpılır, kayıt tam kare), menüler ve düğmeler üstünde.
        // Görüntü, kılavuz ve odak karesi tam ekran katmanda; diğer katmanlar `kutu`da (güvenli alan içinde, dokunuşlar alttaki görüntüye geçer)
        monitor.doldur = true
        tam = FrameLayout(this)
        tam.addView(monitor, FrameLayout.LayoutParams(-1, -1))
        komp = KompozisyonGorunum(this) { monitor.goruntuAlani() }.also { it.tur = kompTur; it.yon = kompYon; it.asistan = asistanAcik
            // Kadraj çentikleri: üstteki sabitlenenlerin altından merceklerin üstüne
            it.kenar = { val u = if (ustBosluk == 0) dp(32f) else ustBosluk; val a = if (altBosluk == 0) dp(16f) else altBosluk
                RectF(dp(16f).toFloat(), (u + dp(132f)).toFloat(), (it.width - dp(16f)).toFloat(), (it.height - a - dp(226f)).toFloat()) } }
        tam.addView(komp, FrameLayout.LayoutParams(-1, -1))
        // Okunurluk için üstte ve altta hafif karartma (yan tutuşta altınki yandadır)
        ustKarartma = View(this).apply { background = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(Color.argb(150, 0, 0, 0), Color.TRANSPARENT)); isClickable = false }
        altKarartma = View(this).apply { background = GradientDrawable(GradientDrawable.Orientation.BOTTOM_TOP, intArrayOf(Color.argb(175, 0, 0, 0), Color.argb(90, 0, 0, 0), Color.TRANSPARENT)); isClickable = false }
        tam.addView(ustKarartma); tam.addView(altKarartma)
        odakKare = View(this).apply { background = GradientDrawable().apply { setColor(Color.TRANSPARENT); setStroke(dp(1.5f), VURGU); cornerRadius = dp(6f).toFloat() }; visibility = View.GONE }
        tam.addView(odakKare, FrameLayout.LayoutParams(dp(72f), dp(72f)))
        oneriCip = cip(MAVI_ACIK).apply { setOnClickListener { sonOneri?.let { (t, y) -> kompTur = t; kompYon = y; sonKomp = t; sonOneri = null; aiAday = null; kompUygula(); kontrolCiz() }; visibility = View.GONE } }
        kutu.addView(oneriCip, FrameLayout.LayoutParams(-2, -2, Gravity.TOP or Gravity.CENTER_HORIZONTAL).apply { topMargin = dp(88f) })
        Tema.simge(oneriCip, R.drawable.ic_oneri, MAVI_ACIK, 16f)
        // Kayıtta zaman kodu çipi: kırmızı nokta + ss:dd:ss:kare (yüzey üstünde)
        kayitCip = TextView(this).apply { textSize = 15f; typeface = kosulKalin; setTextColor(Color.WHITE); gravity = Gravity.CENTER; setPadding(dp(12f), 0, dp(14f), 0); background = cam(dp(14f).toFloat()); visibility = View.GONE
            setCompoundDrawablesRelative(GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(KIRMIZI); setBounds(0, 0, dp(8f), dp(8f)) }, null, null, null); compoundDrawablePadding = dp(8f) }
        sahneCip = cip(MAVI_ACIK).apply { setOnClickListener { sahneUygula(); visibility = View.GONE } }
        Tema.simge(sahneCip, R.drawable.ic_sahne, MAVI_ACIK, 16f)
        kutu.addView(sahneCip, FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM or Gravity.START).apply { bottomMargin = dp(200f); marginStart = dp(12f) })
        proCip = cip(VURGU).apply { contentDescription = "PRO mod ayarları"; setOnClickListener { proOzellestir() } }
        aciklamalar.add(proCip to "Dokun: ISO, S, WB")
        Tema.simge(proCip, R.drawable.ic_ayar, VURGU, 15f)
        kutu.addView(proCip, FrameLayout.LayoutParams(-2, -2, Gravity.TOP or Gravity.CENTER_HORIZONTAL).apply { topMargin = dp(88f) })
        bilgiCip = TextView(this).apply { textSize = 12f; typeface = mono; setTextColor(Color.WHITE); gravity = Gravity.CENTER; setPadding(dp(12f), dp(6f), dp(12f), dp(6f)); background = cam(dp(14f).toFloat()); setOnClickListener { ayarlarAc() }; contentDescription = "Biçim" }
        zoomSira = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
        sureSira = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER; visibility = View.GONE }
        // Biçim bilgisi ve kayıt süresi görüntünün üstünde ortada
        // Üst satır: biçim + sabitlenen denetimler; basılı tutunca düzenleme
        // Üstte tek okuma şeridi (biçim + elle değişmiş değerler); sabitlenenler şeridin altında küçük kapsüller
        bilgiSira = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER; setOnLongClickListener { duzenleAc(); true }
            setPadding(dp(10f), 0, dp(10f), 0); clipChildren = false; clipToPadding = false; background = cam(dp(14f).toFloat()) }
        aciklamalar.add(bilgiSira to "Biçim ve değişen değerler")
        kutu.addView(bilgiSira, FrameLayout.LayoutParams(-2, dp(42f), Gravity.TOP or Gravity.CENTER_HORIZONTAL).apply { topMargin = dp(4f) })
        favSira = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER; setOnLongClickListener { duzenleAc(); true }; clipChildren = false; clipToPadding = false }
        aciklamalar.add(favSira to "Sabitlenenler (basılı tut: düzenle)")
        kutu.addView(favSira, FrameLayout.LayoutParams(-2, dp(24f), Gravity.TOP or Gravity.CENTER_HORIZONTAL).apply { topMargin = dp(54f) })
        kose = OlcumGorunum(this).apply { bindirme = true; gorunen = linkedSetOf(OlcumGorunum.Tur.HISTOGRAM); visibility = if (histoAcik) View.VISIBLE else View.GONE }
        kutu.addView(kose, FrameLayout.LayoutParams(dp(84f), dp(40f), Gravity.TOP or Gravity.START).apply { topMargin = dp(8f); marginStart = dp(10f) })
        kutu.addView(kayitCip, FrameLayout.LayoutParams(-2, dp(30f), Gravity.TOP or Gravity.CENTER_HORIZONTAL).apply { topMargin = dp(14f) })
        ortaYazi = TextView(this).apply { textSize = 88f; typeface = kosulKalin; setTextColor(Color.WHITE); setShadowLayer(12f, 0f, 0f, Color.BLACK); visibility = View.GONE; gravity = Gravity.CENTER }
        donenler.add(ortaYazi)
        kutu.addView(ortaYazi, FrameLayout.LayoutParams(-2, -2, Gravity.CENTER))
        kok.addView(tam, FrameLayout.LayoutParams(-1, -1)); kok.addView(kutu)
        dokunmaKur()

        // Üst bant: solda "?", sağda Ayarlar (flaş, biçim ve PRO deklanşör sırasında ve ⋯ kontrollerde)
        ustSerit = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(dp(2f), 0, dp(2f), 0) }
        val yardim = etiket("?", 14f).apply { typeface = kosulKalin; background = daire(false); contentDescription = "Açıklamalar"; setOnClickListener { yardimAcKapat() } }
        donenler.add(yardim); ustSerit.addView(yardim, LinearLayout.LayoutParams(dp(34f), dp(34f))); aciklamalar.add(yardim to "Açıklamalar")
        ustSerit.addView(View(this), LinearLayout.LayoutParams(0, 1, 1f))
        ustSerit.addView(ikon(R.drawable.ic_ayar, "Ayarlar") { ayarlarAc() }.apply { background = daire(false); scaleType = ImageView.ScaleType.FIT_CENTER; setPadding(dp(8f), dp(8f), dp(8f), dp(8f)); aciklamalar.add(this to "Ayarlar") }, LinearLayout.LayoutParams(dp(34f), dp(34f)))
        kok.addView(ustSerit)
        // Düzenlemede üst bant: Vazgeç · Bitti
        duzenSerit = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; visibility = View.GONE
            addView(etiket("Vazgeç", 14f).apply { contentDescription = "Vazgeç"; setPadding(dp(14f), 0, dp(14f), 0); background = cam(999f); setOnClickListener { duzenleBitir(false) } }, LinearLayout.LayoutParams(-2, dp(32f)))
            addView(View(this@KameraActivity), LinearLayout.LayoutParams(0, 1, 1f))
            addView(etiket("Bitti", 14f, VURGU).apply { contentDescription = "Bitti"; typeface = kosulKalin; setPadding(dp(14f), 0, dp(14f), 0); background = cam(999f); setOnClickListener { duzenleBitir(true) } }, LinearLayout.LayoutParams(-2, dp(32f))) }
        kok.addView(duzenSerit)
        // Flaş simgesi deklanşörün solundaki dairede
        flasIkon = ImageView(this).apply { setImageResource(R.drawable.ic_flas_yok); scaleType = ImageView.ScaleType.FIT_CENTER; setPadding(dp(12f), dp(12f), dp(12f), dp(12f)) }
        flasHarf = TextView(this).apply { text = "A"; textSize = 9f; typeface = kosulKalin; setTextColor(Color.WHITE); visibility = View.GONE }

        // Araç şeridi (eski düzen): araçların durumu burada tutulur
        aracSerit = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER; setPadding(dp(8f), 0, dp(8f), 0) }
        fun arac(res: Int, ad: String, etiketi: String, is_: () -> Unit) {
            val k = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; contentDescription = ad; tag = etiketi; setOnClickListener { is_() } }
            k.addView(ImageView(this).apply { setImageResource(res); donenler.add(this) }, LinearLayout.LayoutParams(dp(22f), dp(22f)))
            k.addView(TextView(this).apply { textSize = 11f; typeface = kosul; setTextColor(Color.WHITE); gravity = Gravity.CENTER; isSingleLine = true; setPadding(0, dp(3f), 0, 0) })
            aracSerit.addView(k, LinearLayout.LayoutParams(0, -1, 1f))
        }
        arac(R.drawable.ic_pozlama, "Pozlama", "poz") { cetvelAc(Cetvel.POZ) }
        arac(R.drawable.ic_beyaz, "Beyaz denge", "bd") { cetvelAc(Cetvel.BD) }
        arac(R.drawable.ic_odak, "Odak", "odak") { cetvelAc(Cetvel.ODAK) }
        arac(R.drawable.ic_kilavuz, "Kompozisyon kılavuzu", "kilavuz") { kilavuzMenu() }
        arac(R.drawable.ic_yardimci, "AI Kadraj", "yardimci") { asistanAcik = !asistanAcik; kompUygula() }
        arac(R.drawable.ic_terazi, "Terazi", "terazi") { teraziAcik = !teraziAcik; kompUygula() }
        // Araç şeridi ekranda değil: aynı araçlar ⋯ kontroller panosunda (Apple Kamera düzeni)

        // Mercek durakları ve timelapse aralığı deklanşörün üstünde
        kok.addView(sureSira); kok.addView(zoomSira)
        secimSira = FrameLayout(this).apply { visibility = View.GONE }
        kok.addView(secimSira)

        // Deklanşör sırası: solda flaş (PRO'da mod), ortada deklanşör, sağda ⋯ kontroller
        deklansorSira = FrameLayout(this)
        solDugme = FrameLayout(this).apply { setOnClickListener { if (mod == KMod.PRO) proKartlar() else flasDegistir() }; contentDescription = "Flaş"; background = daire(false) }
        proIkon = ImageView(this).apply { scaleType = ImageView.ScaleType.FIT_CENTER; setPadding(dp(11f), dp(11f), dp(11f), dp(11f)); setColorFilter(VURGU); visibility = View.GONE }
        solDugme.addView(flasIkon, FrameLayout.LayoutParams(-1, -1)); solDugme.addView(proIkon, FrameLayout.LayoutParams(-1, -1))
        solDugme.addView(flasHarf, FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM or Gravity.END).apply { marginEnd = dp(9f); bottomMargin = dp(8f) })
        donenler.add(solDugme); aciklamalar.add(solDugme to "Flaş")
        deklansorSira.addView(solDugme, FrameLayout.LayoutParams(dp(42f), dp(42f), Gravity.START or Gravity.CENTER_VERTICAL).apply { marginStart = dp(44f) })
        deklansorDugme = KayitDugmesi(this).apply { setOnClickListener { deklansorBasildi() }; contentDescription = "Çek"
            setOnLongClickListener { seriBasla() }
            setOnTouchListener { _, e -> if (e.actionMasked == MotionEvent.ACTION_UP || e.actionMasked == MotionEvent.ACTION_CANCEL) seriBitir(); false } }; aciklamalar.add(deklansorDugme to "Çek")
        deklansorSira.addView(deklansorDugme, FrameLayout.LayoutParams(dp(74f), dp(74f), Gravity.CENTER))
        kontrolDugme = FrameLayout(this).apply { contentDescription = "Kontroller"; background = daire(false); setOnClickListener { if (acilir != null) acilirKapat() else denetimlerAc() } }
        kontrolDugme.addView(Noktalar(), FrameLayout.LayoutParams(-1, -1))
        donenler.add(kontrolDugme); aciklamalar.add(kontrolDugme to "Kontroller")
        deklansorSira.addView(kontrolDugme, FrameLayout.LayoutParams(dp(42f), dp(42f), Gravity.END or Gravity.CENTER_VERTICAL).apply { marginEnd = dp(44f) })
        kok.addView(deklansorSira)

        // Alt bant: son çekim · kapsül mod seçici · çevir
        altSira = FrameLayout(this)
        sonResim = ImageView(this).apply { scaleType = ImageView.ScaleType.CENTER_CROP; background = cam(dp(12f).toFloat()); clipToOutline = true
            contentDescription = "Son çekim"; setOnClickListener { sonuAc() } }
        donenler.add(sonResim); aciklamalar.add(sonResim to "Son çekim")
        altSira.addView(sonResim, FrameLayout.LayoutParams(dp(42f), dp(42f), Gravity.START or Gravity.CENTER_VERTICAL).apply { marginStart = dp(20f) })
        modSerit = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        modKaydir = HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false; addView(modSerit)
            isHorizontalFadingEdgeEnabled = true; setFadingEdgeLength(dp(28f)) }
        aciklamalar.add(modKaydir to "Kaydır: çekim modu")
        altSira.addView(modKaydir, FrameLayout.LayoutParams(-1, dp(40f), Gravity.CENTER).apply { marginStart = dp(76f); marginEnd = dp(76f) })
        modlariCiz()
        val cevir = ikon(R.drawable.ic_cevir, "Kamerayı çevir") { kameraCevir() }.apply { background = daire(false); scaleType = ImageView.ScaleType.FIT_CENTER; setPadding(dp(11f), dp(11f), dp(11f), dp(11f)) }; aciklamalar.add(cevir to "Ön / arka")
        altSira.addView(cevir, FrameLayout.LayoutParams(dp(42f), dp(42f), Gravity.END or Gravity.CENTER_VERTICAL).apply { marginEnd = dp(20f) })
        kok.addView(altSira)
        // Wi-Fi kamera: canlıdayken kırmızı çerçeve (tally), üstte bağlantı durumu
        tallyCerceve = View(this).apply { background = GradientDrawable().apply { setStroke(dp(6f), Color.rgb(229, 57, 53)) }; visibility = View.GONE; isClickable = false }
        kok.addView(tallyCerceve, FrameLayout.LayoutParams(-1, -1))
        masaCip = cip(YESIL).apply { visibility = View.GONE; setOnClickListener { ayarlarAc() } }
        Tema.simge(masaCip, R.drawable.ic_ag, YESIL, 15f)
        kutu.addView(masaCip, FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM or Gravity.START).apply { bottomMargin = dp(200f); marginStart = dp(12f) })

        setContentView(kok)
        kok.viewTreeObserver.addOnGlobalLayoutListener { yaziYay(kok) }
        yerlestir(); kompUygula(); modUygula(ilk = true); sonCekimiBul()
    }

    /** Güvenli alana göre konumlar */
    private fun yerlestir() {
        if (!this::kok.isInitialized) return
        val u = if (ustBosluk == 0) dp(32f) else ustBosluk; val a = if (altBosluk == 0) dp(16f) else altBosluk
        // Üst bant 44, alt bant 80 (siyah); deklanşör sırası, mercekler ve timelapse aralığı görüntünün alt kısmının üstünde
        ustSerit.layoutParams = FrameLayout.LayoutParams(-1, dp(40f), Gravity.TOP).apply { topMargin = u + dp(2f); marginStart = dp(16f); marginEnd = dp(16f) }
        kutu.layoutParams = FrameLayout.LayoutParams(-1, -1).apply { topMargin = u + dp(44f); bottomMargin = a + dp(80f) }
        ustKarartma.layoutParams = FrameLayout.LayoutParams(-1, u + dp(110f), Gravity.TOP)
        altKarartma.layoutParams = FrameLayout.LayoutParams(-1, a + dp(300f), Gravity.BOTTOM)
        altSira.layoutParams = FrameLayout.LayoutParams(-1, dp(80f), Gravity.BOTTOM).apply { bottomMargin = a }
        deklansorSira.layoutParams = FrameLayout.LayoutParams(-1, dp(76f), Gravity.BOTTOM).apply { bottomMargin = a + dp(90f) }
        zoomSira.layoutParams = FrameLayout.LayoutParams(-1, dp(40f), Gravity.BOTTOM).apply { bottomMargin = a + dp(174f) }
        secimSira.layoutParams = FrameLayout.LayoutParams(-1, dp(44f), Gravity.BOTTOM).apply { bottomMargin = a + dp(172f); marginStart = dp(12f); marginEnd = dp(12f) }
        duzenSerit.layoutParams = FrameLayout.LayoutParams(-1, dp(40f), Gravity.TOP).apply { topMargin = u + dp(2f); marginStart = dp(16f); marginEnd = dp(16f) }
        sureSira.layoutParams = FrameLayout.LayoutParams(-1, dp(32f), Gravity.BOTTOM).apply { bottomMargin = a + dp(220f) }
        kok.requestLayout()
    }

    private fun cip(renk: Int) = TextView(this).apply {
        textSize = 13f; typeface = kosul; setTextColor(Color.WHITE); setPadding(dp(12f), dp(7f), dp(12f), dp(7f)); background = cam(dp(14f).toFloat()); visibility = View.GONE
        tag = renk
    }

    /* ================= modlar ================= */
    private fun modlariCiz() {
        modSerit.removeAllViews()
        val ekranG = resources.displayMetrics.widthPixels - dp(152f)
        modSerit.addView(View(this), LinearLayout.LayoutParams(ekranG / 2 - dp(32f), 1))
        // Arkasız; seçili beyaz yazı + beyaz %12 kapsül, diğerleri %62. Kısa adlar: PRO MODLAR → PRO; yan tutuşta TIMELAPSE → TL, MONİTÖR → MON.
        val yan = fizikselYon == 90 || fizikselYon == 270
        KMod.values().forEach { m -> modSerit.addView(etiket(modKisa(m, yan), 12f, if (m == mod) Color.WHITE else METIN2).apply {
            setPadding(dp(12f), 0, dp(12f), 0); tag = m; typeface = kosulKalin; letterSpacing = 0.12f; contentDescription = m.ad; setOnClickListener { modSec(m) }
            if (m == mod) background = Tema.kapsul(SECILI) else setShadowLayer(dp(2f).toFloat(), 0f, 0f, Color.argb(120, 0, 0, 0)) }, LinearLayout.LayoutParams(-2, dp(30f)).apply { marginStart = dp(1f); marginEnd = dp(1f) }) }
        modSerit.addView(View(this), LinearLayout.LayoutParams(ekranG / 2 - dp(32f), 1))
        modKaydir.post { (0 until modSerit.childCount).map { modSerit.getChildAt(it) }.firstOrNull { it.tag == mod }?.let { v -> modKaydir.smoothScrollTo(v.left + v.width / 2 - modKaydir.width / 2, 0) } }
    }

    private fun modKisa(m: KMod, yan: Boolean) = when (m) { KMod.PRO -> "PRO"; KMod.TIMELAPSE -> if (yan) "TL" else m.ad; else -> m.ad }

    private fun modSec(m: KMod, kartlar: Boolean = true) {
        secimKapat()
        if (m == mod) { if (m == KMod.PRO && kartlar) proKartlar(); return }
        if (kayitSuruyor()) return tost("Kayıt sürerken mod değişmez.")
        konuBirak()
        mod = m; tercih.edit().putString("mod", m.name).apply()
        if (ayar.pozlamaNs != null || bulb) { ayar.pozlamaNs = null; ayar.uzunOnizleme = 0; bulb = false; ayarKaydet() }
        modlariCiz(); modUygula(); vlogGuncelle()
        if (m == KMod.PRO) mercekUygula()
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
        mercekUygula()
        proUyari(m)
    }

    /** PRO modun merceği: kayıtlıysa o, yoksa kuş ve uçakta en uzun mercek, diğerlerinde 1× */
    private fun mercekUygula() {
        val d = mercekDuraklari(); if (d.isEmpty() || onde) return
        val a = proMod.oku(tercih)
        val istenen = a.mercek ?: if (proMod.tele) d.last() else 1f
        val z = d.minByOrNull { abs(it - istenen) } ?: return
        if (abs(z - ayar.zoomOrani) > 0.01f) zoomAyarla(z, modaYaz = false)
    }

    private fun proCiz() {
        val acik = mod == KMod.PRO
        proCip.visibility = if (acik) View.VISIBLE else View.GONE
        if (acik) proCip.text = proMod.ozet(proMod.oku(tercih)) + "  ›"
        (oneriCip.layoutParams as FrameLayout.LayoutParams).topMargin = dp(if (acik) 132f else 88f)
        flasCiz()
    }

    /** 3×3 kart: simge, ad, tek satır ipucu; seçili kart turuncu çerçeveli */
    private fun proKartlar() {
        val p = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; background = saydamPano(dp(26f).toFloat()); setPadding(dp(14f), dp(16f), dp(14f), dp(14f)); isClickable = true }
        ProMod.values().toList().chunked(3).forEach { sira ->
            val s = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            sira.forEach { m ->
                val secili = m == proMod
                val k = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL; setPadding(dp(6f), dp(12f), dp(6f), dp(10f)); contentDescription = m.ad
                    background = GradientDrawable().apply { cornerRadius = dp(14f).toFloat(); setColor(if (secili) SECILI else DOLGU); if (secili) setStroke(ince, Color.argb(128, 255, 214, 10)) }
                    // Seçili moda bir kez daha dokunmak normale (standart FOTO) döndürür
                    setOnClickListener { acilirKapat(); if (secili) { modSec(KMod.FOTO); tost("Normal çekime dönüldü") } else proSec(m) } }
                k.addView(ImageView(this).apply { setImageResource(m.simge); setColorFilter(if (secili) VURGU else Color.WHITE) }, LinearLayout.LayoutParams(dp(26f), dp(26f)))
                k.addView(etiket(m.ad, 14f, if (secili) VURGU else Color.WHITE).apply { setPadding(0, dp(6f), 0, dp(2f)) })
                k.addView(TextView(this).apply { text = if (secili) "Tekrar dokun: normale dön" else m.ipucu; textSize = 10f; letterSpacing = -0.01f; setTextColor(if (secili) VURGU else GRI); gravity = Gravity.CENTER; maxLines = 3; ellipsize = android.text.TextUtils.TruncateAt.END })
                s.addView(k, LinearLayout.LayoutParams(0, dp(118f), 1f).apply { marginStart = dp(4f); marginEnd = dp(4f) })
            }
            p.addView(s, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(8f) })
        }
        p.addView(TextView(this).apply { text = "Seçili moda tekrar dokununca normal çekime dönülür. Ayarlar için üstteki etikete dokun."; textSize = 12f; setTextColor(GRI); gravity = Gravity.CENTER; setPadding(0, dp(4f), 0, 0) })
        acilirAc(p, ustTan = false, baslik = "PRO MODLAR"); altGizle(true)
    }

    /** Mod seçilince kısa uyarı (tripod, sabitleme…); pencerenin dışına dokununca kapanır */
    private fun proUyari(m: ProMod) {
        acilirKapat()
        val perde = FrameLayout(this).apply { setBackgroundColor(Color.argb(110, 0, 0, 0)); setOnClickListener { acilirKapat() } }
        val k = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL; background = saydamPano(dp(24f).toFloat()); setPadding(dp(22f), dp(20f), dp(22f), dp(16f)); isClickable = true }
        k.addView(ImageView(this).apply { setImageResource(m.simge); setColorFilter(VURGU) }, LinearLayout.LayoutParams(dp(30f), dp(30f)))
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
        val gorunen = aciklamalar.filter { it.first.isShown && it.first !== modKaydir && !(it.first === bilgiSira && proCip.isShown) }.map { (v, m) -> yer(v).let { Yer(v, m, it[0], it[1]) } }
        val altSiradakiler = gorunen.filter { it.v.parent === altSira || it.v.parent === deklansorSira }
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
                    setPadding(dp(7f), dp(4f), dp(7f), dp(4f)); background = Tema.kapsul(Color.rgb(30, 33, 38), dp(9f).toFloat(), VURGU) }
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
                if (cizgiAlt > cizgiUst) kat.addView(View(this).apply { setBackgroundColor(Color.argb(170, 255, 214, 10)) },
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
        ic.addView(etiket(m.ad.uppercase(Locale("tr")), 18f).apply { gravity = Gravity.START or Gravity.CENTER_VERTICAL; typeface = kosulKalin; Tema.simge(this, m.simge, VURGU, 20f) })
        ic.addView(TextView(this).apply { text = m.ipucu; textSize = 12f; setTextColor(GRI); setPadding(0, dp(4f), 0, dp(4f)) })
        fun degistir(y: ProAyar) { val mercekDegisti = y.mercek != m.oku(tercih).mercek; m.yaz(tercih, y); proCiz(); proGonder(); if (mercekDegisti) mercekUygula(); proOzellestir() }
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
                    background = Tema.kapsul(if (ac) VURGU else if (vurgulu) Color.argb(36, 255, 204, 0) else Color.argb(26, 255, 255, 255), dp(10f).toFloat(), if (vurgulu && !ac) SARI else 0)
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
        val duraklar = mercekDuraklari()
        if (!onde && duraklar.size > 1) satir("LENS", "Mercek", duraklar, a.mercek ?: if (m.tele) duraklar.last() else 1f, { fmt(it) + "×" }) { a.copy(mercek = it) }
        if (m.sureVar) satir("T", "Toplam süre", ProMod.SURELER, a.sureSn, ProMod::sureYazi) { a.copy(sureSn = it) }
        satir("⏱", "Zamanlayıcı", ProMod.ZAMANLAR, a.zamanlayici, ProMod::zamanYazi) { a.copy(zamanlayici = it) }
        val alt = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(0, dp(16f), 0, 0) }
        alt.addView(TextView(this).apply { text = "Varsayılana dön"; textSize = 15f; setTextColor(if (a == m.varsayilan) GRI else MAVI_ACIK); gravity = Gravity.CENTER_VERTICAL; minHeight = dp(44f)
            Tema.simge(this, R.drawable.ic_geri, currentTextColor, 16f); setOnClickListener { if (a != m.varsayilan) degistir(m.varsayilan) } }, LinearLayout.LayoutParams(0, -2, 1f))
        alt.addView(etiket("Tamam", 15f, Color.BLACK).apply { background = Tema.kapsul(Color.WHITE, dp(12f).toFloat()); setPadding(dp(22f), 0, dp(22f), 0); setOnClickListener { acilirKapat() } }, LinearLayout.LayoutParams(-2, dp(44f)))
        ic.addView(alt)
        val p = ScrollView(this).apply { background = saydamPano(dp(26f).toFloat()); addView(ic); isClickable = true; clipToOutline = true }
        acilirAc(p, ustTan = false, baslik = m.ad.uppercase(Locale("tr"))); altGizle(true)

    }

    /** Mod şeridinin üstündeki hızlı seçim: timelapse'te kare aralığı */
    private fun sureCiz() {
        sureSira.removeAllViews()
        Timelapse.HIZLI.forEach { ms -> sureSira.addView(TextView(this).apply {
            text = Timelapse.aralikYazi(ms); textSize = 12f; typeface = kosulKalin; gravity = Gravity.CENTER; setTextColor(if (tlAralik == ms) VURGU else Color.argb(217, 255, 255, 255))
            background = if (tlAralik == ms) secenek(true) else cam(999f); setPadding(dp(12f), 0, dp(12f), 0); contentDescription = "Kare aralığı ${text}"
            setOnClickListener { if (tlKaydedici != null) return@setOnClickListener; tlAralik = ms; tercih.edit().putLong("tlAralik", ms).apply(); sureCiz(); bilgiCiz() } }, LinearLayout.LayoutParams(-2, dp(32f)).apply { marginEnd = dp(6f) }) }
    }

    /* ================= dokunma: odak, kaydırma (mod); yakınlaştırma yok, yalnız gerçek mercekler ================= */
    private fun dokunmaKur() {
        val jest = GestureDetector(this, object : GestureDetector.SimpleOnGestureListener() {
            override fun onDown(e: MotionEvent) = true
            override fun onSingleTapUp(e: MotionEvent): Boolean { odakDokun(e.x, e.y); return true }
            override fun onLongPress(e: MotionEvent) { konuBirak(); kaynak?.odakSerbest(); odakKare.visibility = View.GONE; tost("Otomatik odak") }
            override fun onFling(a: MotionEvent?, b: MotionEvent, vx: Float, vy: Float): Boolean {
                if (a == null || abs(vx) < abs(vy) * 1.5f || abs(b.x - a.x) < dp(60f)) return false
                val modlar = KMod.values().toList(); val i = modlar.indexOf(mod)
                val j = if (vx < 0) i + 1 else i - 1
                if (j in modlar.indices) modSec(modlar[j]); return true
            }
        })
        monitor.setOnTouchListener { _, e -> jest.onTouchEvent(e); true }
    }

    private fun odakDokun(x: Float, y: Float) {
        val r = monitor.goruntuAlani(); if (!r.contains(x, y)) return
        val k = kaynak ?: return
        val u = (x - r.left) / r.width(); val v = (y - r.top) / r.height()
        k.odakla(u, v, 0)
        if (asistanAcik && asistan != null) konuSec(u, v)
        odakKare.translationX = x - dp(36f); odakKare.translationY = y - dp(36f)
        odakKare.visibility = View.VISIBLE; odakKare.alpha = 1f; odakKare.scaleX = 1.3f; odakKare.scaleY = 1.3f
        odakKare.animate().scaleX(1f).scaleY(1f).setDuration(180).withEndAction { odakKare.animate().alpha(0.5f).setStartDelay(1200).setDuration(400) }
    }

    /* ================= AI Kadraj: dokunarak konu seçimi (iPhone'daki Kamera.konuSec) ================= */
    /** Kullanıcı dokunup konuyu seçti: odak ve pozlama konuyu izler; uzun basınca, mod değişince, AI Kadraj kapanınca ya da konu kaybolunca düşer */
    private var konuSecili = false; private var secimBulundu = false
    private var sonKonuOdak = 0L; private var sonKonuNokta = android.graphics.PointF(-1f, -1f)

    private fun konuSec(u: Float, v: Float) {
        val a = asistan ?: return
        a.hedef = android.graphics.PointF(u, v)
        konuSecili = true; secimBulundu = false; komp.konuSecili = true; sonKonuNokta = android.graphics.PointF(-1f, -1f)
        // 1,5 sn içinde konu bulunmazsa seçim düşer (düz odak kalır)
        val no = ++secimNo
        monitor.postDelayed({ if (konuSecili && !secimBulundu && secimNo == no) { konuBirak(); tost("Orada konu bulunamadı") } }, 1500)
    }
    private var secimNo = 0

    private fun konuBirak() {
        if (!konuSecili) return
        konuSecili = false; secimBulundu = false; asistan?.hedef = null; komp.konuSecili = false
    }

    /** Seçili konu hareket ettikçe odak ve pozlama noktası onu izler (0,3 sn'de bir, konu yerinden oynadıysa) */
    private fun konuyuIzle(k: RectF) {
        val m = android.graphics.PointF(k.centerX(), k.centerY()); val simdi = System.currentTimeMillis()
        if (simdi - sonKonuOdak < 300 || kotlin.math.hypot(m.x - sonKonuNokta.x, m.y - sonKonuNokta.y) <= 0.02f) return
        sonKonuOdak = simdi; sonKonuNokta = m
        kaynak?.konuIzle(m.x, m.y, 0)
    }

    /* ================= yakınlaştırma ================= */
    private fun zoomAyarla(v: Float, modaYaz: Boolean = true) {
        val z = kaynak?.zoomAralik ?: return
        ayar.zoomOrani = v.coerceIn(z.lower, minOf(z.upper, 10f)); kaynak?.ayarDegisti(); zoomCiz()
        // PRO MODLAR'da seçilen mercek o moda kaydedilir
        if (modaYaz && mod == KMod.PRO) { val a = proMod.oku(tercih); if (a.mercek != ayar.zoomOrani) proMod.yaz(tercih, a.copy(mercek = ayar.zoomOrani)) }
    }

    /** Telefonun mercek durakları: ultra geniş (varsa), 1×, 2× ve 5× (tele varsa) */
    private fun mercekDuraklari(): List<Float> {
        val z = kaynak?.zoomAralik ?: return emptyList()
        val d = ArrayList<Float>()
        if (z.lower < 0.95f) d.add(z.lower)
        d.add(1f); if (z.upper >= 2f) d.add(2f); if (z.upper >= 5f) d.add(5f)
        return d
    }

    private fun zoomCiz() {
        (0 until zoomSira.childCount).forEach { donenler.remove(zoomSira.getChildAt(it)) }
        zoomSira.removeAllViews()
        val duraklar = mercekDuraklari()
        val yakin = duraklar.minByOrNull { abs(it - ayar.zoomOrani) }
        duraklar.forEach { d ->
            val secili = d == yakin
            val yazi = if (secili) fmt(d) + "×" else fmt(d)
            // Seçili: 40 dp yüzeyli daire, sarı "1×"; diğerleri 34 dp, %62 yazı
            zoomSira.addView(TextView(this).apply {
                text = yazi; textSize = if (secili) 13f else 12f; typeface = kosulKalin; gravity = Gravity.CENTER; setTextColor(if (secili) VURGU else METIN2)
                background = daire(false)
                contentDescription = "Mercek ${fmt(d)}×"; setOnClickListener { zoomAyarla(d) }; donenler.add(this); rotation = -fizikselYon.toFloat()
            }, LinearLayout.LayoutParams(dp(if (secili) 40f else 34f), dp(if (secili) 40f else 34f)).apply { marginStart = dp(4f); marginEnd = dp(4f) })
        }
    }
    private fun fmt(v: Float) = if (v < 1f) "0,${(v * 10).toInt()}" else if (v % 1f == 0f) "${v.toInt()}" else "%.1f".format(v).replace('.', ',')

    /* ================= flaş ================= */
    private fun flasDegistir() {
        if (kaynak?.flasVar != true) return tost("Bu kamerada flaş yok.")
        ayar.flas = if (mod.foto) (when (ayar.flas) { 0 -> 1; 1 -> 2; else -> 0 }) else (if (ayar.flas == 3) 0 else 3)
        ayarKaydet(); kaynak?.ayarDegisti(); flasCiz()
        tost(when (ayar.flas) { 1 -> "Flaş: otomatik"; 2 -> "Flaş: açık"; 3 -> "Fener açık"; else -> "Flaş kapalı" })
    }
    private fun flasCiz() {
        if (!this::solDugme.isInitialized) return
        if (!mod.foto && ayar.flas in 1..2) { ayar.flas = 0; kaynak?.ayarDegisti() }
        if (mod.foto && ayar.flas == 3) { ayar.flas = 0; kaynak?.ayarDegisti() }
        val pro = mod == KMod.PRO
        flasIkon.setImageResource(if (ayar.flas == 0) R.drawable.ic_flas_yok else R.drawable.ic_flas)
        flasIkon.setColorFilter(if (ayar.flas > 0) VURGU else Color.WHITE)
        flasIkon.visibility = if (pro) View.GONE else View.VISIBLE
        flasHarf.visibility = if (ayar.flas == 1 && !pro) View.VISIBLE else View.GONE
        proIkon.visibility = if (pro) View.VISIBLE else View.GONE
        if (pro) proIkon.setImageResource(proMod.simge)
        solDugme.background = daire(pro || ayar.flas > 0)
        solDugme.contentDescription = if (pro) "PRO modlar" else "Flaş"
    }

    /* ================= kompozisyon ================= */
    private fun kompUygula() {
        komp.tur = kompTur; komp.yon = kompYon; komp.asistan = asistanAcik
        tercih.edit().putString("komp", kompTur.name).putInt("kompYon", kompYon).putString("sonKomp", sonKomp.name).putBoolean("k.aiKadraj", asistanAcik)
            .putBoolean("terazi", teraziAcik).putBoolean("sahneOto", sahneOto).apply()
        if (asistanAcik && asistan == null) asistan = runCatching { Asistan { r, ad, yuz -> runOnUiThread { sonYuz = yuz; asistanSonuc(r, ad) } }.also { a ->
            a.konuKayboldu = { runOnUiThread { if (konuSecili) { konuBirak(); kaynak?.odakSerbest(); tost("Konu kayboldu; otomatik odak") } } } } }.getOrNull()
        if (!asistanAcik) konuBirak()
        if (!asistanAcik) { asistan?.kapat(); asistan = null; komp.konu = null; komp.konuAdi = ""; oneriCip.visibility = View.GONE; sonOneri = null; aiAday = null; sahneAday = null
            sahneOnerisi = null; sahneCip.visibility = View.GONE }
        if (!teraziAcik) komp.egim = null
        sensorKaydi()
        if (!asistanAcik) { komp.analiz = null; komp.ipucu = null }
        if (this::kose.isInitialized) kose.visibility = if (histoAcik) View.VISIBLE else View.GONE
        monitor.olcumKaresi = if (asistanAcik || histoAcik) { buf, w, h -> asistan?.kare(buf, w, h); if (sahneOto && asistanAcik) renkOlc(buf, w, h); if (histoAcik) kose.kare(buf, w, h)
            if (asistanAcik) { val oran = komp.goruntuOrani(); analiz.kare(buf, w, h, oran) { s -> runOnUiThread { if (asistanAcik) komp.analiz = s; ipucuGuncelle(); aiDusun() } } } } else null
        if (this::aracSerit.isInitialized) aracCiz()
    }

    private fun sensorKaydi() {
        sensorler.unregisterListener(yercekimDinle)
        if ((teraziAcik || sahneOto && asistanAcik) && onde) sensorler.getDefaultSensor(android.hardware.Sensor.TYPE_GRAVITY)?.let { sensorler.registerListener(yercekimDinle, it, android.hardware.SensorManager.SENSOR_DELAY_UI) }
    }

    private fun asistanSonuc(r: RectF?, ad: String) {
        if (!asistanAcik) return
        komp.konu = r; komp.konuAdi = ad
        if (konuSecili && r != null) { secimBulundu = true; konuyuIzle(r) }
        aiDusun(); ipucuGuncelle()
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
        val izgara = android.widget.GridLayout(this).apply { columnCount = 4 }
        KompTur.values().forEach { t ->
            val sec = t == kompTur
            val h = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL; setPadding(dp(3f), dp(4f), dp(3f), dp(6f)); setOnClickListener { kompTur = t; if (t != KompTur.KAPALI) sonKomp = t; aiAday = null; kompUygula(); kontrolCiz(); acilirKapat(); kilavuzMenu() } }
            val on = FrameLayout(this).apply { background = GradientDrawable().apply { cornerRadius = dp(10f).toFloat(); setColor(Color.rgb(58, 64, 73)); setStroke(dp(if (sec) 2f else 1f), if (sec) VURGU else Color.argb(30, 255, 255, 255)) }; clipToOutline = true }
            if (t != KompTur.KAPALI) on.addView(KompozisyonGorunum(this) { RectF(0f, 0f, dp(72f).toFloat(), dp(54f).toFloat()) }.also { it.tur = t; it.yon = kompYon }, FrameLayout.LayoutParams(-1, -1))
            h.addView(on, LinearLayout.LayoutParams(dp(72f), dp(54f)))
            h.addView(TextView(this).apply { text = t.ad; textSize = 11f; setTextColor(if (sec) VURGU else Color.WHITE); gravity = Gravity.CENTER; setPadding(0, dp(4f), 0, 0) })
            izgara.addView(h)
        }
        p.addView(izgara)
        if (kompTur == KompTur.SPIRAL || kompTur == KompTur.UCGEN) {
            val yonler = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(dp(4f), dp(8f), 0, dp(4f)) }
            yonler.addView(TextView(this).apply { text = "Yön"; textSize = 13f; setTextColor(GRI); setPadding(0, 0, dp(10f), 0) })
            listOf("↘", "↙", "↗", "↖").forEachIndexed { i, ok -> yonler.addView(etiket(ok, 14f, if (i == kompYon) Color.BLACK else Color.WHITE).apply {
                background = Tema.kapsul(if (i == kompYon) VURGU else Color.argb(26, 255, 255, 255), dp(10f).toFloat()); setOnClickListener { kompYon = i; kompUygula(); acilirKapat(); kilavuzMenu() } }, LinearLayout.LayoutParams(dp(46f), dp(34f)).apply { marginEnd = dp(8f) }) }
            p.addView(yonler)
        }
        p.addView(View(this).apply { setBackgroundColor(Color.argb(20, 255, 255, 255)) }, LinearLayout.LayoutParams(-1, 1).apply { topMargin = dp(10f); bottomMargin = dp(4f) })
        p.addView(anahtar("AI Kadraj", asistanAcik) { asistanAcik = it; kompUygula(); kontrolCiz() })
        p.addView(anahtar("Terazi", teraziAcik) { teraziAcik = it; kompUygula() })
        acilirAc(p, ustTan = false, baslik = "KOMPOZİSYON"); altGizle(true)
    }

    private fun anahtar(ad: String, acik: Boolean, degis: (Boolean) -> Unit): View {
        val s = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(dp(4f), dp(8f), dp(4f), dp(8f)) }
        s.addView(TextView(this).apply { text = ad; textSize = 15f; setTextColor(Color.WHITE); Tema.simgeAdi(ad)?.let { Tema.simge(this, it, GRI) } }, LinearLayout.LayoutParams(0, -2, 1f))
        val sw = android.widget.Switch(this).apply { isChecked = acik; thumbTintList = android.content.res.ColorStateList.valueOf(Color.WHITE)
            trackTintList = android.content.res.ColorStateList(arrayOf(intArrayOf(android.R.attr.state_checked), intArrayOf()), intArrayOf(VURGU, Color.argb(70, 255, 255, 255))); trackTintMode = android.graphics.PorterDuff.Mode.SRC
            setOnCheckedChangeListener { _, b -> degis(b) } }
        s.addView(sw)
        return s
    }

    /**
     * Pano alttan açılır (Apple Kamera): üstünde ✕ ve başlık; alt bandın üstüne biner, deklanşör sırası panonun üstüne kalkar.
     * Panolar ekranın en fazla %62'si kadar uzar, fazlası kaydırılır.
     */
    @Suppress("UNUSED_PARAMETER")
    private fun acilirAc(v: View, ustTan: Boolean, altPay: Int = 0, baslik: String? = null, serit: View? = null,
                         sol: Pair<String, () -> Unit>? = null, perdeKapat: (() -> Unit)? = null, carpiYok: Boolean = false) {
        // Menü grubu kurulurken panolar ayrı açılmaz, grubun içine eklenir
        grupIci?.let { g -> v.background = null; (v.parent as? android.view.ViewGroup)?.removeView(v); g.addView(v, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(6f) }); return }
        acilirKapat(); secimKapat()
        val perde = FrameLayout(this).apply { setOnClickListener { perdeKapat?.invoke() ?: acilirKapat() } }
        val kap = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; background = pano(0f); setPadding(dp(14f), dp(10f), dp(14f), dp(16f)); isClickable = true }
        val bas = FrameLayout(this)
        bas.addView(TextView(this).apply { text = baslik ?: ""; textSize = 13f; typeface = kosulKalin; letterSpacing = 0.14f; setTextColor(Color.WHITE); isSingleLine = true },
            FrameLayout.LayoutParams(-2, -2, Gravity.CENTER))
        if (sol != null) bas.addView(etiket(sol.first, 13f).apply { contentDescription = sol.first; setPadding(dp(12f), 0, dp(12f), 0); background = secenek(false)
            setOnClickListener { sol.second() } }, FrameLayout.LayoutParams(-2, dp(32f), Gravity.START or Gravity.CENTER_VERTICAL))
        else if (!carpiYok) bas.addView(ImageView(this).apply { setImageResource(R.drawable.ic_kapat); setColorFilter(METIN2); scaleType = ImageView.ScaleType.FIT_CENTER; setPadding(dp(7f), dp(7f), dp(7f), dp(7f)); contentDescription = "Kapat"
            background = daire(false, Color.argb(31, 255, 255, 255)); setOnClickListener { perdeKapat?.invoke() ?: acilirKapat() } }, FrameLayout.LayoutParams(dp(28f), dp(28f), Gravity.START or Gravity.CENTER_VERTICAL).apply { marginStart = dp(6f) })
        kap.addView(bas, LinearLayout.LayoutParams(-1, dp(44f)))
        v.background = null
        val kaydir = v as? ScrollView ?: ScrollView(this).apply { isVerticalScrollBarEnabled = false; addView(v) }
        kap.addView(kaydir, LinearLayout.LayoutParams(-1, -2))
        serit?.let { kap.addView(it, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10f) }) }
        val a = if (altBosluk == 0) dp(16f) else altBosluk
        perde.addView(kap, FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM).apply { marginStart = dp(8f); marginEnd = dp(8f); bottomMargin = a + dp(6f) })
        kok.addView(perde, FrameLayout.LayoutParams(-1, -1)); acilir = perde
        zoomSira.visibility = View.INVISIBLE; sureSira.visibility = View.INVISIBLE
        kap.post {
            val en = (kok.height * 0.62f).toInt()
            if (kap.height > en) kaydir.layoutParams = kaydir.layoutParams.apply { height = en - dp(72f) - (serit?.height?.plus(dp(10f)) ?: 0) }
            kap.post { if (acilir === perde) deklansorSira.animate().translationY(minOf(0f, (kap.top - dp(6f) - deklansorSira.bottom).toFloat())).setDuration(160).start() }
        }
    }
    private fun acilirKapat() {
        acilir?.let { kok.removeView(it) }; acilir = null; aktifGrup = null; aktifDenetim = false
        if (this::aracSerit.isInitialized) {
            aracCiz(); altGizle(false)
            deklansorSira.animate().translationY(0f).setDuration(160).start()
            zoomSira.visibility = if (acikSecim == null) View.VISIBLE else View.INVISIBLE; sureSira.visibility = if (mod == KMod.TIMELAPSE) View.VISIBLE else View.GONE
        }
    }
    /** Pano açıkken alt bant görünmesin (pano onun üstüne biner) */
    private fun altGizle(gizle: Boolean) = listOf(altSira).forEach { it.visibility = if (gizle) View.INVISIBLE else View.VISIBLE }

    /* ================= cetvel: pozlama, beyaz denge, odak (Final Cut Camera gibi alttan) ================= */
    enum class Cetvel { POZ, BD, ODAK }
    private val BD_ADLARI = linkedMapOf(CameraMetadata.CONTROL_AWB_MODE_AUTO to "Oto", CameraMetadata.CONTROL_AWB_MODE_INCANDESCENT to "3200K",
        CameraMetadata.CONTROL_AWB_MODE_FLUORESCENT to "4000K", CameraMetadata.CONTROL_AWB_MODE_DAYLIGHT to "5600K", CameraMetadata.CONTROL_AWB_MODE_CLOUDY_DAYLIGHT to "6500K", CameraMetadata.CONTROL_AWB_MODE_SHADE to "7500K")
    private val BD_ACIKLAMA = mapOf(CameraMetadata.CONTROL_AWB_MODE_INCANDESCENT to "Ampul", CameraMetadata.CONTROL_AWB_MODE_FLUORESCENT to "Floresan", CameraMetadata.CONTROL_AWB_MODE_DAYLIGHT to "Gün ışığı",
        CameraMetadata.CONTROL_AWB_MODE_CLOUDY_DAYLIGHT to "Bulutlu", CameraMetadata.CONTROL_AWB_MODE_SHADE to "Gölge")
    private fun evYazi(ev: Int, adim: Float) = if (ev == 0) "±0" else "%+.1f".format(ev * adim).replace('.', ',')

    /** Beyaz denge tonu (iPhone'daki TonCubugu): − / + (±5), yeşil ↔ macenta çubuk, ortada sıfır çentiği, çift dokunuş sıfırlar, sağda "Y12 / M12 / 0" */
    private fun tonSatiri(degisti: (Int) -> Unit): LinearLayout {
        val satir = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        val yazi = TextView(this).apply { textSize = 13f; typeface = mono; gravity = Gravity.END }
        lateinit var cubuk: TonCubugu
        fun ayarla(t: Int) {
            val y = t.coerceIn(-50, 50); val eski = ayar.ton
            if (y == eski) return
            if ((y == 0) != (eski == 0) || (y != 0 && y % 25 == 0)) satir.performHapticFeedback(android.view.HapticFeedbackConstants.CLOCK_TICK)
            degisti(y); yaziCiz(yazi); cubuk.invalidate()
        }
        fun adim(isaret: String, d: Int) = etiket(isaret, 16f).apply { background = Tema.kapsul(Color.argb(92, 120, 120, 120)); contentDescription = if (d < 0) "Yeşile" else "Macentaya"
            setOnClickListener { ayarla(ayar.ton + d); ayarKaydet() } }
        cubuk = TonCubugu { ayarla(it) }
        satir.addView(adim("−", -5), LinearLayout.LayoutParams(dp(30f), dp(30f)))
        satir.addView(cubuk, LinearLayout.LayoutParams(0, dp(36f), 1f).apply { marginStart = dp(8f); marginEnd = dp(8f) })
        satir.addView(adim("+", 5), LinearLayout.LayoutParams(dp(30f), dp(30f)))
        satir.addView(yazi, LinearLayout.LayoutParams(dp(40f), -2))
        yaziCiz(yazi)
        return satir
    }
    private fun yaziCiz(t: TextView) { val v = ayar.ton; t.text = if (v == 0) "0" else "${if (v < 0) "Y" else "M"}${abs(v)}"; t.setTextColor(if (v == 0) GRI else Color.WHITE) }

    private inner class TonCubugu(val ayarla: (Int) -> Unit) : View(this@KameraActivity) {
        private val boya = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG)
        private val yesil = Color.rgb(48, 209, 88); private val macenta = Color.rgb(255, 55, 210)
        private val algila = android.view.GestureDetector(context, object : android.view.GestureDetector.SimpleOnGestureListener() {
            override fun onDoubleTap(e: MotionEvent): Boolean { ayarla(0); ayarKaydet(); return true }
        })
        init { contentDescription = "Ton" }
        override fun onDraw(c: android.graphics.Canvas) {
            val w = width.toFloat(); val h = height.toFloat(); val r = dp(12f).toFloat(); val cy = h / 2
            boya.style = android.graphics.Paint.Style.FILL
            boya.shader = android.graphics.LinearGradient(r, 0f, w - r, 0f, intArrayOf(yesil, Color.argb(90, 255, 255, 255), macenta), null, android.graphics.Shader.TileMode.CLAMP)
            val k = dp(2.5f).toFloat(); c.drawRoundRect(RectF(r, cy - k, w - r, cy + k), k, k, boya); boya.shader = null
            boya.color = Color.argb(204, 255, 255, 255); c.drawRect(w / 2 - 1.5f, cy - dp(6f), w / 2 + 1.5f, cy + dp(6f), boya)
            val v = ayar.ton; val x = r + (v + 50) / 100f * (w - 2 * r)
            boya.setShadowLayer(dp(3f).toFloat(), 0f, dp(1f).toFloat(), Color.argb(90, 0, 0, 0)); boya.color = Color.WHITE; c.drawCircle(x, cy, r, boya); boya.clearShadowLayer()
            if (v != 0) { boya.color = (if (v < 0) yesil else macenta).let { Color.argb(((abs(v) / 60f).coerceAtMost(1f) * 255).toInt(), Color.red(it), Color.green(it), Color.blue(it)) }; c.drawCircle(x, cy, r - dp(7f), boya) }
        }
        @android.annotation.SuppressLint("ClickableViewAccessibility")
        override fun onTouchEvent(e: MotionEvent): Boolean {
            if (algila.onTouchEvent(e)) return true
            parent?.requestDisallowInterceptTouchEvent(true)
            val r = dp(12f).toFloat(); val t = ((e.x - r) / (width - 2 * r)).coerceIn(0f, 1f) * 100 - 50
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE -> ayarla(if (abs(t) < 3) 0 else (Math.round(t / 2) * 2))
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> ayarKaydet()
            }
            return true
        }
    }

    private fun cetvelAc(c: Cetvel) {
        if (grupIci == null) aktifGrup?.let { return grupAc(it) }
        if (mod == KMod.PRO) return proOzellestir() // PRO MODLAR'da pozlama, beyaz denge ve odak modun ayarlarında
        val k = kaynak ?: return tost("Kamera hazır değil.")
        val y = k.yetenek
        val p = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; background = pano(dp(22f).toFloat()); setPadding(dp(16f), dp(12f), dp(16f), dp(12f)); isClickable = true }
        val bas = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        val baslik = TextView(this).apply { textSize = 15f; typeface = kosul; setTextColor(Color.WHITE) }
        val deger = TextView(this).apply { textSize = 15f; typeface = mono; setTextColor(VURGU); setPadding(dp(10f), 0, 0, 0) }
        bas.addView(baslik); bas.addView(deger); bas.addView(View(this), LinearLayout.LayoutParams(0, 1, 1f))
        val oto = etiket("OTO", 13f, Color.BLACK).apply { setPadding(dp(14f), 0, dp(14f), 0) }
        bas.addView(oto, LinearLayout.LayoutParams(-2, dp(30f)))
        p.addView(bas)
        fun otoCiz(acik: Boolean) { oto.background = Tema.kapsul(if (acik) VURGU else Color.argb(36, 255, 255, 255)); oto.setTextColor(if (acik) Color.BLACK else Color.WHITE) }
        fun cubuk(en: Int, simdi: Int, degisti: (Int) -> Unit) = p.addView(android.widget.SeekBar(this).apply {
            max = en; progress = simdi
            progressTintList = android.content.res.ColorStateList.valueOf(VURGU); thumbTintList = android.content.res.ColorStateList.valueOf(Color.WHITE)
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
                if (mod == KMod.FOTO && y.elleKontrol) uzunSatirlari(p, y)
                if (mod == KMod.VIDEO && y.elleKontrol) videoEnstSatiri(p)
            }
            Cetvel.BD -> {
                Tema.simge(baslik, R.drawable.ic_beyaz, Color.WHITE); baslik.text = "Beyaz denge"
                fun bdYaz() { deger.text = ayar.kelvin?.let { "${it}K" + if (ayar.ton != 0) " · ${tonYazi(ayar.ton)}" else "" } ?: BD_ADLARI[ayar.awb] ?: "Oto"
                    otoCiz(ayar.kelvin == null && ayar.awb == CameraMetadata.CONTROL_AWB_MODE_AUTO) }
                bdYaz()
                oto.setOnClickListener { ayar.kelvin = null; ayar.ton = 0; ayar.awb = CameraMetadata.CONTROL_AWB_MODE_AUTO; k.ayarDegisti(); ayarKaydet(); cetvelAc(c) }
                val satir = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
                BD_ADLARI.keys.filter { it in y.awbModlari && it != CameraMetadata.CONTROL_AWB_MODE_AUTO }.forEach { m ->
                    val sec = ayar.awb == m && ayar.kelvin == null
                    satir.addView(LinearLayout(this).apply {
                        orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; setPadding(dp(12f), dp(6f), dp(12f), dp(6f))
                        background = Tema.kapsul(if (sec) VURGU else Color.argb(30, 255, 255, 255), dp(12f).toFloat())
                        addView(etiket(BD_ADLARI[m]!!, 13f, if (sec) Color.BLACK else Color.WHITE))
                        BD_ACIKLAMA[m]?.let { addView(etiket(it, 10f, if (sec) Color.DKGRAY else GRI)) }
                        setOnClickListener { ayar.awb = m; ayar.kelvin = null; ayar.ton = 0; k.ayarDegisti(); ayarKaydet(); cetvelAc(c) }
                    }, LinearLayout.LayoutParams(-2, dp(48f)).apply { marginEnd = dp(6f) })
                }
                p.addView(HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false; addView(satir) }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10f) })
                if (k.elleBdVar) {
                    // Kelvin (2500–10000, 100K adım) ve ton (yeşil − / macenta +); otomatikteyken oynatılırsa o anki Kelvin'de kilitlenir
                    not("Sıcaklık (Kelvin)")
                    cubuk((BeyazDenge.EN_COK - BeyazDenge.EN_AZ) / BeyazDenge.ADIM, ((ayar.kelvin ?: k.mevcutKelvin()) - BeyazDenge.EN_AZ) / BeyazDenge.ADIM) { v ->
                        ayar.kelvin = BeyazDenge.EN_AZ + v * BeyazDenge.ADIM; k.ayarDegisti(); bdYaz() }
                    p.addView(tonSatiri { v -> if (ayar.kelvin == null) ayar.kelvin = k.mevcutKelvin(); ayar.ton = v; k.ayarDegisti(); bdYaz() },
                        LinearLayout.LayoutParams(-1, dp(44f)).apply { topMargin = dp(8f) })
                    not("Ton: sola yeşil, sağa macenta (floresan ve LED'deki yeşili giderir). Ortaya çift dokun: sıfır.")
                }
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
        acilirAc(p, ustTan = false, baslik = when (c) { Cetvel.POZ -> "POZLAMA"; Cetvel.BD -> "BEYAZ DENGE"; Cetvel.ODAK -> "ODAK" }); altGizle(true)
        aracCiz(c)
    }

    private fun tonYazi(t: Int) = if (t < 0) "Y${-t}" else "M$t"

    /** VİDEO enstantanesi süre ya da açı olarak (Genel Ayarlar → Pozlama) */
    private fun enstGoster(ns: Long): String {
        if (mod != KMod.VIDEO || !enstAci) return ProMod.enstYazi(ns)
        val a = 360.0 * (ayar.fps?.upper ?: 30) * ns / SN_
        return (if (abs(a - Math.round(a)) < 0.05) "${Math.round(a)}" else "%.1f".format(a).replace('.', ',')) + "°"
    }

    /** VİDEO'da enstantane: süre (1/2000 – 1/24) ya da açı (45° – 360°); kare süresinden uzun olamaz. ISO o anki ışığa göre ayarlanır. */
    private fun videoEnstSatiri(p: LinearLayout) {
        val k = kaynak ?: return
        val fps = ayar.fps?.upper ?: 30; val kare = SN_ / fps
        val degerler: List<Long?> = listOf<Long?>(null) + if (enstAci) listOf(45.0, 90.0, 144.0, 172.8, 180.0, 270.0, 360.0).map { (it / 360 * kare).toLong() }
            else listOf(2000, 1000, 500, 250, 125, 120, 100, 60, 50, 48, 30, 25, 24).map { SN_ / it }.filter { it <= kare + 1000 }
        p.addView(TextView(this).apply { text = if (enstAci) "ENSTANTANE AÇISI" else "ENSTANTANE"; textSize = 12f; typeface = kosulKalin; setTextColor(GRI); setPadding(0, dp(12f), 0, dp(6f)) })
        val s = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        degerler.forEach { e ->
            val secili = if (e == null) ayar.pozlamaNs == null else ayar.pozlamaNs?.let { abs(it - e) < 2000 } == true
            s.addView(etiket(e?.let { enstGoster(it) } ?: "AUTO", 13f, if (secili) Color.BLACK else Color.WHITE).apply {
                setPadding(dp(12f), 0, dp(12f), 0); minWidth = dp(48f); background = Tema.kapsul(if (secili) VURGU else Color.argb(30, 255, 255, 255), dp(12f).toFloat())
                setOnClickListener { ayar.pozlamaNs = e; ayar.uzunOnizleme = if (e == null) 0 else 2; k.ayarDegisti(); ayarKaydet(); cetvelAc(Cetvel.POZ) }
            }, LinearLayout.LayoutParams(-2, dp(38f)).apply { marginEnd = dp(6f) })
        }
        p.addView(HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false; addView(s) })
        p.addView(TextView(this).apply { textSize = 12f; setTextColor(GRI); setPadding(0, dp(6f), 0, 0)
            text = "Sinemada kural: 180° (kare hızının iki katı, $fps fps'te 1/${fps * 2}) doğal hareket bulanıklığı verir. ISO seçtiğin anki ışığa göre ayarlanır. Süre ↔ açı: Ayarlar → Pozlama." })
    }

    /** FOTO'da elle enstantane (1/1000 – 30 sn ve BULB): telefonun tek karede veremediği süre önizleme karelerinin birleştirilmesiyle çekilir */
    private fun uzunSatirlari(p: LinearLayout, y: KameraYetenek) {
        val k = kaynak ?: return
        val enUzun = y.pozlamaAralik?.upper ?: SN_
        fun baslikYaz(t: String) = p.addView(TextView(this).apply { text = t; textSize = 12f; typeface = kosulKalin; setTextColor(GRI); setPadding(0, dp(12f), 0, dp(6f)) })
        fun sira(ogeler: List<Triple<String, String?, Boolean>>, sec: (Int) -> Unit) {
            val s = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            ogeler.forEachIndexed { i, (yazi, alt, secili) ->
                s.addView(LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; setPadding(dp(12f), dp(4f), dp(12f), dp(4f)); minimumWidth = dp(48f)
                    background = Tema.kapsul(if (secili) VURGU else Color.argb(30, 255, 255, 255), dp(12f).toFloat())
                    addView(etiket(yazi, 13f, if (secili) Color.BLACK else Color.WHITE))
                    alt?.let { addView(etiket(it, 10f, if (secili) Color.DKGRAY else GRI)) }
                    setOnClickListener { sec(i) }
                }, LinearLayout.LayoutParams(-2, dp(46f)).apply { marginEnd = dp(6f) })
            }
            p.addView(HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false; addView(s) })
        }
        val enstler: List<Long?> = listOf(null, SN_ / 1000, SN_ / 250, SN_ / 60, SN_ / 15, SN_ / 4, SN_ / 2, SN_, 2 * SN_, 4 * SN_, 8 * SN_, 15 * SN_, 30 * SN_, -1L)
        fun secili(e: Long?) = if (e == -1L) bulb else !bulb && ayar.pozlamaNs == e
        fun uygula() { ayar.uzunOnizleme = if (ayar.pozlamaNs == null && !bulb) 0 else if (uzunYol == "ort" && !bulb) 1 else 2; k.ayarDegisti(); ayarKaydet(); cetvelAc(Cetvel.POZ) }
        baslikYaz("ENSTANTANE")
        sira(enstler.map { e -> Triple(when (e) { null -> "AUTO"; -1L -> "BULB"; else -> ProMod.enstYazi(e) }, if (e != null && (e == -1L || e > enUzun)) "birleşik" else null, secili(e)) }) { i ->
            val e = enstler[i]
            bulb = e == -1L; ayar.pozlamaNs = if (bulb) ONIZLEME_KARE else e; uygula()
        }
        val uzun = bulb || (ayar.pozlamaNs ?: 0L) > enUzun
        if (uzun) {
            baslikYaz("BİRLEŞTİRME")
            val yollar = listOf(Triple("ort", "İpeksi", "su, bulut akar"), Triple("top", "Aydınlat", "karanlık sahne"), Triple("max", "Işık izi", "far, yıldız"))
            sira(yollar.map { Triple(it.second, it.third, uzunYol == it.first) }) { i -> uzunYol = yollar[i].first; tercih.edit().putString("uzunYol", uzunYol).apply(); uygula() }
            p.addView(TextView(this).apply { textSize = 12f; setTextColor(GRI); setPadding(0, dp(6f), 0, 0)
                text = "Telefon tek kareyi en fazla ${ProMod.enstYazi(enUzun)} açabiliyor. Seçtiğin süre boyunca kareler alınıp tek fotoğrafta birleşir; BULB'da deklanşöre yeniden basınca biter. Telefonu sabitle (tripod)." })
        }
    }

    /** Araç şeridinin yazıları ve renkleri: ayar değişmişse değeri turuncu yazar */
    private fun aracCiz(acik: Cetvel? = null) {
        val k = kaynak; val evAdim = k?.yetenek?.evAdim?.takeIf { it > 0 } ?: 1f
        for (i in 0 until aracSerit.childCount) {
            val v = aracSerit.getChildAt(i) as LinearLayout
            val ikon = v.getChildAt(0) as ImageView; val yazi = v.getChildAt(1) as TextView
            val (metin, etkin) = when (v.tag) {
                "poz" -> (when { bulb -> "BULB"; ayar.pozlamaNs != null -> ProMod.enstYazi(ayar.pozlamaNs); ayar.ev == 0 -> "Pozlama"; else -> evYazi(ayar.ev, evAdim) }) to
                    (ayar.ev != 0 || ayar.pozlamaNs != null || acik == Cetvel.POZ)
                "bd" -> (if (ayar.awb == CameraMetadata.CONTROL_AWB_MODE_AUTO) "Beyaz" else BD_ADLARI[ayar.awb] ?: "Beyaz") to (ayar.awb != CameraMetadata.CONTROL_AWB_MODE_AUTO || acik == Cetvel.BD)
                "odak" -> (if (ayar.odakMesafe == null) "Odak" else "MF") to (ayar.odakMesafe != null || acik == Cetvel.ODAK)
                "kilavuz" -> (if (kompTur == KompTur.KAPALI) "Kılavuz" else kompTur.ad) to (kompTur != KompTur.KAPALI)
                "yardimci" -> "AI Kadraj" to asistanAcik
                "terazi" -> "Terazi" to teraziAcik
                else -> "" to false
            }
            yazi.text = metin; val renk = if (etkin) VURGU else Color.WHITE
            yazi.setTextColor(renk); ikon.setColorFilter(renk)
        }
        kontrolCiz(); bilgiCiz()
    }

    /* ================= ayarlar ================= */
    /* ================= Genel Ayarlar (iPhone'daki KameraAyarlar ile aynı yapı) ================= */
    private var ayarEkrani: AyarEkrani? = null
    /** VİDEO'da enstantane açı olarak (180°) mı gösterilsin */
    private var enstAci = false
    /** Göstergeler: köşe histogramı ve LUT (yalnız ekranda; kayıt temiz). LUT kitaplığı Monitör ile ortak. */
    private var histoAcik = false
    private lateinit var kose: OlcumGorunum
    private val lutKlasoru by lazy { java.io.File(filesDir, "lut").also { it.mkdirs() } }
    private fun lutUygula(ad: String?) {
        val f = ad?.let { java.io.File(lutKlasoru, it) }?.takeIf { it.exists() }
        if (f == null) { kullaniciLut = null; kullaniciLutAdi = null; tercih.edit().remove("g_lut").apply(); renkGuncelle(); return }
        runCatching { f.inputStream().use { Lut.oku(f.name, it) } }.onSuccess { kullaniciLut = it; kullaniciLutAdi = f.name; tercih.edit().putString("g_lut", f.name).apply(); renkGuncelle() }
            .onFailure { tost("LUT okunamadı: ${it.message}") }
    }

    private fun oturumuYenile() { kaynak?.oturumYenile { w, h -> monitor.tampon(w, h); runOnUiThread { bilgiCiz() } } }
    private fun cozAdi(h: Int) = when { h >= 2160 -> "4K"; h >= 1080 -> "1080p"; else -> "${h}p" }

    private fun ayarlarAc() {
        if (tlKaydedici != null) return tost("Timelapse sürerken ayarlar değişmez.")
        if (kayitSuruyor()) return tost("Kayıt sürerken ayarlar değişmez.")
        acilirKapat()
        val e = ayarEkrani ?: AyarEkrani(this, kok, ustBosluk, altBosluk) { ayarEkrani = null; bilgiCiz(); aracCiz() }.also { ayarEkrani = it }
        e.ac("Ayarlar") { anaSayfa(e) }
    }

    private fun AyarEkrani.Sayfa.anaSayfa(e: AyarEkrani) {
        val k = kaynak
        if (k != null) {
            val vb = listOf(Size(3840, 2160), Size(1920, 1080), Size(1280, 720)).filter { it in k.yetenek.boyutlar }
            val sb = k.secilenBoyut(); val fps = ayar.fps?.upper ?: 30
            val fs = k.secilenFotoBoyut()
            grup("Çözünürlük", "Video ${cozAdi(sb.height)} · $fps fps · ${if (ayar.hevc || ayar.renk == 1) "HEVC" else "H.264"} · ${if (ayar.renk == 1 && k.hdrVar) "HDR" else "SDR"}" +
                (fs?.let { " — Fotoğraf %.0f MP".format(it.width * it.height / 1e6) } ?: "")) {
                git(R.drawable.ic_film, Color.rgb(255, 69, 58), "Video", cozAdi(sb.height)) { e.git("Video") {
                    grup("Video çözünürlüğü") { vb.forEach { b -> secenek(cozAdi(b.height) + if (b.height >= 2160) " (Ultra HD)" else if (b.height >= 1080) " (Full HD)" else "", b == sb) {
                        ayar.boyut = b; ayarKaydet(); if (!mod.foto) oturumuYenile() } } }
                } }
                git(R.drawable.ic_hiz, Color.rgb(255, 159, 10), "Kare hızı", "$fps fps") { e.git("Kare hızı") {
                    grup("Kare hızı", "24 fps sinema, 25 fps Avrupa yayını (PAL), 30 fps internet, 60 fps akıcı hareket ve yavaşlatma. Telefonun vermediği soluk görünür.") {
                        listOf(24, 25, 30, 60).forEach { f -> val r = Range(f, f); val var_ = r in k.yetenek.fpsler
                            secenek("$f fps", fps == f, if (var_) null else "Bu kamerada yok", var_) { ayar.fps = r; ayarKaydet(); if (!mod.foto) oturumuYenile() } }
                    }
                } }
                git(R.drawable.ic_foto, Color.rgb(10, 132, 255), "Fotoğraf", fs?.let { "%.0f MP".format(it.width * it.height / 1e6) } ?: "") { e.git("Fotoğraf çözünürlüğü") {
                    val fb = (k.fotoBoyutlari.distinctBy { it.width * 10 / it.height }.take(2) + k.fotoBoyutlari.take(4)).distinct().sortedByDescending { it.width * it.height }.take(6)
                    grup("Fotoğraf çözünürlüğü") { fb.forEach { b -> secenek("%.0f MP".format(b.width * b.height / 1e6), b == fs, "${b.width} × ${b.height} · ${oran(b)}") {
                        ayar.fotoBoyut = b; ayarKaydet(); if (mod.foto) oturumuYenile() } } }
                } }
            }
            grup {
                git(R.drawable.ic_kayit_daire, Color.rgb(255, 149, 0), "Kayıt", "${if (ayar.hevc || ayar.renk == 1) "HEVC" else "H.264"} · ${if (ayar.renk == 1 && k.hdrVar) "HDR" else "SDR"}") { e.git("Kayıt") { kayitSayfasi(k) } }
                git(R.drawable.ic_artieksi, Color.rgb(255, 204, 0), "Pozlama", if (enstAci) "Açı" else "Süre") { e.git("Pozlama") { pozlamaSayfasi(k) } }
                git(R.drawable.ic_pozlama, Color.rgb(255, 55, 95), "Renk ve beyaz denge", ayar.kelvin?.let { "${it}K" } ?: BD_ADLARI[ayar.awb] ?: "Oto") { e.git("Renk") { renkSayfasi(k) } }
                git(R.drawable.ic_dalga, Color.rgb(255, 59, 48), "Ses", sesGirisleri(this@KameraActivity).firstOrNull { it.first == ayar.sesGirdi }?.second ?: "Otomatik") { e.git("Ses") { sesSayfasi() } }
                git(R.drawable.ic_enst, Color.rgb(0, 122, 255), "Fotoğraf", if (ayar.raw && k.rawVar) "RAW + JPEG" else "JPEG") { e.git("Fotoğraf") { fotografSayfasi(k) } }
                git(R.drawable.ic_olcum, Color.rgb(52, 199, 89), "Göstergeler", if (kompTur == KompTur.KAPALI) "" else kompTur.ad) { e.git("Göstergeler") { gostergeSayfasi() } }
                git(R.drawable.ic_timelapse, Color.rgb(175, 82, 222), "Timelapse", Timelapse.aralikYazi(tlAralik)) { e.git("Timelapse") { timelapseSayfasi() } }
                git(R.drawable.ic_raptiye, Color.rgb(255, 159, 10), "Sabitlenenler", "${favoriler.size}") { e.git("Sabitlenenler") { sabitlenenSayfasi(e) } }
            }
        } else grup(not = "Kamera açılınca çözünürlük, kayıt, pozlama ve renk ayarları burada görünür.") { deger("Kamera hazır değil", renk = AyarEkrani.IKINCIL) }
        grup {
            git(R.drawable.ic_bolum4, Color.rgb(48, 176, 199), "Multi Cam (çok kamera)", if (wifiKamera) "Açık" else "") { e.git("Multi Cam") { masaSayfasi() } }
            git(R.drawable.ic_bilgi, Color.rgb(142, 142, 147), "Uygulama", packageManager.getPackageInfo(packageName, 0).versionName ?: "") { e.git("Uygulama") { uygulamaSayfasi() } }
        }
    }

    private fun AyarEkrani.Sayfa.kayitSayfasi(k: KameraKaynak) {
        val hevcVar = android.media.MediaCodecList(android.media.MediaCodecList.REGULAR_CODECS).codecInfos.any { it.isEncoder && it.supportedTypes.any { t -> t.equals("video/hevc", true) } }
        grup("Kodek", "Android'de ProRes yok. Kurgu için en geniş aralığı HDR (HEVC 10 bit) verir; HDR seçiliyken kodek kendiliğinden HEVC olur.") {
            secenek("HEVC (H.265)", ayar.hevc || ayar.renk == 1, if (hevcVar) "Küçük dosya, yüksek kalite (MP4)" else "Bu telefonda yok", hevcVar) { ayar.hevc = true; ayarKaydet() }
            secenek("H.264", !ayar.hevc && ayar.renk != 1, "En geniş uyumluluk (MP4)", ayar.renk != 1) { ayar.hevc = false; ayarKaydet() }
            secenek("ProRes 422 HQ · 422 · LT · Proxy", false, "Android telefonlarda yok (yalnız iPhone Pro)", false) {}
        }
        grup("Renk", "HDR parlak ışıkları ve derin gölgeleri korur; HDR ekranda en iyi görünür. Log Android'de uygulamalara açık değil; en yakın seçenek HDR.") {
            secenek("SDR", ayar.renk != 1, "Her ekranda aynı görünür, renk düzeltmesi gerekmez") { ayar.renk = 0; ayarKaydet(); if (!mod.foto) oturumuYenile() }
            secenek("HDR (HLG, 10 bit)", ayar.renk == 1 && k.hdrVar, if (k.hdrVar) "Parlak ışıklar ve derin gölgeler" else "Bu telefon 10 bit HDR vermiyor", k.hdrVar) { ayar.renk = 1; ayarKaydet(); if (!mod.foto) oturumuYenile() }
            secenek("Log", false, "Bu telefon uygulamalara Log vermiyor", false) {}
        }
        grup("Sabitleme", "Tripod ve gimbalde kapat; görüntü kırpılmaz.") {
            listOf(Triple(0, "Kapalı", "Görüntü kırpılmaz; tripod ve gimbal için"), Triple(1, "Standart", "Hafif sabitleme, az kırpma"), Triple(2, "Sinematik", "Yürürken yumuşak görüntü, daha çok kırpma")).forEach { (i, ad, alt) ->
                val var_ = i in k.sabitlemeler
                secenek(ad, ayar.sabit == i, if (var_) alt else "Bu kamerada yok", var_) { ayar.sabit = i; ayarKaydet(); k.ayarDegisti() }
            }
        }
    }

    private fun AyarEkrani.Sayfa.pozlamaSayfasi(k: KameraKaynak) {
        val fps = ayar.fps?.upper ?: 30
        grup("Video enstantanesi", "Sinema kameralarındaki gibi açı: 180° kare hızının iki katı süre demek ($fps fps'te 1/${fps * 2}). Değer kamera ekranında Pozlama'dan seçilir.") {
            bolumlu(listOf("Süre (1/50)", "Açı (180°)"), if (enstAci) 1 else 0) { enstAci = it == 1; tercih.edit().putBoolean("enstAci", enstAci).apply() }
        }
        if (k.diyaframlar.size > 1) grup("Diyafram", "Bu telefonun değişken diyaframı var. Küçük sayı (f/1.4) daha çok ışık ve bulanık arka plan; büyük sayı (f/4) her şey net.") {
            k.diyaframlar.sorted().forEach { f -> secenek("f/${"%.1f".format(f).replace('.', ',')}", (ayar.diyafram ?: k.diyaframlar.first()) == f) { ayar.diyafram = f; ayarKaydet(); k.ayarDegisti() } }
        }
        else grup("Diyafram", "Telefon değişken diyafram verirse burada seçilir.") { deger("Sabit", k.diyaframlar.firstOrNull()?.let { "f/${"%.1f".format(it).replace('.', ',')}" } ?: "—") }
    }

    private fun AyarEkrani.Sayfa.renkSayfasi(k: KameraKaynak) {
        if (!k.elleBdVar) {
            grup("Beyaz denge", "Bu telefon elle Kelvin vermiyor; hazır modlar (Ampul, Gün ışığı, Bulutlu…) kamera ekranındaki Beyaz denge'de.") {
                BD_ADLARI.keys.filter { it in k.yetenek.awbModlari }.forEach { m -> secenek(BD_ADLARI[m]!!, ayar.awb == m, BD_ACIKLAMA[m]) { ayar.awb = m; ayarKaydet(); k.ayarDegisti() } }
            }
            return
        }
        grup("Beyaz denge", "Kelvin: düşük sayı (2500K) ampul ışığını, yüksek sayı (10000K) gölgeyi düzeltir. Ton: yeşil (−) ↔ macenta (+); floresan ve LED ışığın yeşilini alır. Otomatikteyken tonu oynatırsan beyaz denge o anki Kelvin'de kilitlenir.") {
            anahtar("Otomatik", ayar.kelvin == null && ayar.awb == CameraMetadata.CONTROL_AWB_MODE_AUTO) { oto ->
                if (oto) { ayar.kelvin = null; ayar.ton = 0; ayar.awb = CameraMetadata.CONTROL_AWB_MODE_AUTO } else ayar.kelvin = k.mevcutKelvin()
                ayarKaydet(); k.ayarDegisti() }
            val kel = ayar.kelvin ?: k.mevcutKelvin()
            kaydirici("Sıcaklık", (BeyazDenge.EN_COK - BeyazDenge.EN_AZ) / BeyazDenge.ADIM, (kel - BeyazDenge.EN_AZ) / BeyazDenge.ADIM, { "${BeyazDenge.EN_AZ + it * BeyazDenge.ADIM}K" },
                { ayar.kelvin = BeyazDenge.EN_AZ + it * BeyazDenge.ADIM; k.ayarDegisti() }, { ayarKaydet(); ayarEkrani?.yenile() })
            kaydirici("Ton", 100, ayar.ton + 50, { v -> (v - 50).let { if (it == 0) "0" else if (it < 0) "Y $it" else "M +$it" } },
                { if (ayar.kelvin == null) ayar.kelvin = k.mevcutKelvin(); ayar.ton = it - 50; k.ayarDegisti() }, { ayarKaydet(); ayarEkrani?.yenile() })
        }
        grup("Hazır", "Dokununca Kelvin o değere gelir.") {
            listOf(3200 to "Ampul", 4000 to "Floresan", 5600 to "Gün ışığı", 6500 to "Bulutlu", 7500 to "Gölge").forEach { (kv, ad) ->
                secenek("${kv}K", ayar.kelvin == kv, ad) { ayar.kelvin = kv; ayarKaydet(); k.ayarDegisti() } }
        }
    }

    private fun AyarEkrani.Sayfa.sesSayfasi() {
        val girisler = sesGirisleri(this@KameraActivity)
        val simdi = sesGirisi(this@KameraActivity, ayar.sesGirdi)?.let { d -> girisler.firstOrNull { it.first == d.id }?.second } ?: "Telefon mikrofonu"
        grup("Giriş", "Şu an kaydeden: $simdi. Harici mikrofon takınca Otomatik'te kendiliğinden o seçilir.") {
            secenek("Otomatik", ayar.sesGirdi == null, "Takılı harici mikrofon varsa o, yoksa telefonun mikrofonu") { ayar.sesGirdi = null; ayarKaydet() }
            girisler.forEach { (id, ad, harici) -> secenek(ad, ayar.sesGirdi == id, if (harici) "Harici" else null) { ayar.sesGirdi = id; ayarKaydet() } }
        }
        grup("Biçim", "Android'in video kaydedicisi MP4'e sesi yalnız AAC olarak yazar; 24 bit PCM için ayrı ses kaydı gerekir (sonraki sürüm).") {
            secenek("AAC · 48 kHz · 256 kbps", true, "Sıkıştırılmış, küçük dosya") {}
            secenek("24 bit PCM", false, "Android video kaydında yok", false) {}
            secenek("16 bit PCM", false, "Android video kaydında yok", false) {}
        }
    }

    private fun AyarEkrani.Sayfa.fotografSayfasi(k: KameraKaynak) {
        grup(not = if (k.rawVar) "RAW (DNG) ham sensör verisi: kurguda en geniş düzeltme payı; dosya büyük." else null) {
            if (k.rawVar) anahtar("RAW (DNG) da kaydet", ayar.raw) { ayar.raw = it; ayarKaydet(); if (mod.foto) oturumuYenile() }
            else deger("RAW", "Bu telefonda yok")
            anahtar("Deklanşör sesi", deklansorSesi) { deklansorSesi = it; tercih.edit().putBoolean("deklansor", it).apply() }
        }
        grup("Zamanlayıcı") { listOf(0 to "Kapalı", 3 to "3 sn", 10 to "10 sn").forEach { (z, ad) -> secenek(ad, zamanlayici == z) { zamanlayici = z; tercih.edit().putInt("zamanlayici", z).apply() } } }
    }

    private fun AyarEkrani.Sayfa.gostergeSayfasi() {
        val m = monitor.ayarlar
        fun kaydet() { tercih.edit().putBoolean("g_peak", m.peaking).putBoolean("g_zebra", m.zebra).putFloat("g_zebraEsik", m.zebraEsik).putBoolean("g_fc", m.falseColor)
            .putBoolean("g_mono", m.monokrom).putBoolean("g_histo", histoAcik).apply(); monitor.requestRender(); kompUygula() }
        grup("Görüntü araçları", "Araçlar yalnız ekranda görünür; kayıt temiz kalır. False color parlaklığı renklere çevirir: mor/mavi karanlık, yeşil orta gri, pembe ten, sarı/kırmızı patlama.") {
            anahtar("False color", m.falseColor) { m.falseColor = it; kaydet() }
            anahtar("Zebra", m.zebra) { m.zebra = it; kaydet() }
            if (m.zebra) bolumlu(listOf("%95 patlama", "%70 ten"), if (m.zebraEsik < 0.8f) 1 else 0) { m.zebraEsik = if (it == 1) 0.70f else 0.95f; kaydet() }
            anahtar("Odak vurgusu (peaking)", m.peaking) { m.peaking = it; kaydet() }
            anahtar("Histogram", histoAcik, "Sol üstte küçük") { histoAcik = it; kaydet() }
            anahtar("Siyah-beyaz", m.monokrom) { m.monokrom = it; kaydet() }
        }
        val lutlar = lutKlasoru.listFiles { f -> f.name.endsWith(".cube", true) }?.sortedBy { it.name.lowercase() }.orEmpty()
        grup("LUT", "LUT fotoğrafa ve videoya da işlenir (HDR video hariç). 3D .cube dosyası ekle; kitaplık Monitör ile ortak. Android'de Log yok; HDR ile çekip kurguda renklendir.") {
            secenek("Kapalı", kullaniciLut == null) { lutUygula(null) }
            lutlar.forEach { f -> secenek(f.name.removeSuffix(".cube"), kullaniciLutAdi == f.name) { lutUygula(f.name) } }
            deger("+ Ekle (.cube)", renk = AyarEkrani.MAVI) { startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply { addCategory(Intent.CATEGORY_OPENABLE); type = "*/*" }, 7) }
        }
        grup("Kompozisyon kılavuzu") {
            KompTur.values().forEach { t -> secenek(t.ad, kompTur == t) { kompTur = t; if (t != KompTur.KAPALI) sonKomp = t; kompUygula() } }
            anahtar("Terazi", teraziAcik) { teraziAcik = it; kompUygula() }
        }
        grup("AI Kadraj", "Konuyu bulur, yön tarif eder; sahneyi birkaç saniye inceleyip tek öneri getirir, dokununca uygulanır. Kadraj iyiyse çizgiler yeşil olur. Kapalıyken ekranda hiçbiri görünmez.") {
            anahtar("AI Kadraj", asistanAcik) { asistanAcik = it; kompUygula(); gostergeSayfasi() }
            if (asistanAcik) anahtar("Sahne önerileri (gece, portre…)", sahneOto) { sahneOto = it; kompUygula() }
        }
    }

    private fun AyarEkrani.Sayfa.timelapseSayfasi() {
        grup("Kare aralığı") { Timelapse.ARALIKLAR.forEach { a -> secenek(Timelapse.aralikYazi(a), tlAralik == a) { tlAralik = a; tercih.edit().putLong("tlAralik", a).apply(); if (mod == KMod.TIMELAPSE) sureCiz() } } }
        grup("Çekim süresi") { Timelapse.SURELER.forEach { s -> secenek(Timelapse.sureYazi(s), tlSure == s) { tlSure = s; tercih.edit().putInt("tlSure", s).apply() } } }
        grup(not = "Açıkken parlaklık kareden kareye oynamaz (titreme olmaz). Gün batımı gibi ışığın değiştiği çekimlerde kapat. Tripod kullan; ekran açık kalır.") {
            anahtar("Pozlamayı başta sabitle", tlPozSabit) { tlPozSabit = it; tercih.edit().putBoolean("tlPozSabit", it).apply() }
        }
    }

    private fun AyarEkrani.Sayfa.masaSayfasi() {
        grup(not = "Açıkken bu telefonun görüntüsü aynı Wi-Fi'daki Multi Cam ekranına gider; Multi Cam kendiliğinden bulur. Bulunmazsa adres: ${ipAdresi() ?: "Wi-Fi'a bağlı değil"}") {
            anahtar("Wi-Fi kamera ol", wifiKamera) { wifiKamera = it; tercih.edit().putBoolean("wifiKamera", it).apply(); yayinAyarla() }
        }
        grup(not = "Kameranın kendi uygulamasındaki görüntüyü (ör. USB'den webcam vermeyen Insta360) Multi Cam'e kaynak olarak gönderir: aç, kameranın uygulamasına geç, telefonu yan tut. " +
            "Multi Cam'de \"Ekran · ${android.os.Build.MODEL}\" adıyla görünür. Durdurmak için buraya ya da bildirimdeki Durdur'a dokun." + (EkranYayini.durum.takeIf { it.isNotEmpty() }?.let { "\nDurum: $it" } ?: "")) {
            anahtar("Ekranı Multi Cam'e gönder", EkranYayini.calisiyor) { ac ->
                if (ac) {
                    if (android.os.Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
                        requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 9)
                    @Suppress("DEPRECATION") startActivityForResult((getSystemService(MEDIA_PROJECTION_SERVICE) as android.media.projection.MediaProjectionManager).createScreenCaptureIntent(), 8)
                } else EkranYayini.durdur(this@KameraActivity)
            }
        }
        grup(not = "Multi Cam ekranı (çok kamera, geçiş, kayıt) ve Monitör artık UpCam Studio uygulamasında.") {}
    }

    private fun AyarEkrani.Sayfa.uygulamaSayfasi() {
        grup(not = "UPDATED Kamera ${packageManager.getPackageInfo(packageName, 0).versionName} · çökme ve donmalar kendiliğinden bildirilir (yalnız hata ayrıntısı ve cihaz modeli).") {
            deger("Güncellemeleri denetle", renk = AyarEkrani.MAVI) { Guncelleme.denetle(this@KameraActivity, sessiz = false) }
        }
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
        k.fotoModu = mod.foto; k.sahne = mod.sahne; k.sdrZorla = wifiKamera; k.pro = proIstek(); k.ekranYonu = (360 - fizikselYon) % 360
        @Suppress("DEPRECATION") monitor.otoDondur = windowManager.defaultDisplay.rotation * 90
        kaynak = k; if (vlogAcik) k.boyutSiniri = 1080
        k.baslat(y, { w, h -> monitor.tampon(w, h); runOnUiThread { bilgiCiz(); zoomCiz(); flasCiz(); aracCiz() } }, { hata -> runOnUiThread { if (hata == "POLITIKA") engelli() else tost(hata) } })
        vlogGuncelle()
    }

    /** Arka kamerayla aynı anda açılabilen ön kamera (Android 11+, CameraManager.concurrentCameraIds); yoksa null */
    private fun vlogOnId(): String? {
        if (android.os.Build.VERSION.SDK_INT < 30) return null
        val arka = kamListe.getOrNull(kamIndex)?.first ?: return null
        val cm = getSystemService(android.hardware.camera2.CameraManager::class.java)
        return runCatching {
            cm.concurrentCameraIds.filter { arka in it }.flatten().firstOrNull { it != arka &&
                cm.getCameraCharacteristics(it).get(android.hardware.camera2.CameraCharacteristics.LENS_FACING) == android.hardware.camera2.CameraCharacteristics.LENS_FACING_FRONT }
        }.getOrNull()
    }

    private fun vlogSec(v: Boolean) {
        vlog = v; tercih.edit().putBoolean("vlog", v).apply()
        if (v && (ayar.boyut?.height ?: 0) > 1080) tost("Vlog'da ana kamera 1080p çeker.")
        vlogGuncelle()
    }

    /** Vlog açıkken ön kamerayı sağ altta küçük pencerede açar, kapalıyken kapatır; ana kameranın boyut sınırını ayarlar */
    private fun vlogGuncelle() {
        val iste = onde && vlogAcik && kaynak != null
        kaynak?.let { k -> val s = if (iste) 1080 else null; if (k.boyutSiniri != s && !kayitSuruyor()) { k.boyutSiniri = s; oturumuYenile() } }
        if (!iste) { onKaynak?.durdur(); onKaynak = null; onPencere?.let { kok.removeView(it) }; onPencere = null; return }
        if (onPencere != null) return
        val id = vlogOnId() ?: return
        val g = (resources.displayMetrics.widthPixels * DuzenMotoru.VLOG_PENCERE).toInt()
        val p = android.view.TextureView(this).apply {
            scaleX = -1f // ön kamera ayna gibi görünür (kayıt aynasız)
            outlineProvider = object : android.view.ViewOutlineProvider() { override fun getOutline(v: View, o: android.graphics.Outline) { o.setRoundRect(0, 0, v.width, v.height, dp(14f).toFloat()) } }
            clipToOutline = true; contentDescription = "Ön kamera (Vlog)"
            surfaceTextureListener = object : android.view.TextureView.SurfaceTextureListener {
                override fun onSurfaceTextureAvailable(st: android.graphics.SurfaceTexture, w: Int, h: Int) {
                    val k = runCatching { KameraKaynak(this@KameraActivity, id, "Ön kamera") }.getOrElse { tost("Ön kamera açılamadı."); return }
                    k.ekranYonu = (360 - fizikselYon) % 360; onKaynak = k
                    k.baslat(android.view.Surface(st), { bw, bh -> st.setDefaultBufferSize(bw, bh) },
                        { hata -> runOnUiThread { tost("Vlog kapandı: ön kamera açılamadı ($hata)"); vlogSec(false) } })
                }
                override fun onSurfaceTextureSizeChanged(st: android.graphics.SurfaceTexture, w: Int, h: Int) {}
                override fun onSurfaceTextureDestroyed(st: android.graphics.SurfaceTexture): Boolean { onKaynak?.durdur(); onKaynak = null; return true }
                override fun onSurfaceTextureUpdated(st: android.graphics.SurfaceTexture) {}
            }
        }
        val alt = if (zoomSira.height > 0) kok.height - zoomSira.top else dp(230f)
        kok.addView(p, kok.indexOfChild(tallyCerceve), FrameLayout.LayoutParams(g, g * 16 / 9, Gravity.BOTTOM or Gravity.END).apply { marginEnd = dp(16f); bottomMargin = alt + dp(8f) })
        onPencere = p
    }

    /** Vlog kaydının ön kamera dosyası (ana kayıt başlayınca); sessiz, arka kaydın sesi birleşik dosyaya gider */
    private fun onKayitBasla(mbps: Int) {
        val o = onKaynak ?: return
        val d = ContentValues().apply { put(MediaStore.Video.Media.DISPLAY_NAME, "${kayitKok}_on.mp4"); put(MediaStore.Video.Media.MIME_TYPE, "video/mp4"); put(MediaStore.Video.Media.RELATIVE_PATH, "Movies/UPDATED Kamera"); put(MediaStore.Video.Media.IS_PENDING, 1) }
        val uri = contentResolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, d) ?: return tost("Ön kamera dosyası açılamadı.")
        val fd = contentResolver.openFileDescriptor(uri, "w") ?: run { contentResolver.delete(uri, null, null); return tost("Ön kamera dosyası açılamadı.") }
        o.ekranYonu = (360 - fizikselYon) % 360
        o.kayitBasla(fd, ayar.hevc, (mbps / 2).coerceAtLeast(10), false) { hata -> runOnUiThread {
            if (hata != null) { contentResolver.delete(uri, null, null); tost("Ön kamera kaydı başlamadı: $hata") } else onUri = uri
        } }
    }

    /** Vlog kaydını bitirir (ana kayıt dururken): ön dosya görünür olur; iki dosya da tamamsa `vlogParca` birleşik videoyu sıraya koyar */
    private fun vlogDurdur(arka: Uri?) {
        val o = onKaynak; val u = onUri; onUri = null
        if (o == null || u == null || arka == null || !o.kayitta) { vlogBekleyen = 0; return }
        vlogBekleyen = 2; vlogArka = arka; vlogOnDosya = u; vlogArkaOk = false; vlogOnOk = false
        o.kayitDurdur { ok -> runOnUiThread {
            if (ok) contentResolver.update(u, ContentValues().apply { put(MediaStore.Video.Media.IS_PENDING, 0) }, null, null) else contentResolver.delete(u, null, null)
            vlogOnOk = ok; vlogParca()
        } }
    }

    private fun vlogParca(arkaOk: Boolean? = null) {
        if (vlogBekleyen == 0) return
        arkaOk?.let { vlogArkaOk = it }
        if (--vlogBekleyen > 0) return
        val a = vlogArka ?: return; val o = vlogOnDosya ?: return
        if (!vlogArkaOk || !vlogOnOk) return
        if (ayar.renk == 1) return tost("Vlog: iki kamera ayrı dosya kaydedildi (HDR'de birleşik video yapılmaz).")
        tost("Vlog: birleşik video hazırlanıyor; ekrandan çıkabilirsin, bildirimde ilerler.")
        VideoIsleme.ekle(applicationContext, VideoIsleme.Is(a, null, ayar.hevc, vlogOn = o))
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

    /** Görüntünün üstündeki biçim bilgisi: "4K / 60", "12 MP / JPEG"; elle değişen değerler sarı (Apple Kamera gibi iki satır) */
    private fun bilgiCiz() {
        if (!this::bilgiSira.isInitialized) return
        val k = kaynak
        val metin = when {
            k == null -> ""
            mod.foto -> k.secilenFotoBoyut()?.let { "%.0f MP · %s".format(it.width * it.height / 1e6, if (k.rawAcik) "RAW" else "JPEG") } ?: "FOTO"
            mod == KMod.TIMELAPSE -> { val b = k.secilenBoyut(); "${when { b.height >= 2160 -> "4K"; b.height >= 1080 -> "1080P"; else -> "${b.height}P" }} · ${Timelapse.aralikYazi(tlAralik)}" }
            else -> { val b = k.secilenBoyut(); "${when { b.height >= 2160 -> "4K"; b.height >= 1080 -> "1080P"; else -> "${b.height}P" }} · ${ayar.fps?.upper ?: 30}" +
                (if (ayar.renk == 1 && k.hdrVar) " · HDR" else if (ayar.hevc) " · HEVC" else "") }
        }
        bilgiCip.text = metin
        ustSatirCiz(k, metin)
        bilgiSira.visibility = if (kayitCip.visibility == View.VISIBLE || bilgiSira.childCount == 0) View.INVISIBLE else View.VISIBLE
        favSira.visibility = if (kayitCip.visibility == View.VISIBLE || favSira.childCount == 0) View.INVISIBLE else View.VISIBLE
    }

    /** BİÇİM (Apple Kamera'daki gibi): solda küçük başlık, sağda seçenekler; seçili sarı ve önünde nokta */
    private fun bicimAc() {
        if (grupIci == null) aktifGrup?.let { return grupAc(it) }
        val k = kaynak ?: return tost("Kamera hazır değil.")
        if (kayitSuruyor()) return
        val p = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(8f), 0, dp(8f), dp(4f)) }
        fun satir(ad: String, ogeler: List<String>, secili: Int, sec: (Int) -> Unit) {
            val s = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
            s.addView(bolumBasligi(ad), LinearLayout.LayoutParams(dp(104f), -2))
            val sira = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
            ogeler.forEachIndexed { i, o -> sira.addView(TextView(this).apply { text = o; textSize = 17f; typeface = kosulKalin; gravity = Gravity.CENTER_VERTICAL
                setTextColor(if (i == secili) Color.WHITE else METIN3); contentDescription = "$ad $o"; setOnClickListener { sec(i); bilgiCiz(); bicimAc() } },
                LinearLayout.LayoutParams(-2, dp(48f)).apply { marginEnd = dp(22f) }) }
            s.addView(HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false; addView(sira) }, LinearLayout.LayoutParams(0, -2, 1f))
            p.addView(s)
        }
        fun yenile() = k.oturumYenile { w, h -> monitor.tampon(w, h); runOnUiThread { bilgiCiz() } }
        val vb = listOf(Size(1280, 720), Size(1920, 1080), Size(3840, 2160)).filter { it in k.yetenek.boyutlar }
        fun videoSatiri() { if (vb.isNotEmpty()) satir("ÇÖZ.", vb.map { when (it.height) { 720 -> "720p"; 1080 -> "HD"; else -> "4K" } }, vb.indexOf(ayar.boyut ?: Size(1920, 1080)).coerceAtLeast(0)) {
            ayar.boyut = vb[it]; ayarKaydet(); yenile() } }
        when {
            mod.foto -> {
                val fb = k.fotoBoyutlari.distinctBy { it.width * 10 / it.height }.take(2) + k.fotoBoyutlari.take(4)
                val liste = fb.distinct().sortedByDescending { it.width * it.height }.take(4); val fs = k.secilenFotoBoyut()
                if (liste.isNotEmpty()) satir("ÇÖZ.", liste.map { "%.0f MP".format(it.width * it.height / 1e6) }, liste.indexOf(fs).coerceAtLeast(0)) { ayar.fotoBoyut = liste[it]; ayarKaydet(); yenile() }
                if (k.rawVar) satir("RAW", listOf("Kapalı", "Açık"), if (ayar.raw) 1 else 0) { ayar.raw = it == 1; ayarKaydet(); yenile() }
                if (mod != KMod.PRO) satir("ZAMANLAYICI", listOf("Kapalı", "3 sn", "10 sn"), when (zamanlayici) { 3 -> 1; 10 -> 2; else -> 0 }) {
                    zamanlayici = intArrayOf(0, 3, 10)[it]; tercih.edit().putInt("zamanlayici", zamanlayici).apply() }
            }
            mod == KMod.TIMELAPSE -> {
                videoSatiri()
                satir("ARALIK", Timelapse.HIZLI.map { Timelapse.aralikYazi(it) }, Timelapse.HIZLI.indexOf(tlAralik)) { tlAralik = Timelapse.HIZLI[it]; tercih.edit().putLong("tlAralik", tlAralik).apply(); sureCiz() }
                satir("SÜRE", Timelapse.SURELER.map { Timelapse.sureYazi(it) }, Timelapse.SURELER.indexOf(tlSure).coerceAtLeast(0)) { tlSure = Timelapse.SURELER[it]; tercih.edit().putInt("tlSure", tlSure).apply() }
            }
            else -> {
                videoSatiri()
                val fpsler = listOfNotNull(Range(30, 30).takeIf { it in k.yetenek.fpsler }, Range(60, 60).takeIf { it in k.yetenek.fpsler })
                if (fpsler.isNotEmpty()) satir("KARE HIZI", fpsler.map { "${it.upper}" }, if (ayar.fps == Range(60, 60)) fpsler.size - 1 else 0) { ayar.fps = fpsler[it]; ayarKaydet(); yenile() }
            }
        }
        acilirAc(p, ustTan = false, baslik = "BİÇİM"); altGizle(true)
    }

    /* ================= Denetimler ve sabitlenenler (iPhone'daki Favoriler.swift; Apple iOS 27 Kamera düzeni) ================= */
    /** Sabitlenebilen denetimler (iPhone ile aynı anahtarlar ve sıra) */
    private val FAV_TUM = listOf("iso", "enst", "bd", "ev", "odak", "cozunurluk", "kodek", "renk", "sabitleme", "stil", "lut", "zebra", "falseColor", "peaking",
        "histogram", "monokrom", "flas", "zamanlayici", "kilavuz", "terazi", "yardimci", "ses")
    private val FAV_VARSAYILAN = listOf("iso", "enst", "bd", "zebra")
    private val FAV_EN_COK = 6
    /** Dokununca hemen değişenler */
    private val FAV_ACKAPA = setOf("zebra", "falseColor", "peaking", "histogram", "monokrom", "flas", "zamanlayici", "terazi", "yardimci")
    /** Merceklerin yerinde tek satır seçim açanlar */
    private val FAV_SATIR = setOf("iso", "enst", "ev", "bd", "kodek", "renk", "sabitleme", "lut", "odak")
    private var favoriler = mutableListOf<String>()
    private var duzenleniyor = false
    private var favOnce: List<String> = emptyList()
    private var acikSecim: String? = null
    private lateinit var secimSira: FrameLayout
    private lateinit var duzenSerit: LinearLayout

    private fun favOku() {
        favoriler = runCatching { org.json.JSONArray(tercih.getString("k.favoriler", null) ?: return@runCatching FAV_VARSAYILAN.toMutableList())
            .let { j -> (0 until j.length()).map { j.getString(it) }.filter { it in FAV_TUM }.distinct().take(FAV_EN_COK).toMutableList() } }.getOrDefault(FAV_VARSAYILAN.toMutableList())
    }
    private fun favKaydet() { tercih.edit().putString("k.favoriler", org.json.JSONArray(favoriler).toString()).apply(); bilgiCiz() }
    private fun favSabitle(a: String) {
        if (a in favoriler) { favoriler.remove(a); tost("Sabitleme kaldırıldı: ${favAd(a)}") }
        else if (favoriler.size >= FAV_EN_COK) return tost("En çok $FAV_EN_COK denetim sabitlenir.")
        else { favoriler.add(a); tost("Sabitlendi: ${favAd(a)}") }
        favKaydet()
    }

    private fun favAd(a: String) = when (a) {
        "iso" -> "ISO"; "enst" -> "Enstantane"; "bd" -> "Beyaz denge"; "ev" -> "Pozlama"; "odak" -> "Odak"; "cozunurluk" -> "Biçim"; "kodek" -> "Kodek"
        "renk" -> "HDR"; "sabitleme" -> "Sabitleme"; "stil" -> "Stiller"; "lut" -> "LUT"; "zebra" -> "Zebra"; "falseColor" -> "False color"; "peaking" -> "Odak vurgusu"
        "histogram" -> "Histogram"; "monokrom" -> "Siyah-beyaz"; "flas" -> "Flaş"; "zamanlayici" -> "Sayaç"; "kilavuz" -> "Kılavuz"; "terazi" -> "Terazi"
        "yardimci" -> "AI Kadraj"; "ses" -> "Ses"; else -> a
    }
    private fun favEtiket(a: String) = when (a) { "bd" -> "BEYAZ"; "falseColor" -> "FALSE COLOR"; "peaking" -> "VURGU"; "monokrom" -> "S-B"; "renk" -> "RENK"; else -> favAd(a).uppercase(Locale("tr")) }

    /** Bir denetimin görünüşü: simge ya da iki satır değer; değişmişse sarı */
    private class FavGorunum(val ikon: Int?, val ust: String?, val alt: String?, val degisik: Boolean)
    private fun favGorunum(a: String): FavGorunum {
        val m = monitor.ayarlar; val k = kaynak
        return when (a) {
            "iso" -> FavGorunum(R.drawable.ic_iso, ayar.iso?.toString() ?: "OTO", "ISO", ayar.iso != null)
            "enst" -> FavGorunum(R.drawable.ic_enst, if (bulb) "BULB" else ayar.pozlamaNs?.let { enstGoster(it) } ?: "OTO", if (mod == KMod.VIDEO && enstAci) "AÇI" else "S", bulb || ayar.pozlamaNs != null)
            "bd" -> FavGorunum(R.drawable.ic_beyaz, ayar.kelvin?.toString() ?: BD_ADLARI[ayar.awb]?.takeIf { ayar.awb != CameraMetadata.CONTROL_AWB_MODE_AUTO }?.removeSuffix("K") ?: "OTO",
                "K", ayar.kelvin != null || ayar.awb != CameraMetadata.CONTROL_AWB_MODE_AUTO)
            "ev" -> FavGorunum(R.drawable.ic_pozlama, evYazi(ayar.ev, k?.yetenek?.evAdim?.takeIf { it > 0 } ?: 1f), "EV", ayar.ev != 0)
            "odak" -> FavGorunum(R.drawable.ic_odak, if (ayar.odakMesafe == null) "AF" else "MF", "ODAK", ayar.odakMesafe != null)
            "cozunurluk" -> bilgiCip.text.split(" · ").let { p -> FavGorunum(R.drawable.ic_foto, p.getOrNull(0)?.takeIf { it.isNotEmpty() }?.replace(" MP", "") ?: "BİÇİM",
                p.getOrNull(1)?.let { if (p[0].endsWith("MP")) it else it } ?: "", false) }
            "kodek" -> FavGorunum(R.drawable.ic_kodek, if (ayar.hevc || ayar.renk == 1) "HEVC" else "H.264", null, false)
            "renk" -> FavGorunum(null, if (ayar.renk == 1) "HDR" else "SDR", null, ayar.renk == 1)
            "sabitleme" -> FavGorunum(R.drawable.ic_sabit, null, null, ayar.sabit == 2)
            "stil" -> FavGorunum(R.drawable.ic_renk, null, null, stil.etkin)
            "lut" -> FavGorunum(R.drawable.ic_lut, null, null, kullaniciLut != null)
            "zebra" -> FavGorunum(R.drawable.ic_zebra, null, null, m.zebra)
            "falseColor" -> FavGorunum(R.drawable.ic_parlak, null, null, m.falseColor)
            "peaking" -> FavGorunum(R.drawable.ic_kadraj, null, null, m.peaking)
            "histogram" -> FavGorunum(R.drawable.ic_olcum, null, null, histoAcik)
            "monokrom" -> FavGorunum(R.drawable.ic_mono, null, null, m.monokrom)
            "flas" -> FavGorunum(if (ayar.flas == 0) R.drawable.ic_flas_yok else R.drawable.ic_flas, null, null, ayar.flas > 0)
            "zamanlayici" -> FavGorunum(R.drawable.ic_zaman, null, null, zamanlayici > 0)
            "kilavuz" -> FavGorunum(R.drawable.ic_kilavuz, null, null, kompTur != KompTur.KAPALI)
            "terazi" -> FavGorunum(R.drawable.ic_terazi, null, null, teraziAcik)
            "yardimci" -> FavGorunum(R.drawable.ic_yardimci, null, null, asistanAcik)
            "ses" -> FavGorunum(R.drawable.ic_ses, null, null, ayar.sesGirdi != null)
            else -> FavGorunum(null, a, null, false)
        }
    }

    /** Simge ya da iki satırlık değer (değer türünde `deger` true ise ve değişmişse değer; `hep` true ise her zaman değer) */
    private fun favIcerik(g: FavGorunum, degerGoster: Boolean, boy: Float, golge: Boolean): View {
        val renk = if (g.degisik) VURGU else Color.WHITE
        if (g.ust != null && (degerGoster || g.ikon == null)) return LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
            addView(TextView(this@KameraActivity).apply { text = g.ust; textSize = boy; typeface = kosulKalin; setTextColor(renk); gravity = Gravity.CENTER; isSingleLine = true
                if (golge) setShadowLayer(dp(3f).toFloat(), 0f, 0f, Color.argb(140, 0, 0, 0)) })
            g.alt?.takeIf { it.isNotEmpty() }?.let { addView(TextView(this@KameraActivity).apply { text = it; textSize = boy * 0.62f; typeface = kosulKalin; setTextColor(renk); gravity = Gravity.CENTER
                if (golge) setShadowLayer(dp(3f).toFloat(), 0f, 0f, Color.argb(140, 0, 0, 0)) }) }
        }
        return ImageView(this).apply { setImageResource(g.ikon ?: R.drawable.ic_ayar); setColorFilter(renk); scaleType = ImageView.ScaleType.FIT_CENTER
            if (golge) elevation = 0f }
    }

    /** Okuma: değer 15 sp yarı kalın, altında etiket 9,5 sp büyük harf (aralık 0,08em); elle değişmişse ikisi de sarı */
    private fun okuma(deger: String, etiket: String, degisik: Boolean) = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
        addView(TextView(this@KameraActivity).apply { text = deger; textSize = 15f; typeface = kosulKalin; setTextColor(if (degisik) VURGU else Color.WHITE); gravity = Gravity.CENTER; isSingleLine = true; includeFontPadding = false })
        if (etiket.isNotEmpty()) addView(TextView(this@KameraActivity).apply { text = etiket.uppercase(Locale("tr")); textSize = 9.5f; typeface = kosulKalin; letterSpacing = 0.08f
            setTextColor(if (degisik) Color.argb(200, 255, 214, 10) else METIN2); gravity = Gravity.CENTER; isSingleLine = true; includeFontPadding = false; setPadding(0, dp(2f), 0, 0) })
    }

    /**
     * Üstte tek okuma şeridi: biçim (PRO'da modun ISO/S'si) ve elle değişmiş değerler (sarı), aralarında ince ayraç.
     * Altında sabitlenenler: 24 dp kapsüller (simge + kısa ad ya da değer); elle değişmişse sarı yazı ve sarı yarım hat. Düzenlemede ⊖ rozeti.
     */
    private fun ustSatirCiz(k: KameraKaynak?, metin: String) {
        bilgiSira.removeAllViews(); favSira.removeAllViews()
        fun oge(v: View, ad: String, tik: () -> Unit) {
            if (bilgiSira.childCount > 0) bilgiSira.addView(View(this).apply { setBackgroundColor(HAT) }, LinearLayout.LayoutParams(ince, dp(18f)).apply { marginStart = dp(10f); marginEnd = dp(10f) })
            v.contentDescription = ad; v.setOnClickListener { tik() }; v.setOnLongClickListener { duzenleAc(); true }; v.rotation = -fizikselYon.toFloat()
            bilgiSira.addView(v, LinearLayout.LayoutParams(-2, -1))
        }
        if (metin.isNotEmpty()) { val p = metin.split(" · "); oge(okuma(p[0], p.drop(1).joinToString(" · "), false), "Biçim") { bicimAc() } }
        if (mod == KMod.PRO && !duzenleniyor) {
            val a = proMod.oku(tercih)
            oge(okuma(ProMod.isoYazi(a.iso), "ISO", a.iso != null), "ISO") { proOzellestir() }
            a.enstNs?.let { oge(okuma(ProMod.enstYazi(it), "S", true), "Enstantane") { proOzellestir() } }
        }
        // Elle değişmiş değerler (sabitlenmiş olsun olmasın) okuma şeridinde
        if (mod != KMod.PRO) listOf("iso", "enst", "bd", "ev", "odak").forEach { a -> val g = favGorunum(a)
            if (g.degisik && g.ust != null) oge(okuma(g.ust, g.alt ?: "", true), favAd(a)) { favDokun(a) } }
        // Sabitlenenler
        val degerli = setOf("iso", "enst", "bd", "ev", "odak")
        favoriler.filter { it != "cozunurluk" && (mod != KMod.PRO || it in FAV_ACKAPA || duzenleniyor) }.forEach { a ->
            val g = favGorunum(a); val renk = if (g.degisik) VURGU else Color.argb(217, 255, 255, 255)
            val yazi = if (a in degerli && g.ust != null) "${g.alt ?: ""} ${g.ust}".trim() else favKisa(a)
            val f = FrameLayout(this).apply { clipChildren = false; contentDescription = favAd(a); setOnClickListener { favDokun(a) }; setOnLongClickListener { duzenleAc(); true }; rotation = -fizikselYon.toFloat() }
            f.addView(TextView(this).apply { text = yazi; textSize = 11f; typeface = kosulKalin; setTextColor(renk); gravity = Gravity.CENTER_VERTICAL; isSingleLine = true; includeFontPadding = false
                setPadding(dp(9f), 0, dp(10f), 0); background = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(CAM_UST, CAM_ALT)).apply { cornerRadius = dp(12f).toFloat(); setStroke(ince, if (g.degisik) Color.argb(128, 255, 214, 10) else CAM_KENAR) }
                g.ikon?.let { Tema.simge(this, it, renk, 12f); compoundDrawablePadding = dp(5f) } }, FrameLayout.LayoutParams(-2, -1))
            if (duzenleniyor) f.addView(etiket("−", 12f).apply { typeface = kosulKalin; background = daire(false, Color.rgb(99, 99, 102)); setOnClickListener { favoriler.remove(a); favKaydet(); duzenleAc(yeniden = true) } },
                FrameLayout.LayoutParams(dp(15f), dp(15f), Gravity.TOP or Gravity.START).apply { topMargin = -dp(5f); marginStart = -dp(5f) })
            favSira.addView(f, LinearLayout.LayoutParams(-2, -1).apply { marginStart = dp(3f); marginEnd = dp(3f) })
        }
        favSira.background = if (duzenleniyor) Tema.kapsul(Color.argb(60, 0, 0, 0), 999f, Color.argb(150, 255, 255, 255)) else null
    }
    /** Sabitlenen kapsülündeki kısa ad */
    private fun favKisa(a: String) = when (a) { "falseColor" -> "False"; "peaking" -> "Vurgu"; "monokrom" -> "S-B"; "histogram" -> "Histo"; "zamanlayici" -> if (zamanlayici > 0) "$zamanlayici sn" else "Sayaç"
        "renk" -> if (ayar.renk == 1) "HDR" else "SDR"; "kodek" -> if (ayar.hevc || ayar.renk == 1) "HEVC" else "H.264"; "stil" -> if (stil.hazir != HazirStil.STANDART) stil.hazir.ad else "Stil"
        "lut" -> kullaniciLutAdi?.removeSuffix(".cube") ?: "LUT"; else -> favAd(a) }

    /** Denetime dokunuş: aç/kapa değişir, değerli olanlar tek satır seçim, diğerleri kendi panelini açar */
    private fun favDokun(a: String) {
        if (duzenleniyor) return
        val m = monitor.ayarlar
        fun gKaydet() { tercih.edit().putBoolean("g_peak", m.peaking).putBoolean("g_zebra", m.zebra).putBoolean("g_fc", m.falseColor).putBoolean("g_mono", m.monokrom)
            .putBoolean("g_histo", histoAcik).apply(); monitor.requestRender(); kompUygula() }
        when (a) {
            "zebra" -> { m.zebra = !m.zebra; gKaydet() }
            "falseColor" -> { m.falseColor = !m.falseColor; gKaydet() }
            "peaking" -> { m.peaking = !m.peaking; gKaydet() }
            "histogram" -> { histoAcik = !histoAcik; gKaydet() }
            "monokrom" -> { m.monokrom = !m.monokrom; gKaydet() }
            "flas" -> flasDegistir()
            "zamanlayici" -> { zamanlayici = when (zamanlayici) { 0 -> 3; 3 -> 10; else -> 0 }; tercih.edit().putInt("zamanlayici", zamanlayici).apply() }
            "terazi" -> { teraziAcik = !teraziAcik; kompUygula() }
            "yardimci" -> { asistanAcik = !asistanAcik; kompUygula() }
            in FAV_SATIR -> { acilirKapat(); if (acikSecim == a) secimKapat() else secimAc(a) }
            "cozunurluk" -> { secimKapat(); bicimAc() }
            "kilavuz" -> { acilirKapat(); secimKapat(); kilavuzMenu() }
            "stil", "ses" -> {
                secimKapat()
                val ic = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
                if (a == "stil") stilPedi(ic) { favDokun("stil") } else sesHizli(ic) { favDokun("ses") }
                acilirAc(ic, ustTan = false, baslik = favAd(a).uppercase(Locale("tr"))); altGizle(true)
            }
        }
        if (a in FAV_ACKAPA) { bilgiCiz(); kontrolCiz(); if (acilir != null && aktifDenetim) denetimlerAc() }
    }

    /* ---------- Merceklerin yerinde tek satır seçim (Apple Kamera'daki BİÇİM satırı gibi) ---------- */
    private class Secenek(val yazi: String, val secili: Boolean, val sec: () -> Unit)
    private fun secimKapat() {
        if (!this::secimSira.isInitialized) return
        acikSecim = null; secimSira.visibility = View.GONE
        if (acilir == null) zoomSira.visibility = View.VISIBLE
    }
    private fun secimAc(a: String) {
        val k = kaynak ?: return tost("Kamera hazır değil.")
        if (mod == KMod.PRO) return proOzellestir()
        val y = k.yetenek
        val videoMu = mod == KMod.VIDEO
        fun uygula() { k.ayarDegisti(); ayarKaydet(); bilgiCiz(); kontrolCiz(); secimAc(a) }
        var oto: Pair<Boolean, () -> Unit>? = null
        val l = ArrayList<Secenek>()
        when (a) {
            "iso" -> {
                if (!y.elleKontrol) return tost("Bu kamerada elle ISO yok.")
                val r = y.isoAralik
                listOf(50, 100, 200, 400, 800, 1600, 3200, 6400, 12800).filter { r == null || it in r.lower..r.upper }.forEach { i -> l.add(Secenek("$i", ayar.iso == i) { ayar.iso = i; uygula() }) }
                oto = (ayar.iso == null) to { ayar.iso = null; uygula() }
            }
            "enst" -> {
                if (!y.elleKontrol) return tost("Bu kamerada elle enstantane yok.")
                val ler: List<Long> = if (videoMu) { val kare = SN_ / (ayar.fps?.upper ?: 30)
                    if (enstAci) listOf(45.0, 90.0, 144.0, 172.8, 180.0, 270.0, 360.0).map { (it / 360 * kare).toLong() }
                    else listOf(2000, 1000, 500, 250, 125, 100, 60, 50, 48, 30, 25, 24).map { SN_ / it }.filter { it <= kare + 1000 } }
                    else listOf(SN_ / 4000, SN_ / 1000, SN_ / 500, SN_ / 250, SN_ / 125, SN_ / 60, SN_ / 30, SN_ / 15, SN_ / 8, SN_ / 4, SN_ / 2, SN_, 2 * SN_, 4 * SN_, 8 * SN_, 15 * SN_, 30 * SN_)
                ler.forEach { e -> l.add(Secenek(enstGoster(e), !bulb && ayar.pozlamaNs?.let { abs(it - e) < 2000 } == true) {
                    bulb = false; ayar.pozlamaNs = e; ayar.uzunOnizleme = if (videoMu) 2 else if (uzunYol == "ort") 1 else 2; uygula() }) }
                oto = (ayar.pozlamaNs == null && !bulb) to { bulb = false; ayar.pozlamaNs = null; ayar.uzunOnizleme = 0; uygula() }
            }
            "ev" -> {
                val r = y.evAralik ?: return tost("Bu kamerada pozlama telafisi yok.")
                val adim = y.evAdim.takeIf { it > 0 } ?: 1f
                val kat = maxOf(1, Math.round(1f / 3f / adim))
                (r.lower..r.upper).filter { it % kat == 0 && abs(it * adim) <= 2.01f }.forEach { e -> l.add(Secenek(evYazi(e, adim), ayar.ev == e) { ayar.ev = e; uygula() }) }
                oto = (ayar.ev == 0) to { ayar.ev = 0; uygula() }
            }
            "bd" -> {
                if (k.elleBdVar) listOf(2800, 3200, 4000, 4500, 5000, 5600, 6500, 7500).forEach { t -> l.add(Secenek("${t}K", ayar.kelvin == t) { ayar.kelvin = t; ayar.ton = 0; uygula() }) }
                else BD_ADLARI.keys.filter { it in y.awbModlari && it != CameraMetadata.CONTROL_AWB_MODE_AUTO }.forEach { m ->
                    l.add(Secenek(BD_ADLARI[m]!!, ayar.awb == m && ayar.kelvin == null) { ayar.awb = m; ayar.kelvin = null; ayar.ton = 0; uygula() }) }
                oto = (ayar.kelvin == null && ayar.awb == CameraMetadata.CONTROL_AWB_MODE_AUTO) to { ayar.kelvin = null; ayar.ton = 0; ayar.awb = CameraMetadata.CONTROL_AWB_MODE_AUTO; uygula() }
            }
            "odak" -> {
                if (y.minOdak <= 0f) return tost("Bu kamerada el ile odak yok; ekrana dokunarak odakla.")
                listOf(0f to "∞", 1f / 3 to "3 m", 1f to "1 m", 2f to "50 cm", 3.33f to "30 cm", 5f to "20 cm", 10f to "10 cm").filter { it.first <= y.minOdak }.forEach { (d, ad) ->
                    l.add(Secenek(ad, ayar.odakMesafe?.let { abs(it - d) < 0.01f } == true) { ayar.odakMesafe = d; uygula() }) }
                oto = (ayar.odakMesafe == null) to { ayar.odakMesafe = null; k.odakSerbest(); uygula() }
            }
            "kodek", "renk", "sabitleme" -> {
                if (!videoMu) return tost("${favAd(a)} yalnız VİDEO'da.")
                if (k.kayitta) return tost("Kayıt sürerken değişmez.")
                when (a) {
                    "kodek" -> { l.add(Secenek("HEVC", ayar.hevc || ayar.renk == 1) { ayar.hevc = true; uygula() })
                        if (ayar.renk != 1) l.add(Secenek("H.264", !ayar.hevc) { ayar.hevc = false; uygula() }) }
                    "renk" -> { l.add(Secenek("SDR", ayar.renk != 1) { ayar.renk = 0; ayarKaydet(); oturumuYenile(); uygula() })
                        if (k.hdrVar) l.add(Secenek("HDR", ayar.renk == 1) { ayar.renk = 1; ayarKaydet(); oturumuYenile(); uygula() }) }
                    else -> listOf(0 to "Kapalı", 1 to "Standart", 2 to "Sinematik").filter { it.first in k.sabitlemeler }.forEach { (i, ad) ->
                        l.add(Secenek(ad, ayar.sabit == i) { ayar.sabit = i; uygula() }) }
                }
            }
            "lut" -> {
                val lutlar = lutKlasoru.listFiles { f -> f.name.endsWith(".cube", true) }?.sortedBy { it.name.lowercase() }.orEmpty()
                l.add(Secenek("Kapalı", kullaniciLut == null) { lutUygula(null); bilgiCiz(); secimAc(a) })
                lutlar.forEach { f -> l.add(Secenek(f.name.removeSuffix(".cube"), kullaniciLutAdi == f.name) { lutUygula(f.name); bilgiCiz(); secimAc(a) }) }
                l.add(Secenek("+ Ekle", false) { startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply { addCategory(Intent.CATEGORY_OPENABLE); type = "*/*" }, 7) })
            }
        }
        val kaydirX = (secimSira.getChildAt(0) as? LinearLayout)?.let { (it.getChildAt(1) as? HorizontalScrollView)?.scrollX }.takeIf { acikSecim == a }
        acikSecim = a
        secimSira.removeAllViews()
        val s = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; background = cam(dp(14f).toFloat()); setPadding(dp(14f), 0, dp(6f), 0) }
        s.addView(bolumBasligi(favEtiket(a)).apply { setPadding(0, 0, dp(8f), 0) })
        val sira = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        var seciliV: View? = null
        l.forEach { o ->
            val v = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(dp(9f), 0, dp(9f), 0); setOnClickListener { o.sec() }; contentDescription = o.yazi
                addView(View(this@KameraActivity).apply { background = daire(false, VURGU); visibility = if (o.secili) View.VISIBLE else View.INVISIBLE }, LinearLayout.LayoutParams(dp(5f), dp(5f)).apply { marginEnd = dp(5f) })
                addView(TextView(this@KameraActivity).apply { text = o.yazi; textSize = 15f; typeface = kosulKalin; setTextColor(if (o.secili) VURGU else Color.argb(217, 255, 255, 255)) }) }
            if (o.secili) seciliV = v
            sira.addView(v, LinearLayout.LayoutParams(-2, -1))
        }
        val hs = HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false; isHorizontalFadingEdgeEnabled = true; setFadingEdgeLength(dp(20f)); addView(sira) }
        s.addView(hs, LinearLayout.LayoutParams(0, -1, 1f))
        // OTO: elle bir değer seçiliyken soluk; otomatikteyken beyaz %12 kapsül (sarı yalnız elle değişen değerde)
        oto?.let { (acik, is_) -> s.addView(etiket("OTO", 11f, if (acik) Color.WHITE else METIN2).apply { typeface = kosulKalin; letterSpacing = 0.08f; setPadding(dp(10f), 0, dp(10f), 0)
            background = Tema.kapsul(if (acik) SECILI else DOLGU); setOnClickListener { is_() } }, LinearLayout.LayoutParams(-2, dp(28f)).apply { marginStart = dp(6f) }) }
        secimSira.addView(s, FrameLayout.LayoutParams(-1, -1))
        hs.post { if (kaydirX != null) hs.scrollTo(kaydirX, 0) else seciliV?.let { v -> hs.scrollTo(maxOf(0, v.left - (hs.width - v.width) / 2), 0) } }
        secimSira.visibility = View.VISIBLE; zoomSira.visibility = View.INVISIBLE
    }

    /* ---------- "⋯" DENETİMLER ızgarası ---------- */
    private var aktifDenetim = false
    private fun denetimlerAc() {
        secimKapat()
        val p = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        FAV_TUM.chunked(3).forEach { sira ->
            val s = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            sira.forEach { a ->
                val g = favGorunum(a)
                val h = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL; contentDescription = favAd(a); setPadding(0, dp(6f), 0, dp(10f))
                    setOnClickListener { favDokun(a) }; setOnLongClickListener { favSabitle(a); true } }
                val d = FrameLayout(this).apply { background = daire(g.degisik, DOLGU); rotation = -fizikselYon.toFloat() }
                val ic = favIcerik(g, g.ust != null && a in setOf("iso", "enst", "bd", "ev", "cozunurluk", "kodek", "renk", "odak"), 13f, false)
                if (ic is ImageView) d.addView(ic, FrameLayout.LayoutParams(dp(26f), dp(26f), Gravity.CENTER)) else d.addView(ic, FrameLayout.LayoutParams(-2, -2, Gravity.CENTER))
                h.addView(d, LinearLayout.LayoutParams(dp(60f), dp(60f)))
                h.addView(TextView(this).apply { text = favEtiket(a); textSize = 9.5f; letterSpacing = 0.08f; typeface = kosulKalin; setTextColor(METIN2); gravity = Gravity.CENTER; isSingleLine = true; setPadding(0, dp(7f), 0, 0) })
                s.addView(h, LinearLayout.LayoutParams(0, -2, 1f))
            }
            repeat(3 - sira.size) { s.addView(View(this), LinearLayout.LayoutParams(0, 1, 1f)) }
            p.addView(s)
        }
        acilirAc(p, ustTan = false, baslik = "DENETİMLER", sol = "Düzenle" to { duzenleAc() }); altGizle(true)
        aktifDenetim = true
    }

    /* ---------- Düzenleme: üstte ⊖ ile kaldır, altta ızgaradan ekle ---------- */
    private fun duzenleAc(yeniden: Boolean = false) {
        if (!yeniden && !duzenleniyor) favOnce = favoriler.toList()
        secimKapat()
        duzenleniyor = true
        ustSerit.visibility = View.INVISIBLE; duzenSerit.visibility = View.VISIBLE
        bilgiCiz()
        val p = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        FAV_TUM.chunked(4).forEach { sira ->
            val s = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            sira.forEach { a ->
                val ekli = a in favoriler
                val h = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL; contentDescription = favAd(a); setPadding(0, dp(6f), 0, dp(10f))
                    alpha = if (ekli) 0.32f else 1f
                    setOnClickListener { if (!ekli) { if (favoriler.size >= FAV_EN_COK) tost("En çok $FAV_EN_COK denetim sabitlenir.") else { favoriler.add(a); favKaydet(); duzenleAc(yeniden = true) } } } }
                val d = FrameLayout(this).apply { background = daire(false, DOLGU); rotation = -fizikselYon.toFloat() }
                val ic = favIcerik(favGorunum(a), a in setOf("iso", "enst", "bd", "ev", "cozunurluk"), 10f, false)
                if (ic is ImageView) d.addView(ic, FrameLayout.LayoutParams(dp(20f), dp(20f), Gravity.CENTER)) else d.addView(ic, FrameLayout.LayoutParams(-2, -2, Gravity.CENTER))
                h.addView(d, LinearLayout.LayoutParams(dp(44f), dp(44f)))
                h.addView(TextView(this).apply { text = favEtiket(a); textSize = 10f; letterSpacing = 0.04f; typeface = kosul; setTextColor(Color.WHITE); gravity = Gravity.CENTER; isSingleLine = true; setPadding(0, dp(6f), 0, 0) })
                s.addView(h, LinearLayout.LayoutParams(0, -2, 1f))
            }
            repeat(4 - sira.size) { s.addView(View(this), LinearLayout.LayoutParams(0, 1, 1f)) }
            p.addView(s)
        }
        p.addView(etiket("Temel Ayarlara Sıfırla", 14f, Color.argb(200, 255, 255, 255)).apply { setPadding(0, dp(12f), 0, dp(4f))
            setOnClickListener { favoriler = FAV_VARSAYILAN.toMutableList(); favKaydet(); duzenleAc(yeniden = true) } }, LinearLayout.LayoutParams(-1, -2))
        acilirAc(p, ustTan = false, baslik = "KAMERA DENETİMLERİNİ EKLE", perdeKapat = { duzenleBitir(false) }, carpiYok = true); altGizle(true)
    }
    private fun duzenleBitir(kaydet: Boolean) {
        if (!kaydet) favoriler = favOnce.toMutableList()
        duzenleniyor = false
        ustSerit.visibility = View.VISIBLE; duzenSerit.visibility = View.GONE
        favKaydet(); acilirKapat()
    }

    /** Genel Ayarlar → Sabitlenenler: sürükleyerek sırala, ⊖ ile kaldır, altta ekle */
    private fun AyarEkrani.Sayfa.sabitlenenSayfasi(e: AyarEkrani) {
        grup("Sabitlenenler", "Görüntünün üstünde görünür (en çok $FAV_EN_COK). Sıralamak için ≡ tutamağından sürükle. Ekranda üst satıra basılı tutunca da düzenlenir.") {
            if (favoriler.isEmpty()) deger("Sabitlenen yok", renk = AyarEkrani.IKINCIL) else ozel(SiraListe(e))
        }
        val diger = FAV_TUM.filter { it !in favoriler }
        if (diger.isNotEmpty()) grup("Diğer özellikler") {
            diger.forEach { a -> val dolu = favoriler.size >= FAV_EN_COK
                deger(favAd(a), "Sabitle", if (dolu) AyarEkrani.IKINCIL else AyarEkrani.MAVI) { if (!dolu) { favoriler.add(a); favKaydet(); e.yenile() } } }
        }
        grup { deger("Temel Ayarlara Sıfırla", "", AyarEkrani.MAVI) { favoriler = FAV_VARSAYILAN.toMutableList(); favKaydet(); e.yenile() } }
    }

    /** Sürüklenerek sıralanan liste (satır 44 dp) */
    private inner class SiraListe(val e: AyarEkrani) : LinearLayout(this@KameraActivity) {
        init {
            orientation = VERTICAL
            favoriler.forEach { a -> addView(satir(a), LayoutParams(-1, dp(44f))) }
        }
        private fun satir(a: String): View = LinearLayout(context).apply {
            orientation = HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; tag = a; setPadding(dp(14f), 0, dp(6f), 0); setBackgroundColor(Color.rgb(28, 28, 30))
            addView(etiket("−", 15f).apply { typeface = kosulKalin; background = daire(false, Color.rgb(255, 69, 58)); contentDescription = "Kaldır ${favAd(a)}"
                setOnClickListener { favoriler.remove(a); favKaydet(); e.yenile() } }, LayoutParams(dp(22f), dp(22f)).apply { marginEnd = dp(12f) })
            addView(TextView(context).apply { text = favAd(a); textSize = 16f; setTextColor(Color.WHITE) }, LayoutParams(0, -2, 1f))
            val tut = etiket("≡", 22f, AyarEkrani.IKINCIL).apply { contentDescription = "Sırala" }
            addView(tut, LayoutParams(dp(44f), -1))
            var basY = 0f
            @Suppress("ClickableViewAccessibility")
            tut.setOnTouchListener { _, ev ->
                val s = this
                when (ev.actionMasked) {
                    MotionEvent.ACTION_DOWN -> { basY = ev.rawY; s.parent.requestDisallowInterceptTouchEvent(true); s.elevation = dp(4f).toFloat() }
                    MotionEvent.ACTION_MOVE -> {
                        val i = indexOfChild(s); val h = s.height.toFloat()
                        val dy = ev.rawY - basY
                        if (dy > h / 2 && i < childCount - 1) { val n = getChildAt(i + 1); removeView(n); addView(n, i); java.util.Collections.swap(favoriler, i, i + 1); basY += h }
                        else if (dy < -h / 2 && i > 0) { val n = getChildAt(i - 1); removeView(n); addView(n, i); java.util.Collections.swap(favoriler, i, i - 1); basY -= h }
                        s.translationY = ev.rawY - basY
                    }
                    MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> { s.translationY = 0f; s.elevation = 0f; favKaydet() }
                }
                true
            }
        }
    }

    /* ================= Ekrandaki menü grupları (iPhone'daki AnaEkran `Grup` ile aynı) ================= */
    /** "⋯" tek dokunuşla son açılan grubu açar; panelin altındaki şeritten diğerlerine geçilir */
    enum class Grup(val ad: String, val simge: Int) {
        KAYIT("Kayıt", R.drawable.ic_video), POZLAMA("Pozlama", R.drawable.ic_pozlama), RENK("Renk", R.drawable.ic_renk),
        SES("Ses", R.drawable.ic_ses), GOSTERGE("Göstergeler", R.drawable.ic_olcum)
    }
    private var sonGrup = Grup.POZLAMA
    /** Açık grup (panel yeniden çizilirken aynı grup açılsın) ve grup kurulurken içine eklenen kap */
    private var aktifGrup: Grup? = null
    private var grupIci: LinearLayout? = null
    private var renkSekme = 0

    private class Oge(val simge: Int?, val harf: String?, val ad: String, val deger: String, val etkin: Boolean, val is_: () -> Unit)

    /** Yuvarlak düğme ızgarası (4 sütun, etkin olan sarı halkalı) */
    private fun izgara(p: LinearLayout, l: List<Oge>) {
        l.chunked(4).forEach { sira ->
            val s = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            sira.forEach { o ->
                val h = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL; contentDescription = o.ad; setOnClickListener { o.is_() }; setPadding(0, dp(6f), 0, dp(8f)) }
                val renk = if (o.etkin) VURGU else Color.WHITE
                val dai: View = if (o.simge != null) ImageView(this).apply { setImageResource(o.simge); setColorFilter(renk); scaleType = ImageView.ScaleType.FIT_CENTER; setPadding(dp(13f), dp(13f), dp(13f), dp(13f)) }
                    else etiket(o.harf ?: "", 12f, renk).apply { typeface = kosulKalin }
                dai.background = daire(o.etkin, DOLGU); dai.rotation = -fizikselYon.toFloat()
                h.addView(dai, LinearLayout.LayoutParams(dp(46f), dp(46f)))
                h.addView(etiket(o.ad, 10.5f).apply { setPadding(0, dp(6f), 0, 0) })
                h.addView(etiket(o.deger, 9.5f, if (o.etkin) VURGU else METIN2))
                s.addView(h, LinearLayout.LayoutParams(0, -2, 1f))
            }
            repeat(4 - sira.size) { s.addView(View(this), LinearLayout.LayoutParams(0, 1, 1f)) }
            p.addView(s)
        }
    }

    /** Başlıklı seçenek kapsülleri satırı (KODEK, RENK, GİRİŞ…); seçili sarı, olmayan soluk */
    /** Seçenek çipleri; seçilemeyen çip soluk görünür, dokununca `neden`deki açıklama çıkar */
    private fun cipSatiri(p: LinearLayout, ad: String, l: List<Triple<String, Boolean, (() -> Unit)?>>, neden: Map<String, String> = emptyMap()) {
        val s = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(dp(6f), dp(4f), 0, dp(4f)) }
        s.addView(bolumBasligi(ad), LinearLayout.LayoutParams(dp(84f), -2))
        val sira = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        l.forEach { (yazi, secili, is_) -> sira.addView(etiket(yazi, 13f, secenekYazi(secili)).apply {
            setPadding(dp(12f), 0, dp(12f), 0); alpha = if (is_ == null && !secili) 0.35f else 1f
            background = secenek(secili)
            if (is_ != null) setOnClickListener { is_() } else neden[yazi]?.let { m -> setOnClickListener { tost(m) } } },
            LinearLayout.LayoutParams(-2, dp(32f)).apply { marginEnd = dp(6f) }) }
        s.addView(HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false; addView(sira) }, LinearLayout.LayoutParams(0, -2, 1f))
        p.addView(s)
    }

    /** Bölümlü seçim (Apple segmented control) */
    private fun bolumlu(p: LinearLayout, l: List<String>, secili: Int, sec: (Int) -> Unit) {
        val kap = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setPadding(dp(2f), dp(2f), dp(2f), dp(2f)); background = Tema.kapsul(DOLGU, dp(10f).toFloat()) }
        l.forEachIndexed { i, o -> kap.addView(etiket(o, 13f, if (i == secili) Color.WHITE else METIN2).apply { if (i == secili) background = Tema.kapsul(SECILI, dp(8f).toFloat()); setOnClickListener { sec(i) } },
            LinearLayout.LayoutParams(0, dp(30f), 1f)) }
        p.addView(kap, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(4f); bottomMargin = dp(8f) })
    }

    private fun grupSeridi(secili: Grup): View {
        val s = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setPadding(dp(4f), dp(4f), dp(4f), dp(4f)); background = Tema.kapsul(DOLGU) }
        Grup.values().forEach { g ->
            val ic = if (g == secili) Color.WHITE else METIN2
            s.addView(LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; contentDescription = g.ad
                if (g == secili) background = Tema.kapsul(SECILI)
                setOnClickListener { grupAc(g) }
                addView(ImageView(this@KameraActivity).apply { setImageResource(g.simge); setColorFilter(ic); scaleType = ImageView.ScaleType.FIT_CENTER }, LinearLayout.LayoutParams(dp(17f), dp(17f)))
                addView(etiket(g.ad, 9.5f, ic).apply { setPadding(0, dp(2f), 0, 0) })
            }, LinearLayout.LayoutParams(0, dp(44f), 1f))
        }
        return s
    }

    private fun grupAc(g: Grup) {
        sonGrup = g; tercih.edit().putString("sonGrup", g.name).apply()
        if (g == Grup.POZLAMA && mod == KMod.PRO) return proOzellestir()
        val k = kaynak
        val ic = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        grupIci = ic
        try {
            when (g) {
                Grup.KAYIT -> {
                    if (k != null) bicimAc()
                    if (k != null && mod == KMod.VIDEO) {
                        val kayitta = kayitSuruyor()
                        fun f(is_: () -> Unit): (() -> Unit)? = if (kayitta) null else ({ is_(); grupAc(Grup.KAYIT) })
                        cipSatiri(ic, "KODEK", listOf(Triple("HEVC", ayar.hevc || ayar.renk == 1, f { ayar.hevc = true; ayarKaydet() }),
                            Triple("H.264", !ayar.hevc && ayar.renk != 1, if (ayar.renk == 1) null else f { ayar.hevc = false; ayarKaydet() })),
                            mapOf("H.264" to "HDR yalnız HEVC ile kaydedilir. H.264 için önce RENK'ten SDR'yi seç."))
                        cipSatiri(ic, "RENK", listOf(Triple("SDR", ayar.renk != 1, f { ayar.renk = 0; ayarKaydet(); oturumuYenile() }),
                            Triple("HDR", ayar.renk == 1 && k.hdrVar, if (k.hdrVar) f { ayar.renk = 1; ayarKaydet(); oturumuYenile() } else null)),
                            mapOf("HDR" to "Bu telefonun kamerası 10 bit HDR (HLG) vermiyor."))
                        cipSatiri(ic, "SABİTLEME", listOf(0 to "Kapalı", 1 to "Standart", 2 to "Sinematik").map { (i, ad) ->
                            Triple(ad, ayar.sabit == i, if (i in k.sabitlemeler) f { ayar.sabit = i; ayarKaydet(); k.ayarDegisti() } else null) },
                            mapOf("Standart" to "Bu kamerada sabitleme yok.", "Sinematik" to "Bu kamerada sinematik sabitleme yok."))
                        val onVar = vlogOnId() != null
                        cipSatiri(ic, "VLOG", listOf(Triple("Kapalı", !vlog || !onVar, f { vlogSec(false) }), Triple("Ön + arka", vlog && onVar, if (onVar) f { vlogSec(true) } else null)),
                            mapOf("Ön + arka" to "Bu telefon ön ve arka kamerayı aynı anda açamıyor (Android 11 ve telefon desteği gerekir)."))
                    }
                    val l = ArrayList<Oge>()
                    if (mod != KMod.PRO) l.add(Oge(if (ayar.flas == 0) R.drawable.ic_flas_yok else R.drawable.ic_flas, null, "Flaş", listOf("Kapalı", "Oto", "Açık", "Fener")[ayar.flas.coerceIn(0, 3)], ayar.flas > 0) { flasDegistir(); grupAc(Grup.KAYIT) })
                    if (mod == KMod.FOTO || mod == KMod.PORTRE) l.add(Oge(R.drawable.ic_zaman, null, "Zamanlayıcı", if (zamanlayici == 0) "Kapalı" else "$zamanlayici sn", zamanlayici > 0) {
                        zamanlayici = when (zamanlayici) { 0 -> 3; 3 -> 10; else -> 0 }; tercih.edit().putInt("zamanlayici", zamanlayici).apply(); bilgiCiz(); grupAc(Grup.KAYIT) })
                    l.add(Oge(R.drawable.ic_ayar, null, "Ayarlar", "Tümü", false) { ayarlarAc() })
                    izgara(ic, l)
                }
                Grup.POZLAMA -> { if (k != null) { cetvelAc(Cetvel.POZ); cetvelAc(Cetvel.ODAK) } }
                Grup.RENK -> {
                    bolumlu(ic, listOf("Stiller", "Beyaz denge"), renkSekme) { renkSekme = it; grupAc(Grup.RENK) }
                    if (renkSekme == 0) stilPedi(ic) else if (k != null) cetvelAc(Cetvel.BD)
                }
                Grup.SES -> sesHizli(ic)
                Grup.GOSTERGE -> {
                    gostergeHizli(ic)
                    izgara(ic, listOf(
                        Oge(R.drawable.ic_kilavuz, null, "Kılavuz", if (kompTur == KompTur.KAPALI) "Kapalı" else kompTur.ad, kompTur != KompTur.KAPALI) { acilirKapat(); kilavuzMenu() },
                        Oge(R.drawable.ic_yardimci, null, "AI Kadraj", if (asistanAcik) "Açık" else "Kapalı", asistanAcik) { asistanAcik = !asistanAcik; kompUygula(); grupAc(Grup.GOSTERGE) },
                        Oge(R.drawable.ic_terazi, null, "Terazi", if (teraziAcik) "Açık" else "Kapalı", teraziAcik) { teraziAcik = !teraziAcik; kompUygula(); grupAc(Grup.GOSTERGE) }))
                }
            }
        } finally { grupIci = null }
        if (k == null && ic.childCount == 0) ic.addView(TextView(this).apply { text = "Kamera hazır değil."; textSize = 13f; setTextColor(GRI); setPadding(dp(8f), dp(8f), 0, dp(8f)) })
        acilirAc(ic, ustTan = false, baslik = g.ad.uppercase(Locale("tr")), serit = grupSeridi(g)); altGizle(true)
        aktifGrup = g
    }

    /** Ses grubu: giriş ve biçim */
    private fun sesHizli(p: LinearLayout, yenile: () -> Unit = { grupAc(Grup.SES) }) {
        val girisler = sesGirisleri(this)
        val d = sesGirisi(this, ayar.sesGirdi); val simdi = d?.let { x -> girisler.firstOrNull { it.first == x.id } }
        p.addView(TextView(this).apply { text = simdi?.second ?: "Telefon mikrofonu"; textSize = 15f; typeface = kosul; setTextColor(Color.WHITE); setPadding(dp(6f), dp(4f), 0, dp(6f))
            Tema.simge(this, R.drawable.ic_ses, Color.WHITE) })
        val kayitta = kaynak?.kayitta == true
        cipSatiri(p, "GİRİŞ", listOf(Triple("Otomatik", ayar.sesGirdi == null, if (kayitta) null else ({ ayar.sesGirdi = null; ayarKaydet(); yenile() }))) +
            girisler.map { (id, ad, _) -> Triple(ad, ayar.sesGirdi == id, if (kayitta) null else ({ ayar.sesGirdi = id; ayarKaydet(); yenile() })) })
        cipSatiri(p, "BİÇİM", listOf(Triple("AAC", true, null), Triple("24 bit PCM", false, null), Triple("16 bit PCM", false, null)))
        p.addView(TextView(this).apply { text = "AAC · 48 kHz · 256 kbps. Android'in video kaydedicisi MP4'e sesi yalnız AAC yazar. Harici mikrofon takınca Otomatik'te kendiliğinden o seçilir."
            textSize = 12f; setTextColor(GRI); setPadding(dp(6f), dp(6f), 0, dp(4f)) })
    }

    /** Göstergeler grubu: görüntü araçları (yalnız ekranda) */
    private fun gostergeHizli(p: LinearLayout) {
        val m = monitor.ayarlar
        fun kaydet() { tercih.edit().putBoolean("g_peak", m.peaking).putBoolean("g_zebra", m.zebra).putFloat("g_zebraEsik", m.zebraEsik).putBoolean("g_fc", m.falseColor)
            .putBoolean("g_mono", m.monokrom).putBoolean("g_histo", histoAcik).apply(); monitor.requestRender(); kompUygula(); grupAc(Grup.GOSTERGE) }
        cipSatiri(p, "ARAÇLAR", listOf(Triple("False color", m.falseColor, { m.falseColor = !m.falseColor; kaydet() }), Triple("Zebra", m.zebra, { m.zebra = !m.zebra; kaydet() }),
            Triple("Odak vurgusu", m.peaking, { m.peaking = !m.peaking; kaydet() }), Triple("Histogram", histoAcik, { histoAcik = !histoAcik; kaydet() }), Triple("S-B", m.monokrom, { m.monokrom = !m.monokrom; kaydet() })))
        if (m.zebra) cipSatiri(p, "ZEBRA", listOf(Triple("%95 patlama", m.zebraEsik >= 0.8f, { m.zebraEsik = 0.95f; kaydet() }), Triple("%70 ten", m.zebraEsik < 0.8f, { m.zebraEsik = 0.70f; kaydet() })))
        val lutlar = lutKlasoru.listFiles { f -> f.name.endsWith(".cube", true) }?.sortedBy { it.name.lowercase() }.orEmpty()
        cipSatiri(p, "LUT", listOf(Triple("Kapalı", kullaniciLut == null, { lutUygula(null); grupAc(Grup.GOSTERGE) })) +
            lutlar.map { f -> Triple(f.name.removeSuffix(".cube"), kullaniciLutAdi == f.name, { lutUygula(f.name); grupAc(Grup.GOSTERGE) }) } +
            listOf(Triple("+ Ekle", false, { startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply { addCategory(Intent.CATEGORY_OPENABLE); type = "*/*" }, 7) })))
    }

    /* ================= Stiller (Stiller.kt): Renk grubu ================= */
    private var stil = Stil()
    /** Kullanıcının LUT'u (Göstergeler → LUT); stil bunun üstüne eklenir */
    private var kullaniciLut: Lut? = null; private var kullaniciLutAdi: String? = null
    /** Ekrandaki tek LUT (kullanıcı LUT'u + stil); null = renk değişmiyor */
    @Volatile private var renkLut: Lut? = null
    /** Kayda işlenen = ekrandaki (Fatih 29 Ekim: "Monitör değil burası"; stil ve LUT doğrudan çekime girer) */
    private val kayitLut: Lut? get() = renkLut

    private fun renkGuncelle() {
        val l = if (stil.etkin) stil.lut(kullaniciLut) else kullaniciLut
        renkLut = l
        if (l != null) monitor.lutYukle(l) else { monitor.ayarlar.lutAcik = false; monitor.requestRender() }
        kaynak?.jpegIsle = if (kayitLut != null) { b -> kayitLut?.let { StilGom.foto(b, it) } ?: b } else null
    }
    private fun stilKaydet() { tercih.edit().putString("stil", stil.json()).apply(); renkGuncelle() }

    private fun stilPedi(p: LinearLayout, yenile: () -> Unit = { grupAc(Grup.RENK) }) {
        // İki sıra (iPhone'daki gibi): TEMEL ve FİLM REÇETELERİ. Seçili kutuya tekrar dokununca Standart'a döner;
        // basılı tutunca açıklama ve "Seç ve üst şeride sabitle"
        fun hazirSirasi(baslik: String, liste: List<HazirStil>) {
            p.addView(bolumBasligi(baslik).apply { setPadding(0, 0, 0, dp(8f)) })
            val hazirlar = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            liste.forEach { h ->
                val secili = stil.hazir == h
                hazirlar.addView(LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL; contentDescription = h.ad
                    setOnClickListener { stil.hazir = if (secili && h != HazirStil.STANDART) HazirStil.STANDART else h; stilKaydet(); yenile() }
                    setOnLongClickListener {
                        performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS)
                        val b = AlertDialog.Builder(this@KameraActivity).setTitle(h.ad)
                        if (h.aciklama.isNotEmpty()) b.setMessage(h.aciklama)
                        b.setPositiveButton(if ("stil" in favoriler) "Seç" else "Seç ve üst şeride sabitle") { _, _ ->
                            stil.hazir = h; stilKaydet(); if ("stil" !in favoriler) favSabitle("stil"); yenile() }
                            .setNegativeButton("Vazgeç", null).show()
                        true }
                    addView(View(this@KameraActivity).apply { background = GradientDrawable(GradientDrawable.Orientation.TL_BR, h.renkler).apply { cornerRadius = dp(10f).toFloat(); if (secili) setStroke(dp(1.5f), VURGU) } },
                        LinearLayout.LayoutParams(dp(56f), dp(44f)))
                    addView(etiket(h.ad, 11f, if (secili) VURGU else Color.argb(217, 255, 255, 255)).apply { setPadding(0, dp(4f), 0, 0); maxLines = 2; gravity = Gravity.CENTER
                        setSingleLine(false); ellipsize = null }, LinearLayout.LayoutParams(-1, -2))
                }, LinearLayout.LayoutParams(dp(60f), -2).apply { marginEnd = dp(8f) })
            }
            p.addView(HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false; addView(hazirlar) }, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(12f) })
        }
        hazirSirasi("TEMEL", HazirStil.TEMEL)
        hazirSirasi("FİLM REÇETELERİ", HazirStil.RECETELER)
        lutSirasi(p, yenile)
        val sira = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        val solKap = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        solKap.addView(StilPad(), LinearLayout.LayoutParams(dp(140f), dp(140f)))
        solKap.addView(LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL
            listOf("soğuk", "ton ↕", "sıcak").forEachIndexed { i, t -> addView(TextView(this@KameraActivity).apply { text = t; textSize = 10f; setTextColor(Color.argb(153, 255, 255, 255))
                gravity = when (i) { 0 -> Gravity.START; 1 -> Gravity.CENTER; else -> Gravity.END } }, LinearLayout.LayoutParams(0, -2, 1f)) } }, LinearLayout.LayoutParams(dp(140f), -2).apply { topMargin = dp(4f) })
        sira.addView(solKap)
        val sag = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(14f), 0, 0, 0) }
        fun kaydirici(ad: String, en: Int, simdi: Int, yazi: (Int) -> String, degisti: (Int) -> Unit) {
            val bas = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            bas.addView(TextView(this).apply { text = ad; textSize = 11f; setTextColor(Color.argb(191, 255, 255, 255)) }, LinearLayout.LayoutParams(0, -2, 1f))
            val d = TextView(this).apply { text = yazi(simdi); textSize = 11f; typeface = mono; setTextColor(Color.argb(191, 255, 255, 255)) }
            bas.addView(d); sag.addView(bas)
            sag.addView(android.widget.SeekBar(this).apply {
                max = en; progress = simdi; setPadding(dp(4f), dp(6f), dp(4f), dp(6f))
                progressTintList = android.content.res.ColorStateList.valueOf(VURGU); thumbTintList = android.content.res.ColorStateList.valueOf(Color.WHITE)
                progressBackgroundTintList = android.content.res.ColorStateList.valueOf(Color.argb(90, 255, 255, 255))
                setOnSeekBarChangeListener(object : android.widget.SeekBar.OnSeekBarChangeListener {
                    override fun onProgressChanged(s: android.widget.SeekBar?, v: Int, k: Boolean) { if (k) { d.text = yazi(v); degisti(v); renkGuncelle() } }
                    override fun onStartTrackingTouch(s: android.widget.SeekBar?) {}
                    override fun onStopTrackingTouch(s: android.widget.SeekBar?) { stilKaydet() }
                }) }, LinearLayout.LayoutParams(-1, -2))
        }
        kaydirici("Yoğunluk", 100, (stil.yogunluk * 100).toInt(), { "$it" }) { stil.yogunluk = it / 100f }
        kaydirici("Doygunluk", 200, (stil.doygunluk * 100).toInt() + 100, { "%+d".format(it - 100) }) { stil.doygunluk = (it - 100) / 100f }
        sira.addView(sag, LinearLayout.LayoutParams(0, -2, 1f))
        p.addView(sira)
        p.addView(TextView(this).apply { textSize = 12f; setTextColor(GRI); setPadding(0, dp(8f), 0, 0)
            text = "Fotoğraf ve video bu renkle kaydedilir." + (if (ayar.renk == 1) " HDR videoya işlenmez (yalnız SDR)." else "") })
    }

    /** Dosya seçiciden dönünce açık Stiller panosu yenilensin */
    private var stilYenile: (() -> Unit)? = null

    /** Kendi LUT'ların (.cube): seçili olan stilin altına taban olarak girer; "+" dosya seçiciyi açar, basılı tutunca Sil */
    private fun lutSirasi(p: LinearLayout, yenile: () -> Unit) {
        stilYenile = yenile
        p.addView(bolumBasligi("LUT'LARIN").apply { setPadding(0, 0, 0, dp(8f)) })
        val sira = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        fun kutu(ad: String, secili: Boolean, zemin: android.graphics.drawable.Drawable, ic: View) = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL; contentDescription = ad
            addView(FrameLayout(this@KameraActivity).apply { background = zemin; addView(ic, FrameLayout.LayoutParams(-2, -2, Gravity.CENTER)) }, LinearLayout.LayoutParams(dp(56f), dp(44f)))
            addView(etiket(ad, 11f, if (secili) VURGU else Color.argb(217, 255, 255, 255)).apply { setPadding(0, dp(4f), 0, 0); ellipsize = android.text.TextUtils.TruncateAt.END }, LinearLayout.LayoutParams(-1, -2))
        }
        val lutlar = lutKlasoru.listFiles { f -> f.name.endsWith(".cube", true) }?.sortedBy { it.name.lowercase() }.orEmpty()
        lutlar.forEach { f ->
            val secili = kullaniciLutAdi == f.name
            sira.addView(kutu(f.name.removeSuffix(".cube"), secili,
                GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(Color.rgb(82, 82, 82), Color.rgb(31, 31, 31))).apply { cornerRadius = dp(10f).toFloat(); if (secili) setStroke(dp(1.5f), VURGU) },
                etiket("LUT", 10f, Color.argb(179, 255, 255, 255)).apply { letterSpacing = 0.1f; typeface = android.graphics.Typeface.DEFAULT_BOLD }).apply {
                setOnClickListener { lutUygula(if (secili) null else f.name); yenile() }
                setOnLongClickListener {
                    performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS)
                    AlertDialog.Builder(this@KameraActivity).setTitle(f.name.removeSuffix(".cube")).setMessage("Bu LUT kitaplıktan silinsin mi? (Monitör'le ortak)")
                        .setPositiveButton("Sil") { _, _ -> if (secili) lutUygula(null); f.delete(); yenile() }.setNegativeButton("Vazgeç", null).show()
                    true }
            }, LinearLayout.LayoutParams(dp(60f), -2).apply { marginEnd = dp(8f) })
        }
        sira.addView(kutu("Ekle", false, GradientDrawable().apply { cornerRadius = dp(10f).toFloat(); setColor(Color.argb(15, 255, 255, 255))
            setStroke(dp(1f), Color.argb(89, 255, 255, 255), dp(3f).toFloat(), dp(3f).toFloat()) },
            etiket("+", 18f, Color.argb(217, 255, 255, 255))).apply { contentDescription = "LUT ekle"; tag = "lutEkle"
            setOnClickListener { startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply { addCategory(Intent.CATEGORY_OPENABLE); type = "*/*" }, 7) } },
            LinearLayout.LayoutParams(dp(60f), -2))
        p.addView(HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false; addView(sira) }, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(12f) })
    }

    /** Stil pedi: dokun ya da sürükle (x soğuk ↔ sıcak, y ton); çift dokunuş ortaya döner */
    private inner class StilPad : View(this@KameraActivity) {
        private val boya = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG)
        private var sonDokunus = 0L
        override fun onDraw(c: android.graphics.Canvas) {
            val w = width.toFloat(); val h = height.toFloat(); val r = dp(16f).toFloat(); val alan = RectF(0f, 0f, w, h)
            boya.style = android.graphics.Paint.Style.FILL
            boya.shader = android.graphics.LinearGradient(0f, 0f, 0f, h, intArrayOf(Color.rgb(217, 217, 217), Color.rgb(102, 102, 102), Color.rgb(18, 18, 18)), null, android.graphics.Shader.TileMode.CLAMP)
            c.drawRoundRect(alan, r, r, boya)
            boya.shader = android.graphics.LinearGradient(0f, 0f, w, 0f, intArrayOf(Color.argb(140, 77, 148, 255), Color.TRANSPARENT, Color.argb(153, 255, 148, 61)), null, android.graphics.Shader.TileMode.CLAMP)
            c.drawRoundRect(alan, r, r, boya)
            boya.shader = null; boya.color = Color.argb(64, 255, 255, 255); boya.strokeWidth = 1f
            c.drawLine(w / 2, 0f, w / 2, h, boya); c.drawLine(0f, h / 2, w, h / 2, boya)
            val x = (stil.x + 1) / 2 * w; val y = (1 - stil.y) / 2 * h
            boya.setShadowLayer(dp(3f).toFloat(), 0f, 0f, Color.argb(153, 0, 0, 0)); boya.color = VURGU; c.drawCircle(x, y, dp(10f).toFloat(), boya); boya.clearShadowLayer()
            boya.style = android.graphics.Paint.Style.STROKE; boya.strokeWidth = dp(2.5f).toFloat(); boya.color = Color.WHITE; c.drawCircle(x, y, dp(10f).toFloat(), boya)
        }
        @android.annotation.SuppressLint("ClickableViewAccessibility")
        override fun onTouchEvent(e: MotionEvent): Boolean {
            parent?.requestDisallowInterceptTouchEvent(true)
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> { val s = System.currentTimeMillis(); if (s - sonDokunus < 300) { stil.x = 0f; stil.y = 0f; invalidate(); stilKaydet(); sonDokunus = 0; return true }; sonDokunus = s; konum(e) }
                MotionEvent.ACTION_MOVE -> konum(e)
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> stilKaydet()
            }
            return true
        }
        private fun konum(e: MotionEvent) {
            stil.x = (e.x / width * 2 - 1).coerceIn(-1f, 1f); stil.y = (1 - e.y / height * 2).coerceIn(-1f, 1f)
            invalidate(); renkGuncelle()
        }
    }

    /* ================= AI Kadraj (iPhone'daki Kamera.aiDusun) ================= */
    /** Düşünürken aday öneri ve sahne: aynı aday ~6 sn sürünce tek öneri olarak gösterilir (Fatih 29 Ekim: "saniyede 1 fikirle gelmesin") */
    private var aiAday: Triple<KompTur, Int, Long>? = null
    private var sahneAday: Pair<Sahne, Long>? = null
    private val AI_BEKLEME = 6000L

    /** Aynı kompozisyon önerisi ~6 sn sürünce tek çip "Kadraj: Üçte bir" (dokununca uygulanır); kadraj zaten iyiyse öneri kalkar.
     *  Konu ya da çizgi yokken kılavuz kapalıysa üçte bir önerilir. Düşünürken küçük "AI Kadraj inceliyor". */
    private fun aiDusun() {
        if (!asistanAcik || kayitSuruyor() || mod == KMod.PRO) { aiAday = null; sonOneri = null; oneriCip.visibility = View.GONE; return }
        val o = kompozisyonOner(komp.konu, kompTur, komp.goruntuOrani(), komp.analiz) ?: (if (kompTur == KompTur.KAPALI) KompTur.UCTE_BIR to 0 else null)
        if (o != null && komp.hizalama <= 0.85f && (o.first != kompTur || o.second != kompYon)) {
            val a = aiAday
            if (a != null && a.first == o.first && a.second == o.second) {
                if (System.currentTimeMillis() - a.third >= AI_BEKLEME) sonOneri = o
            } else aiAday = Triple(o.first, o.second, System.currentTimeMillis())
        } else {
            aiAday = null
            if (komp.hizalama > 0.85f || o == null) sonOneri = null
        }
        val g = sonOneri
        when {
            g != null -> { oneriCip.text = "Kadraj: ${g.first.ad}"; oneriCip.alpha = 1f; oneriCip.isClickable = true; oneriCip.visibility = View.VISIBLE }
            aiAday != null -> { oneriCip.text = "AI Kadraj inceliyor"; oneriCip.alpha = 0.6f; oneriCip.isClickable = false; oneriCip.visibility = View.VISIBLE }
            else -> oneriCip.visibility = View.GONE
        }
    }

    /** ⋯ Kontroller: Apple Kamera'daki gibi yuvarlak düğme ızgarası (etkin olan sarı halkalı); eski araç şeridi, PRO, "?" ve Ayarlar burada */
    private fun kontrollerAc() {
        val k = kaynak; val evAdim = k?.yetenek?.evAdim?.takeIf { it > 0 } ?: 1f
        val p = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(0, dp(4f), 0, 0) }
        val l = ArrayList<Oge>()
        if (mod != KMod.PRO) l.add(Oge(if (ayar.flas == 0) R.drawable.ic_flas_yok else R.drawable.ic_flas, null, "Flaş", listOf("Kapalı", "Oto", "Açık", "Fener")[ayar.flas.coerceIn(0, 3)], ayar.flas > 0) { flasDegistir(); kontrollerAc() })
        if (mod == KMod.FOTO || mod == KMod.PORTRE) l.add(Oge(R.drawable.ic_zaman, null, "Zamanlayıcı", if (zamanlayici == 0) "Kapalı" else "$zamanlayici sn", zamanlayici > 0) {
            zamanlayici = when (zamanlayici) { 0 -> 3; 3 -> 10; else -> 0 }; tercih.edit().putInt("zamanlayici", zamanlayici).apply(); bilgiCiz(); kontrollerAc() })
        l.add(Oge(R.drawable.ic_pozlama, null, "Pozlama", when { bulb -> "BULB"; ayar.pozlamaNs != null -> enstGoster(ayar.pozlamaNs!!); ayar.ev != 0 -> evYazi(ayar.ev, evAdim); else -> "Oto" },
            ayar.ev != 0 || ayar.pozlamaNs != null) { cetvelAc(Cetvel.POZ) })
        l.add(Oge(R.drawable.ic_beyaz, null, "Beyaz denge", ayar.kelvin?.let { "${it}K" } ?: BD_ADLARI[ayar.awb] ?: "Oto", ayar.kelvin != null || ayar.awb != CameraMetadata.CONTROL_AWB_MODE_AUTO) { cetvelAc(Cetvel.BD) })
        l.add(Oge(R.drawable.ic_odak, null, "Odak", if (ayar.odakMesafe == null) "Oto" else "MF", ayar.odakMesafe != null) { cetvelAc(Cetvel.ODAK) })
        l.add(Oge(R.drawable.ic_kilavuz, null, "Kılavuz", if (kompTur == KompTur.KAPALI) "Kapalı" else kompTur.ad, kompTur != KompTur.KAPALI) { acilirKapat(); kilavuzMenu() })
        l.add(Oge(R.drawable.ic_yardimci, null, "AI Kadraj", if (asistanAcik) "Açık" else "Kapalı", asistanAcik) { asistanAcik = !asistanAcik; kompUygula(); kontrollerAc() })
        l.add(Oge(R.drawable.ic_terazi, null, "Terazi", if (teraziAcik) "Açık" else "Kapalı", teraziAcik) { teraziAcik = !teraziAcik; kompUygula(); kontrollerAc() })
        l.add(Oge(R.drawable.ic_foto, null, "Biçim", bilgiCip.text.split(" · ").first(), false) { bicimAc() })
        l.add(Oge(null, "PRO", "Elle ayar", "Ekran", false) { acilirKapat(); proyaGec() })
        val g = monitor.ayarlar; val gAcik = g.falseColor || g.zebra || g.peaking || g.monokrom || kullaniciLut != null || histoAcik
        l.add(Oge(R.drawable.ic_olcum, null, "Göstergeler", if (kullaniciLut != null) "LUT" else if (gAcik) "Açık" else "Kapalı", gAcik) { acilirKapat(); ayarlarAc(); ayarEkrani?.let { e -> e.git("Göstergeler") { gostergeSayfasi() } } })
        l.add(Oge(R.drawable.ic_ayar, null, "Ayarlar", "Tümü", false) { ayarlarAc() })
        izgara(p, l)
        acilirAc(p, ustTan = false, baslik = "KONTROLLER"); altGizle(true)
    }

    /** ⋯ simgesi: 3×2 nokta */
    private inner class Noktalar : View(this@KameraActivity) {
        private val boya = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG)
        var renk = Color.WHITE; set(v) { field = v; invalidate() }
        override fun onDraw(c: android.graphics.Canvas) {
            boya.color = renk; val r = dp(2.1f).toFloat(); val ara = dp(6.5f).toFloat()
            for (i in -1..1) for (j in 0..1) c.drawCircle(width / 2f + i * ara, height / 2f + (j - 0.5f) * ara, r, boya)
        }
    }

    /** ⋯ düğmesi: bir değer elle değişmişse sarı halka */
    private fun kontrolCiz() {
        if (!this::kontrolDugme.isInitialized) return
        val degisik = ayar.ev != 0 || ayar.pozlamaNs != null || ayar.iso != null || ayar.awb != CameraMetadata.CONTROL_AWB_MODE_AUTO || ayar.kelvin != null || ayar.odakMesafe != null ||
            kompTur != KompTur.KAPALI || asistanAcik || teraziAcik
        kontrolDugme.background = daire(degisik)
        (kontrolDugme.getChildAt(0) as? Noktalar)?.renk = if (degisik) VURGU else Color.WHITE
    }

    /* ================= çekim ================= */
    private fun deklansorBasildi() {
        acilirKapat()
        val k = kaynak ?: return tost("Kamera hazır değil.")
        if (mod == KMod.TIMELAPSE) return timelapseDugmesi(k)
        if (!mod.foto) return videoDugmesi(k)
        if (monitor.birlestiriyor) { birlestirmeIstegi?.takeIf { bulb && mod == KMod.FOTO }?.let { it.bitir = true } ?: monitor.birlestirmeIptal(); return }
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
            val e = a.enstNs; if (a.iso != null && e != null && e >= 1_000_000_000L) uzunNs = e
        }
        if (mod == KMod.FOTO) {
            val p = ayar.pozlamaNs
            if (p == null) bulb = false
            // Telefonun tek karede veremediği süre ya da BULB: önizleme kareleri birleştirilir
            if (bulb || (p != null && p > (k.yetenek.pozlamaAralik?.upper ?: Long.MAX_VALUE)))
                return birlestirCek(if (uzunYol == "max") Sahne.Birlestir.MAX else Sahne.Birlestir.ORT, 0, if (bulb) Long.MAX_VALUE else p!! / 1_000_000L,
                    if (bulb) "BULB" else "Uzun pozlama", toplam = uzunYol == "top" || (bulb && uzunYol == "ort"))
            if (p != null && p >= 1_000_000_000L) uzunNs = p
        }
        deklansorDugme.basili = true; deklansorDugme.performHapticFeedback(android.view.HapticFeedbackConstants.VIRTUAL_KEY)
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

    private fun birlestirCek(tur: Sahne.Birlestir, n: Int, sureMs: Long, adSahne: String, toplam: Boolean = false) {
        deklansorDugme.basili = true
        if (deklansorSesi) runCatching { deklansor.play(android.media.MediaActionSound.START_VIDEO_RECORDING) }
        ortaYazi.textSize = 34f; ortaYazi.text = "0%"; ortaYazi.visibility = View.VISIBLE
        val yon = fizikselYon
        // Uzun birleştirmede (yıldız izi dakikalarca) ekran kapanmasın
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val bas = System.currentTimeMillis()
        val istek = MonitorGorunum.BirlestirmeIstegi(tur, n, sureMs, 1f, { o ->
            ortaYazi.text = if (sureMs == Long.MAX_VALUE) "$adSahne  ${(System.currentTimeMillis() - bas) / 1000} sn" else "$adSahne  ${(o * 100).toInt()}%" }) { bmp ->
            ortaYazi.visibility = View.GONE; deklansorDugme.basili = false; birlestirmeIstegi = null
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
        }
        istek.toplam = toplam
        birlestirmeIstegi = istek
        monitor.birlestir(istek)
    }

    private fun videoDugmesi(k: KameraKaynak) {
        lutKaydedici?.let { y -> lutKayitBitir(y); return }
        if (k.kayitta) {
            vlogDurdur(kayitUri)
            k.kayitDurdur { ok -> runOnUiThread {
                val l = kayitLut
                kayitUri?.let { u ->
                    fun bitir() { contentResolver.update(u, ContentValues().apply { put(MediaStore.Video.Media.IS_PENDING, 0) }, null, null); if (ok) { sonUri = u; sonMime = "video/mp4"; kucukResim(u) } else contentResolver.delete(u, null, null) }
                    // Stil kayıttan sonra videoya işlenir (HDR'de değil; LUT SDR için); ön plan hizmetinde, ekrandan çıkılsa da biter
                    if (ok && l != null && ayar.renk != 1) { tost("Stil videoya işleniyor; ekrandan çıkabilirsin, bildirimde ilerler.")
                        VideoIsleme.ekle(applicationContext, VideoIsleme.Is(u, l, ayar.hevc))
                    } else bitir()
                }
                kayitUri = null; deklansorDugme.kayitta = false; kayitCip.visibility = View.GONE; bilgiCiz()
                if (!ok) tost("Kayıt kaydedilemedi (çok kısa olabilir).")
                vlogParca(ok)
            } }
            return
        }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) { requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 2); return }
        k.ekranYonu = (360 - fizikselYon) % 360
        val ad = "UPDATED_${SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())}.mp4"; kayitKok = ad.removeSuffix(".mp4")
        val d = ContentValues().apply { put(MediaStore.Video.Media.DISPLAY_NAME, ad); put(MediaStore.Video.Media.MIME_TYPE, "video/mp4"); put(MediaStore.Video.Media.RELATIVE_PATH, "Movies/UPDATED Kamera"); put(MediaStore.Video.Media.IS_PENDING, 1) }
        val uri = contentResolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, d) ?: return tost("Kayıt dosyası açılamadı.")
        val fd = contentResolver.openFileDescriptor(uri, "w") ?: return tost("Kayıt dosyası açılamadı.")
        kayitUri = uri
        val b = k.secilenBoyut(); val fps = ayar.fps?.upper ?: 30
        val mbps = when { b.height >= 2160 -> 50; b.height >= 1080 -> if (fps > 30) 30 else 20; else -> 12 }
        // Stil/LUT varsa (HDR değil, Wi-Fi kamera değil) çekerken uygulanır: kayıttan sonra işleme beklemesi olmaz
        if (kayitLut != null && ayar.renk != 1 && verici == null && !vlogAcik) {
            val (w, h) = monitor.kayitBoyutu()
            val y = runCatching { Kaydedici(this, fd, w, h, fps, mbps, ayar.hevc, sesIste = true, yon = fizikselYon).also { it.baslat() } }
                .getOrElse { e -> HataKaydi.not("kayit", e.stackTraceToString()); null }
            if (y != null) {
                lutKaydedici = y; monitor.kayitLutlu = true; monitor.kayitYuzeyi = y.yuzey; monitor.yenile()
                if (deklansorSesi) runCatching { deklansor.play(android.media.MediaActionSound.START_VIDEO_RECORDING) }
                kayitBas = System.currentTimeMillis(); deklansorDugme.kayitta = true; kayitCip.text = zamanKodu(0); kayitCip.visibility = View.VISIBLE; bilgiSira.visibility = View.INVISIBLE; favSira.visibility = View.INVISIBLE; oneriCip.visibility = View.GONE
                return
            }
            // GPU kaydı açılamadı: kamera kaydı + kayıttan sonra işleme
            runCatching { fd.close() }
            val fd2 = contentResolver.openFileDescriptor(uri, "w") ?: return tost("Kayıt dosyası açılamadı.")
            return normalKayit(k, uri, fd2, mbps)
        }
        normalKayit(k, uri, fd, mbps)
    }

    private fun lutKayitBitir(y: Kaydedici) {
        lutKaydedici = null; monitor.kayitLutlu = false; monitor.kayitYuzeyi = verici?.yuzey; monitor.yenile()
        val u = kayitUri; kayitUri = null; deklansorDugme.kayitta = false; kayitCip.visibility = View.GONE; bilgiCiz()
        if (deklansorSesi) runCatching { deklansor.play(android.media.MediaActionSound.STOP_VIDEO_RECORDING) }
        Thread {
            Thread.sleep(150)
            val ok = runCatching { y.bitir() }.getOrDefault(false)
            runOnUiThread {
                if (u == null) return@runOnUiThread
                if (ok) { contentResolver.update(u, ContentValues().apply { put(MediaStore.Video.Media.IS_PENDING, 0) }, null, null); sonUri = u; sonMime = "video/mp4"; kucukResim(u) }
                else { contentResolver.delete(u, null, null); tost("Kayıt kaydedilemedi (çok kısa olabilir).") }
            }
        }.start()
    }

    private fun normalKayit(k: KameraKaynak, uri: Uri, fd: android.os.ParcelFileDescriptor, mbps: Int) {
        k.kayitBasla(fd, ayar.hevc, mbps, true) { hata -> runOnUiThread {
            if (hata != null) { tost("Kayıt başlamadı: $hata"); contentResolver.delete(uri, null, null); kayitUri = null; return@runOnUiThread }
            kayitBas = System.currentTimeMillis(); deklansorDugme.kayitta = true; kayitCip.text = zamanKodu(0); kayitCip.visibility = View.VISIBLE; bilgiSira.visibility = View.INVISIBLE; favSira.visibility = View.INVISIBLE; oneriCip.visibility = View.GONE
            if (vlogAcik) onKayitBasla(mbps)
        } }
    }

    /**
     * Timelapse: ekrandaki görüntü her `tlAralik`'ta bir kodlayıcıya çizilir (MonitorGorunum.kayitAraligiNs), video 30 fps oynar, ses yok.
     * Pozlama isteğe göre başta kilitlenir; ekran açık kalır; süre sınırı varsa kendiliğinden biter.
     */
    private fun timelapseDugmesi(k: KameraKaynak) {
        tlKaydedici?.let { y -> timelapseBitir(y); return }
        if (verici != null) return tost("Wi-Fi kamera açıkken timelapse çekilmez (Ayarlar → Wi-Fi kamera ol).")
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
        kayitCip.text = Timelapse.saat(0); kayitCip.visibility = View.VISIBLE; bilgiSira.visibility = View.INVISIBLE; favSira.visibility = View.INVISIBLE; oneriCip.visibility = View.GONE
    }

    private fun timelapseBitir(y: Kaydedici) {
        tlKaydedici = null; monitor.kayitYuzeyi = verici?.yuzey; monitor.kayitAraligiNs = 0L; monitor.yenile()
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
        if (!sahneOto || !asistanAcik || mod != KMod.FOTO || kayitSuruyor()) { sahneCip.visibility = View.GONE; sahneAday = null; return }
        val k = kaynak ?: return
        val otoPoz = ayar.iso == null && ayar.pozlamaNs == null && k.sonIso > 0 && k.sonPozNs > 0
        val r = renkOrt
        val yuz = asistanAcik && komp.konuAdi == "Yüz" && (komp.konu?.let { it.width() * it.height() } ?: 0f) > 0.05f
        val o = sahneOner(SahneOlcum(if (otoPoz) k.sonIso * k.sonPozNs / 1e9f else null, yercekimZ < -5f, 0.2126f * r[0] + 0.7152f * r[1] + 0.0722f * r[2], if (r[2] > 0.01f) r[0] / r[2] else 1f, yuz))
        // Sahne de birkaç saniye aynı kalınca önerilir; gösterilen öneri yeni aday oturana kadar kalır
        if (o == null || o == k.sahne) { sahneAday = null; sahneOnerisi = null; sahneCip.visibility = View.GONE; return }
        val a = sahneAday
        if (a != null && a.first == o) { if (System.currentTimeMillis() - a.second >= AI_BEKLEME) sahneOnerisi = o } else sahneAday = o to System.currentTimeMillis()
        val g = sahneOnerisi
        if (g == null || g == k.sahne) sahneCip.visibility = View.GONE else { sahneCip.text = "Sahne: ${g.ad}"; sahneCip.visibility = View.VISIBLE }
    }
    private fun sahneUygula() {
        val o = sahneOnerisi ?: return
        when (o) { Sahne.GECE -> proSec(ProMod.GECE_SEHIR); Sahne.SAMANYOLU -> proSec(ProMod.SAMANYOLU); Sahne.PORTRE -> modSec(KMod.PORTRE); else -> { kaynak?.sahne = o; kaynak?.ayarDegisti(); tost("${o.ad} ayarları uygulandı") } }
    }

    /* ================= döngü ================= */
    private var sonSaniye = -1L
    private fun tik() {
        val k = kaynak
        if (k?.kayitta == true || lutKaydedici != null) { val ms = System.currentTimeMillis() - kayitBas; kayitCip.text = zamanKodu(ms) }
        tlKaydedici?.let { y ->
            // Timelapse: geçen süre · çıkacak video süresi; süre sınırı dolunca biter
            val ms = System.currentTimeMillis() - kayitBas
            kayitCip.text = "${Timelapse.saat(ms)}  →  ${Timelapse.saat(Timelapse.videoMs(monitor.kayitKareSayisi))}"
            if (tlSure > 0 && ms >= tlSure * 60_000L) timelapseBitir(y)
        }
        val sn = System.currentTimeMillis() / 1000
        if (sn != sonSaniye) { sonSaniye = sn; sahneDenetle() }
    }

    /* ================= yön: ikonlar döner, düzen sabit ================= */
    /** Yalnız ekran testi: telefon yan tutulmuş gibi ikonlar hemen döner */
    fun testYon(d: Int) { fizikselYon = d; donenler.forEach { it.rotation = -d.toFloat() } }

    /** Kayıt zaman kodu: ss:dd:ss:kare */
    private fun zamanKodu(ms: Long): String { val fps = ayar.fps?.upper ?: 30
        return "%02d:%02d:%02d:%02d".format(ms / 3_600_000, ms / 60_000 % 60, ms / 1000 % 60, (ms % 1000) * fps / 1000) }

    private fun yonUygula() {
        val hedef = -fizikselYon.toFloat()
        for (v in donenler) {
            var simdi = v.rotation % 360f; var fark = hedef - simdi
            while (fark > 180f) fark -= 360f; while (fark < -180f) fark += 360f
            v.animate().rotation(simdi + fark).setDuration(220).start()
        }
        kaynak?.ekranYonu = (360 - fizikselYon) % 360
        verici?.yon = fizikselYon
        bilgiCiz(); modlariCiz()
    }

    /* ================= PRO ve Monitör ================= */
    private fun proyaGec() {
        if (kayitSuruyor()) return tost("Önce kaydı durdur.")
        startActivity(Intent(this, MainActivity::class.java).putExtra("mod", "pro").putExtra("kamera", kamListe.getOrNull(kamIndex)?.first))
    }

    /**
     * Wi-Fi kamera: ekrandaki görüntü (en çok 1080p) H.264'e sıkıştırılıp masaya gider. Kodlayıcı boyutu açılışta sabitlenir;
     * sonradan oran değişirse (foto ↔ video) MonitorGorunum sığdırarak çizer.
     */
    private fun yayinAyarla() {
        val iste = wifiKamera && onde && tlKaydedici == null
        kaynak?.let { k -> if (onde && k.sdrZorla != wifiKamera) { k.sdrZorla = wifiKamera
            if (ayar.renk == 1 && k.hdrVar) { oturumuYenile(); if (wifiKamera) tost("Wi-Fi kamera açıkken HDR kapalı: Multi Cam'e SDR gider.") } } }
        if (!iste) { verici?.let { it.durdur(); verici = null; if (tlKaydedici == null) monitor.kayitYuzeyi = null }; tallyCerceve.visibility = View.GONE; masaCip.visibility = View.GONE; return }
        if (verici != null) return
        val (kw, kh) = monitor.kayitBoyutu()
        val olcek = minOf(1f, 1920f / maxOf(kw, kh)); val w = (kw * olcek).toInt() and 15.inv(); val h = (kh * olcek).toInt() and 15.inv()
        val ad = "UPDATED · ${android.os.Build.MODEL}"
        val v = runCatching { YayinVerici(this, ad, w, h, tally = { acik -> runOnUiThread { tallyCerceve.visibility = if (acik) View.VISIBLE else View.GONE } },
            durum = { d -> runOnUiThread { masaCip.text = d; masaCip.setTextColor(if (d == "Multi Cam'e bağlı") YESIL else GRI) } }).also { it.baslat() } }
            .getOrElse { e -> HataKaydi.not("yayin", e.stackTraceToString()); return tost("Wi-Fi kamera başlamadı: ${e.message}") }
        verici = v; v.yon = fizikselYon
        monitor.kayitYuzeyi = v.yuzey; monitor.yenile()
        masaCip.visibility = View.VISIBLE
    }

    /** Telefonun yerel ağ adresi (masada elle bağlanmak için) */
    private fun ipAdresi(): String? = runCatching {
        java.net.NetworkInterface.getNetworkInterfaces().toList().filter { it.isUp && !it.isLoopback }.flatMap { it.inetAddresses.toList() }
            .firstOrNull { it is java.net.Inet4Address && it.isSiteLocalAddress }?.hostAddress
    }.getOrNull()



    /* ================= ayarların saklanması ================= */
    private fun ayarlariOku() {
        // 0.11'e kadar ayrı olan Gece / Işık izi / Samanyolu modları artık PRO MODLAR'ın içinde
        val eski = mapOf("GECE" to ProMod.GECE_SEHIR, "ISIK_IZI" to ProMod.ARAC_IZI, "SAMANYOLU" to ProMod.SAMANYOLU)[tercih.getString("mod", null)]
        if (eski != null) tercih.edit().putString("mod", KMod.PRO.name).putString("proMod", eski.name).apply()
        mod = runCatching { KMod.valueOf(tercih.getString("mod", "FOTO")!!) }.getOrDefault(KMod.FOTO)
        kamIndex = tercih.getInt("kamIndex", 0)
        kompTur = runCatching { KompTur.valueOf(tercih.getString("komp", "KAPALI")!!) }.getOrDefault(KompTur.KAPALI); kompYon = tercih.getInt("kompYon", 0)
        // 0.14'ten önceki "otomatik kompozisyon" kılavuzu kendisi seçip kaydediyordu; Fatih: "her modda oto çıkmasın" → o kalıntı bir kez kapatılır
        if (!tercih.contains("k.kompTemiz")) { if (tercih.getBoolean("kompOto", true)) kompTur = KompTur.KAPALI
            tercih.edit().putBoolean("k.kompTemiz", true).remove("kompOto").putString("komp", kompTur.name).apply() }
        sonKomp = runCatching { KompTur.valueOf(tercih.getString("sonKomp", "SPIRAL")!!) }.getOrDefault(KompTur.SPIRAL)
        asistanAcik = tercih.getBoolean("k.aiKadraj", false); teraziAcik = tercih.getBoolean("terazi", false); sahneOto = tercih.getBoolean("sahneOto", true)
        wifiKamera = tercih.getBoolean("wifiKamera", false)
        proMod = runCatching { ProMod.valueOf(tercih.getString("proMod", "SAMANYOLU")!!) }.getOrDefault(ProMod.SAMANYOLU)
        uzunYol = tercih.getString("uzunYol", "ort") ?: "ort"
        zamanlayici = tercih.getInt("zamanlayici", 0); deklansorSesi = tercih.getBoolean("deklansor", true)
        vlog = tercih.getBoolean("vlog", false)
        tlAralik = tercih.getLong("tlAralik", 2000L); tlSure = tercih.getInt("tlSure", 0); tlPozSabit = tercih.getBoolean("tlPozSabit", true)
        enstAci = tercih.getBoolean("enstAci", false)
                sonGrup = runCatching { Grup.valueOf(tercih.getString("sonGrup", "POZLAMA")!!) }.getOrDefault(Grup.POZLAMA)
    }
    private fun ayarOku(id: String): KameraAyari {
        val j = runCatching { JSONObject(tercih.getString("kam_$id", "{}")!!) }.getOrNull() ?: return KameraAyari()
        return KameraAyari(boyut = if (j.has("vw")) Size(j.getInt("vw"), j.getInt("vh")) else null, fps = if (j.has("fps")) Range(j.getInt("fps"), j.getInt("fps")) else null,
            fotoBoyut = if (j.has("fw")) Size(j.getInt("fw"), j.getInt("fh")) else null, raw = j.optBoolean("raw"), flas = j.optInt("flas"),
            hevc = j.optBoolean("hevc"), renk = j.optInt("renk"), sabit = j.optInt("sabit", 1), kelvin = if (j.has("kelvin")) j.getInt("kelvin") else null, ton = j.optInt("ton").coerceIn(-50, 50),
            sesGirdi = if (j.has("sesGirdi")) j.getInt("sesGirdi") else null, diyafram = if (j.has("diyafram")) j.getDouble("diyafram").toFloat() else null)
    }
    private fun ayarKaydet() {
        val id = kamListe.getOrNull(kamIndex)?.first ?: return
        tercih.edit().putString("kam_$id", JSONObject().apply {
            ayar.boyut?.let { put("vw", it.width); put("vh", it.height) }; ayar.fps?.let { put("fps", it.upper) }
            ayar.fotoBoyut?.let { put("fw", it.width); put("fh", it.height) }; put("raw", ayar.raw); put("flas", ayar.flas)
            put("hevc", ayar.hevc); put("renk", ayar.renk); put("sabit", ayar.sabit); ayar.kelvin?.let { put("kelvin", it) }; put("ton", ayar.ton)
            ayar.sesGirdi?.let { put("sesGirdi", it) }; ayar.diyafram?.let { put("diyafram", it.toDouble()) }
        }.toString()).apply()
    }

    /* ================= yaşam döngüsü ================= */
    override fun onResume() {
        super.onResume(); onde = true; tamEkran(); monitor.onResume(); sensorKaydi()
        if (yonDinle.canDetectOrientation()) yonDinle.enable()
        if (acilir == null) modlariCiz()
        kameraAc(); yayinAyarla()
        // İşlenen video bitince son çekim küçük resmi güncellenir; önceki oturumdan yarım kalan varsa özgün renkte kurtarılır
        VideoIsleme.bitti = { u, iyi -> sonUri = u; sonMime = "video/mp4"; kucukResim(u); tost(when (VideoIsleme.sonTur) {
            "vlog" -> if (iyi) "Vlog videosu galeride." else "Vlog videosu birleştirilemedi; iki kamera dosyası duruyor."
            else -> if (iyi) "Stil videoya işlendi." else "Stil işlenemedi; video özgün renkte kaydedildi." }) }
        VideoIsleme.artiklariKurtar(applicationContext)
    }
    override fun onPause() {
        super.onPause(); onde = false; yonDinle.disable(); sensorler.unregisterListener(yercekimDinle); VideoIsleme.bitti = null
        geriSayiliyor = false; seriSuruyor = false; ortaYazi.visibility = View.GONE
        if (monitor.birlestiriyor) monitor.birlestirmeIptal()
        kaynak?.let { k -> if (k.kayitta || lutKaydedici != null) videoDugmesi(k) }
        tlKaydedici?.let { timelapseBitir(it) } // alta alınınca kamera kapanır: o ana kadarki kareler kaydedilir
        yayinAyarla() // onde = false: Wi-Fi kamera durur, geri gelince yeniden açılır
        dongu.postDelayed({ if (!onde) { kaynak?.durdur(); kaynak = null } }, if (kaynak?.kayitta == true) 600 else 0)
        dongu.postDelayed({ if (!onde) vlogGuncelle() }, 700)
        monitor.onPause()
    }
    /** Göstergeler → LUT → + Ekle: seçilen .cube kitaplığa kopyalanır ve uygulanır */
    @Deprecated("startActivityForResult") override fun onActivityResult(k: Int, s: Int, veri: Intent?) {
        @Suppress("DEPRECATION") super.onActivityResult(k, s, veri)
        if (k == 8) {
            if (s == RESULT_OK && veri != null) startForegroundService(Intent(this, EkranYayini::class.java).putExtra(EkranYayini.SONUC, s).putExtra(EkranYayini.VERI, veri))
            else tost("Ekran paylaşımına izin verilmedi.")
            return
        }
        val uri = veri?.data ?: return
        if (k != 7 || s != RESULT_OK) return
        try {
            val ad = (contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(0) else null } ?: "lut-${System.currentTimeMillis()}").let { if (it.endsWith(".cube", true)) it else "$it.cube" }
            val hedef = java.io.File(lutKlasoru, ad.replace(Regex("[^\\wçğıöşüÇĞİÖŞÜ .()-]"), "_"))
            contentResolver.openInputStream(uri)!!.use { g -> hedef.outputStream().use { g.copyTo(it) } }
            lutUygula(hedef.name); tost("LUT kitaplığa eklendi"); ayarEkrani?.yenile(); if (acilir?.findViewWithTag<View>("lutEkle") != null) stilYenile?.invoke()
        } catch (e: Exception) { tost("LUT okunamadı: ${e.message}") }
    }

    override fun onRequestPermissionsResult(r: Int, izinler: Array<out String>, sonuclar: IntArray) {
        super.onRequestPermissionsResult(r, izinler, sonuclar)
        if (r == 1 && checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) kameraAc()
        if (r == 1 && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) tost("Kamera izni olmadan görüntü yok. Ayarlar → Uygulamalar → UPDATED Kamera → İzinler.")
    }
    @Deprecated("Geri: açık menü önce kapanır")
    override fun onBackPressed() { if (ayarEkrani?.acik == true) ayarEkrani?.geri() else if (acilir != null) acilirKapat() else @Suppress("DEPRECATION") super.onBackPressed() }
    override fun onDestroy() { super.onDestroy(); asistan?.kapat(); analiz.kapat(); dongu.removeCallbacksAndMessages(null); kaynak?.durdur() }
}

private const val SN_ = 1_000_000_000L
/** BULB'da önizleme karesinin süresi (Kaynaklar.kt'deki ONIZLEME_EN_UZUN ile aynı) */
private const val ONIZLEME_KARE = 100_000_000L
