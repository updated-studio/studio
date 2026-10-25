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
    enum class Sekme(val ad: String) { KAYIT("KAYIT"), MONITOR("MONİTÖR"), KILAVUZ("KILAVUZ"), LUT("LUT"), OLCUM("ÖLÇÜM"), SES("SES"), KAYNAK("KAYNAK"), KURULUM("KURULUM") }
    enum class Param { FPS, ENSTANTANE, DIYAFRAM, ISO, WB, EV, ODAK }

    // Renkler (Blackmagic düzeni: siyah şeritler, gri etiket, beyaz değer, kırmızı kayıt)
    private val SIYAH = Color.BLACK; private val GRI = Color.rgb(140, 140, 140); private val KOYU = Color.rgb(30, 30, 30); private val KOYU2 = Color.rgb(44, 44, 44)
    private val KIRMIZI = Color.rgb(230, 40, 40); private val SARI = Color.rgb(255, 196, 0)
    private val dar: Typeface = Typeface.create("sans-serif-condensed", Typeface.BOLD)

    private lateinit var ust: LinearLayout; private lateinit var alt: LinearLayout; private lateinit var sol: LinearLayout; private lateinit var sag: LinearLayout
    private lateinit var bolmeler: LinearLayout; private lateinit var orta: FrameLayout; private lateinit var serit: LinearLayout
    private lateinit var kose: OlcumGorunum; private lateinit var ses: SesGostergesi; private lateinit var kayitDugme: KayitDugmesi
    private lateinit var sonCekim: ImageView; private lateinit var kalanYazi: TextView; private lateinit var panel: FrameLayout; private lateinit var tcYazi: TextView

    private val monitorler = arrayOfNulls<MonitorGorunum>(2)
    private val kaynaklar = arrayOfNulls<Kaynak>(2)
    private val kaynakAdi = arrayOf("", "")
    private val ayarlar = arrayOf(Ayarlar(), Ayarlar())
    private val kamAyar = arrayOf(KameraAyari(), KameraAyari())
    private val sonYuzey = arrayOfNulls<android.view.Surface>(2)
    private val acici = arrayOfNulls<(() -> Unit)>(2)
    private var olcum: OlcumGorunum? = null
    private var kip = Kip.TEK; private var etkin = 0; private var arayuzAcik = true
    private var koseHisto = true; private var parlaklikTam = false; private var sesGosterge = true
    private var hevc = true; private var mbps = 50; private var sesKayit = true
    private var kayitBas = 0L; private var kayitUri: Uri? = null; private var sonUri: Uri? = null
    private var acikParam: Param? = null
    private var bekleyenKamera: Pair<Int, Pair<String, String>>? = null
    private val tercih by lazy { getSharedPreferences("monitor", MODE_PRIVATE) }
    private val dongu = Handler(Looper.getMainLooper())
    private val lutKlasoru by lazy { File(filesDir, "lut").also { it.mkdirs() } }
    private val sesOlcer = SesOlcer { l, r -> runOnUiThread { if (this::ses.isInitialized) ses.ayarla(l, r) } }

    private fun dp(v: Float) = Tema.dp(this, v)
    private fun kamera(): KameraKaynak? = kaynaklar[etkin] as? KameraKaynak

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        HataKaydi.kur(this)
        ayarlariOku()
        kip = runCatching { Kip.valueOf(tercih.getString("kip", "TEK")!!) }.getOrDefault(Kip.TEK)
        koseHisto = tercih.getBoolean("koseHisto", true); parlaklikTam = tercih.getBoolean("parlaklik", false); sesGosterge = tercih.getBoolean("sesGosterge", true)
        hevc = tercih.getBoolean("hevc", true); mbps = tercih.getInt("mbps", 50); sesKayit = tercih.getBoolean("sesKayit", true)

        val kok = FrameLayout(this).apply { setBackgroundColor(SIYAH) }
        val dikey = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        kok.addView(dikey, FrameLayout.LayoutParams(-1, -1))
        ust = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setBackgroundColor(SIYAH) }
        dikey.addView(ust, LinearLayout.LayoutParams(-1, dp(54f)))
        val yatay = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        dikey.addView(yatay, LinearLayout.LayoutParams(-1, 0, 1f))
        sol = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; setBackgroundColor(SIYAH) }
        yatay.addView(sol, LinearLayout.LayoutParams(dp(72f), -1))
        orta = FrameLayout(this)
        bolmeler = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        orta.addView(bolmeler, FrameLayout.LayoutParams(-1, -1))
        serit = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(Color.argb(225, 18, 18, 18)); visibility = View.GONE; setPadding(dp(12f), dp(8f), dp(12f), dp(10f)) }
        orta.addView(serit, FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM))
        yatay.addView(orta, LinearLayout.LayoutParams(0, -1, 1f))
        sag = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL; setBackgroundColor(SIYAH); setPadding(0, dp(10f), 0, dp(10f)) }
        yatay.addView(sag, LinearLayout.LayoutParams(dp(96f), -1))
        alt = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setBackgroundColor(SIYAH); setPadding(dp(10f), 0, dp(10f), 0) }
        dikey.addView(alt, LinearLayout.LayoutParams(-1, dp(62f)))
        panel = FrameLayout(this).apply { visibility = View.GONE; setBackgroundColor(Color.rgb(22, 22, 22)); isClickable = true }
        kok.addView(panel, FrameLayout.LayoutParams(-1, -1))
        setContentView(kok)

        sagCiz(); altCiz()
        tamEkran(); parlaklik()
        kur()
        dongu.post(object : Runnable { override fun run() { tik(); dongu.postDelayed(this, 40) } })
    }

    private fun tamEkran() {
        if (android.os.Build.VERSION.SDK_INT >= 30) window.insetsController?.let { it.hide(WindowInsets.Type.systemBars()); it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE }
        else @Suppress("DEPRECATION") { window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY }
    }
    private fun parlaklik() { window.attributes = window.attributes.apply { screenBrightness = if (parlaklikTam) 1f else -1f } }
    private fun tost(m: String) = Toast.makeText(this, m, Toast.LENGTH_LONG).show()

    /* ================= bölmeler ================= */
    private fun kur() {
        if (kamera()?.kayitta == true) return tost("Kayıt sürerken görünüm değişmez.")
        kaynaklar.forEach { it?.durdur() }; kaynaklar.fill(null)
        monitorler.forEach { it?.onPause() }; monitorler.fill(null)
        bolmeler.removeAllViews(); olcum = null
        val sayi = if (kip == Kip.IKI) 2 else 1
        for (i in 0 until sayi) bolmeler.addView(bolmeYap(i), LinearLayout.LayoutParams(0, -1, 1f))
        if (kip == Kip.OLCUM) { val o = OlcumGorunum(this); olcum = o; bolmeler.addView(o, LinearLayout.LayoutParams(0, -1, 0.7f)) }
        monitorler[0]?.karsilastir = kip == Kip.KARSILASTIR
        etkin = 0; olcumBagla(); arayuzCiz()
        for (i in 0 until sayi) {
            when (tercih.getString("kaynak$i", null) ?: if (i == 0) "kamera" else null) {
                "kamera" -> { val id = tercih.getString("kamera$i", null); val l = kameralar(this); (l.firstOrNull { it.first == id } ?: l.firstOrNull())?.let { kameraAc(i, it) } }
                "ag" -> tercih.getString("ag$i", null)?.let { agAc(i, it) }
            }
            ayarlar[i].takeIf { it.lutAcik && it.lutAdi.isNotEmpty() }?.let { a -> runCatching { File(lutKlasoru, a.lutAdi).inputStream().use { Lut.oku(a.lutAdi, it) } }.getOrNull()?.let { monitorler[i]?.lutYukle(it) } }
        }
    }

    private fun olcumBagla() {
        monitorler.forEachIndexed { i, m -> m?.olcumKaresi = if (i == etkin && (olcum != null || koseHisto)) { buf, w, h -> olcum?.kare(buf, w, h); if (koseHisto) kose.kare(buf, w, h) } else null }
        if (this::kose.isInitialized) kose.visibility = if (koseHisto) View.VISIBLE else View.INVISIBLE
    }

    private fun bolmeYap(i: Int): View {
        val m = MonitorGorunum(this).also { it.ayarlar = ayarlar[i] }
        monitorler[i] = m; sonYuzey[i] = null; acici[i] = null
        m.yuzeyHazir = { y -> sonYuzey[i] = y; acici[i]?.invoke() }
        val kutu = FrameLayout(this); kutu.addView(m, FrameLayout.LayoutParams(-1, -1))
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
        for (i in 0 until bolmeler.childCount) bolmeler.getChildAt(i).foreground = if (kip == Kip.IKI && i == etkin && monitorler.getOrNull(i) != null) GradientDrawable().apply { setStroke(dp(2f), SARI) } else null
        ustCiz(); solCiz(); altCiz()
    }

    /* ================= üst parametre şeridi ================= */
    private fun hucre(etiket: String, deger: String, agirlik: Float = 1f, p: Param? = null, renk: Int = Color.WHITE, buyuk: Boolean = false): TextView? {
        val k = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
            if (p != null) { setOnClickListener { if (acikParam == p) seritKapat() else seritAc(p) }; if (acikParam == p) setBackgroundColor(KOYU2) } }
        if (etiket.isNotEmpty()) k.addView(TextView(this).apply { text = etiket; textSize = 10f; setTextColor(GRI); typeface = dar; letterSpacing = 0.08f })
        val v = TextView(this).apply { text = deger; textSize = if (buyuk) 24f else 17f; setTextColor(renk); typeface = if (buyuk) Typeface.create("sans-serif-condensed", Typeface.BOLD) else dar; isSingleLine = true }
        k.addView(v)
        ust.addView(k, LinearLayout.LayoutParams(0, -1, agirlik))
        return v
    }

    private fun ustCiz() {
        ust.removeAllViews()
        val k = kamera(); val a = kamAyar[etkin]
        val ag = kaynaklar[etkin] is AgKaynak
        val fps = when { ag -> "—"; a.fps != null -> if (a.fps!!.lower == a.fps!!.upper) "${a.fps!!.upper}" else "${a.fps!!.lower}–${a.fps!!.upper}"; else -> "OTO" }
        val fpsSayi = a.fps?.upper ?: 30
        val ens = when { ag || k == null -> "—"; a.pozlamaNs == null -> "OTO"; else -> { val t = a.pozlamaNs!! / 1e9; val aci = 360.0 * fpsSayi * t; if (abs(aci - 180) < 6) "180°" else "1/${(1 / t).toInt()}" } }
        hucre("KARE HIZI", fps, p = Param.FPS)
        hucre("ENSTANTANE", ens, p = Param.ENSTANTANE)
        hucre("DİYAFRAM", k?.yetenek?.diyafram?.let { "f/" + "%.1f".format(it).replace('.', ',') } ?: "—", p = Param.DIYAFRAM)
        tcYazi = hucre("", "00:00:00:00", 1.9f, renk = if (k?.kayitta == true) KIRMIZI else Color.WHITE, buyuk = true)!!
        hucre("ISO", if (ag || k == null) "—" else a.iso?.toString() ?: "OTO", p = Param.ISO)
        hucre("BEYAZ DENGESİ", if (ag || k == null) "—" else WB_ADLARI[a.awb] ?: "OTO", p = Param.WB)
        hucre("POZLAMA", if (ag || k == null) "—" else if (a.ev == 0) "0" else "%+.1f".format(a.ev * (k.yetenek.evAdim.takeIf { it > 0 } ?: 1f)).replace('.', ','), p = Param.EV)
    }

    private val WB_ADLARI = mapOf(CameraMetadata.CONTROL_AWB_MODE_AUTO to "OTO", CameraMetadata.CONTROL_AWB_MODE_DAYLIGHT to "5600K", CameraMetadata.CONTROL_AWB_MODE_CLOUDY_DAYLIGHT to "6500K",
        CameraMetadata.CONTROL_AWB_MODE_INCANDESCENT to "3200K", CameraMetadata.CONTROL_AWB_MODE_FLUORESCENT to "4000K", CameraMetadata.CONTROL_AWB_MODE_SHADE to "7500K", CameraMetadata.CONTROL_AWB_MODE_TWILIGHT to "Alacakaranlık")

    /* ---------- ayar şeridi (parametreye dokununca altta açılır) ---------- */
    private fun seritKapat() { serit.visibility = View.GONE; acikParam = null; ustCiz(); solCiz() }

    private fun seritAc(p: Param) {
        acikParam = p; serit.removeAllViews(); serit.visibility = View.VISIBLE; ustCiz(); solCiz()
        val k = kamera()
        val baslik = mapOf(Param.FPS to "KARE HIZI", Param.ENSTANTANE to "ENSTANTANE", Param.DIYAFRAM to "DİYAFRAM", Param.ISO to "ISO", Param.WB to "BEYAZ DENGESİ", Param.EV to "POZLAMA TELAFİSİ", Param.ODAK to "ODAK")[p]!!
        serit.addView(TextView(this).apply { text = baslik; textSize = 11f; setTextColor(GRI); typeface = dar; letterSpacing = 0.1f; setPadding(0, 0, 0, dp(6f)) })
        if (k == null) { serit.addView(TextView(this).apply { text = "Bu ayar yalnız kamera ve USB kaynaklarında var."; setTextColor(Color.WHITE) }); return }
        val y = k.yetenek; val a = kamAyar[etkin]
        val satir = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        fun c(ad: String, secili: Boolean, is_: () -> Unit) = satir.addView(Tema.dugme(this, ad, secili, kucuk = true).apply {
            background = Tema.kapsul(if (secili) Color.WHITE else KOYU2, dp(6f).toFloat()); setTextColor(if (secili) Color.BLACK else Color.WHITE); typeface = dar
            setOnClickListener { is_(); kameraAyarKaydet(); seritAc(p) } }, LinearLayout.LayoutParams(-2, -2).apply { marginEnd = dp(6f) })
        when (p) {
            Param.FPS -> { c("OTO", a.fps == null) { a.fps = null; k.oturumYenile { w, h -> monitorler[etkin]?.tampon(w, h) } }
                y.fpsler.forEach { r -> c(if (r.lower == r.upper) "${r.upper}" else "${r.lower}–${r.upper}", a.fps == r) { a.fps = r; k.oturumYenile { w, h -> monitorler[etkin]?.tampon(w, h) } } } }
            Param.ENSTANTANE -> {
                if (!y.elleKontrol) satir.addView(TextView(this).apply { text = "Bu kamera el ile enstantaneyi desteklemiyor."; setTextColor(Color.WHITE) })
                else { c("OTO", a.pozlamaNs == null) { a.pozlamaNs = null; k.ayarDegisti() }
                    val fps = a.fps?.upper ?: 30
                    c("180° (1/${fps * 2})", a.pozlamaNs == 1_000_000_000L / (fps * 2)) { a.pozlamaNs = 1_000_000_000L / (fps * 2); k.ayarDegisti() }
                    intArrayOf(24, 30, 50, 60, 100, 125, 250, 500, 1000, 2000, 4000).map { 1_000_000_000L / it }.filter { y.pozlamaAralik?.contains(it) != false }.forEach { ns -> c("1/${1_000_000_000L / ns}", a.pozlamaNs == ns) { a.pozlamaNs = ns; k.ayarDegisti() } } }
            }
            Param.DIYAFRAM -> satir.addView(TextView(this).apply { text = y.diyafram?.let { "Bu kameranın diyaframı sabit: f/${"%.1f".format(it)}. Pozlamayı ISO, enstantane ve ND filtreyle ayarla." } ?: "Diyafram kameranın kendisinden ayarlanır (HDMI kaynağı)."; setTextColor(Color.WHITE) })
            Param.ISO -> {
                if (!y.elleKontrol) satir.addView(TextView(this).apply { text = "Bu kamera el ile ISO'yu desteklemiyor."; setTextColor(Color.WHITE) })
                else { c("OTO", a.iso == null) { a.iso = null; k.ayarDegisti() }
                    intArrayOf(50, 64, 100, 125, 200, 250, 400, 640, 800, 1250, 1600, 3200, 6400, 12800).filter { y.isoAralik?.contains(it) == true }.forEach { v -> c("$v", a.iso == v) { a.iso = v; k.ayarDegisti() } } }
            }
            Param.WB -> listOf(CameraMetadata.CONTROL_AWB_MODE_AUTO, CameraMetadata.CONTROL_AWB_MODE_INCANDESCENT, CameraMetadata.CONTROL_AWB_MODE_FLUORESCENT, CameraMetadata.CONTROL_AWB_MODE_DAYLIGHT,
                CameraMetadata.CONTROL_AWB_MODE_CLOUDY_DAYLIGHT, CameraMetadata.CONTROL_AWB_MODE_SHADE, CameraMetadata.CONTROL_AWB_MODE_TWILIGHT).filter { it in y.awbModlari }
                .forEach { m -> c(WB_ADLARI[m] ?: "?", a.awb == m) { a.awb = m; k.ayarDegisti() } }
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
    private fun kare(ad: String, alt: String = "", secili: Boolean = false, is_: () -> Unit) {
        sol.addView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
            background = Tema.kapsul(if (secili) Color.WHITE else KOYU, dp(8f).toFloat())
            addView(TextView(this@MainActivity).apply { text = ad; textSize = 14f; typeface = dar; setTextColor(if (secili) Color.BLACK else Color.WHITE); gravity = Gravity.CENTER })
            if (alt.isNotEmpty()) addView(TextView(this@MainActivity).apply { text = alt; textSize = 9f; typeface = dar; setTextColor(if (secili) Color.DKGRAY else GRI); gravity = Gravity.CENTER })
            setOnClickListener { is_() }
        }, LinearLayout.LayoutParams(dp(56f), dp(52f)).apply { bottomMargin = dp(8f) })
    }

    private fun solCiz() {
        sol.removeAllViews()
        val a = ayarlar[etkin]; val ka = kamAyar[etkin]
        kare("⇄", "KAYNAK") { kaynakSec() }
        kare(if (a.zoom > 1f) "${a.zoom.toInt()}x" else "1x", "BÜYÜT", a.zoom > 1f) { a.zoom = when (a.zoom) { 1f -> 2f; 2f -> 4f; else -> 1f }; kaydet(); solCiz(); ustCiz(); yenile() }
        kare(if (ka.odakMesafe == null) "AF" else "MF", "ODAK", acikParam == Param.ODAK) { if (acikParam == Param.ODAK) seritKapat() else seritAc(Param.ODAK) }
        kare("◐", "TEMİZ", a.temiz) { a.temiz = !a.temiz; kaydet(); solCiz(); yenile() }
        kare("▦", "DÜZEN") { panelAc(Sekme.MONITOR) }
    }

    /* ================= sağ sütun ================= */
    private fun sagCiz() {
        sag.removeAllViews()
        sag.addView(TextView(this).apply { text = "⚙"; textSize = 26f; setTextColor(Color.WHITE); gravity = Gravity.CENTER; setOnClickListener { panelAc(Sekme.KAYIT) } }, LinearLayout.LayoutParams(dp(56f), dp(56f)))
        sag.addView(View(this), LinearLayout.LayoutParams(1, 0, 1f))
        kayitDugme = KayitDugmesi(this).apply { setOnClickListener { kayitDugmesi() }; setOnLongClickListener { ekranGoruntusu(); true }; contentDescription = "Kaydı başlat/durdur (basılı tut: ekran görüntüsü)" }
        sag.addView(kayitDugme, LinearLayout.LayoutParams(dp(76f), dp(76f)))
        sag.addView(View(this), LinearLayout.LayoutParams(1, 0, 1f))
        sonCekim = ImageView(this).apply { scaleType = ImageView.ScaleType.CENTER_CROP; background = Tema.kapsul(KOYU, dp(6f).toFloat()); clipToOutline = true; setOnClickListener { sonUri?.let { u -> runCatching { startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(u, "video/mp4").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)) } } ?: tost("Henüz kayıt yok.") } }
        sag.addView(sonCekim, LinearLayout.LayoutParams(dp(64f), dp(40f)).apply { bottomMargin = dp(6f) })
        kalanYazi = TextView(this).apply { textSize = 10f; setTextColor(GRI); typeface = dar; gravity = Gravity.CENTER }
        sag.addView(kalanYazi, LinearLayout.LayoutParams(-1, -2))
    }

    /* ================= alt şerit ================= */
    private fun altCiz() {
        alt.removeAllViews()
        kose = OlcumGorunum(this).apply { bindirme = true; gorunen = linkedSetOf(OlcumGorunum.Tur.HISTOGRAM); visibility = if (koseHisto) View.VISIBLE else View.INVISIBLE }
        alt.addView(kose, LinearLayout.LayoutParams(dp(140f), dp(48f)).apply { marginEnd = dp(12f) })
        olcumBagla()
        val a = ayarlar[etkin]
        val orta = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
        fun c(ad: String, secili: Boolean, is_: () -> Unit) = orta.addView(TextView(this).apply {
            text = ad; textSize = 13f; typeface = dar; setTextColor(if (secili) Color.BLACK else Color.WHITE); gravity = Gravity.CENTER; setPadding(dp(12f), dp(8f), dp(12f), dp(8f))
            background = Tema.kapsul(if (secili) SARI else KOYU, dp(6f).toFloat()); setOnClickListener { is_(); kaydet(); altCiz(); ustCiz(); yenile() }
        }, LinearLayout.LayoutParams(-2, -2).apply { marginEnd = dp(6f) })
        c("ODAK", a.peaking) { a.peaking = !a.peaking }
        c("ZEBRA", a.zebra) { a.zebra = !a.zebra }
        c("FALSE", a.falseColor) { a.falseColor = !a.falseColor }
        c(if (a.lutAcik) "LUT ✓" else "LUT", a.lutAcik) { if (a.lutAdi.isEmpty()) panelAc(Sekme.LUT) else a.lutAcik = !a.lutAcik }
        c("KILAVUZ", a.kilavuz > 0f || a.izgara) { if (a.kilavuz > 0f || a.izgara) { a.kilavuz = 0f; a.izgara = false } else a.kilavuz = 2.39f }
        alt.addView(HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false; addView(orta) }, LinearLayout.LayoutParams(0, -2, 1f))
        ses = SesGostergesi(this).apply { visibility = if (sesGosterge) View.VISIBLE else View.INVISIBLE }
        alt.addView(ses, LinearLayout.LayoutParams(dp(170f), dp(44f)).apply { marginStart = dp(10f) })
    }

    /* ================= döngü: zaman kodu, ses, kalan süre ================= */
    private var sonSaniye = -1L
    private fun tik() {
        val k = kamera()
        if (k?.kayitta == true) {
            val ms = System.currentTimeMillis() - kayitBas; val fps = kamAyar[etkin].fps?.upper ?: 30
            if (this::tcYazi.isInitialized) tcYazi.text = "%02d:%02d:%02d:%02d".format(ms / 3600000, ms / 60000 % 60, ms / 1000 % 60, (ms % 1000) * fps / 1000)
            if (sesGosterge) { val a = k.sesDuzeyi(); val db = if (a <= 0) -90f else (20 * log10(a / 32767.0)).toFloat(); ses.ayarla(db, db) }
        }
        val sn = System.currentTimeMillis() / 1000
        if (sn != sonSaniye) {
            sonSaniye = sn
            if (k?.kayitta != true && this::tcYazi.isInitialized) tcYazi.text = SimpleDateFormat("HH:mm:ss", Locale.US).format(Date()) + ":00"
            val bos = runCatching { StatFs(Environment.getExternalStorageDirectory().path).availableBytes }.getOrDefault(0L)
            val saniye = bos / max(1L, mbps * 1_000_000L / 8)
            val pil = registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))?.let { it.getIntExtra(BatteryManager.EXTRA_LEVEL, 0) * 100 / max(1, it.getIntExtra(BatteryManager.EXTRA_SCALE, 100)) }
            if (this::kalanYazi.isInitialized) kalanYazi.text = "KALAN\n${saniye / 3600}sa ${saniye / 60 % 60}dk\n%${pil ?: 0}"
        }
    }

    /* ================= kayıt ================= */
    private fun kayitDugmesi() {
        val k = kamera() ?: return tost(if (kaynaklar[etkin] is AgKaynak) "Ağ yayınında kayıt yok; kamera ya da USB kaynağı seç." else "Kaynak yok.")
        if (k.kayitta) {
            k.kayitDurdur { ok -> runOnUiThread {
                kayitUri?.let { u -> contentResolver.update(u, ContentValues().apply { put(MediaStore.Video.Media.IS_PENDING, 0) }, null, null); if (ok) { sonUri = u; runCatching { sonCekim.setImageBitmap(contentResolver.loadThumbnail(u, Size(160, 100), null)) } } }
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
            setTextColor(if (s == sekme) Color.WHITE else GRI)
            background = if (s == sekme) GradientDrawable().apply { setColor(SIYAH); setStroke(0, 0) }.also { } else null
            if (s == sekme) setCompoundDrawablesWithIntrinsicBounds(null, null, null, GradientDrawable().apply { setColor(Color.WHITE); setSize(dp(40f), dp(3f)) })
            setOnClickListener { sekme = s; panelCiz() } }) }
        sekmeler.addView(View(this), LinearLayout.LayoutParams(0, 1, 1f))
        sekmeler.addView(TextView(this).apply { text = "✕"; textSize = 22f; setTextColor(Color.WHITE); setPadding(dp(18f), dp(8f), dp(18f), dp(8f)); setOnClickListener { panelKapat() } })
        dk.addView(HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false; isFillViewport = true; addView(sekmeler) }, LinearLayout.LayoutParams(-1, dp(52f)))
        val ic = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(28f), dp(12f), dp(28f), dp(28f)) }
        dk.addView(ScrollView(this).apply { addView(ic) }, LinearLayout.LayoutParams(-1, 0, 1f))
        val a = ayarlar[etkin]; val k = kamera(); val ka = kamAyar[etkin]
        if (kip == Kip.IKI && sekme != Sekme.KURULUM) aciklama(ic, "${etkin + 1}. bölmenin ayarları (bölmeye dokunarak değiştir)")
        when (sekme) {
            Sekme.KAYIT -> {
                if (k == null) aciklama(ic, "Kayıt yalnız kamera ve USB kaynağında. Ağ yayınında kayıt yok.")
                else {
                    if (k.kayitta) aciklama(ic, "Kayıt sürerken çözünürlük ve kare hızı değişmez.")
                    val boyutlar = k.yetenek.boyutlar; val secili = k.secilenBoyut()
                    secenek(ic, "ÇÖZÜNÜRLÜK", boyutlar.map { "${it.width}×${it.height}" }, boyutlar.indexOf(secili)) { if (!k.kayitta) { ka.boyut = boyutlar[it]; k.oturumYenile { w, h -> monitorler[etkin]?.tampon(w, h) } } }
                    secenek(ic, "KARE HIZI", listOf("OTO") + k.yetenek.fpsler.map { if (it.lower == it.upper) "${it.upper}" else "${it.lower}–${it.upper}" }, ka.fps?.let { k.yetenek.fpsler.indexOf(it) + 1 } ?: 0) { if (!k.kayitta) { ka.fps = if (it == 0) null else k.yetenek.fpsler[it - 1]; k.oturumYenile { w, h -> monitorler[etkin]?.tampon(w, h) } } }
                    secenek(ic, "KODEK", listOf("H.264", "H.265 (HEVC)"), if (hevc) 1 else 0) { hevc = it == 1 }
                    val hizlar = listOf(10, 20, 35, 50, 80, 100, 150)
                    secenek(ic, "BİT HIZI", hizlar.map { "$it Mb/sn" }, hizlar.indexOf(mbps).coerceAtLeast(0)) { mbps = hizlar[it] }
                    anahtar(ic, "SES KAYDI", sesKayit) { sesKayit = it }
                    anahtar(ic, "GÖRÜNTÜ SABİTLEME", ka.sabitleme) { ka.sabitleme = it; k.ayarDegisti() }
                    aciklama(ic, "Kayıtlar: Galeri → Movies/UPDATED Monitör. Kayıt temizdir (odak, zebra, kılavuz ve LUT kayda girmez). Kayıt düğmesine basılı tutunca ekran görüntüsü alınır.")
                }
            }
            Sekme.MONITOR -> {
                secenek(ic, "EKRAN DÜZENİ", Kip.values().map { it.ad }, kip.ordinal) { kip = Kip.values()[it]; tercih.edit().putString("kip", kip.name).apply(); kur() }
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
                l.forEach { f -> satir(ic, f.name.removeSuffix(".cube"), f.name == a.lutAdi && a.lutAcik, sil = { f.delete(); if (a.lutAdi == f.name) { a.lutAdi = ""; a.lutAcik = false }; panelCiz() }) {
                    runCatching { f.inputStream().use { Lut.oku(f.name, it) } }.onSuccess { lut -> a.lutAdi = f.name; monitorler[etkin]?.lutYukle(lut); kaydet(); panelCiz() }.onFailure { tost("LUT okunamadı: ${it.message}") } } }
                ic.addView(Tema.dugme(this, "+ LUT EKLE (.cube)").apply { typeface = dar; setOnClickListener { lutSec() } }, LinearLayout.LayoutParams(-2, -2).apply { topMargin = dp(12f) })
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
                val kamlar = kameralar(this)
                kamlar.forEach { kk -> satir(ic, kk.second, kaynakAdi[etkin] == kk.second) { kameraAc(etkin, kk); panelCiz() } }
                satir(ic, "Ağ yayını (RTSP · RTMP · HLS)…", kaynaklar[etkin] is AgKaynak) { agSor() }
                if (kamlar.none { it.second.startsWith("USB") }) aciklama(ic, "USB görüntü kaynağı yok: HDMI→USB çeviriciyi tak. Android 14+ ve telefonun harici kamera desteği gerekir.")
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
                aciklama(ic, "UPDATED Monitör ${packageManager.getPackageInfo(packageName, 0).versionName}")
            }
        }
    }

    private fun aciklama(ic: LinearLayout, metin: String) = ic.addView(TextView(this).apply { text = metin; textSize = 13f; setTextColor(GRI); setPadding(0, dp(12f), 0, dp(6f)) })

    private fun etiket(r: LinearLayout, ad: String) = r.addView(TextView(this).apply { text = ad; textSize = 14f; typeface = dar; letterSpacing = 0.05f; setTextColor(Color.WHITE) }, LinearLayout.LayoutParams(dp(220f), -2))

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

    private fun satir(ic: LinearLayout, ad: String, secili: Boolean, sil: (() -> Unit)? = null, tik: () -> Unit) {
        val r = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(dp(14f), dp(12f), dp(14f), dp(12f)); background = Tema.kapsul(if (secili) Color.WHITE else KOYU, dp(6f).toFloat()) }
        r.addView(TextView(this).apply { text = ad; textSize = 15f; typeface = dar; setTextColor(if (secili) Color.BLACK else Color.WHITE) }, LinearLayout.LayoutParams(0, -2, 1f))
        sil?.let { s -> r.addView(TextView(this).apply { text = "SİL"; textSize = 12f; typeface = dar; setTextColor(if (secili) Color.DKGRAY else GRI); setPadding(dp(12f), 0, 0, 0); setOnClickListener { s() } }) }
        r.setOnClickListener { tik() }
        ic.addView(r, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(6f) })
    }

    /* ================= kaynaklar ================= */
    private fun kaynakSec() = panelAc(Sekme.KAYNAK)

    private fun kameraAc(i: Int, k: Pair<String, String>) {
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) { bekleyenKamera = i to k; requestPermissions(arrayOf(Manifest.permission.CAMERA), 1); return }
        val m = monitorler[i] ?: return
        if ((kaynaklar[i] as? KameraKaynak)?.kayitta == true) return tost("Kayıt sürerken kaynak değişmez.")
        tercih.edit().putString("kaynak$i", "kamera").putString("kamera$i", k.first).apply()
        kaynakAdi[i] = k.second
        kamAyar[i] = kameraAyarOku(k.first)
        acici[i] = {
            kaynaklar[i]?.durdur()
            val kaynak = runCatching { KameraKaynak(this, k.first, k.second, kamAyar[i]) }.getOrElse { e -> tost("Kamera açılamadı: ${e.message}"); HataKaydi.not("kamera", e.stackTraceToString()); null }
            if (kaynak != null) {
                kaynaklar[i] = kaynak
                kaynak.baslat(sonYuzey[i]!!, { w, h ->
                    m.tampon(w, h)
                    if (!kaynak.haricimi) { @Suppress("DEPRECATION") val ekran = windowManager.defaultDisplay.rotation * 90; m.ayarlar.dondur = ((kaynak.sensorYonu - ekran + 360) % 360) }
                    runOnUiThread { ustCiz() }
                }, { hata -> runOnUiThread { tost(hata) } })
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

    private fun agAc(i: Int, adres: String) {
        val m = monitorler[i] ?: return
        tercih.edit().putString("kaynak$i", "ag").putString("ag$i", adres).apply()
        kaynakAdi[i] = adres; m.ayarlar.dondur = 0
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
            a.iso?.let { put("iso", it) }; a.pozlamaNs?.let { put("poz", it) }; put("ev", a.ev); put("awb", a.awb); a.odakMesafe?.let { put("odak", it.toDouble()) }; put("sab", a.sabitleme)
        }.toString()).putBoolean("hevc", hevc).putInt("mbps", mbps).putBoolean("sesKayit", sesKayit).apply()
    }

    private fun kameraAyarOku(id: String): KameraAyari {
        val j = runCatching { JSONObject(tercih.getString("kam_$id", "{}")!!) }.getOrNull() ?: return KameraAyari()
        return KameraAyari(
            boyut = if (j.has("w")) Size(j.getInt("w"), j.getInt("h")) else null, fps = if (j.has("fl")) Range(j.getInt("fl"), j.getInt("fu")) else null,
            iso = if (j.has("iso")) j.getInt("iso") else null, pozlamaNs = if (j.has("poz")) j.getLong("poz") else null, ev = j.optInt("ev"),
            awb = j.optInt("awb", CameraMetadata.CONTROL_AWB_MODE_AUTO), odakMesafe = if (j.has("odak")) j.getDouble("odak").toFloat() else null, sabitleme = j.optBoolean("sab", true))
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

    @Deprecated("Geri tuşu: önce panel/şerit kapanır")
    override fun onBackPressed() {
        when { panel.visibility == View.VISIBLE -> panelKapat(); serit.visibility == View.VISIBLE -> seritKapat(); else -> @Suppress("DEPRECATION") super.onBackPressed() }
    }
    override fun onResume() { super.onResume(); tamEkran(); monitorler.forEach { it?.onResume() }; if (sesGosterge) sesOlcerBaslat() }
    override fun onPause() {
        super.onPause()
        if (kamera()?.kayitta == true) kayitDugmesi() // arka plana geçerken kayıt güvenle kapanır
        sesOlcer.durdur(); monitorler.forEach { it?.onPause() }
    }
    override fun onDestroy() { super.onDestroy(); dongu.removeCallbacksAndMessages(null); sesOlcer.durdur(); kaynaklar.forEach { it?.durdur() } }
}
