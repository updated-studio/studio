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
import android.os.BatteryManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * UPDATED Monitör. Yerleşim, profesyonel kamera uygulamalarının alışılmış düzeni (Blackmagic Camera benzeri iş akışı, UPDATED görünümü):
 * üstte durum şeridi (kaynak, çözünürlük, açık araçlar, saat, pil; dokununca ilgili ayar), sağda hızlı düğmeler, sol altta canlı
 * histogram, ayarlar sekmeli tam ekran panelde (Monitör · Kılavuzlar · LUT · Ölçümler · Kaynak · Görünüm · Kurulum).
 * Görünüm kipleri: tek ekran · görüntü + ölçümler · LUT karşılaştırma · iki kaynak. Araçlar etkin bölmeye uygulanır.
 */
class MainActivity : Activity() {
    enum class Kip(val ad: String) { TEK("Tek ekran"), OLCUM("Görüntü + ölçümler"), KARSILASTIR("LUT karşılaştırma"), IKI("İki kaynak") }
    enum class Sekme(val ad: String) { MONITOR("Monitör"), KILAVUZ("Kılavuzlar"), LUT("LUT"), OLCUM("Ölçümler"), KAYNAK("Kaynak"), GORUNUM("Görünüm"), KURULUM("Kurulum") }

