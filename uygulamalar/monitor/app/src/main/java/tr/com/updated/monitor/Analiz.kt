package tr.com.updated.monitor

import android.graphics.RectF
import java.nio.ByteBuffer
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin
import kotlin.math.sqrt

/** Görüntüde 0–1 arası nokta (x sağa, y aşağı) */
data class N(val x: Float, val y: Float)

/** Bulunan düz çizgi: uçları 0–1, açı derece (ekranda saat yönünün tersine, −90…90), güç = toplam kenar ağırlığındaki payı */
data class Cizgi(val a: N, val b: N, val aci: Float, val guc: Float) {
    val ortaY: Float get() = (a.y + b.y) / 2f
}

/** Yüz ayrıntısı (portre ipuçları için): göz hizası (0–1) ve başın dönüşü (ML Kit: + görüntünün sağına bakıyor) */
data class YuzBilgi(val gozY: Float?, val donus: Float)

/**
 * Görüntü analizi sonucu: ufuk çizgisi, öncü (çapraz) çizgiler ve kaçış noktaları, simetri (0–1), görsel ağırlık merkezi.
 */
data class AnalizSonuc(val ufuk: Cizgi?, val oncu: List<Cizgi>, val kacis: N?, val simetri: Float, val agirlik: N)

/**
 * Kompozisyon analizi (telefonun içinde, modelsiz): ölçüm kopyası (256×144 RGBA) üzerinde kenar bulma (Sobel), düz çizgi
 * bulma (Hough), ayna farkı (simetri) ve kenar ağırlığı merkezi (denge). Saniyede ~3 kez, arka planda.
 */
class GoruntuAnaliz {
    private val is_ = Executors.newSingleThreadExecutor()
    private val mesgul = AtomicBoolean(false)
    private var son = 0L

    fun kare(b: ByteBuffer, w: Int, h: Int, oran: Float, geri: (AnalizSonuc) -> Unit) {
        val s = System.currentTimeMillis()
        if (s - son < 320 || !mesgul.compareAndSet(false, true)) return
        son = s
        val kopya = ByteArray(w * h * 4); b.position(0); b.get(kopya)
        try { is_.execute { try { geri(hesapla(kopya, w, h, oran, ustAlt = true)) } catch (_: Throwable) {} finally { mesgul.set(false) } } }
        catch (_: java.util.concurrent.RejectedExecutionException) { mesgul.set(false) }
    }

    fun kapat() { is_.shutdownNow() }

