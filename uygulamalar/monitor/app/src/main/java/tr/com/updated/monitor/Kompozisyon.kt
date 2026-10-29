package tr.com.updated.monitor

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PointF
import android.graphics.RectF
import android.view.View
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.min
import kotlin.math.sin

/** Kompozisyon kılavuzları (Fatih'in fikri, 25 Ekim 2026): menüden seçilir, görüntünün üstüne çizilir */
enum class KompTur(val ad: String) {
    KAPALI("Kapalı"), UCTE_BIR("Üçte bir"), PHI("Phi ızgarası"), SPIRAL("Altın spiral"), KOSEGEN("Köşegenler"), UCGEN("Altın üçgenler"), SIMETRI("Simetri"), ONCU("Öncü çizgi")
}

private const val FI = 1.6180339f

/** Her kılavuzun "güçlü noktaları" (0–1, görüntü alanına göre); yön: spiral/üçgen için 0–3 (yatay/dikey ayna) */
fun gucluNoktalar(t: KompTur, yon: Int, oran: Float = 16f / 9f): List<PointF> {
    fun c(x: Float, y: Float) = PointF(if (yon and 1 == 1) 1 - x else x, if (yon and 2 == 2) 1 - y else y)
    return when (t) {
        KompTur.UCTE_BIR -> listOf(PointF(1 / 3f, 1 / 3f), PointF(2 / 3f, 1 / 3f), PointF(1 / 3f, 2 / 3f), PointF(2 / 3f, 2 / 3f))
        KompTur.PHI -> { val a = 1 - 1 / FI; val b = 1 / FI; listOf(PointF(a, a), PointF(b, a), PointF(a, b), PointF(b, b)) }
        KompTur.SPIRAL -> listOf(spiralGozu(oran < 1f).let { c(it.x, it.y) })
        KompTur.UCGEN -> { val (p1, p2) = ucgenAyaklari(); listOf(c(p1.x, p1.y), c(p2.x, p2.y)) }
        KompTur.KOSEGEN -> listOf(PointF(0.5f, 0.5f), PointF(0.25f, 0.25f), PointF(0.75f, 0.75f), PointF(0.25f, 0.75f), PointF(0.75f, 0.25f))
        KompTur.SIMETRI -> listOf(PointF(0.5f, 0.5f))
        KompTur.ONCU -> listOf(PointF(0.5f, 0.42f)) // görüntüde kaçış noktası bulunursa o kullanılır
        KompTur.KAPALI -> emptyList()
    }
}

/** Altın spiral: dikdörtgen her adımda 1/φ oranında bölünür (sol, üst, sağ, alt…); her parçaya çeyrek elips yayı */
private fun spiralParcalari(adim: Int = 10, dikey: Boolean = false): List<Pair<RectF, Int>> {
    // Dikey kadrajda ilk bölme yataydan (üst parça) başlar: spiral uzun kenar boyunca açılır
    var r = RectF(0f, 0f, 1f, 1f); val l = ArrayList<Pair<RectF, Int>>()
    for (i in 0 until adim) {
        val yon = (i + if (dikey) 1 else 0) % 4
        val p: RectF
        when (yon) {
            0 -> { val x = r.left + r.width() / FI; p = RectF(r.left, r.top, x, r.bottom); r = RectF(x, r.top, r.right, r.bottom) }
            1 -> { val y = r.top + r.height() / FI; p = RectF(r.left, r.top, r.right, y); r = RectF(r.left, y, r.right, r.bottom) }
            2 -> { val x = r.right - r.width() / FI; p = RectF(x, r.top, r.right, r.bottom); r = RectF(r.left, r.top, x, r.bottom) }
            else -> { val y = r.bottom - r.height() / FI; p = RectF(r.left, y, r.right, r.bottom); r = RectF(r.left, r.top, r.right, y) }
        }
        l.add(p to yon)
    }
    return l
}
fun spiralGozu(dikey: Boolean = false): PointF { val son = spiralParcalari(14, dikey).last().first; return PointF(son.centerX(), son.centerY()) }
/** Altın üçgen: sol üst–sağ alt köşegenine diğer iki köşeden dik inen çizgilerin ayakları */
private fun ucgenAyaklari(oran: Float = 16f / 9f): Pair<PointF, PointF> {
    // Görüntü oranında hesap (dik açı gerçek piksellerde): köşegen (0,0)-(1,1)
    fun ayak(px: Float, py: Float): PointF { val dx = oran; val dy = 1f; val t = (px * oran * dx + py * dy) / (dx * dx + dy * dy); return PointF(t * dx / oran, t * dy) }
    return ayak(1f, 0f) to ayak(0f, 1f)
}