    private lateinit var kok: FrameLayout
    private lateinit var bolmeler: LinearLayout
    private lateinit var hud: LinearLayout
    private lateinit var ray: LinearLayout
    private lateinit var kose: OlcumGorunum
    private lateinit var panel: FrameLayout
    private val monitorler = arrayOfNulls<MonitorGorunum>(2)
    private val kaynaklar = arrayOfNulls<Kaynak>(2)
    private val kaynakAdi = arrayOf("", "")
    private val ayarlar = arrayOf(Ayarlar(), Ayarlar())
    private val sonYuzey = arrayOfNulls<android.view.Surface>(2)
    private val acici = arrayOfNulls<(() -> Unit)>(2)
    private var olcum: OlcumGorunum? = null
    private var kip = Kip.TEK
    private var etkin = 0
    private var arayuzAcik = true
    private var koseHisto = true
    private var parlaklikTam = false
    private var bekleyenKamera: Pair<Int, Pair<String, String>>? = null
    private val tercih by lazy { getSharedPreferences("monitor", MODE_PRIVATE) }
    private val saat = Handler(Looper.getMainLooper())
    private val lutKlasoru by lazy { File(filesDir, "lut").also { it.mkdirs() } }

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        ayarlariOku()
        kip = runCatching { Kip.valueOf(tercih.getString("kip", "TEK")!!) }.getOrDefault(Kip.TEK)
        koseHisto = tercih.getBoolean("koseHisto", true); parlaklikTam = tercih.getBoolean("parlaklik", false)
        kok = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        bolmeler = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        kok.addView(bolmeler, FrameLayout.LayoutParams(-1, -1))
        hud = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setBackgroundColor(Tema.YUZEY); setPadding(dp(10f), dp(6f), dp(10f), dp(6f)) }
        kok.addView(hud, FrameLayout.LayoutParams(-1, -2, Gravity.TOP))
        ray = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL; setPadding(dp(8f), dp(8f), dp(8f), dp(8f)); background = Tema.kapsul(Tema.YUZEY, dp(16f).toFloat()) }
        kok.addView(ray, FrameLayout.LayoutParams(-2, -2, Gravity.END or Gravity.CENTER_VERTICAL).apply { marginEnd = dp(10f); topMargin = dp(24f) })
        kose = OlcumGorunum(this).apply { bindirme = true; gorunen = linkedSetOf(OlcumGorunum.Tur.HISTOGRAM) }
        kok.addView(kose, FrameLayout.LayoutParams(dp(200f), dp(90f), Gravity.BOTTOM or Gravity.START).apply { marginStart = dp(12f); bottomMargin = dp(12f) })
        panel = FrameLayout(this).apply { visibility = View.GONE; setBackgroundColor(Color.argb(235, 10, 11, 14)); isClickable = true }
        kok.addView(panel, FrameLayout.LayoutParams(-1, -1))
        setContentView(kok)
        tamEkran(); parlaklik()
        kur()
        saat.post(object : Runnable { override fun run() { hudCiz(); saat.postDelayed(this, 1000) } })
    }

    private fun dp(v: Float) = Tema.dp(this, v)

    private fun tamEkran() {
        if (android.os.Build.VERSION.SDK_INT >= 30) window.insetsController?.let { it.hide(WindowInsets.Type.systemBars()); it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE }
        else @Suppress("DEPRECATION") { window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY }
    }
    private fun parlaklik() { window.attributes = window.attributes.apply { screenBrightness = if (parlaklikTam) 1f else -1f } }

    /* ---------------- bölmeler ---------------- */
    private fun kur() {
        kaynaklar.forEach { it?.durdur() }; kaynaklar.fill(null)
        monitorler.forEach { it?.onPause() }; monitorler.fill(null)
        bolmeler.removeAllViews(); olcum = null
        val sayi = if (kip == Kip.IKI) 2 else 1
        for (i in 0 until sayi) bolmeler.addView(bolmeYap(i), LinearLayout.LayoutParams(0, -1, 1f))
        if (kip == Kip.OLCUM) { val o = OlcumGorunum(this); olcum = o; bolmeler.addView(o, LinearLayout.LayoutParams(0, -1, 0.75f)) }
        monitorler[0]?.karsilastir = kip == Kip.KARSILASTIR
        olcumBagla()
        etkin = 0; arayuzCiz()
        for (i in 0 until sayi) {
            when (tercih.getString("kaynak$i", null) ?: if (i == 0) "kamera" else null) {
                "kamera" -> { val id = tercih.getString("kamera$i", null); val l = kameralar(this); (l.firstOrNull { it.first == id } ?: l.firstOrNull())?.let { kameraAc(i, it) } }
                "ag" -> tercih.getString("ag$i", null)?.let { agAc(i, it) }
            }
            ayarlar[i].takeIf { it.lutAcik && it.lutAdi.isNotEmpty() }?.let { a -> runCatching { File(lutKlasoru, a.lutAdi).inputStream().use { Lut.oku(a.lutAdi, it) } }.getOrNull()?.let { monitorler[i]?.lutYukle(it) } }
        }
    }

    /** Ölçüm verisi: etkin bölmeden ölçüm paneline ve köşe histogramına */
    private fun olcumBagla() {
        monitorler.forEachIndexed { i, m -> m?.olcumKaresi = if (i == etkin && (olcum != null || koseHisto)) { buf, w, h -> olcum?.kare(buf, w, h); if (koseHisto) kose.kare(buf, w, h) } else null }
        kose.visibility = if (koseHisto && arayuzAcik) View.VISIBLE else View.GONE
    }

    private fun bolmeYap(i: Int): View {
        val m = MonitorGorunum(this).also { it.ayarlar = ayarlar[i] }
        monitorler[i] = m; sonYuzey[i] = null; acici[i] = null
        m.yuzeyHazir = { y -> sonYuzey[i] = y; acici[i]?.invoke() }
        val kutu = FrameLayout(this)
        kutu.addView(m, FrameLayout.LayoutParams(-1, -1))
        m.setOnClickListener {
            if (etkin != i && kip == Kip.IKI) { etkin = i; olcumBagla(); arayuzCiz() }
            else { arayuzAcik = !arayuzAcik; arayuzCiz() }
        }
        return kutu
    }

    /* ---------------- durum şeridi ve hızlı düğmeler ---------------- */
    private fun arayuzCiz() {
        hud.visibility = if (arayuzAcik) View.VISIBLE else View.GONE
        ray.visibility = if (arayuzAcik) View.VISIBLE else View.GONE
        kose.visibility = if (koseHisto && arayuzAcik) View.VISIBLE else View.GONE
        for (i in 0 until bolmeler.childCount) bolmeler.getChildAt(i).foreground = if (kip == Kip.IKI && i == etkin && monitorler.getOrNull(i) != null) GradientDrawable().apply { setStroke(dp(2f), Tema.VURGU) } else null
        rayCiz(); hudCiz()
    }

    private fun hudOge(metin: String, vurgu: Boolean = false, mono: Boolean = false, tik: (() -> Unit)? = null) {
        hud.addView(TextView(this).apply {
            text = metin; textSize = 13f; setTextColor(if (vurgu) Color.BLACK else Tema.METIN)
            typeface = if (mono) Tema.MONO else Typeface.DEFAULT_BOLD
            if (vurgu) background = Tema.kapsul(Tema.VURGU, dp(6f).toFloat())
            setPadding(dp(8f), dp(4f), dp(8f), dp(4f))
            tik?.let { t -> setOnClickListener { t() } }
        }, LinearLayout.LayoutParams(-2, -2).apply { marginEnd = dp(6f) })
    }

    private fun hudCiz() {
        if (!this::hud.isInitialized) return
        hud.removeAllViews()
        val a = ayarlar[etkin]; val m = monitorler[etkin]
        hudOge(kaynakAdi[etkin].ifEmpty { "Kaynak yok" }.take(28)) { panelAc(Sekme.KAYNAK) }
        m?.kaynakBoyut?.let { hudOge("${it[0]}×${it[1]}", mono = true) { panelAc(Sekme.KAYNAK) } }
        hudOge(kip.ad) { panelAc(Sekme.GORUNUM) }
        if (a.peaking) hudOge("ODAK", true) { panelAc(Sekme.MONITOR) }
        if (a.zebra) hudOge("ZEBRA ${(a.zebraEsik * 100).toInt()}", true) { panelAc(Sekme.MONITOR) }
        if (a.falseColor) hudOge("FALSE", true) { panelAc(Sekme.MONITOR) }
        if (a.lutAcik) hudOge("LUT ${a.lutAdi.removeSuffix(".cube").take(14)}", true) { panelAc(Sekme.LUT) }
        if (a.desqueeze > 1f) hudOge("${a.desqueeze}x ANA", true) { panelAc(Sekme.KAYNAK) }
        if (a.zoom > 1f) hudOge("${a.zoom.toInt()}x", true)
        if (a.temiz) hudOge("TEMİZ", true)
        hud.addView(View(this), LinearLayout.LayoutParams(0, 1, 1f))
        hudOge(SimpleDateFormat("HH:mm:ss", Locale("tr")).format(Date()), mono = true)
        val pil = registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))?.let { it.getIntExtra(BatteryManager.EXTRA_LEVEL, 0) * 100 / maxOf(1, it.getIntExtra(BatteryManager.EXTRA_SCALE, 100)) }
        pil?.let { hudOge("%$it", mono = true) }
        hudOge("⚙ Ayarlar") { panelAc(Sekme.MONITOR) }
    }

    private fun rayCiz() {
        ray.removeAllViews()
        val a = ayarlar[etkin]
        fun d(ad: String, acik: Boolean, is_: () -> Unit) = ray.addView(Tema.dugme(this, ad, acik, kucuk = true).apply { setOnClickListener { is_(); kaydet(); arayuzCiz(); yenile() } }, LinearLayout.LayoutParams(dp(78f), -2).apply { bottomMargin = dp(6f) })
        d("ODAK", a.peaking) { a.peaking = !a.peaking }
        d("ZEBRA", a.zebra) { a.zebra = !a.zebra }
        d("FALSE", a.falseColor) { a.falseColor = !a.falseColor }
        d("LUT", a.lutAcik) { if (a.lutAdi.isEmpty()) panelAc(Sekme.LUT) else { a.lutAcik = !a.lutAcik } }
        d(if (a.zoom > 1f) "${a.zoom.toInt()}x" else "BÜYÜT", a.zoom > 1f) { a.zoom = when (a.zoom) { 1f -> 2f; 2f -> 4f; else -> 1f } }
        d("TEMİZ", a.temiz) { a.temiz = !a.temiz }
        // Ekran görüntüsü: büyük yuvarlak düğme (kayıt düğmesinin yeri)
        ray.addView(View(this).apply {
            background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(Color.WHITE); setStroke(dp(4f), Tema.VURGU) }
            contentDescription = "Ekran görüntüsü"; setOnClickListener { ekranGoruntusu() }
        }, LinearLayout.LayoutParams(dp(56f), dp(56f)).apply { topMargin = dp(6f) })
    }

    private fun yenile() = monitorler.forEach { it?.yenile() }

    /* ---------------- ayarlar paneli ---------------- */
    private var sekme = Sekme.MONITOR
    private fun panelAc(s: Sekme) { sekme = s; panel.visibility = View.VISIBLE; panelCiz() }
    private fun panelKapat() { panel.visibility = View.GONE; kaydet(); arayuzCiz(); yenile() }

    private fun panelCiz() {
        panel.removeAllViews()
        val kat = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        panel.addView(kat, FrameLayout.LayoutParams(-1, -1))
        // Sol: sekmeler
        val sol = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(12f), dp(16f), dp(12f), dp(16f)); setBackgroundColor(Tema.YUZEY2) }
        sol.addView(TextView(this).apply { text = "AYARLAR"; textSize = 12f; letterSpacing = 0.12f; setTextColor(Tema.METIN2); setPadding(dp(6f), 0, 0, dp(12f)) })
        Sekme.values().forEach { s -> sol.addView(Tema.dugme(this, s.ad, s == sekme).apply { gravity = Gravity.START or Gravity.CENTER_VERTICAL; setOnClickListener { sekme = s; panelCiz() } }, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(6f) }) }
        sol.addView(View(this), LinearLayout.LayoutParams(1, 0, 1f))
        sol.addView(Tema.dugme(this, "Kapat ✕").apply { setOnClickListener { panelKapat() } }, LinearLayout.LayoutParams(-1, -2))
        kat.addView(ScrollView(this).apply { addView(sol) }, LinearLayout.LayoutParams(dp(190f), -1))
        // Sağ: seçili sekmenin satırları
        val ic = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(20f), dp(16f), dp(20f), dp(24f)) }
        kat.addView(ScrollView(this).apply { addView(ic) }, LinearLayout.LayoutParams(0, -1, 1f))
        ic.addView(TextView(this).apply { text = sekme.ad + if (kip == Kip.IKI && sekme in listOf(Sekme.MONITOR, Sekme.KILAVUZ, Sekme.LUT, Sekme.KAYNAK)) " · ${etkin + 1}. bölme" else ""; textSize = 22f; typeface = Typeface.DEFAULT_BOLD; setTextColor(Tema.METIN); setPadding(0, 0, 0, dp(12f)) })
        val a = ayarlar[etkin]
        when (sekme) {
            Sekme.MONITOR -> {
                anahtar(ic, "Odak yardımı (peaking)", a.peaking) { a.peaking = it }
                secenek(ic, "Odak rengi", listOf("Kırmızı", "Mavi", "Beyaz", "Sarı"), a.peakRenk) { a.peakRenk = it }
                secenek(ic, "Odak hassasiyeti", listOf("Hassas", "Normal", "Kaba"), when (a.peakEsik) { 0.1f -> 0; 0.3f -> 2; else -> 1 }) { a.peakEsik = floatArrayOf(0.1f, 0.18f, 0.3f)[it] }
                anahtar(ic, "Zebra", a.zebra) { a.zebra = it }
                val zeb = floatArrayOf(0.7f, 0.8f, 0.9f, 0.95f, 0.995f)
                secenek(ic, "Zebra eşiği", listOf("%70 ten", "%80", "%90", "%95", "%100"), zeb.indexOfFirst { kotlin.math.abs(it - a.zebraEsik) < 0.01f }.coerceAtLeast(0)) { a.zebraEsik = zeb[it] }
                anahtar(ic, "False color", a.falseColor) { a.falseColor = it }
                anahtar(ic, "Siyah-beyaz", a.monokrom) { a.monokrom = it }
                anahtar(ic, "Temiz görüntü (araç bindirmeleri gizli, LUT kalır)", a.temiz) { a.temiz = it }
                secenek(ic, "Büyütme", listOf("Yok", "2x", "4x"), when (a.zoom) { 2f -> 1; 4f -> 2; else -> 0 }) { a.zoom = floatArrayOf(1f, 2f, 4f)[it] }
            }
            Sekme.KILAVUZ -> {
                val oran = floatArrayOf(0f, 2.39f, 1.85f, 16f / 9f, 0.8f, 9f / 16f, 1f)
                secenek(ic, "Kadraj kılavuzu", listOf("Yok", "2,39:1", "1,85:1", "16:9", "4:5", "9:16", "1:1"), oran.indexOfFirst { kotlin.math.abs(it - a.kilavuz) < 0.01f }.coerceAtLeast(0)) { a.kilavuz = oran[it] }
                anahtar(ic, "Üçte bir ızgarası", a.izgara) { a.izgara = it }
                anahtar(ic, "Merkez işareti", a.merkez) { a.merkez = it }
                secenek(ic, "Güvenli alan", listOf("Yok", "%90", "%80"), when (a.guvenli) { 0.9f -> 1; 0.8f -> 2; else -> 0 }) { a.guvenli = floatArrayOf(0f, 0.9f, 0.8f)[it] }
            }
            Sekme.LUT -> {
                anahtar(ic, "LUT'u görüntüye uygula", a.lutAcik) { a.lutAcik = it }
                val l = lutKlasoru.listFiles { f -> f.name.endsWith(".cube", true) }?.sortedBy { it.name.lowercase() }.orEmpty()
                aciklama(ic, if (l.isEmpty()) "Kitaplık boş. .cube (3D) LUT ekle; eklediklerin burada saklanır." else "Kitaplık (${l.size}) — seçince etkin bölmeye uygulanır:")
                l.forEach { f ->
                    satir(ic, f.name.removeSuffix(".cube"), f.name == a.lutAdi && a.lutAcik, sil = { f.delete(); if (a.lutAdi == f.name) { a.lutAdi = ""; a.lutAcik = false }; panelCiz() }) {
                        runCatching { f.inputStream().use { Lut.oku(f.name, it) } }.onSuccess { lut -> a.lutAdi = f.name; monitorler[etkin]?.lutYukle(lut); panelCiz() }.onFailure { tost("LUT okunamadı: ${it.message}") }
                    }
                }
                ic.addView(Tema.dugme(this, "+ LUT ekle (.cube)").apply { setOnClickListener { lutSec() } }, LinearLayout.LayoutParams(-2, -2).apply { topMargin = dp(10f) })
                aciklama(ic, "İpucu: LUT karşılaştırma görünümünde solda ham, sağda LUT'lu görüntü yan yana.")
            }
            Sekme.OLCUM -> {
                anahtar(ic, "Köşe histogramı", koseHisto) { koseHisto = it; tercih.edit().putBoolean("koseHisto", it).apply(); olcumBagla() }
                aciklama(ic, "Tam ölçüm paneli için Görünüm → \"Görüntü + ölçümler\". Panelde görünecek ölçümler:")
                val o = olcum
                OlcumGorunum.Tur.values().forEach { t -> anahtar(ic, t.ad, o?.gorunen?.contains(t) ?: true) { ok -> o?.let { it.gorunen = LinkedHashSet(if (ok) it.gorunen + t else it.gorunen - t) } } }
            }
            Sekme.KAYNAK -> {
                val kamlar = kameralar(this)
                aciklama(ic, "Görüntü kaynağı:")
                kamlar.forEach { k -> satir(ic, k.second, kaynakAdi[etkin] == k.second) { kameraAc(etkin, k); panelCiz() } }
                satir(ic, "Ağ yayını (RTSP · RTMP · HLS)…", kaynakAdi[etkin].startsWith("rtsp") || kaynakAdi[etkin].startsWith("rtmp") || kaynakAdi[etkin].startsWith("http")) { agSor() }
                if (kamlar.none { it.second.startsWith("USB") }) aciklama(ic, "USB görüntü kaynağı görünmüyor: HDMI→USB çeviriciyi tak. Android 14 ve üstü ile telefonun harici kamera desteği gerekir.")
                secenek(ic, "Anamorfik açma", listOf("Yok", "1,33x", "1,5x", "1,6x", "1,8x", "2x"), floatArrayOf(1f, 1.33f, 1.5f, 1.6f, 1.8f, 2f).indexOfFirst { kotlin.math.abs(it - a.desqueeze) < 0.01f }.coerceAtLeast(0)) { a.desqueeze = floatArrayOf(1f, 1.33f, 1.5f, 1.6f, 1.8f, 2f)[it] }
                secenek(ic, "Döndür", listOf("0°", "90°", "180°", "270°"), a.dondur / 90) { a.dondur = it * 90; monitorler[etkin]?.let { m -> m.tampon(m.kaynakBoyut[0], m.kaynakBoyut[1]) } }
                anahtar(ic, "Ayna (yatay çevir)", a.ayna) { a.ayna = it }
                anahtar(ic, "Ters çevir (dikey)", a.cevir) { a.cevir = it }
            }
            Sekme.GORUNUM -> {
                Kip.values().forEach { k -> satir(ic, k.ad, k == kip) { kip = k; tercih.edit().putString("kip", k.name).apply(); kur(); panelCiz() } }
                aciklama(ic, "İki kaynak görünümünde bölmeye dokunarak etkin bölmeyi seç; araçlar ve ayarlar etkin bölmeye uygulanır.")
            }
            Sekme.KURULUM -> {
                anahtar(ic, "Ekran parlaklığı en yüksek", parlaklikTam) { parlaklikTam = it; tercih.edit().putBoolean("parlaklik", it).apply(); parlaklik() }
                aciklama(ic, "Ekran açık kalır, uygulama yatay çalışır. Ekran görüntüleri Galeri → Pictures/UPDATED Monitör.")
                satir(ic, "Yardım ve ipuçları", false) { yardim() }
                aciklama(ic, "UPDATED Monitör ${packageManager.getPackageInfo(packageName, 0).versionName} · updated.com.tr")
            }
        }
    }

    private fun aciklama(ic: LinearLayout, metin: String) = ic.addView(TextView(this).apply { text = metin; textSize = 13f; setTextColor(Tema.METIN2); setPadding(0, dp(10f), 0, dp(6f)) })

    private fun anahtar(ic: LinearLayout, ad: String, acik: Boolean, degis: (Boolean) -> Unit) {
        val r = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(0, dp(8f), 0, dp(8f)) }
        r.addView(TextView(this).apply { text = ad; textSize = 15f; setTextColor(Tema.METIN) }, LinearLayout.LayoutParams(0, -2, 1f))
        r.addView(Tema.dugme(this, if (acik) "Açık" else "Kapalı", acik, kucuk = true).apply { minWidth = dp(76f) }, LinearLayout.LayoutParams(-2, -2))
        r.setOnClickListener { degis(!acik); kaydet(); yenile(); panelCiz() }
        ic.addView(r); cizgi(ic)
    }

    private fun secenek(ic: LinearLayout, ad: String, l: List<String>, secili: Int, degis: (Int) -> Unit) {
        ic.addView(TextView(this).apply { text = ad; textSize = 15f; setTextColor(Tema.METIN); setPadding(0, dp(8f), 0, dp(6f)) })
        val r = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        l.forEachIndexed { i, s -> r.addView(Tema.dugme(this, s, i == secili, kucuk = true).apply { setOnClickListener { degis(i); kaydet(); yenile(); panelCiz() } }, LinearLayout.LayoutParams(-2, -2).apply { marginEnd = dp(6f) }) }
        ic.addView(android.widget.HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false; addView(r) }); cizgi(ic)
    }

    private fun satir(ic: LinearLayout, ad: String, secili: Boolean, sil: (() -> Unit)? = null, tik: () -> Unit) {
        val r = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(dp(12f), dp(10f), dp(12f), dp(10f)); background = Tema.kapsul(if (secili) Color.argb(60, 255, 107, 26) else Color.argb(18, 255, 255, 255), dp(10f).toFloat(), if (secili) Tema.VURGU else 0) }
        r.addView(TextView(this).apply { text = (if (secili) "✓  " else "") + ad; textSize = 15f; setTextColor(Tema.METIN) }, LinearLayout.LayoutParams(0, -2, 1f))
        sil?.let { s -> r.addView(TextView(this).apply { text = "Sil"; textSize = 13f; setTextColor(Tema.METIN2); setPadding(dp(10f), 0, 0, 0); setOnClickListener { s() } }) }
        r.setOnClickListener { tik() }
        ic.addView(r, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(6f) })
    }

    private fun cizgi(ic: LinearLayout) = ic.addView(View(this).apply { setBackgroundColor(Tema.CIZGI) }, LinearLayout.LayoutParams(-1, 1))
    private fun tost(m: String) = Toast.makeText(this, m, Toast.LENGTH_LONG).show()

    /* ---------------- kaynaklar ---------------- */
    private fun kameraAc(i: Int, k: Pair<String, String>) {
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) { bekleyenKamera = i to k; requestPermissions(arrayOf(Manifest.permission.CAMERA), 1); return }
        val m = monitorler[i] ?: return
        tercih.edit().putString("kaynak$i", "kamera").putString("kamera$i", k.first).apply()
        kaynakAdi[i] = k.second
        acici[i] = {
            kaynaklar[i]?.durdur()
            val kaynak = KameraKaynak(this, k.first, k.second); kaynaklar[i] = kaynak
            kaynak.baslat(sonYuzey[i]!!, { w, h ->
                m.tampon(w, h)
                if (!kaynak.haricimi) { @Suppress("DEPRECATION") val ekran = windowManager.defaultDisplay.rotation * 90; m.ayarlar.dondur = ((kaynak.sensorYonu - ekran + 360) % 360) }
                runOnUiThread { hudCiz() }
            }, { hata -> runOnUiThread { tost(hata) } })
        }
        if (sonYuzey[i] != null) acici[i]?.invoke()
        hudCiz()
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
            k.baslat(sonYuzey[i]!!, { w, h -> m.tampon(w, h); runOnUiThread { hudCiz() } }, { hata -> runOnUiThread { tost(hata) } })
        }
        if (sonYuzey[i] != null) acici[i]?.invoke()
        hudCiz()
    }

    override fun onRequestPermissionsResult(k: Int, izin: Array<out String>, sonuc: IntArray) {
        super.onRequestPermissionsResult(k, izin, sonuc)
        val b = bekleyenKamera; bekleyenKamera = null
        if (sonuc.firstOrNull() == PackageManager.PERMISSION_GRANTED && b != null) kameraAc(b.first, b.second)
        else tost("Kamera izni olmadan USB görüntü ve telefon kamerası açılamaz.")
    }

    /* ---------------- LUT kitaplığı ---------------- */
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
            val lut = hedef.inputStream().use { Lut.oku(hedef.name, it) } // doğrula
            val i = if (kip == Kip.KARSILASTIR) 0 else etkin
            ayarlar[i].lutAdi = hedef.name; ayarlar[i].lutAcik = true
            monitorler[i]?.lutYukle(lut); kaydet()
            tost("LUT kitaplığa eklendi (${lut.boyut}³)")
            if (panel.visibility == View.VISIBLE) panelCiz() else arayuzCiz()
        } catch (e: Exception) { tost("LUT okunamadı: ${e.message}") }
    }

    /* ---------------- ekran görüntüsü ---------------- */
    private fun ekranGoruntusu() { monitorler[etkin]?.ekranGoruntusu { bmp -> kaydetGorsel(bmp) } }

    private fun kaydetGorsel(bmp: Bitmap) {
        val ad = "UPDATED_Monitor_${SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())}.png"
        val d = ContentValues().apply { put(MediaStore.Images.Media.DISPLAY_NAME, ad); put(MediaStore.Images.Media.MIME_TYPE, "image/png"); put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/UPDATED Monitör") }
        val uri = contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, d) ?: return tost("Kaydedilemedi.")
        contentResolver.openOutputStream(uri)?.use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
        tost("Galeriye kaydedildi")
    }

    private fun yardim() {
        AlertDialog.Builder(this).setTitle("UPDATED Monitör").setMessage(
            "• Kameranın HDMI çıkışını HDMI→USB çeviriciyle telefona tak; Ayarlar → Kaynak'ta 'USB görüntü' olarak çıkar (Android 14+, harici kamera desteği).\n" +
            "• Ağ yayını: RTSP, RTMP ya da HLS adresi.\n" +
            "• Ekrana dokun: şerit ve düğmeler gizlenir/açılır. Üst şeritte bir değere dokununca ilgili ayar açılır.\n" +
            "• Sağdaki düğmeler: odak, zebra, false color, LUT, büyüt, temiz görüntü; beyaz daire ekran görüntüsü.\n" +
            "• LUT: .cube (3D) dosyaları Ayarlar → LUT kitaplığında saklanır."
        ).setPositiveButton("Tamam", null).show()
    }

    /* ---------------- ayarların saklanması ---------------- */
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
        e.apply()
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

    @Deprecated("Geri tuşu: önce ayarlar paneli kapanır")
    override fun onBackPressed() { if (panel.visibility == View.VISIBLE) panelKapat() else @Suppress("DEPRECATION") super.onBackPressed() }
    override fun onResume() { super.onResume(); tamEkran(); monitorler.forEach { it?.onResume() } }
    override fun onPause() { super.onPause(); monitorler.forEach { it?.onPause() } }
    override fun onDestroy() { super.onDestroy(); saat.removeCallbacksAndMessages(null); kaynaklar.forEach { it?.durdur() } }
}
