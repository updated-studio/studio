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
 * UPDATED Kamera: telefonun normal kamerası (iPhone kamerası gibi sade). Ekran dikey sabit; telefon döndükçe yalnız ikonlar döner.
 * Modlar altta kaydırılır (Video · Foto · Portre · Gece · Işık izi · Samanyolu · Monitör). PRO düğmesi Blackmagic düzenini
 * (MainActivity, mod=pro), Monitör dış kamera izlemeyi (MainActivity, mod=monitor) açar. Uygulama baştan açılınca hangisi
 * olacağı sorulur; alta alınıp geri gelince sorulmaz.
 */
class KameraActivity : Activity() {
    enum class KMod(val ad: String, val foto: Boolean, val sahne: Sahne) {
        VIDEO("VİDEO", false, Sahne.KAPALI), FOTO("FOTO", true, Sahne.KAPALI), PORTRE("PORTRE", true, Sahne.PORTRE),
        GECE("GECE", true, Sahne.GECE), ISIK_IZI("IŞIK İZİ", true, Sahne.ISIK_IZI), SAMANYOLU("SAMANYOLU", true, Sahne.SAMANYOLU),
        MONITOR("MONİTÖR", false, Sahne.KAPALI)
    }

    companion object {
        /** Bu süreçte açılış sorusu soruldu mu (uygulama tamamen kapanınca sıfırlanır) */
        var girisSoruldu = false
        val TURUNCU = Color.rgb(255, 107, 26); val MAVI_ACIK = Color.rgb(106, 152, 248); val YESIL = Color.rgb(52, 199, 89)
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
    private var sonOneri: Pair<KompTur, Int>? = null
    private var sahneOnerisi: Sahne? = null
    @Volatile private var renkOrt = floatArrayOf(0f, 0f, 0f); @Volatile private var yercekimZ = 0f
    private var zamanlayici = 0; private var deklansorSesi = true; private var izSure = 10
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
    private fun pano(kose: Float) = GradientDrawable().apply { cornerRadius = kose; setColor(Color.argb(244, 30, 33, 38)); setStroke(1, Color.argb(26, 255, 255, 255)) }

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
        kayitCip = TextView(this).apply { textSize = 14f; typeface = mono; setTextColor(Color.WHITE); setPadding(dp(12f), dp(5f), dp(12f), dp(5f)); background = Tema.kapsul(Color.rgb(229, 72, 77), dp(14f).toFloat()); visibility = View.GONE }
        kutu.addView(kayitCip, FrameLayout.LayoutParams(-2, -2, Gravity.TOP or Gravity.CENTER_HORIZONTAL).apply { topMargin = dp(12f) })
        sahneCip = cip(MAVI_ACIK).apply { setOnClickListener { sahneUygula(); visibility = View.GONE } }
        kutu.addView(sahneCip, FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM or Gravity.START).apply { bottomMargin = dp(64f); marginStart = dp(12f) })
        bilgiCip = TextView(this).apply { textSize = 12f; typeface = mono; setTextColor(Color.WHITE); setPadding(dp(10f), dp(5f), dp(10f), dp(5f)); background = cam(dp(12f).toFloat()); setOnClickListener { ayarlarAc() } }
        donenler.add(bilgiCip)
        kutu.addView(bilgiCip, FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM or Gravity.END).apply { bottomMargin = dp(64f); marginEnd = dp(12f) })
        zoomSira = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
        kutu.addView(zoomSira, FrameLayout.LayoutParams(-1, dp(48f), Gravity.BOTTOM).apply { bottomMargin = dp(10f) })
        sureSira = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER; visibility = View.GONE }
        kutu.addView(sureSira, FrameLayout.LayoutParams(-1, dp(40f), Gravity.BOTTOM).apply { bottomMargin = dp(60f) })
        ortaYazi = TextView(this).apply { textSize = 88f; typeface = kosulKalin; setTextColor(Color.WHITE); setShadowLayer(12f, 0f, 0f, Color.BLACK); visibility = View.GONE; gravity = Gravity.CENTER }
        donenler.add(ortaYazi)
        kutu.addView(ortaYazi, FrameLayout.LayoutParams(-2, -2, Gravity.CENTER))
        kok.addView(kutu)
        dokunmaKur()

        // Üst cam şerit
        ustSerit = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; background = cam(dp(26f).toFloat()); setPadding(dp(4f), 0, dp(4f), 0) }
        fun ekle(v: View, w: Int = dp(44f)) = ustSerit.addView(v, LinearLayout.LayoutParams(w, dp(44f)))
        fun bosluk() = ustSerit.addView(View(this), LinearLayout.LayoutParams(0, 1, 1f))
        ekle(ikon(R.drawable.ic_monitor, "Monitör") { monitoreGec() }.apply { setColorFilter(MAVI_ACIK) }); bosluk()
        val flasKutu = FrameLayout(this).apply { setOnClickListener { flasDegistir() }; contentDescription = "Flaş" }
        flasIkon = ImageView(this).apply { setImageResource(R.drawable.ic_flas_yok); scaleType = ImageView.ScaleType.CENTER }
        flasHarf = TextView(this).apply { text = "A"; textSize = 9f; typeface = kosulKalin; setTextColor(Color.WHITE); visibility = View.GONE }
        flasKutu.addView(flasIkon, FrameLayout.LayoutParams(-1, -1)); flasKutu.addView(flasHarf, FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM or Gravity.END).apply { marginEnd = dp(8f); bottomMargin = dp(6f) })
        donenler.add(flasKutu); ekle(flasKutu); bosluk()
        ekle(ikon(R.drawable.ic_kilavuz, "Kompozisyon kılavuzu") { kilavuzMenu() }); bosluk()
        ekle(ikon(R.drawable.ic_yardimci, "Akıllı yardımcı") { asistanAcik = !asistanAcik; kompUygula() }.apply { tag = "yardimci" }); bosluk()
        ekle(ikon(R.drawable.ic_terazi, "Terazi") { teraziAcik = !teraziAcik; kompUygula() }.apply { tag = "terazi" }); bosluk()
        val pro = etiket("PRO", 15f).apply { background = GradientDrawable().apply { cornerRadius = dp(17f).toFloat(); setStroke(dp(1f), Color.argb(72, 255, 255, 255)) }; setOnClickListener { proyaGec() }; contentDescription = "PRO" }
        donenler.add(pro); ustSerit.addView(pro, LinearLayout.LayoutParams(dp(58f), dp(34f))); bosluk()
        ekle(ikon(R.drawable.ic_ayar, "Ayarlar") { ayarlarAc() })
        kok.addView(ustSerit)

        // Mod şeridi
        modSerit = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        modKaydir = HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false; addView(modSerit) }
        kok.addView(modKaydir)
        modlariCiz()

        // Alt sıra: son çekim · deklanşör · çevir
        altSira = FrameLayout(this)
        sonResim = ImageView(this).apply { scaleType = ImageView.ScaleType.CENTER_CROP; background = GradientDrawable().apply { cornerRadius = dp(12f).toFloat(); setColor(Color.rgb(74, 81, 92)); setStroke(1, Color.argb(50, 255, 255, 255)) }; clipToOutline = true
            contentDescription = "Son çekim"; setOnClickListener { sonuAc() } }
        donenler.add(sonResim)
        altSira.addView(sonResim, FrameLayout.LayoutParams(dp(52f), dp(52f), Gravity.START or Gravity.CENTER_VERTICAL).apply { marginStart = dp(34f) })
        deklansorDugme = KayitDugmesi(this).apply { setOnClickListener { deklansorBasildi() }; contentDescription = "Çek" }
        altSira.addView(deklansorDugme, FrameLayout.LayoutParams(dp(82f), dp(82f), Gravity.CENTER))
        val cevir = ikon(R.drawable.ic_cevir, "Kamerayı çevir") { kameraCevir() }.apply { background = Tema.kapsul(CAM) }
        altSira.addView(cevir, FrameLayout.LayoutParams(dp(52f), dp(52f), Gravity.END or Gravity.CENTER_VERTICAL).apply { marginEnd = dp(34f) })
        kok.addView(altSira)

        setContentView(kok)
        yerlestir(); kompUygula(); modUygula(ilk = true); sonCekimiBul()
    }

    /** Güvenli alana göre konumlar */
    private fun yerlestir() {
        if (!this::kok.isInitialized) return
        val u = if (ustBosluk == 0) dp(32f) else ustBosluk; val a = if (altBosluk == 0) dp(16f) else altBosluk
        ustSerit.layoutParams = FrameLayout.LayoutParams(-1, dp(56f), Gravity.TOP).apply { topMargin = u + dp(6f); marginStart = dp(12f); marginEnd = dp(12f) }
        altSira.layoutParams = FrameLayout.LayoutParams(-1, dp(96f), Gravity.BOTTOM).apply { bottomMargin = a + dp(8f) }
        modKaydir.layoutParams = FrameLayout.LayoutParams(-1, dp(40f), Gravity.BOTTOM).apply { bottomMargin = a + dp(8f) + dp(100f) }
        kutu.layoutParams = FrameLayout.LayoutParams(-1, -1).apply { topMargin = u + dp(68f); bottomMargin = a + dp(8f) + dp(146f) }
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
            setPadding(dp(10f), dp(6f), dp(10f), dp(6f)); tag = m; setOnClickListener { modSec(m) } }) }
        modSerit.addView(View(this), LinearLayout.LayoutParams(ekranG / 2 - dp(40f), 1))
        modKaydir.post { (0 until modSerit.childCount).map { modSerit.getChildAt(it) }.firstOrNull { it.tag == mod }?.let { v -> modKaydir.smoothScrollTo(v.left + v.width / 2 - modKaydir.width / 2, 0) } }
    }

    private fun modSec(m: KMod) {
        if (m == mod) return
        if (kaynak?.kayitta == true) return tost("Kayıt sürerken mod değişmez.")
        if (m == KMod.MONITOR) { monitoreGec(); return }
        mod = m; tercih.edit().putString("mod", m.name).apply()
        modlariCiz(); modUygula()
    }

    private fun modUygula(ilk: Boolean = false) {
        val k = kaynak
        deklansorDugme.foto = mod.foto; deklansorDugme.kayitta = k?.kayitta == true
        sureSira.visibility = if (mod == KMod.ISIK_IZI) View.VISIBLE else View.GONE
        if (mod == KMod.ISIK_IZI) sureCiz()
        sahneOnerisi = null; sahneCip.visibility = View.GONE
        if (!ilk && k != null) {
            k.sahne = mod.sahne
            if (k.fotoModu != mod.foto) k.modDegistir(mod.foto) { w, h -> monitor.tampon(w, h); runOnUiThread { bilgiCiz(); komp.invalidate() } } else k.ayarDegisti()
        }
        bilgiCiz(); flasCiz()
    }

    private fun sureCiz() {
        sureSira.removeAllViews()
        intArrayOf(5, 10, 20, 30, 60).forEach { sn -> sureSira.addView(TextView(this).apply {
            text = "$sn sn"; textSize = 13f; typeface = kosul; gravity = Gravity.CENTER; setTextColor(if (izSure == sn) Color.BLACK else Color.WHITE)
            background = Tema.kapsul(if (izSure == sn) TURUNCU else CAM, dp(14f).toFloat()); setPadding(dp(12f), 0, dp(12f), 0)
            setOnClickListener { izSure = sn; tercih.edit().putInt("izSure", sn).apply(); sureCiz() } }, LinearLayout.LayoutParams(-2, dp(32f)).apply { marginEnd = dp(6f) }) }
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
        if (asistanAcik && asistan == null) asistan = Asistan { r, ad -> runOnUiThread { asistanSonuc(r, ad) } }
        if (!asistanAcik) { asistan?.kapat(); asistan = null; komp.konu = null; oneriCip.visibility = View.GONE }
        if (!teraziAcik) komp.egim = null
        sensorKaydi()
        monitor.olcumKaresi = if (asistanAcik || sahneOto) { buf, w, h -> asistan?.kare(buf, w, h); if (sahneOto) renkOlc(buf, w, h) } else null
        (0 until ustSerit.childCount).map { ustSerit.getChildAt(it) }.forEach { v ->
            if (v is ImageView && v.tag == "yardimci") v.setColorFilter(if (asistanAcik) TURUNCU else Color.WHITE)
            if (v is ImageView && v.tag == "terazi") v.setColorFilter(if (teraziAcik) TURUNCU else Color.WHITE)
            if (v is ImageView && v.contentDescription == "Kompozisyon kılavuzu") v.setColorFilter(if (kompTur != KompTur.KAPALI) TURUNCU else Color.WHITE)
        }
    }

    private fun sensorKaydi() {
        sensorler.unregisterListener(yercekimDinle)
        if ((teraziAcik || sahneOto) && onde) sensorler.getDefaultSensor(android.hardware.Sensor.TYPE_GRAVITY)?.let { sensorler.registerListener(yercekimDinle, it, android.hardware.SensorManager.SENSOR_DELAY_UI) }
    }

    private fun asistanSonuc(r: RectF?, ad: String) {
        komp.konu = r; komp.konuAdi = ad
        if (kompTur == KompTur.KAPALI && r != null) { kompTur = sonKomp; kompUygula() }
        val o = if (oneriAcik) kompozisyonOner(r, kompTur, komp.goruntuOrani()) else null
        sonOneri = o
        if (o == null || komp.hizalama > 0.85f || kayitCip.visibility == View.VISIBLE) oneriCip.visibility = View.GONE
        else { oneriCip.text = "Öneri: ${o.first.ad}  ›  Uygula"; oneriCip.visibility = View.VISIBLE }
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
        p.addView(etiket("KOMPOZİSYON KILAVUZU", 13f, GRI).apply { gravity = Gravity.START; setPadding(dp(4f), 0, 0, dp(10f)) })
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
        s.addView(TextView(this).apply { text = ad; textSize = 15f; setTextColor(Color.WHITE) }, LinearLayout.LayoutParams(0, -2, 1f))
        val sw = android.widget.Switch(this).apply { isChecked = acik; thumbTintList = android.content.res.ColorStateList.valueOf(Color.WHITE)
            trackTintList = android.content.res.ColorStateList(arrayOf(intArrayOf(android.R.attr.state_checked), intArrayOf()), intArrayOf(TURUNCU, Color.argb(70, 255, 255, 255))); trackTintMode = android.graphics.PorterDuff.Mode.SRC
            setOnCheckedChangeListener { _, b -> degis(b) } }
        s.addView(sw)
        return s
    }

    private fun acilirAc(v: View, ustTan: Boolean) {
        acilirKapat()
        val perde = FrameLayout(this).apply { setOnClickListener { acilirKapat() } }
        val lp = FrameLayout.LayoutParams(-1, -2, if (ustTan) Gravity.TOP else Gravity.BOTTOM).apply {
            marginStart = dp(12f); marginEnd = dp(12f)
            if (ustTan) topMargin = (ustSerit.layoutParams as FrameLayout.LayoutParams).topMargin + dp(62f) else bottomMargin = altBosluk + dp(12f)
        }
        perde.addView(v, lp)
        kok.addView(perde, FrameLayout.LayoutParams(-1, -1)); acilir = perde
    }
    private fun acilirKapat() { acilir?.let { kok.removeView(it) }; acilir = null }

    /* ================= ayarlar ================= */
    private fun ayarlarAc() {
        val k = kaynak
        val ic = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(18f), dp(16f), dp(18f), dp(16f)) }
        fun baslik(t: String) = ic.addView(etiket(t, 13f, GRI).apply { gravity = Gravity.START; setPadding(0, dp(14f), 0, dp(6f)) })
        fun secim(ad: String, secenekler: List<String>, secili: Int, sec: (Int) -> Unit) {
            ic.addView(TextView(this).apply { text = ad; textSize = 14f; setTextColor(Color.WHITE); setPadding(0, dp(8f), 0, dp(6f)) })
            val s = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            secenekler.forEachIndexed { i, o -> s.addView(etiket(o, 13f, if (i == secili) Color.BLACK else Color.WHITE).apply {
                background = Tema.kapsul(if (i == secili) TURUNCU else Color.argb(26, 255, 255, 255), dp(10f).toFloat()); setPadding(dp(12f), 0, dp(12f), 0)
                setOnClickListener { sec(i); ayarlarAc() } }, LinearLayout.LayoutParams(-2, dp(36f)).apply { marginEnd = dp(6f) }) }
            ic.addView(HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false; addView(s) })
        }
        if (k != null) {
            baslik("FOTOĞRAF")
            val fb = k.fotoBoyutlari.distinctBy { it.width * 10 / it.height }.take(2) + k.fotoBoyutlari.take(4)
            val liste = fb.distinct().sortedByDescending { it.width * it.height }.take(5); val fs = k.secilenFotoBoyut()
            if (liste.isNotEmpty()) secim("Çözünürlük", liste.map { "%.0f MP · %s".format(it.width * it.height / 1e6, oran(it)) }, liste.indexOf(fs).coerceAtLeast(0)) {
                ayar.fotoBoyut = liste[it]; ayarKaydet(); k.oturumYenile { w, h -> monitor.tampon(w, h); runOnUiThread { bilgiCiz() } } }
            if (k.rawVar) ic.addView(anahtar("RAW (DNG) da kaydet", ayar.raw) { ayar.raw = it; ayarKaydet(); k.oturumYenile { w, h -> monitor.tampon(w, h); runOnUiThread { bilgiCiz() } } })
            secim("Zamanlayıcı", listOf("Kapalı", "3 sn", "10 sn"), when (zamanlayici) { 3 -> 1; 10 -> 2; else -> 0 }) { zamanlayici = intArrayOf(0, 3, 10)[it]; tercih.edit().putInt("zamanlayici", zamanlayici).apply() }
            ic.addView(anahtar("Deklanşör sesi", deklansorSesi) { deklansorSesi = it; tercih.edit().putBoolean("deklansor", it).apply() })
            baslik("VİDEO")
            val vb = listOf(Size(1280, 720), Size(1920, 1080), Size(3840, 2160)).filter { it in k.yetenek.boyutlar }
            if (vb.isNotEmpty()) secim("Çözünürlük", vb.map { when (it.height) { 720 -> "720p"; 1080 -> "1080p"; else -> "4K" } }, vb.indexOf(ayar.boyut ?: Size(1920, 1080)).coerceAtLeast(0)) {
                ayar.boyut = vb[it]; ayarKaydet(); if (!mod.foto) k.oturumYenile { w, h -> monitor.tampon(w, h); runOnUiThread { bilgiCiz() } } }
            val fpsler = listOfNotNull(Range(30, 30).takeIf { it in k.yetenek.fpsler }, Range(60, 60).takeIf { it in k.yetenek.fpsler })
            if (fpsler.size > 1) secim("Kare hızı", fpsler.map { "${it.upper} fps" }, if (ayar.fps == Range(60, 60)) 1 else 0) {
                ayar.fps = fpsler[it]; ayarKaydet(); if (!mod.foto) k.oturumYenile { w, h -> monitor.tampon(w, h); runOnUiThread { bilgiCiz() } } }
        }
        baslik("YARDIMCILAR")
        ic.addView(anahtar("Otomatik sahne önerisi", sahneOto) { sahneOto = it; kompUygula() })
        baslik("UYGULAMA")
        ic.addView(anahtar("Açılışta Kamera / Monitör sor", tercih.getString("giris", null) == null) { if (it) tercih.edit().remove("giris").apply() else tercih.edit().putString("giris", "kamera").apply() })
        ic.addView(TextView(this).apply { text = "Güncellemeleri denetle"; textSize = 15f; setTextColor(MAVI_ACIK); setPadding(0, dp(12f), 0, dp(8f)); setOnClickListener { Guncelleme.denetle(this@KameraActivity, sessiz = false) } })
        ic.addView(TextView(this).apply { text = "UPDATED Kamera ${packageManager.getPackageInfo(packageName, 0).versionName} · çökme ve donmalar kendiliğinden bildirilir (yalnız hata ayrıntısı ve cihaz modeli)."; textSize = 12f; setTextColor(GRI); setPadding(0, dp(6f), 0, 0) })
        ic.addView(etiket("AYARLAR", 18f).apply { gravity = Gravity.START; typeface = kosulKalin; setPadding(0, 0, 0, dp(2f)) }, 0)
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
        k.fotoModu = mod.foto; k.sahne = mod.sahne; k.ekranYonu = (360 - fizikselYon) % 360
        @Suppress("DEPRECATION") monitor.otoDondur = windowManager.defaultDisplay.rotation * 90
        kaynak = k
        k.baslat(y, { w, h -> monitor.tampon(w, h); runOnUiThread { bilgiCiz(); zoomCiz(); flasCiz() } }, { hata -> runOnUiThread { if (hata == "POLITIKA") engelli() else tost(hata) } })
    }

    private fun kameraCevir() {
        if (kamListe.size < 2) return tost("Tek kamera var.")
        if (kaynak?.kayitta == true) return
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
            else -> { val b = k.secilenBoyut(); "${when { b.height >= 2160 -> "4K"; b.height >= 1080 -> "1080p"; else -> "${b.height}p" }} · ${ayar.fps?.upper ?: 30}" }
        }
        bilgiCip.visibility = if (k == null) View.GONE else View.VISIBLE
    }

    /* ================= çekim ================= */
    private fun deklansorBasildi() {
        acilirKapat()
        val k = kaynak ?: return tost("Kamera hazır değil.")
        if (!mod.foto) return videoDugmesi(k)
        if (monitor.birlestiriyor) { monitor.birlestirmeIptal(); return }
        if (geriSayiliyor) { geriSayiliyor = false; ortaYazi.visibility = View.GONE; return }
        if (zamanlayici == 0) return cek(k)
        geriSayiliyor = true; var kalan = zamanlayici
        fun adim() {
            if (!geriSayiliyor) return
            if (kalan == 0) { geriSayiliyor = false; ortaYazi.visibility = View.GONE; cek(k); return }
            ortaYazi.textSize = 88f; ortaYazi.text = "$kalan"; ortaYazi.visibility = View.VISIBLE; kalan--
            dongu.postDelayed({ adim() }, 1000)
        }
        adim()
    }

    private fun birlestirmeTuru(k: KameraKaynak): Sahne.Birlestir? = when (mod) {
        KMod.ISIK_IZI -> Sahne.Birlestir.MAX
        KMod.SAMANYOLU -> if (k.uzunPozlamaVar) null else Sahne.Birlestir.ORT
        KMod.GECE -> if (k.sahneModuVar(CameraMetadata.CONTROL_SCENE_MODE_NIGHT)) null else Sahne.Birlestir.ORT
        else -> null
    }

    private fun cek(k: KameraKaynak) {
        k.ekranYonu = (360 - fizikselYon) % 360
        birlestirmeTuru(k)?.let { return birlestirCek(it) }
        deklansorDugme.basili = true
        if (deklansorSesi) runCatching { deklansor.play(android.media.MediaActionSound.SHUTTER_CLICK) }
        monitor.animate().alpha(0.2f).setDuration(60).withEndAction { monitor.animate().alpha(1f).setDuration(160) }
        var ilk: Uri? = null
        k.fotoCek({ ad, mime, yaz -> galeriyeYaz(ad, mime, yaz)?.also { if (mime == "image/jpeg") ilk = it } != null }) { hata -> runOnUiThread {
            deklansorDugme.basili = false
            if (hata != null) { tost(hata); return@runOnUiThread }
            ilk?.let { u -> sonUri = u; sonMime = "image/jpeg"; kucukResim(u) }
        } }
    }

    private fun birlestirCek(tur: Sahne.Birlestir) {
        deklansorDugme.basili = true
        if (deklansorSesi) runCatching { deklansor.play(android.media.MediaActionSound.START_VIDEO_RECORDING) }
        ortaYazi.textSize = 34f; ortaYazi.text = "0%"; ortaYazi.visibility = View.VISIBLE
        val n = if (mod == KMod.SAMANYOLU) 16 else 8; val yon = fizikselYon; val adSahne = mod.ad
        monitor.birlestir(MonitorGorunum.BirlestirmeIstegi(tur, n, izSure * 1000L, 1f, { o -> ortaYazi.text = "$adSahne  ${(o * 100).toInt()}%" }) { bmp ->
            ortaYazi.visibility = View.GONE; deklansorDugme.basili = false
            if (bmp == null) return@BirlestirmeIstegi tost("Birleştirme durdu.")
            if (deklansorSesi) runCatching { deklansor.play(android.media.MediaActionSound.SHUTTER_CLICK) }
            Thread {
                // Ekran dikey sabit: telefon yan tutulduysa sonuç dik çevrilir
                val dik = if (yon == 0) bmp else Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, android.graphics.Matrix().apply { postRotate(yon.toFloat()) }, true)
                val ad = "UPDATED_" + SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date()) + "_" + mod.name.lowercase(Locale.US) + ".jpg"
                val u = galeriyeYaz(ad, "image/jpeg") { dik.compress(Bitmap.CompressFormat.JPEG, 95, it) }
                runOnUiThread { if (u == null) tost("Fotoğraf kaydedilemedi.") else { sonUri = u; sonMime = "image/jpeg"; kucukResim(u) } }
            }.start()
        })
    }

    private fun videoDugmesi(k: KameraKaynak) {
        if (k.kayitta) {
            k.kayitDurdur { ok -> runOnUiThread {
                kayitUri?.let { u -> contentResolver.update(u, ContentValues().apply { put(MediaStore.Video.Media.IS_PENDING, 0) }, null, null); if (ok) { sonUri = u; sonMime = "video/mp4"; kucukResim(u) } else contentResolver.delete(u, null, null) }
                kayitUri = null; deklansorDugme.kayitta = false; kayitCip.visibility = View.GONE
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
            kayitBas = System.currentTimeMillis(); deklansorDugme.kayitta = true; kayitCip.visibility = View.VISIBLE; oneriCip.visibility = View.GONE
        } }
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
        if (!sahneOto || mod != KMod.FOTO || kaynak?.kayitta == true) { sahneCip.visibility = View.GONE; return }
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
        when (o) { Sahne.GECE -> modSec(KMod.GECE); Sahne.SAMANYOLU -> modSec(KMod.SAMANYOLU); Sahne.PORTRE -> modSec(KMod.PORTRE); else -> { kaynak?.sahne = o; kaynak?.ayarDegisti(); tost("${o.ad} ayarları uygulandı") } }
    }

    /* ================= döngü ================= */
    private var sonSaniye = -1L
    private fun tik() {
        val k = kaynak
        if (k?.kayitta == true) { val ms = System.currentTimeMillis() - kayitBas; kayitCip.text = "●  %02d:%02d".format(ms / 60000, ms / 1000 % 60) }
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
        if (kaynak?.kayitta == true) return tost("Önce kaydı durdur.")
        startActivity(Intent(this, MainActivity::class.java).putExtra("mod", "pro").putExtra("kamera", kamListe.getOrNull(kamIndex)?.first))
    }
    private fun monitoreGec() {
        if (kaynak?.kayitta == true) return tost("Önce kaydı durdur.")
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
        ic.addView(kart(R.drawable.ic_kamera, TURUNCU, "Kamera", "Fotoğraf, video, gece, ışık izi. PRO ile tam el ile kontrol.") {
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
        mod = runCatching { KMod.valueOf(tercih.getString("mod", "FOTO")!!) }.getOrDefault(KMod.FOTO).let { if (it == KMod.MONITOR) KMod.FOTO else it }
        kamIndex = tercih.getInt("kamIndex", 0)
        kompTur = runCatching { KompTur.valueOf(tercih.getString("komp", "KAPALI")!!) }.getOrDefault(KompTur.KAPALI); kompYon = tercih.getInt("kompYon", 0)
        sonKomp = runCatching { KompTur.valueOf(tercih.getString("sonKomp", "SPIRAL")!!) }.getOrDefault(KompTur.SPIRAL)
        asistanAcik = tercih.getBoolean("asistan", false); teraziAcik = tercih.getBoolean("terazi", false); oneriAcik = tercih.getBoolean("oneri", true); sahneOto = tercih.getBoolean("sahneOto", true)
        zamanlayici = tercih.getInt("zamanlayici", 0); deklansorSesi = tercih.getBoolean("deklansor", true); izSure = tercih.getInt("izSure", 10)
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
        geriSayiliyor = false; ortaYazi.visibility = View.GONE
        if (monitor.birlestiriyor) monitor.birlestirmeIptal()
        kaynak?.let { k -> if (k.kayitta) videoDugmesi(k) }
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
    override fun onDestroy() { super.onDestroy(); asistan?.kapat(); dongu.removeCallbacksAndMessages(null); kaynak?.durdur() }
}