/**
 * Görüntünün üstündeki kompozisyon katmanı: kılavuz çizgileri, güçlü noktalar; akıllı yardımcı açıksa konu kutusu, konudan en yakın
 * güçlü noktaya ok, altta ibre (konu yerine oturunca yeşil) ve terazi (ufuk düzse yeşil). Dokunma almaz (alttaki monitöre geçer).
 */
class KompozisyonGorunum(c: Context, private val alan: () -> RectF) : View(c) {
    var tur = KompTur.KAPALI; set(v) { field = v; invalidate() }
    var yon = 0; set(v) { field = v; invalidate() }
    var konu: RectF? = null; set(v) { field = v; postInvalidate() }      // 0–1, görüntüye göre
    var konuAdi = ""
    var egim: Float? = null; set(v) { field = v; postInvalidate() }     // derece; null = terazi kapalı
    /** Dikey kilitli kamerada telefon yan tutulunca: çizginin ekrandaki açısı = taban + eğim (taban 0/±90/180) */
    var egimTaban = 0f
    var asistan = false
    /** Kullanıcı konuyu seçti: odak ve pozlama onu izliyor (sarı köşe çentikli kutu, "Yüz · AF") */
    var konuSecili = false; set(v) { field = v; postInvalidate() }
    /** AI Kadraj açıkken ekran köşelerindeki kadraj çentiklerinin alanı (görünümde piksel; null = çizilmez) */
    var kenar: (() -> RectF)? = null
    private val centik = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND }
    var hizalama = 0f; private set
    /** Görüntü analizi (ufuk, öncü çizgiler, kaçış noktası); yardımcı açıkken çizilir */
    var analiz: AnalizSonuc? = null; set(v) { field = v; postInvalidate() }
    /** Kısa yön tarifi (ibrenin üstünde) */
    var ipucu: String? = null; set(v) { if (field != v) { field = v; postInvalidate() } }
    /** Konunun gitmesi gereken güçlü nokta (yön tarifi için) */
    var hedefNokta: N? = null; private set
    fun goruntuOrani(): Float { val r = alan(); return if (r.height() > 0f) r.width() / r.height() else 16f / 9f }
    private val yesil = Color.rgb(60, 220, 110); private val sari = Color.rgb(255, 196, 0)
    private val cizgi = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 2.2f; color = Color.argb(200, 255, 255, 255); setShadowLayer(2f, 0f, 0f, Color.argb(160, 0, 0, 0)) }
    private val ince = Paint(cizgi).apply { strokeWidth = 1.4f; color = Color.argb(130, 255, 255, 255) }
    private val nokta = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(220, 255, 255, 255) }
    private val ok = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 5f; strokeCap = Paint.Cap.ROUND }
    private val yazi = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 30f; color = Color.WHITE; setShadowLayer(3f, 0f, 0f, Color.BLACK); isFakeBoldText = true }

    init { setLayerType(LAYER_TYPE_SOFTWARE, null); isClickable = false; isFocusable = false }

    override fun onDraw(c: Canvas) {
        val r = alan(); if (r.width() <= 0f) return
        fun X(x: Float) = r.left + x * r.width()
        fun Y(y: Float) = r.top + y * r.height()
        fun yx(x: Float) = if (yon and 1 == 1) 1 - x else x
        fun yy(y: Float) = if (yon and 2 == 2) 1 - y else y
        val noktalar = gucluNoktalar(tur, yon, r.width() / r.height()).let { if (tur == KompTur.ONCU) listOf(analiz?.kacis?.takeIf { k -> k.x in 0f..1f && k.y in 0f..1f }?.let { k -> PointF(k.x, k.y) } ?: it[0]) else if (tur == KompTur.UCGEN) { val (a1, a2) = ucgenAyaklari(r.width() / r.height()); listOf(PointF(yx(a1.x), yy(a1.y)), PointF(yx(a2.x), yy(a2.y))) } else it }
        // AI Kadraj: konu güçlü noktadaysa kılavuz da yeşil (iyi kadraj gözden kaçmasın)
        val iyi = asistan && konu?.let { k -> noktalar.minOfOrNull { hypot((it.x - k.centerX()) * r.width(), (it.y - k.centerY()) * r.height()) / r.height() }?.let { it < 0.045f } } == true
        // Kadraj çentikleri: 16 dp, beyaz %75; iyi kadrajda yeşil
        val kn = kenar?.invoke()
        if (asistan && kn != null && kn.width() > 0f) {
            val d = resources.displayMetrics.density; val u = 16f * d
            centik.strokeWidth = 2f * d; centik.color = if (iyi) Color.rgb(52, 199, 89) else Color.argb(191, 255, 255, 255)
            for ((x, y, sx, sy) in listOf(floatArrayOf(kn.left, kn.top, 1f, 1f), floatArrayOf(kn.right, kn.top, -1f, 1f), floatArrayOf(kn.left, kn.bottom, 1f, -1f), floatArrayOf(kn.right, kn.bottom, -1f, -1f)))
                c.drawPath(Path().apply { moveTo(x, y + sy * u); lineTo(x, y); lineTo(x + sx * u, y) }, centik)
        }
        cizgi.color = if (iyi) Color.argb(242, 60, 220, 110) else Color.argb(200, 255, 255, 255)
        ince.color = if (iyi) Color.argb(153, 60, 220, 110) else Color.argb(130, 255, 255, 255)
        when (tur) {
            KompTur.UCTE_BIR -> for (k in 1..2) { c.drawLine(X(k / 3f), r.top, X(k / 3f), r.bottom, cizgi); c.drawLine(r.left, Y(k / 3f), r.right, Y(k / 3f), cizgi) }
            KompTur.PHI -> for (k in floatArrayOf(1 - 1 / FI, 1 / FI)) { c.drawLine(X(k), r.top, X(k), r.bottom, cizgi); c.drawLine(r.left, Y(k), r.right, Y(k), cizgi) }
            KompTur.SPIRAL -> {
                val yol = Path()
                for ((p, yonP) in spiralParcalari(10, r.width() < r.height())) {
                    val ax = floatArrayOf(yx(p.left), yx(p.right)); val ay = floatArrayOf(yy(p.top), yy(p.bottom))
                    val kare = RectF(X(ax.min()), Y(ay.min()), X(ax.max()), Y(ay.max()))
                    c.drawRect(kare, ince)
                    // Çeyrek yay: merkez parçanın bir köşesi (sol parça → sağ alt, üst → sol alt, sağ → sol üst, alt → sağ üst)
                    val (mx, my, bas) = when (yonP) { 0 -> Triple(p.right, p.bottom, 180f); 1 -> Triple(p.left, p.bottom, 270f); 2 -> Triple(p.left, p.top, 0f); else -> Triple(p.right, p.top, 90f) }
                    val rw = p.width(); val rh = p.height()
                    val elips = RectF(mx - rw, my - rh, mx + rw, my + rh)
                    // aynalamada açı yönü ters döner: noktaları tek tek hesaplayıp çiz
                    for (s in 0..16) {
                        val a = Math.toRadians((bas + 90f * s / 16f).toDouble())
                        val px = yx((elips.centerX() + rw * cos(a)).toFloat()); val py = yy((elips.centerY() + rh * sin(a)).toFloat())
                        if (s == 0 && yol.isEmpty) yol.moveTo(X(px), Y(py)) else yol.lineTo(X(px), Y(py))
                    }
                }
                c.drawPath(yol, cizgi)
            }
            KompTur.KOSEGEN -> { c.drawLine(r.left, r.top, r.right, r.bottom, cizgi); c.drawLine(r.right, r.top, r.left, r.bottom, cizgi)
                c.drawLine(X(0.5f), r.top, r.left, Y(0.5f), ince); c.drawLine(X(0.5f), r.top, r.right, Y(0.5f), ince); c.drawLine(r.left, Y(0.5f), X(0.5f), r.bottom, ince); c.drawLine(r.right, Y(0.5f), X(0.5f), r.bottom, ince) }
            KompTur.UCGEN -> {
                val oran = r.width() / r.height(); val (a1, a2) = ucgenAyaklari(oran)
                c.drawLine(X(yx(0f)), Y(yy(0f)), X(yx(1f)), Y(yy(1f)), cizgi)
                c.drawLine(X(yx(1f)), Y(yy(0f)), X(yx(a1.x)), Y(yy(a1.y)), cizgi); c.drawLine(X(yx(0f)), Y(yy(1f)), X(yx(a2.x)), Y(yy(a2.y)), cizgi)
            }
            KompTur.SIMETRI -> { c.drawLine(X(0.5f), r.top, X(0.5f), r.bottom, cizgi); c.drawLine(r.left, Y(0.5f), r.right, Y(0.5f), cizgi)
                val kes = Paint(ince).apply { pathEffect = DashPathEffect(floatArrayOf(10f, 10f), 0f) }; c.drawLine(r.left, r.top, r.right, r.bottom, kes); c.drawLine(r.right, r.top, r.left, r.bottom, kes) }
            KompTur.ONCU -> {
                // Alt köşelerden ve alt üçte birlerden kaçış noktasına (bulunduysa görüntüdekine)
                val k = analiz?.kacis?.takeIf { it.x in 0f..1f && it.y in 0f..1f } ?: N(0.5f, 0.42f)
                for ((x, y) in listOf(0f to 1f, 1f to 1f, 0f to 2 / 3f, 1f to 2 / 3f)) c.drawLine(X(x), Y(y), X(k.x), Y(k.y), if (y == 1f) cizgi else ince)
            }
            KompTur.KAPALI -> {}
        }
        noktalar.forEach { c.drawCircle(X(it.x), Y(it.y), 7f, nokta) }

        // Akıllı yardımcı: konudan en yakın güçlü noktaya ok + ibre
        hizalama = 0f; hedefNokta = null
        // Analiz: ufuk (mavi kesikli) ve öncü çizgiler (turuncu, ince)
        val an = analiz
        if (asistan && an != null) {
            an.ufuk?.let { u -> c.drawLine(X(u.a.x), Y(u.a.y), X(u.b.x), Y(u.b.y), Paint(ince).apply { color = Color.argb(200, 106, 152, 248); strokeWidth = 3f; pathEffect = DashPathEffect(floatArrayOf(18f, 12f), 0f) }) }
            if (tur == KompTur.ONCU) an.oncu.forEach { l -> c.drawLine(X(l.a.x), Y(l.a.y), X(l.b.x), Y(l.b.y), Paint(ince).apply { color = Color.argb(170, 255, 107, 26); strokeWidth = 3f }) }
        }
        val k = konu
        if (asistan && k != null && noktalar.isNotEmpty()) {
            val kx = k.centerX(); val ky = k.centerY()
            val hedef = noktalar.minBy { hypot((it.x - kx) * r.width(), (it.y - ky) * r.height()) }
            val mesafe = hypot((hedef.x - kx) * r.width(), (hedef.y - ky) * r.height()) / r.height()
            hizalama = (1f - mesafe / 0.35f).coerceIn(0f, 1f); hedefNokta = N(hedef.x, hedef.y)
            val tamam = mesafe < 0.045f
            val renk = if (tamam) yesil else if (hizalama > 0.6f) sari else Color.WHITE
            val kt = RectF(X(k.left), Y(k.top), X(k.right), Y(k.bottom))
            if (konuSecili) {
                // Seçili konu: köşe çentikleri (stüdyo kamerası izleme kutusu gibi)
                val u = min(kt.width(), kt.height()) * 0.22f
                val cp = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 5f; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND; color = sari; setShadowLayer(2f, 0f, 0f, Color.argb(160, 0, 0, 0)) }
                for ((x, y, sx, sy) in listOf(floatArrayOf(kt.left, kt.top, 1f, 1f), floatArrayOf(kt.right, kt.top, -1f, 1f), floatArrayOf(kt.left, kt.bottom, 1f, -1f), floatArrayOf(kt.right, kt.bottom, -1f, -1f)))
                    c.drawPath(Path().apply { moveTo(x, y + sy * u); lineTo(x, y); lineTo(x + sx * u, y) }, cp)
            } else c.drawRect(kt, Paint(ince).apply { color = renk; strokeWidth = 3f })
            if (!tamam) {
                ok.color = renk
                val sx = X(kx); val sy = Y(ky); val hx = X(hedef.x); val hy = Y(hedef.y)
                c.drawLine(sx, sy, hx, hy, ok)
                val aci = atan2((hy - sy).toDouble(), (hx - sx).toDouble()); val u = 26f
                c.drawLine(hx, hy, (hx - u * cos(aci - 0.5)).toFloat(), (hy - u * sin(aci - 0.5)).toFloat(), ok)
                c.drawLine(hx, hy, (hx - u * cos(aci + 0.5)).toFloat(), (hy - u * sin(aci + 0.5)).toFloat(), ok)
            }
            c.drawCircle(X(hedef.x), Y(hedef.y), 16f, Paint(ok).apply { color = renk; strokeWidth = 4f })
            ibre(c, r, hizalama, tamam)
            if (konuAdi.isNotEmpty()) { c.drawText(if (konuSecili) "$konuAdi · AF" else konuAdi, X(k.left), Y(k.top) - 10f, yazi.apply { color = if (konuSecili) sari else Color.WHITE }); yazi.color = Color.WHITE }
        }
        if (asistan) ipucuCiz(c, r)
        // Terazi: ufuk çizgisi, düzse yeşil
        egim?.let { e ->
            val duz = abs(e) < 1f; val uz = min(r.width(), r.height()) * 0.28f
            val cx = r.centerX(); val cy = r.centerY(); val a = Math.toRadians(-(e + egimTaban).toDouble())
            val p = Paint(cizgi).apply { strokeWidth = 4f; color = if (duz) yesil else Color.WHITE }
            c.drawLine((cx - uz * cos(a)).toFloat(), (cy - uz * sin(a)).toFloat(), (cx + uz * cos(a)).toFloat(), (cy + uz * sin(a)).toFloat(), p)
            c.drawLine(cx - uz - 30f, cy, cx - uz - 10f, cy, Paint(p).apply { color = if (duz) yesil else Color.argb(150, 255, 255, 255) })
            c.drawLine(cx + uz + 10f, cy, cx + uz + 30f, cy, Paint(p).apply { color = if (duz) yesil else Color.argb(150, 255, 255, 255) })
            c.drawText("%.1f°".format(e).replace('.', ','), cx + uz + 40f, cy + 10f, yazi.apply { color = if (duz) yesil else Color.WHITE })
            yazi.color = Color.WHITE
        }
    }

    private val ipucuZemin = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(185, 18, 20, 24) }
    private val ipucuYazi = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 30f; color = Color.WHITE; isFakeBoldText = true }
    /** Yön tarifi: ibrenin üstünde ortalı hap */
    private fun ipucuCiz(c: Canvas, r: RectF) {
        val t = ipucu ?: return
        ipucuYazi.textSize = (min(r.width(), r.height()) * 0.045f).coerceIn(26f, 40f)
        val gen = ipucuYazi.measureText(t); val yuk = ipucuYazi.textSize * 1.9f
        val alt = r.bottom - min(r.width(), r.height()) * 0.11f - 70f
        val kutu = RectF(r.centerX() - gen / 2 - 24f, alt - yuk, r.centerX() + gen / 2 + 24f, alt)
        c.drawRoundRect(kutu, yuk / 2, yuk / 2, ipucuZemin)
        c.drawText(t, kutu.left + 24f, kutu.centerY() + ipucuYazi.textSize * 0.36f, ipucuYazi)
    }

    /** Alt ortada yarım daire ibre: 0 = uzak, 1 = tam yerinde (yeşil) */
    private fun ibre(c: Canvas, r: RectF, v: Float, tamam: Boolean) {
        val rr = min(r.width(), r.height()) * 0.11f; val cx = r.centerX(); val cy = r.bottom - 22f
        val yay = RectF(cx - rr, cy - rr, cx + rr, cy + rr)
        val zemin = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 10f; strokeCap = Paint.Cap.ROUND }
        zemin.color = Color.argb(120, 0, 0, 0); c.drawArc(yay, 180f, 180f, false, zemin)
        zemin.color = Color.rgb(230, 60, 50); c.drawArc(yay, 180f, 60f, false, zemin)
        zemin.color = sari; c.drawArc(yay, 240f, 60f, false, zemin)
        zemin.color = yesil; c.drawArc(yay, 300f, 60f, false, zemin)
        val a = Math.toRadians((180.0 + 180.0 * v)); val ibreP = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = if (tamam) yesil else Color.WHITE; strokeWidth = 6f; strokeCap = Paint.Cap.ROUND }
        c.drawLine(cx, cy, (cx + rr * 0.95 * cos(a)).toFloat(), (cy + rr * 0.95 * sin(a)).toFloat(), ibreP)
        c.drawCircle(cx, cy, 8f, ibreP)
        if (tamam) c.drawText("YERİNDE", cx - 62f, cy - rr - 14f, yazi.apply { color = yesil }).also { yazi.color = Color.WHITE }
    }
}