    companion object {
        private const val ACI_ADIM = 2 // derece
        private const val RHO_SAYI = 140

        /**
         * p: RGBA; ustAlt = glReadPixels gibi alttan üste satırlar. oran: görüntünün gerçek en/boyu (ölçüm kopyası buna gerilmiştir;
         * açılar gerçek oranla hesaplanır).
         */
        fun hesapla(p: ByteArray, w: Int, h: Int, oran: Float, ustAlt: Boolean): AnalizSonuc {
            val L = FloatArray(w * h)
            for (y in 0 until h) { val ky = if (ustAlt) h - 1 - y else y
                for (x in 0 until w) { val i = (ky * w + x) * 4; L[y * w + x] = 0.2126f * (p[i].toInt() and 255) + 0.7152f * (p[i + 1].toInt() and 255) + 0.0722f * (p[i + 2].toInt() and 255) } }
            // Sobel; gerçek orana göre: yatay adım oran/w, dikey adım 1/h
            val sx = w / oran; val sy = h.toFloat()
            val G = FloatArray(w * h); val GX = FloatArray(w * h); val GY = FloatArray(w * h)
            var toplamG = 0.0; var agX = 0.0; var agY = 0.0
            for (y in 1 until h - 1) for (x in 1 until w - 1) {
                fun l(dx: Int, dy: Int) = L[(y + dy) * w + x + dx]
                val gx = ((l(1, -1) + 2 * l(1, 0) + l(1, 1)) - (l(-1, -1) + 2 * l(-1, 0) + l(-1, 1))) * sx / sy
                val gy = (l(-1, 1) + 2 * l(0, 1) + l(1, 1)) - (l(-1, -1) + 2 * l(0, -1) + l(1, -1))
                val g = sqrt(gx * gx + gy * gy)
                G[y * w + x] = g; GX[y * w + x] = gx; GY[y * w + x] = gy
                toplamG += g; agX += g * x; agY += g * y
            }
            val agirlik = if (toplamG > 0) N((agX / toplamG / (w - 1)).toFloat(), (agY / toplamG / (h - 1)).toFloat()) else N(0.5f, 0.5f)
            // Eşik: ortalamanın 2,5 katı (en az 24): yalnız belirgin kenarlar oy verir
            val ort = (toplamG / ((w - 2) * (h - 2))).toFloat()
            val esik = maxOf(24f, ort * 2.5f)

            // Hough: θ 0..178 (çizginin normali), ρ = X cosθ + Y sinθ; X = x/w*oran, Y = y/h
            val nT = 180 / ACI_ADIM; val rMax = sqrt(oran * oran + 1f)
            val acc = FloatArray(nT * RHO_SAYI)
            val cosT = FloatArray(nT) { cos(Math.toRadians((it * ACI_ADIM).toDouble())).toFloat() }
            val sinT = FloatArray(nT) { sin(Math.toRadians((it * ACI_ADIM).toDouble())).toFloat() }
            var oyToplam = 0f
            val kenarlar = ArrayList<Int>()
            for (y in 1 until h - 1) for (x in 1 until w - 1) {
                val g = G[y * w + x]; if (g < esik) continue
                kenarlar.add(y * w + x)
                val X = x / (w - 1f) * oran; val Y = y / (h - 1f)
                // Yalnız kenarın yönüne yakın açılara oy (gürültüyü azaltır): kenar normali = gradyan yönü
                val gt = Math.toDegrees(atan2(GY[y * w + x].toDouble(), GX[y * w + x].toDouble())).toFloat().let { (it + 360f) % 180f }
                oyToplam += g
                for (t in 0 until nT) {
                    val fark = abs(((t * ACI_ADIM - gt + 270f) % 180f) - 90f)
                    if (fark > 12f) continue
                    val rho = X * cosT[t] + Y * sinT[t]
                    val ri = ((rho + rMax) / (2 * rMax) * (RHO_SAYI - 1)).toInt().coerceIn(0, RHO_SAYI - 1)
                    acc[t * RHO_SAYI + ri] += g
                }
            }
            // Tepe noktaları (çevresinin en büyüğü)
            data class Tepe(val t: Int, val r: Int, val oy: Float)
            val tepeler = ArrayList<Tepe>()
            for (t in 0 until nT) for (r in 0 until RHO_SAYI) {
                val v = acc[t * RHO_SAYI + r]; if (v <= 0f) continue
                var enBuyuk = true
                loop@ for (dt in -3..3) for (dr in -4..4) {
                    if (dt == 0 && dr == 0) continue
                    val tt = (t + dt + nT) % nT; val rr = r + dr; if (rr !in 0 until RHO_SAYI) continue
                    if (acc[tt * RHO_SAYI + rr] > v) { enBuyuk = false; break@loop }
                }
                if (enBuyuk) tepeler.add(Tepe(t, r, v))
            }
            tepeler.sortByDescending { it.oy }
            fun cizgi(tp: Tepe): Cizgi? {
                val th = Math.toRadians((tp.t * ACI_ADIM).toDouble()); var c = cos(th).toFloat(); var s = sin(th).toFloat()
                var rho = tp.r / (RHO_SAYI - 1f) * 2 * rMax - rMax
                // İnceltme: çizgiye yakın kenar noktalarına en küçük kareler (Hough'un 2°'lik adımından daha hassas açı)
                var sw = 0.0; var mx = 0.0; var my = 0.0
                val yakin = ArrayList<Int>()
                for (i in kenarlar) { val X = (i % w) / (w - 1f) * oran; val Y = (i / w) / (h - 1f); if (abs(X * c + Y * s - rho) < 0.025f) { yakin.add(i); val g = G[i]; sw += g; mx += g * X; my += g * Y } }
                if (sw > 0 && yakin.size > 8) {
                    mx /= sw; my /= sw; var sxx = 0.0; var syy = 0.0; var sxy = 0.0
                    for (i in yakin) { val g = G[i]; val dx = (i % w) / (w - 1f) * oran - mx; val dy = (i / w) / (h - 1f) - my; sxx += g * dx * dx; syy += g * dy * dy; sxy += g * dx * dy }
                    val yonA = 0.5 * atan2(2 * sxy, sxx - syy) // ana doğrultu
                    c = (-sin(yonA)).toFloat(); s = cos(yonA).toFloat() // normal
                    rho = (mx * c + my * s).toFloat()
                }
                // Dikdörtgenle ([0,oran]×[0,1]) kesişim
                val pts = ArrayList<N>()
                if (abs(s) > 1e-4f) { for (X in floatArrayOf(0f, oran)) { val Y = (rho - X * c) / s; if (Y in 0f..1f) pts.add(N(X, Y)) } }
                if (abs(c) > 1e-4f) { for (Y in floatArrayOf(0f, 1f)) { val X = (rho - Y * s) / c; if (X in 0f..oran) pts.add(N(X, Y)) } }
                if (pts.size < 2) return null
                val a = pts[0]; val b = pts.maxBy { hypot(it.x - a.x, it.y - a.y) }
                // Doğrultu (ekranda y aşağı): (−s, c); saat yönünün tersine açı
                var aci = Math.toDegrees(atan2(-c.toDouble(), -s.toDouble())).toFloat()
                while (aci > 90f) aci -= 180f; while (aci <= -90f) aci += 180f
                return Cizgi(N(a.x / oran, a.y), N(b.x / oran, b.y), aci, if (oyToplam > 0f) tp.oy / oyToplam else 0f)
            }
            val cizgiler = tepeler.take(10).mapNotNull { cizgi(it) }
            // Ufuk: en güçlü yataya yakın (±15°), görüntüyü boydan boya geçen çizgi
            val ufuk = cizgiler.filter { abs(it.aci) <= 15f && it.guc >= 0.05f && abs(it.b.x - it.a.x) > 0.8f }.maxByOrNull { it.guc }
            // Öncü çizgiler: çapraz (20–70°) ve güçlü
            val oncu = cizgiler.filter { abs(it.aci) in 20f..70f && it.guc >= 0.035f }.take(4)
            var kacis: N? = null
            val sol = oncu.filter { it.aci > 0 }.maxByOrNull { it.guc }; val sag = oncu.filter { it.aci < 0 }.maxByOrNull { it.guc }
            if (sol != null && sag != null) kesisim(sol, sag, oran)?.let { if (it.x in -0.1f..1.1f && it.y in -0.1f..1.1f) kacis = it }

            // Simetri: dikey eksene göre ayna farkı, sahnenin kendi kontrastına oranla
            var fark = 0.0; var kontrast = 0.0; var ortL = 0.0
            for (v in L) ortL += v; ortL /= L.size
            for (y in 0 until h) for (x in 0 until w / 2) { val a = L[y * w + x]; val b = L[y * w + w - 1 - x]; fark += abs(a - b); kontrast += abs(a - ortL) + abs(b - ortL) }
            val simetri = if (kontrast > 1.0) (1.0 - fark / kontrast).toFloat().coerceIn(0f, 1f) else 0f
            return AnalizSonuc(ufuk, oncu, kacis, simetri, agirlik)
        }

        private fun kesisim(a: Cizgi, b: Cizgi, oran: Float): N? {
            val x1 = a.a.x * oran; val y1 = a.a.y; val x2 = a.b.x * oran; val y2 = a.b.y
            val x3 = b.a.x * oran; val y3 = b.a.y; val x4 = b.b.x * oran; val y4 = b.b.y
            val d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4); if (abs(d) < 1e-6f) return null
            val px = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / d
            val py = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / d
            return N(px / oran, py)
        }
    }
}

