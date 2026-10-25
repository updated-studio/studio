package tr.com.updated.monitor

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.provider.MediaStore
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import org.json.JSONObject

/**
 * UPDATED Monitör (25 Ekim 2026; Android, ilk sürüm): kameranın HDMI çıkışını (USB çevirici), telefon kamerasını ya da ağ yayınını
 * izleme monitörüne çevirir. Görünüm kipleri: tek ekran · görüntü + ölçümler · LUT karşılaştırma (ham | LUT'lu) · iki kaynak yan yana.
 * Araçlar etkin bölmeye uygulanır (bölmeye dokununca etkin olur); araç çubuğu ekrana dokununca gizlenir/açılır.
 */
class MainActivity : Activity() {
    enum class Kip(val ad: String) { TEK("Tek ekran"), OLCUM("Görüntü + ölçümler"), KARSILASTIR("LUT karşılaştırma"), IKI("İki kaynak") }

    private lateinit var kok: FrameLayout
    private lateinit var bolmeler: LinearLayout
    private lateinit var cubuk: View
    private lateinit var cubukIc: LinearLayout
    private val monitorler = arrayOfNulls<MonitorGorunum>(2)
    private val kaynaklar = arrayOfNulls<Kaynak>(2)
    private val ayarlar = arrayOf(Ayarlar(), Ayarlar())
    private var olcum: OlcumGorunum? = null
    private var kip = Kip.TEK
    private var etkin = 0
    private var bekleyenKamera: Pair<Int, Pair<String, String>>? = null
    private val tercih by lazy { getSharedPreferences("monitor", MODE_PRIVATE) }

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        ayarlariOku()
        kip = runCatching { Kip.valueOf(tercih.getString("kip", "TEK")!!) }.getOrDefault(Kip.TEK)
        kok = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        bolmeler = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        kok.addView(bolmeler, FrameLayout.LayoutParams(-1, -1))
        cubuk = cubukYap()
        kok.addView(cubuk, FrameLayout.LayoutParams(-1, -2, Gravity.TOP))
        setContentView(kok)
        tamEkran()
        kur()
    }

    private fun tamEkran() {
        if (android.os.Build.VERSION.SDK_INT >= 30) window.insetsController?.let { it.hide(WindowInsets.Type.systemBars()); it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE }
        else @Suppress("DEPRECATION") { window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY }
    }

    /* ---------------- bölmeler ---------------- */
    private fun kur() {
        kaynaklar.forEach { it?.durdur() }; kaynaklar.fill(null)
        monitorler.forEach { it?.onPause() }; monitorler.fill(null)
        bolmeler.removeAllViews(); olcum = null
        val monitorSayisi = if (kip == Kip.IKI) 2 else 1
        for (i in 0 until monitorSayisi) bolmeler.addView(bolmeYap(i), LinearLayout.LayoutParams(0, -1, 1f))
        if (kip == Kip.OLCUM) {
            val o = OlcumGorunum(this); olcum = o
            monitorler[0]?.olcumKaresi = { buf, w, h -> o.kare(buf, w, h) }
            bolmeler.addView(o, LinearLayout.LayoutParams(0, -1, 0.75f))
        }
        monitorler[0]?.karsilastir = kip == Kip.KARSILASTIR
        etkin = 0; vurgula()
        // Son kullanılan kaynaklar
        for (i in 0 until monitorSayisi) {
            val tur = tercih.getString("kaynak$i", null) ?: if (i == 0) "kamera" else null
            when (tur) {
                "kamera" -> { val k = kameralar(this).firstOrNull(); if (k != null) kameraAc(i, k) }
                "ag" -> tercih.getString("ag$i", null)?.let { agAc(i, it) }
            }
        }
    }

    private fun bolmeYap(i: Int): View {
        val m = MonitorGorunum(this).also { it.ayarlar = ayarlar[i] }
        monitorler[i] = m
        sonYuzey[i] = null; acici[i] = null
        // Yeni yüzey (ilk açılış ya da çizim bağlamı yeniden kurulunca): seçili kaynak bu yüzeyle (yeniden) açılır
        m.yuzeyHazir = { y -> sonYuzey[i] = y; acici[i]?.invoke() }
        val kutu = FrameLayout(this)
        kutu.addView(m, FrameLayout.LayoutParams(-1, -1))
        val etiket = TextView(this).apply { textSize = 11f; setTextColor(Color.argb(180, 255, 255, 255)); setPadding(12, 6, 12, 6); tag = "etiket" }
        kutu.addView(etiket, FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM or Gravity.START))
        m.setOnClickListener { if (etkin != i) { etkin = i; vurgula() } else cubuk.visibility = if (cubuk.visibility == View.VISIBLE) View.GONE else View.VISIBLE }
        return kutu
    }

    private fun vurgula() {
        for (i in 0 until bolmeler.childCount) {
            val v = bolmeler.getChildAt(i)
            v.foreground = if (kip == Kip.IKI && i == etkin) GradientDrawable().apply { setStroke(4, Color.rgb(255, 107, 26)) } else null
        }
        cubukGuncelle()
    }

    private fun etiketYaz(i: Int, metin: String) {
        ((bolmeler.getChildAt(i) as? ViewGroup)?.findViewWithTag<TextView>("etiket"))?.text = metin
    }

    /* ---------------- kaynaklar ---------------- */
    private fun kaynakSec() {
        val kamlar = kameralar(this)
        val secenek = kamlar.map { it.second } + "Ağ yayını (RTSP · RTMP · HLS)…"
        AlertDialog.Builder(this).setTitle("Kaynak seç" + if (kip == Kip.IKI) " (${etkin + 1}. bölme)" else "")
            .setItems(secenek.toTypedArray()) { _, n -> if (n < kamlar.size) kameraAc(etkin, kamlar[n]) else agSor() }
            .setNeutralButton("Yardım") { _, _ -> yardim() }
            .show()
    }

    private fun kameraAc(i: Int, k: Pair<String, String>) {
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            bekleyenKamera = i to k; requestPermissions(arrayOf(Manifest.permission.CAMERA), 1); return
        }
        val m = monitorler[i] ?: return
        tercih.edit().putString("kaynak$i", "kamera").apply()
        etiketYaz(i, k.second)
        acici[i] = {
            kaynaklar[i]?.durdur()
            val kaynak = KameraKaynak(this, k.first, k.second)
            kaynaklar[i] = kaynak
            kaynak.baslat(sonYuzey[i]!!, { w, h ->
                m.tampon(w, h)
                if (!kaynak.haricimi) { // telefon kamerası: ekran yatayken görüntüyü düzelt
                    @Suppress("DEPRECATION") val ekran = windowManager.defaultDisplay.rotation * 90
                    m.ayarlar.dondur = ((kaynak.sensorYonu - ekran + 360) % 360)
                }
            }, { hata -> runOnUiThread { Toast.makeText(this, hata, Toast.LENGTH_LONG).show() } })
        }
        if (sonYuzey[i] != null) acici[i]?.invoke()
    }

    private fun agSor() {
        val e = EditText(this).apply { setText(tercih.getString("ag$etkin", "rtsp://")); setSingleLine() }
        AlertDialog.Builder(this).setTitle("Ağ yayını adresi").setMessage("Ör. rtsp://192.168.1.20:554/live · rtmp://… · https://…/index.m3u8")
            .setView(e).setPositiveButton("Bağlan") { _, _ -> agAc(etkin, e.text.toString().trim()) }.setNegativeButton("Vazgeç", null).show()
    }

    private fun agAc(i: Int, adres: String) {
        val m = monitorler[i] ?: return
        tercih.edit().putString("kaynak$i", "ag").putString("ag$i", adres).apply()
        etiketYaz(i, adres)
        m.ayarlar.dondur = 0
        acici[i] = {
            kaynaklar[i]?.durdur()
            val k = AgKaynak(this, adres); kaynaklar[i] = k
            k.baslat(sonYuzey[i]!!, { w, h -> m.tampon(w, h) }, { hata -> runOnUiThread { Toast.makeText(this, hata, Toast.LENGTH_LONG).show() } })
        }
        if (sonYuzey[i] != null) acici[i]?.invoke()
    }

    private val sonYuzey = arrayOfNulls<android.view.Surface>(2)
    private val acici = arrayOfNulls<(() -> Unit)>(2)

    override fun onRequestPermissionsResult(k: Int, izin: Array<out String>, sonuc: IntArray) {
        super.onRequestPermissionsResult(k, izin, sonuc)
        val b = bekleyenKamera; bekleyenKamera = null
        if (sonuc.firstOrNull() == PackageManager.PERMISSION_GRANTED && b != null) kameraAc(b.first, b.second)
        else Toast.makeText(this, "Kamera izni olmadan USB görüntü ve telefon kamerası açılamaz.", Toast.LENGTH_LONG).show()
    }

    /* ---------------- araç çubuğu ---------------- */
    private fun cubukYap(): View {
        cubukIc = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setPadding(8, 8, 8, 8) }
        return HorizontalScrollView(this).apply { addView(cubukIc); setBackgroundColor(Color.argb(170, 12, 13, 16)); isHorizontalScrollBarEnabled = false }
    }

    private fun dugme(ad: String, acik: Boolean = false, is_: () -> Unit) {
        cubukIc.addView(TextView(this).apply {
            text = ad; textSize = 13f; typeface = Typeface.DEFAULT_BOLD; setPadding(26, 14, 26, 14)
            setTextColor(if (acik) Color.BLACK else Color.WHITE)
            background = GradientDrawable().apply { cornerRadius = 40f; setColor(if (acik) Color.rgb(255, 107, 26) else Color.argb(60, 255, 255, 255)) }
            setOnClickListener { is_(); cubukGuncelle(); monitorler.forEach { it?.yenile() } }
        }, LinearLayout.LayoutParams(-2, -2).apply { marginEnd = 10 })
    }

    private fun cubukGuncelle() {
        cubukIc.removeAllViews()
        val a = ayarlar[etkin]
        dugme("Kaynak") { kaynakSec() }
        dugme(kip.ad) { secim("Görünüm", Kip.values().map { it.ad }) { n -> kip = Kip.values()[n]; tercih.edit().putString("kip", kip.name).apply(); kur() } }
        dugme("Odak", a.peaking) { if (!a.peaking) a.peaking = true else secim("Odak tepe noktası", listOf("Kapat", "Renk: kırmızı", "Renk: mavi", "Renk: beyaz", "Renk: sarı", "Hassas", "Normal", "Kaba")) { n -> when (n) { 0 -> a.peaking = false; in 1..4 -> a.peakRenk = n - 1; 5 -> a.peakEsik = 0.1f; 6 -> a.peakEsik = 0.18f; 7 -> a.peakEsik = 0.3f } ; kaydet(); cubukGuncelle(); yenile() } }
        dugme("Zebra", a.zebra) { if (!a.zebra) a.zebra = true else secim("Zebra eşiği", listOf("Kapat", "%100", "%95", "%90", "%80", "%70 (ten)")) { n -> when (n) { 0 -> a.zebra = false; 1 -> a.zebraEsik = 0.995f; 2 -> a.zebraEsik = 0.95f; 3 -> a.zebraEsik = 0.9f; 4 -> a.zebraEsik = 0.8f; 5 -> a.zebraEsik = 0.7f }; kaydet(); cubukGuncelle(); yenile() } }
        dugme("False color", a.falseColor) { a.falseColor = !a.falseColor }
        if (kip == Kip.OLCUM) dugme("Ölçümler") { olcumSec() }
        dugme(if (a.lutAcik) "LUT ✓" else "LUT", a.lutAcik) { if (a.lutAcik) secim("LUT", listOf("Kapat", "Başka LUT yükle")) { n -> if (n == 0) a.lutAcik = false else lutSec(); kaydet(); cubukGuncelle(); yenile() } else lutSec() }
        dugme(if (a.desqueeze > 1f) "Anamorfik ${a.desqueeze}x" else "Anamorfik", a.desqueeze > 1f) { secim("Anamorfik açma", listOf("Yok", "1,33x", "1,5x", "1,6x", "1,8x", "2x")) { n -> a.desqueeze = floatArrayOf(1f, 1.33f, 1.5f, 1.6f, 1.8f, 2f)[n]; kaydet(); cubukGuncelle(); yenile() } }
        dugme("Kılavuz", a.kilavuz > 0f || a.izgara || a.merkez || a.guvenli > 0f) { kilavuzSec(a) }
        dugme(if (a.zoom > 1f) "Büyüt ${a.zoom.toInt()}x" else "Büyüt", a.zoom > 1f) { a.zoom = when (a.zoom) { 1f -> 2f; 2f -> 4f; else -> 1f } }
        dugme("Ayna", a.ayna) { a.ayna = !a.ayna }
        dugme("Çevir", a.cevir) { a.cevir = !a.cevir }
        dugme("Döndür ${a.dondur}°") { a.dondur = (a.dondur + 90) % 360; monitorler[etkin]?.let { it.tampon(it.kaynakBoyut[0], it.kaynakBoyut[1]) } }
        dugme("Siyah-beyaz", a.monokrom) { a.monokrom = !a.monokrom }
        dugme("Ekran görüntüsü") { ekranGoruntusu() }
        dugme("Yardım") { yardim() }
        kaydet()
    }

    private fun yenile() = monitorler.forEach { it?.yenile() }

    private fun secim(baslik: String, l: List<String>, is_: (Int) -> Unit) {
        AlertDialog.Builder(this).setTitle(baslik).setItems(l.toTypedArray()) { _, n -> is_(n) }.show()
    }

    private fun kilavuzSec(a: Ayarlar) {
        val adlar = arrayOf("2,39:1 sinema", "1,85:1", "16:9", "4:5 (Instagram)", "9:16 (Reels/Story)", "1:1", "Üçte bir ızgarası", "Merkez işareti", "Güvenli alan %90", "Güvenli alan %80")
        val oranlar = floatArrayOf(2.39f, 1.85f, 16f / 9f, 0.8f, 9f / 16f, 1f)
        val secili = BooleanArray(adlar.size) { i -> when (i) { in 0..5 -> a.kilavuz == oranlar[i]; 6 -> a.izgara; 7 -> a.merkez; 8 -> a.guvenli == 0.9f; else -> a.guvenli == 0.8f } }
        AlertDialog.Builder(this).setTitle("Kılavuzlar").setMultiChoiceItems(adlar, secili) { d, n, ok ->
            when (n) {
                in 0..5 -> { a.kilavuz = if (ok) oranlar[n] else 0f; for (j in 0..5) if (j != n) (d as AlertDialog).listView.setItemChecked(j, false) }
                6 -> a.izgara = ok; 7 -> a.merkez = ok
                8 -> { a.guvenli = if (ok) 0.9f else 0f; if (ok) (d as AlertDialog).listView.setItemChecked(9, false) }
                9 -> { a.guvenli = if (ok) 0.8f else 0f; if (ok) (d as AlertDialog).listView.setItemChecked(8, false) }
            }
            yenile()
        }.setPositiveButton("Tamam") { _, _ -> kaydet(); cubukGuncelle() }.show()
    }

    private fun olcumSec() {
        val o = olcum ?: return
        val turler = OlcumGorunum.Tur.values()
        val secili = BooleanArray(turler.size) { turler[it] in o.gorunen }
        AlertDialog.Builder(this).setTitle("Ölçümler").setMultiChoiceItems(turler.map { it.ad }.toTypedArray(), secili) { _, n, ok -> secili[n] = ok }
            .setPositiveButton("Tamam") { _, _ -> o.gorunen = LinkedHashSet(turler.filterIndexed { i, _ -> secili[i] }) }.show()
    }

    /* ---------------- LUT ---------------- */
    private fun lutSec() {
        startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply { addCategory(Intent.CATEGORY_OPENABLE); type = "*/*" }, 7)
    }

    @Deprecated("Activity sonuç arayüzü (eklentisiz)")
    override fun onActivityResult(k: Int, s: Int, veri: Intent?) {
        super.onActivityResult(k, s, veri)
        val uri = veri?.data ?: return
        if (k != 7 || s != RESULT_OK) return
        try {
            val lut = contentResolver.openInputStream(uri)!!.use { Lut.oku(uri.lastPathSegment ?: "LUT", it) }
            val hedef = if (kip == Kip.KARSILASTIR) 0 else etkin
            monitorler[hedef]?.lutYukle(lut)
            Toast.makeText(this, "LUT yüklendi (${lut.boyut}³)", Toast.LENGTH_SHORT).show()
            cubukGuncelle()
        } catch (e: Exception) { Toast.makeText(this, "LUT okunamadı: ${e.message}", Toast.LENGTH_LONG).show() }
    }

    /* ---------------- ekran görüntüsü ---------------- */
    private fun ekranGoruntusu() {
        val m = monitorler[etkin] ?: return
        m.ekranGoruntusu { bmp -> kaydetGorsel(bmp) }
    }

    private fun kaydetGorsel(bmp: Bitmap) {
        val ad = "UPDATED_Monitor_${System.currentTimeMillis()}.png"
        val d = ContentValues().apply { put(MediaStore.Images.Media.DISPLAY_NAME, ad); put(MediaStore.Images.Media.MIME_TYPE, "image/png"); put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/UPDATED Monitör") }
        val uri = contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, d)
        if (uri == null) { Toast.makeText(this, "Kaydedilemedi.", Toast.LENGTH_SHORT).show(); return }
        contentResolver.openOutputStream(uri)?.use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
        Toast.makeText(this, "Galeriye kaydedildi: $ad", Toast.LENGTH_SHORT).show()
    }

    private fun yardim() {
        AlertDialog.Builder(this).setTitle("UPDATED Monitör").setMessage(
            "• Kameranın HDMI çıkışını bir HDMI→USB çeviriciyle telefona tak; 'Kaynak' listesinde 'USB görüntü' olarak çıkar (Android 14 ve üstü, telefonun harici kamera desteği gerekir).\n" +
            "• Ağ yayını: RTSP, RTMP ya da HLS adresi yaz (kayıt cihazları, kameraların ağ çıkışı).\n" +
            "• Ekrana dokun: araç çubuğu gizlenir/açılır. İki kaynak kipinde bölmeye dokununca o bölme etkin olur.\n" +
            "• Odak / Zebra düğmesine ikinci kez basınca ayarları açılır.\n" +
            "• LUT: .cube dosyası (3D). Karşılaştırma kipinde solda ham, sağda LUT'lu görüntü.\n" +
            "Sürüm ${packageManager.getPackageInfo(packageName, 0).versionName}"
        ).setPositiveButton("Tamam", null).show()
    }

    /* ---------------- ayarların saklanması ---------------- */
    private fun kaydet() {
        val e = tercih.edit()
        ayarlar.forEachIndexed { i, a ->
            e.putString("ayar$i", JSONObject().apply {
                put("peaking", a.peaking); put("peakEsik", a.peakEsik.toDouble()); put("peakRenk", a.peakRenk); put("zebra", a.zebra); put("zebraEsik", a.zebraEsik.toDouble())
                put("falseColor", a.falseColor); put("desqueeze", a.desqueeze.toDouble()); put("kilavuz", a.kilavuz.toDouble()); put("izgara", a.izgara); put("merkez", a.merkez)
                put("guvenli", a.guvenli.toDouble()); put("ayna", a.ayna); put("cevir", a.cevir); put("monokrom", a.monokrom)
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
                guvenli = j.optDouble("guvenli", 0.0).toFloat(); ayna = j.optBoolean("ayna"); cevir = j.optBoolean("cevir"); monokrom = j.optBoolean("monokrom")
            }
        }
    }

    override fun onResume() { super.onResume(); tamEkran(); monitorler.forEach { it?.onResume() } }
    override fun onPause() { super.onPause(); monitorler.forEach { it?.onPause() } }
    override fun onDestroy() { super.onDestroy(); kaynaklar.forEach { it?.durdur() } }
}
