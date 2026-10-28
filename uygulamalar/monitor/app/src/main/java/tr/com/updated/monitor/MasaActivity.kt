package tr.com.updated.monitor

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.ContentValues
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
import android.provider.MediaStore
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
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Masa: telefon ya da tablet ATEM gibi çalışır. Kaynaklar: aynı ağdaki UPDATED Kamera'lar (Wi-Fi kamera, kendiliğinden bulunur)
 * ve USB'den takılan görüntü aygıtları (Sony "USB yayını", HDMI→USB çevirici, webcam modundaki aksiyon kamerası).
 * Üstte canlı (program), altta bütün kaynaklar; bir kaynağa dokununca canlıya geçer, canlıdaki Wi-Fi kamerasının ekranı kırmızı yanar.
 * Kayıt canlıdaki görüntüden 1080p; ses USB'den gelen makine sesi, yoksa telefonun mikrofonu.
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
    private var kaydedici: Kaydedici? = null; private var kayitUri: Uri? = null; private var kayitBas = 0L
    private var ustPay = 0; private var altPay = 0
    private var cokluYayin: android.net.wifi.WifiManager.MulticastLock? = null

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
        sure = etiket("", 15f).apply { typeface = mono; setPadding(dp(10f), 0, dp(10f), 0); background = Tema.kapsul(KIRMIZI, dp(12f).toFloat()); visibility = View.GONE }
        ust.addView(sure, LinearLayout.LayoutParams(-2, dp(30f)).apply { marginEnd = dp(10f) })
        ust.addView(etiket("+  Kaynak", 15f).apply { background = Tema.kapsul(Color.argb(60, 255, 255, 255), dp(14f).toFloat()); setPadding(dp(14f), 0, dp(14f), 0); setOnClickListener { kaynakMenu() } },
            LinearLayout.LayoutParams(-2, dp(40f)))
        kok.addView(ust, FrameLayout.LayoutParams(-1, dp(52f), Gravity.TOP))
        kayitDugme = KayitDugmesi(this).apply { contentDescription = "Kayıt"; setOnClickListener { kayitDugmesi() } }
        kok.addView(kayitDugme, FrameLayout.LayoutParams(dp(72f), dp(72f), Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL).apply { bottomMargin = dp(16f) })
        kok.setOnApplyWindowInsetsListener { _, i ->
            val (u, a) = if (android.os.Build.VERSION.SDK_INT >= 30) i.getInsetsIgnoringVisibility(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout()).let { it.top to it.bottom } else 0 to 0
            ustPay = maxOf(u, dp(8f)); altPay = maxOf(a, dp(8f))
            (ust.layoutParams as FrameLayout.LayoutParams).topMargin = ustPay; (kayitDugme.layoutParams as FrameLayout.LayoutParams).bottomMargin = altPay + dp(8f)
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
        val u = ustPay + dp(56f).toFloat(); val a = altPay + dp(96f).toFloat()
        masa.ustPay = u; masa.altPay = a
        val (canliA, kucukler) = masa.alanlar(w, h, u, a)
        katman.removeAllViews()
        katman.addView(View(this).apply { background = GradientDrawable().apply { setStroke(dp(2f), if (masa.dolu[masa.canli]) KIRMIZI else Color.argb(60, 255, 255, 255)) } },
            FrameLayout.LayoutParams(canliA.width().toInt(), canliA.height().toInt()).apply { leftMargin = canliA.left.toInt(); topMargin = canliA.top.toInt() })
        katman.addView(etiket(if (masa.dolu[masa.canli]) "CANLI · ${adlar[masa.canli]}" else "Canlı: kaynak yok", 13f, if (masa.dolu[masa.canli]) KIRMIZI else GRI).apply { gravity = Gravity.START },
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
            katman.addView(k, FrameLayout.LayoutParams(r.width().toInt(), r.height().toInt()).apply { leftMargin = r.left.toInt(); topMargin = r.top.toInt() })
        }
    }

    /** Yalnız ekran testi: kaynak yokken yuvaların görünüşü için örnek adlar */
    internal fun ornekDoldur() {
        listOf("USB: Sony ILCE-7M5", "UPDATED · Pixel 8", "UPDATED · Galaxy S24").forEachIndexed { i, a -> adlar[i] = a }
        masa.dolu = booleanArrayOf(true, true, true, false); masa.canli = 0; duzen()
    }

    private fun canliYap(i: Int) {
        masa.canli = i; duzen()
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
        secenekler.add("Adresle bağlan (ör. 192.168.1.20)" to { adresSor() })
        AlertDialog.Builder(this).setTitle("Kaynak ekle")
            .setMessage(if (bulunan.isEmpty()) "Wi-Fi kamerası: öteki telefonda UPDATED Kamera → Ayarlar → \"Wi-Fi kamera ol\". Aynı Wi-Fi'da olunca burada kendiliğinden görünür.\nUSB: makineyi \"USB yayını\" moduna alıp tak." else null)
            .setItems(secenekler.map { it.first }.toTypedArray()) { _, i -> secenekler[i].second() }
            .setNegativeButton("Kapat", null).show()
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
    private fun kayitDugmesi() {
        kaydedici?.let { k -> bitir(k); return }
        if (!masa.dolu[masa.canli]) return tost("Önce bir kaynak ekle.")
        val ad = "UPDATED_${SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())}_masa.mp4"
        val d = ContentValues().apply { put(MediaStore.Video.Media.DISPLAY_NAME, ad); put(MediaStore.Video.Media.MIME_TYPE, "video/mp4"); put(MediaStore.Video.Media.RELATIVE_PATH, "Movies/UPDATED Kamera"); put(MediaStore.Video.Media.IS_PENDING, 1) }
        val uri = contentResolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, d) ?: return tost("Kayıt dosyası açılamadı.")
        val fd = contentResolver.openFileDescriptor(uri, "w") ?: run { contentResolver.delete(uri, null, null); return tost("Kayıt dosyası açılamadı.") }
        val ses = checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        val k = runCatching { Kaydedici(this, fd, MasaGorunum.KAYIT_W, MasaGorunum.KAYIT_H, 30, 16, false, sesIste = ses).also { it.baslat() } }
            .getOrElse { e -> runCatching { fd.close() }; contentResolver.delete(uri, null, null); HataKaydi.not("masa", e.stackTraceToString()); return tost("Kayıt başlamadı: ${e.message}") }
        kaydedici = k; kayitUri = uri; kayitBas = System.currentTimeMillis()
        masa.kayitYuzeyi = k.yuzey; masa.requestRender()
        kayitDugme.kayitta = true; sure.visibility = View.VISIBLE
        k.sesKaynagi?.let { tost("Ses: $it") }
    }

    private fun bitir(k: Kaydedici) {
        kaydedici = null; masa.kayitYuzeyi = null; masa.requestRender()
        kayitDugme.kayitta = false; sure.visibility = View.GONE
        val u = kayitUri; kayitUri = null
        Thread {
            Thread.sleep(150)
            val ok = runCatching { k.bitir() }.getOrDefault(false)
            runOnUiThread {
                if (u == null) return@runOnUiThread
                if (ok) { contentResolver.update(u, ContentValues().apply { put(MediaStore.Video.Media.IS_PENDING, 0) }, null, null); tost("Kayıt galeride: Movies/UPDATED Kamera") }
                else { contentResolver.delete(u, null, null); tost("Kayıt kaydedilemedi (görüntü gelmedi).") }
            }
        }.start()
    }

    private fun tik() {
        if (kaydedici != null) { val ms = System.currentTimeMillis() - kayitBas; sure.text = "●  %02d:%02d".format(ms / 60000, ms / 1000 % 60) }
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
        kaydedici?.let { bitir(it) }
        masa.onPause()
    }
    override fun onDestroy() {
        super.onDestroy(); dongu.removeCallbacksAndMessages(null); runCatching { unregisterReceiver(usbDinle) }
        kaynaklar.forEach { (it as? WifiKameraKaynak)?.tally(false) }
        dongu.postDelayed({ kaynaklar.forEach { it?.durdur() } }, 0)
    }
}