/**
 * Tek satırlık yön tarifi (en önemlisi): konu kesiliyor mu, boyutu, portrede göz hizası ve bakış yönü, ufuk eğikliği ve yeri,
 * kılavuza oturma, kadraj dengesi. Konuyu kadrajda sağa almak için telefon sola çevrilir (tarif telefona göre).
 */
fun ipucuUret(konu: RectF?, konuAdi: String, yuz: YuzBilgi?, a: AnalizSonuc?, hedef: N?, hizalama: Float): String? {
    fun yatay(dx: Float) = if (dx > 0) "sola" else "sağa"      // konu sağa gitmeli → telefon sola
    fun dikey(dy: Float) = if (dy > 0) "yukarı kaldır" else "aşağı indir" // konu aşağı gitmeli → telefon yukarı
    val k = konu
    if (k != null) {
        val alan = k.width() * k.height(); val pay = 0.015f
        val sol = k.left < pay; val sag = k.right > 1 - pay; val ust = k.top < pay; val alt = k.bottom > 1 - pay
        if (alan < 0.6f) {
            if ((sol && sag) || (ust && alt)) return "Konu kadraja sığmıyor: biraz uzaklaş"
            if (konuAdi == "Yüz" && ust) return "Baş kesiliyor: telefonu biraz yukarı kaldır"
            if (sol || sag) return "Konu kenarda kesiliyor: telefonu biraz ${if (sol) "sola" else "sağa"} çevir"
            if (ust || alt) return "Konu kenarda kesiliyor: telefonu biraz ${if (ust) "yukarı kaldır" else "aşağı indir"}"
        }
        if (alan < 0.006f) return "Konu çok küçük: biraz yaklaş"
        if (alan > 0.6f) return "Çok yakın: biraz uzaklaş"
        if (yuz != null && konuAdi == "Yüz") {
            yuz.gozY?.let { g -> if (k.height() > 0.1f && abs(g - 1 / 3f) > 0.07f) return "Gözleri üst üçte bire getir: telefonu biraz ${if (g > 1 / 3f) "aşağı indir" else "yukarı kaldır"}" }
            if (yuz.donus > 20f && k.centerX() > 0.55f) return "Baktığı yöne boşluk bırak: telefonu biraz sağa çevir"
            if (yuz.donus < -20f && k.centerX() < 0.45f) return "Baktığı yöne boşluk bırak: telefonu biraz sola çevir"
        }
    }
    a?.ufuk?.let { u ->
        if (abs(u.aci) in 0.7f..12f) return "Ufuk %.1f° eğik: telefonu düzelt".format(abs(u.aci)).replace('.', ',')
        if ((k == null || k.width() * k.height() < 0.05f) && u.ortaY in 0.42f..0.58f)
            return if (u.ortaY < 0.5f) "Ufku üst üçte bire al: telefonu biraz aşağı indir" else "Ufku alt üçte bire al: telefonu biraz yukarı kaldır"
    }
    if (k != null && hedef != null && hizalama < 0.85f) {
        val dx = hedef.x - k.centerX(); val dy = hedef.y - k.centerY()
        return if (abs(dx) >= abs(dy)) "Telefonu biraz ${yatay(dx)} çevir" else "Telefonu biraz ${dikey(dy)}"
    }
    if (k == null && a != null && abs(a.agirlik.x - 0.5f) > 0.18f)
        return if (a.agirlik.x > 0.5f) "Kadraj sağa yüklü: telefonu biraz sağa çevir" else "Kadraj sola yüklü: telefonu biraz sola çevir"
    return null
}

/** İpucu titremesin: yeni ipucu en az 1,2 sn göründükten sonra değişir; kaybolması için 0,8 sn yokluk gerekir */
class IpucuSabitle {
    private var gosterilen: String? = null; private var zaman = 0L; private var yokSaydi = 0L
    fun ver(yeni: String?): String? {
        val s = System.currentTimeMillis()
        if (yeni == gosterilen) { yokSaydi = 0; return gosterilen }
        if (yeni == null) { if (yokSaydi == 0L) yokSaydi = s; if (s - yokSaydi > 800) { gosterilen = null; zaman = s }; return gosterilen }
        if (gosterilen == null || s - zaman > 1200) { gosterilen = yeni; zaman = s }
        return gosterilen
    }
}