/** Öneri: konuya en az hareketle uyan kılavuz (kapalı ve mevcut hariç) */
fun kompozisyonOner(konu: RectF?, mevcut: KompTur, oran: Float, analiz: AnalizSonuc? = null): Pair<KompTur, Int>? {
    // Görüntünün kendisi: ayna gibi simetrik sahne → simetri; iki yandan gelen çizgiler bir noktada buluşuyorsa → öncü çizgi
    if (analiz != null && (konu == null || abs(konu.centerX() - 0.5f) < 0.12f)) {
        if (analiz.simetri > 0.8f) return if (mevcut == KompTur.SIMETRI) null else KompTur.SIMETRI to 0
        if (analiz.kacis != null && analiz.oncu.size >= 2) return if (mevcut == KompTur.ONCU) null else KompTur.ONCU to 0
    }
    val k = konu ?: return null
    val adaylar = ArrayList<Triple<KompTur, Int, Float>>()
    for (t in listOf(KompTur.UCTE_BIR, KompTur.PHI, KompTur.SPIRAL, KompTur.UCGEN)) for (y in if (t == KompTur.SPIRAL || t == KompTur.UCGEN) 0..3 else 0..0) {
        val n = gucluNoktalar(t, y, oran).minOf { hypot((it.x - k.centerX()) * oran, it.y - k.centerY()) }
        adaylar.add(Triple(t, y, n))
    }
    // Konu ortadaysa ve iriyse simetri
    if (abs(k.centerX() - 0.5f) < 0.06f && k.width() > 0.25f) return KompTur.SIMETRI to 0
    val en = adaylar.minBy { it.third }
    return if (en.first == mevcut) null else en.first to en.second
}
