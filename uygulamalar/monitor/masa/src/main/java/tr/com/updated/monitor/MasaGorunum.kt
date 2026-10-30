package tr.com.updated.monitor

import android.content.Context
import android.graphics.RectF
import android.graphics.SurfaceTexture
import android.opengl.EGL14
import android.opengl.EGLExt
import android.opengl.GLES11Ext
import android.opengl.GLES30
import android.opengl.GLSurfaceView
import android.view.Surface
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10

/**
 * Masa ekranı: en çok 4 kaynak (Wi-Fi kamerası, USB görüntü) aynı GL bağlamında. Ekranda üstte büyük "canlı" (program),
 * altta bütün kaynakların küçük görüntüleri (multiview); yatay ekranda canlı solda, kaynaklar sağda. Kayıt açıksa canlıdaki
 * kaynak her yeni karesinde program kayıt yüzeyine (kayitW×kayitH) sığdırılarak çizilir (kenarlar siyah); USB kaynakların ayrı
 * kaydı (ISO) için de her yuvanın yeni karesi kendi yüzeyine (isoHedef) tam boyutta çizilir.
 */
class MasaGorunum(context: Context) : GLSurfaceView(context) {
    companion object { const val EN_COK = 4; const val KAYIT_W = 1920; const val KAYIT_H = 1080; const val TUVAL_W = 3840f; const val TUVAL_H = 2160f }

    /** Kaynak yuvası: yüzeyi (kaynak buraya çizer), boyutu, kaç derece döndürülerek gösterileceği */
    inner class Yuva(val no: Int) {
        @Volatile var boyut = intArrayOf(1920, 1080)
        @Volatile var dondur = 0
        @Volatile var kare = 0L
        internal var doku: SurfaceTexture? = null
        internal var tex = 0
        internal val mat = FloatArray(16)
        @Volatile internal var yeni = false
        /** Android karesini dokuya 90° çevrilmiş veriyor mu (telefon kamerası; getTransformMatrix'ten okunur): en/boy yer değiştirir */
        @Volatile var dokuDonuk = false
        fun tampon(w: Int, h: Int) { boyut = intArrayOf(w, h); doku?.setDefaultBufferSize(w, h); requestRender() }
        /** Ekranda görünen en/boy (dönüşle) */
        fun oran(): Float { val d = (dondur % 180 != 0) != dokuDonuk; return if (d) boyut[1].toFloat() / boyut[0] else boyut[0].toFloat() / boyut[1] }
    }
    val yuvalar = List(EN_COK) { Yuva(it) }
    /** GL hazır olunca her yuvanın yüzeyi (kaynaklar bunlara çizer) */
    var yuzeylerHazir: ((List<Surface>) -> Unit)? = null
    @Volatile var canli = 0
        set(v) { field = v; requestRender() }
    /** Ekranda kaynak olan yuvalar (boşlar çizilmez) */
    @Volatile var dolu = BooleanArray(EN_COK)
    @Volatile var kayitYuzeyi: Surface? = null
    @Volatile var kayitW = KAYIT_W; @Volatile var kayitH = KAYIT_H
    /** Yuvanın ayrı kayıt yüzeyi ve boyutu (yalnız yeniden kodlanması gereken USB kaynaklar) */
    val isoHedef = arrayOfNulls<Triple<Surface, Int, Int>>(EN_COK)
    /** Program düzeni (iOS ile ortak): 0 oto (kaynak sayısına göre), 1 tek (canlı kaynak), 2 yan yana, 3 üstte iki altta bir, 4 2×2, 5 PiP (canlı tam, ikinci kaynak sağ altta). Kaynaklar yuva sırasıyla yerleşir */
    @Volatile var duzen = 1
        set(v) { field = v; requestRender() }
    /** Düzende görünen yuvalar ve 3840×2160 tuvaldeki yerleri */
    val etkinDuzen: Int get() = if (duzen == 0) dolu.count { it }.coerceIn(1, 4) else duzen
    fun duzenHucreleri(): List<Pair<Int, RectF>> {
        val duzen = etkinDuzen
        if (duzen <= 1) return if (dolu[canli]) listOf(canli to RectF(0f, 0f, TUVAL_W, TUVAL_H)) else emptyList()
        if (duzen == 5) {
            // PiP: önizlemedeki (yoksa ilk diğer) kaynak sağ altta, genişliğin %28'i, kenardan %4 (Vlog ile aynı ölçü)
            val tam = if (dolu[canli]) listOf(canli to RectF(0f, 0f, TUVAL_W, TUVAL_H)) else emptyList()
            val k = siradaki.takeIf { it in 0 until EN_COK && dolu[it] && it != canli } ?: (0 until EN_COK).firstOrNull { dolu[it] && it != canli }
            return tam + listOfNotNull(k?.let { it to RectF(2611f, 1401f, 3686f, 2006f) })
        }
        val y = (0 until EN_COK).filter { dolu[it] }.take(duzen)
        val hucre = when (duzen) {
            2 -> listOf(RectF(0f, 540f, 1920f, 1620f), RectF(1920f, 540f, 3840f, 1620f))
            3 -> listOf(RectF(0f, 0f, 1920f, 1080f), RectF(1920f, 0f, 3840f, 1080f), RectF(960f, 1080f, 2880f, 2160f))
            else -> listOf(RectF(0f, 0f, 1920f, 1080f), RectF(1920f, 0f, 3840f, 1080f), RectF(0f, 1080f, 1920f, 2160f), RectF(1920f, 1080f, 3840f, 2160f))
        }
        return y.zip(hucre)
    }

    /*
     * ATEM gibi geçiş ve katmanlar (program ekranında ve kayıtta aynı): geçiş türü 0 kesme, 1 MIX (çapraz), 2 DIP (siyaha inip çıkar),
     * 3 WIPE (soldan sağa silme); yalnız tek düzende, çoklu düzende kesme. FTB programı siyaha indirir. Logo sağ üstte, alt yazı sol altta,
     * ikisi de yumuşak açılıp kapanır. Süreler gecisSure (ms).
     */
    @Volatile var gecisTuru = 0
    @Volatile var gecisSure = 600
    @Volatile private var gecisOnceki = -1; @Volatile private var gecisBas = 0L; @Volatile private var gecisAnTuru = 0
    val gecisSuruyor get() = gecisOnceki >= 0
    /** Canlıyı geçişle değiştirir (`tur` verilmezse seçili geçiş) */
    fun gecis(yeni: Int, tur: Int = gecisTuru) {
        if (yeni == canli || yeni !in 0 until EN_COK) return
        if (tur != 0 && etkinDuzen <= 1 && dolu[canli] && gecisSure > 0) { gecisOnceki = canli; gecisAnTuru = tur; gecisBas = System.nanoTime() } else gecisOnceki = -1
        canli = yeni
    }
    @Volatile var karart = false
        set(v) { field = v; requestRender() }
    @Volatile var logo: android.graphics.Bitmap? = null
        set(v) { field = v; logoYeni = true; requestRender() }
    @Volatile var altYazi: android.graphics.Bitmap? = null
        set(v) { field = v; altYaziYeni = true; requestRender() }
    @Volatile var logoAcik = false
        set(v) { field = v; requestRender() }
    @Volatile var altYaziAcik = false
        set(v) { field = v; requestRender() }
    @Volatile private var logoYeni = false; @Volatile private var altYaziYeni = false

    init {
        setEGLContextClientVersion(3)
        if (android.os.Build.FINGERPRINT != "robolectric") setEGLConfigChooser { egl, d ->
            fun sec(kayit: Boolean): EGLConfig? {
                val o = intArrayOf(0x3024, 8, 0x3023, 8, 0x3022, 8, 0x3040, 0x40) + (if (kayit) intArrayOf(0x3142, 1) else intArrayOf()) + intArrayOf(0x3038)
                val l = arrayOfNulls<EGLConfig>(1); val n = IntArray(1)
                return if (egl.eglChooseConfig(d, o, l, 1, n) && n[0] > 0) l[0] else null
            }
            sec(true) ?: sec(false) ?: throw IllegalArgumentException("EGL yapılandırması yok")
        }
        preserveEGLContextOnPause = true
        setRenderer(Isleyici())
        renderMode = RENDERMODE_WHEN_DIRTY
    }

    /** Ekran düzeni: canlı alan ve yuvaların küçük alanları (piksel); dokunma ve yazılar da bunu kullanır */
    fun alanlar(w: Float = width.toFloat(), h: Float = height.toFloat(), ustPay: Float = 0f, altPay: Float = 0f): Pair<RectF, List<RectF>> {
        val pay = w.coerceAtMost(h) * 0.015f
        return if (w > h) {
            val sagW = w * 0.3f
            val canliA = RectF(0f, ustPay, w - sagW - pay, h - altPay)
            val kh = (h - ustPay - altPay - pay * (EN_COK - 1)) / EN_COK
            canliA to List(EN_COK) { i -> RectF(w - sagW, ustPay + i * (kh + pay), w, ustPay + i * (kh + pay) + kh) }
        } else {
            val canliA = RectF(0f, ustPay, w, ustPay + w * 9f / 16f)
            val kalan = h - altPay - canliA.bottom - pay
            val kw = (w - pay) / 2; val kh = minOf(kalan / 2 - pay / 2, kw * 9f / 16f)
            val ust = canliA.bottom + pay * 2
            canliA to List(EN_COK) { i -> val x = (i % 2) * (kw + pay); val y = ust + (i / 2) * (kh + pay); RectF(x, y, x + kw, y + kh) }
        }
    }
    @Volatile var ustPay = 0f; @Volatile var altPay = 0f
    /** Telefon "Ninja" düzeni: program alanı ve yuva başına küçük alan (boş yuvada RectF()); verilmişse alanlar() yerine bu çizilir */
    @Volatile var ozelAlan: Pair<RectF, List<RectF>>? = null

    /** Tablet (yönetmen masası, iPad'deki MasaIpad gibi): üstte ÖNİZLEME ve PROGRAM yan yana, altta kaynak ızgarası */
    @Volatile var tablet = false
    /** Önizlemede hazırlanan kaynak (yalnız tablette; -1 yok) */
    @Volatile var siradaki = -1
        set(v) { field = v; requestRender() }
    /** Tablet düzeni: (önizleme, program, kaynaklar); yazı payı monitörlerin üstünde */
    fun tabletAlanlar(w: Float = width.toFloat(), h: Float = height.toFloat(), ustPay: Float = 0f, altPay: Float = 0f): Triple<RectF, RectF, List<RectF>> {
        val d = resources.displayMetrics.density
        val kenar = 20 * d; val ara = 14 * d; val yazi = 24 * d
        val sutun = if (w > h) 4 else 2; val satir = EN_COK / sutun
        val kw = (w - 2 * kenar - (sutun - 1) * ara) / sutun; val kh = kw * 9f / 16f
        val izgaraH = satir * kh + (satir - 1) * ara
        var mw = (w - 2 * kenar - ara) / 2; var mh = mw * 9f / 16f
        val bos = h - ustPay - altPay - yazi - ara - izgaraH - ara
        if (mh > bos && bos > 0) { mh = bos; mw = mh * 16f / 9f }
        val sol = (w - 2 * mw - ara) / 2; val mUst = ustPay + yazi
        val oniz = RectF(sol, mUst, sol + mw, mUst + mh); val prog = RectF(sol + mw + ara, mUst, sol + 2 * mw + ara, mUst + mh)
        val iUst = oniz.bottom + ara * 1.5f
        return Triple(oniz, prog, List(EN_COK) { i -> val x = kenar + (i % sutun) * (kw + ara); val y = iUst + (i / sutun) * (kh + ara); RectF(x, y, x + kw, y + kh) })
    }

    private inner class Isleyici : Renderer, SurfaceTexture.OnFrameAvailableListener {
        private var program = 0; private var resimProgram = 0; private var logoTex = 0; private var altYaziTex = 0
        /** Canlandırma düzeyleri (GL iş parçacığında, kare başına ilerler): FTB karartması, logo ve alt yazı görünürlüğü (0–1) */
        private var ftb = 0f; private var logoA = 0f; private var altA = 0f; private var sonKare = 0L
        private var gw = 1; private var gh = 1
        private val dortgen: FloatBuffer = ByteBuffer.allocateDirect(8 * 4).order(ByteOrder.nativeOrder()).asFloatBuffer().apply { put(floatArrayOf(-1f, -1f, 1f, -1f, -1f, 1f, 1f, 1f)); position(0) }
        /** Kayıt yüzeyleri için EGL yüzeyleri (yüzey kaldırılınca silinir) */
        private val egller = HashMap<Surface, android.opengl.EGLSurface>()

        override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
            program = MonitorGorunum.programYap(MonitorGorunum.KOSE, PARCA)
            resimProgram = MonitorGorunum.programYap(MonitorGorunum.KOSE, RESIM)
            val rt = IntArray(2); GLES30.glGenTextures(2, rt, 0); logoTex = rt[0]; altYaziTex = rt[1]; logoYeni = true; altYaziYeni = true
            GLES30.glEnable(GLES30.GL_BLEND); GLES30.glBlendFunc(GLES30.GL_SRC_ALPHA, GLES30.GL_ONE_MINUS_SRC_ALPHA)
            val t = IntArray(EN_COK); GLES30.glGenTextures(EN_COK, t, 0)
            val yuzeyler = yuvalar.mapIndexed { i, y ->
                y.tex = t[i]
                GLES30.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, y.tex)
                GLES30.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_LINEAR)
                GLES30.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_LINEAR)
                GLES30.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES30.GL_TEXTURE_WRAP_S, GLES30.GL_CLAMP_TO_EDGE)
                GLES30.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES30.GL_TEXTURE_WRAP_T, GLES30.GL_CLAMP_TO_EDGE)
                y.doku?.release()
                val d = SurfaceTexture(y.tex).also { it.setDefaultBufferSize(y.boyut[0], y.boyut[1]); it.setOnFrameAvailableListener(this) }
                y.doku = d; android.opengl.Matrix.setIdentityM(y.mat, 0)
                Surface(d)
            }
            post { yuzeylerHazir?.invoke(yuzeyler) }
        }

        override fun onSurfaceChanged(gl: GL10?, w: Int, h: Int) { gw = w; gh = h }

        override fun onFrameAvailable(s: SurfaceTexture?) { yuvalar.firstOrNull { it.doku === s }?.let { it.yeni = true; it.kare++ }; requestRender() }

        override fun onDrawFrame(gl: GL10?) {
            val hucreler = duzenHucreleri()
            val canlanan = canlandir()
            val programYeni = hucreler.any { yuvalar[it.first].yeni } || canlanan || gecisOnceki.let { it >= 0 && yuvalar[it].yeni }
            val yeniler = BooleanArray(EN_COK) { yuvalar[it].yeni }
            for (y in yuvalar) if (y.yeni) { y.yeni = false; runCatching { y.doku?.updateTexImage(); y.doku?.getTransformMatrix(y.mat); y.dokuDonuk = kotlin.math.abs(y.mat[0]) < 0.5f } }
            GLES30.glClearColor(0f, 0f, 0f, 1f); GLES30.glViewport(0, 0, gw, gh); GLES30.glClear(GLES30.GL_COLOR_BUFFER_BIT)
            GLES30.glUseProgram(program)
            if (tablet) {
                val (oniz, prog, kucukler) = tabletAlanlar(gw.toFloat(), gh.toFloat(), ustPay, altPay)
                siradaki.takeIf { it in 0 until EN_COK && dolu[it] }?.let { ciz(yuvalar[it], oniz, gh) }
                programCiz(hucreler, prog, gh)
                kucukler.forEachIndexed { i, r -> if (dolu[i]) ciz(yuvalar[i], r, gh) }
            } else {
                val (canliA, kucukler) = ozelAlan ?: alanlar(gw.toFloat(), gh.toFloat(), ustPay, altPay)
                programCiz(hucreler, canliA, gh)
                kucukler.forEachIndexed { i, r -> if (dolu[i] && r.width() > 0f) ciz(yuvalar[i], r, gh) }
            }
            egllerTemizle()
            // Program: düzendeki kaynaklardan biri yeni kare verdikçe (en çok ~60/sn)
            val simdi = System.nanoTime()
            if (programYeni && hucreler.isNotEmpty() && simdi - sonProgram >= 15_000_000L) kayitYuzeyi?.let { s -> sonProgram = simdi; hedefeCiz(s, kayitW, kayitH) { programCiz(hucreler, RectF(0f, 0f, kayitW.toFloat(), kayitH.toFloat()), kayitH) } }
            for (i in 0 until EN_COK) if (yeniler[i] && dolu[i]) isoHedef[i]?.let { (s, w, h) -> hedefeCiz(s, w, h) { ciz(yuvalar[i], RectF(0f, 0f, w.toFloat(), h.toFloat()), h) } }
            if (canlanan) requestRender()
        }

        /** Geçiş, FTB ve katman düzeylerini zamana göre ilerletir; biri sürüyorsa true (bir sonraki kare de çizilir) */
        private fun canlandir(): Boolean {
            val simdi = System.nanoTime(); val dt = if (sonKare == 0L) 0f else ((simdi - sonKare) / 1e6f).coerceAtMost(100f); sonKare = simdi
            val adim = dt / gecisSure.coerceAtLeast(1); val katAdim = dt / 300f
            fun yaklas(v: Float, hedef: Float, a: Float) = if (v < hedef) (v + a).coerceAtMost(hedef) else (v - a).coerceAtLeast(hedef)
            ftb = yaklas(ftb, if (karart) 1f else 0f, adim)
            logoA = yaklas(logoA, if (logoAcik && logo != null) 1f else 0f, katAdim)
            altA = yaklas(altA, if (altYaziAcik && altYazi != null) 1f else 0f, katAdim)
            if (logoYeni) { logoYeni = false; resimYukle(logoTex, logo) }
            if (altYaziYeni) { altYaziYeni = false; resimYukle(altYaziTex, altYazi) }
            if (gecisOnceki >= 0 && (simdi - gecisBas) / 1e6f >= gecisSure) gecisOnceki = -1
            return gecisOnceki >= 0 || ftb != (if (karart) 1f else 0f) || logoA != (if (logoAcik && logo != null) 1f else 0f) || altA != (if (altYaziAcik && altYazi != null) 1f else 0f)
        }

        private fun resimYukle(tex: Int, b: android.graphics.Bitmap?) {
            if (b == null || b.isRecycled) return
            GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, tex)
            GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_LINEAR); GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_LINEAR)
            GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_S, GLES30.GL_CLAMP_TO_EDGE); GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_T, GLES30.GL_CLAMP_TO_EDGE)
            android.opengl.GLUtils.texImage2D(GLES30.GL_TEXTURE_2D, 0, b, 0)
        }

        /** Resim katmanı (önceden çarpılmış alfa) alana çizilir */
        private fun resimCiz(tex: Int, x: Float, ust: Float, w: Float, h: Float, yukseklik: Int, alfa: Float) {
            if (alfa <= 0f) return
            GLES30.glUseProgram(resimProgram); GLES30.glBlendFunc(GLES30.GL_ONE, GLES30.GL_ONE_MINUS_SRC_ALPHA)
            GLES30.glViewport(x.toInt(), (yukseklik - ust - h).toInt(), w.toInt(), h.toInt())
            GLES30.glActiveTexture(GLES30.GL_TEXTURE0); GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, tex)
            GLES30.glUniform1i(GLES30.glGetUniformLocation(resimProgram, "uResim"), 0)
            GLES30.glUniform1f(GLES30.glGetUniformLocation(resimProgram, "uAlfa"), alfa)
            val k = GLES30.glGetAttribLocation(resimProgram, "aKonum")
            GLES30.glEnableVertexAttribArray(k); GLES30.glVertexAttribPointer(k, 2, GLES30.GL_FLOAT, false, 0, dortgen)
            GLES30.glDrawArrays(GLES30.GL_TRIANGLE_STRIP, 0, 4)
            GLES30.glBlendFunc(GLES30.GL_SRC_ALPHA, GLES30.GL_ONE_MINUS_SRC_ALPHA); GLES30.glUseProgram(program)
        }

        /** Katmanlar programın 16:9 çerçevesine göre: logo sağ üstte (yükseklik %10), alt yazı sol altta (yükseklik %15) */
        private fun katmanlarCiz(r: RectF, yukseklik: Int) {
            var tw = r.width(); var th = r.height()
            if (tw / th > TUVAL_W / TUVAL_H) tw = th * TUVAL_W / TUVAL_H else th = tw * TUVAL_H / TUVAL_W
            val x0 = r.left + (r.width() - tw) / 2; val y0 = r.top + (r.height() - th) / 2; val pay = tw * 0.04f
            logo?.let { b -> val h = th * 0.10f; val w = h * b.width / b.height; resimCiz(logoTex, x0 + tw - pay - w, y0 + pay * 0.8f, w, h, yukseklik, logoA * (1 - ftb)) }
            altYazi?.let { b -> val h = th * 0.15f; val w = (h * b.width / b.height).coerceAtMost(tw - 2 * pay); resimCiz(altYaziTex, x0 + pay, y0 + th - pay - h, w, h, yukseklik, altA * (1 - ftb)) }
        }

        /** Kaynağı alana sığdırarak çizer (alan ekran koordinatında, üstten) */
        private fun ciz(y: Yuva, r: RectF, yukseklik: Int, alfa: Float = 1f, parlak: Float = 1f) {
            val oran = y.oran(); var vw = r.width(); var vh = r.height()
            if (vw / vh > oran) vw = vh * oran else vh = vw / oran
            val x = r.left + (r.width() - vw) / 2; val ust = r.top + (r.height() - vh) / 2
            GLES30.glViewport(x.toInt(), (yukseklik - ust - vh).toInt(), vw.toInt(), vh.toInt())
            GLES30.glActiveTexture(GLES30.GL_TEXTURE0); GLES30.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, y.tex)
            GLES30.glUniform1i(GLES30.glGetUniformLocation(program, "uKaynak"), 0)
            GLES30.glUniformMatrix4fv(GLES30.glGetUniformLocation(program, "uTexMat"), 1, false, y.mat, 0)
            GLES30.glUniform1i(GLES30.glGetUniformLocation(program, "uDondur"), ((360 - y.dondur) % 360) / 90)
            GLES30.glUniform1f(GLES30.glGetUniformLocation(program, "uAlfa"), alfa); GLES30.glUniform1f(GLES30.glGetUniformLocation(program, "uParlak"), parlak)
            val k = GLES30.glGetAttribLocation(program, "aKonum")
            GLES30.glEnableVertexAttribArray(k); GLES30.glVertexAttribPointer(k, 2, GLES30.GL_FLOAT, false, 0, dortgen)
            GLES30.glDrawArrays(GLES30.GL_TRIANGLE_STRIP, 0, 4)
        }

        private fun egllerTemizle() {
            val kullanilan = (listOfNotNull(kayitYuzeyi) + isoHedef.mapNotNull { it?.first }).toSet()
            val dpy = EGL14.eglGetCurrentDisplay()
            egller.keys.filter { it !in kullanilan }.forEach { egller.remove(it)?.let { e -> EGL14.eglDestroySurface(dpy, e) } }
        }

        private fun egl(hedef: Surface): android.opengl.EGLSurface? = egller[hedef] ?: runCatching {
            val dpy = EGL14.eglGetCurrentDisplay(); val bag = EGL14.eglGetCurrentContext(); val no = IntArray(1)
            EGL14.eglQueryContext(dpy, bag, EGL14.EGL_CONFIG_ID, no, 0)
            val l = arrayOfNulls<android.opengl.EGLConfig>(1); val n = IntArray(1)
            EGL14.eglChooseConfig(dpy, intArrayOf(EGL14.EGL_CONFIG_ID, no[0], EGL14.EGL_NONE), 0, l, 0, 1, n, 0)
            EGL14.eglCreateWindowSurface(dpy, l[0], hedef, intArrayOf(EGL14.EGL_NONE), 0).takeIf { it != EGL14.EGL_NO_SURFACE }?.also { egller[hedef] = it }
        }.onFailure { HataKaydi.not("masa", it.stackTraceToString()) }.getOrNull()

        private var sonProgram = 0L

        /** Program: tek düzende canlı kaynak alana sığar; çoklu düzende 16:9 tuval alana sığdırılıp her kaynak kendi hücresine sığar */
        private fun programCiz(hucreler: List<Pair<Int, RectF>>, r: RectF, yukseklik: Int) {
            val p = 1f - ftb
            if (etkinDuzen <= 1) {
                val hedef = hucreler.firstOrNull()?.first
                val once = gecisOnceki.takeIf { it >= 0 && dolu[it] && hedef != null && it != hedef }
                if (once == null || hedef == null) hedef?.let { ciz(yuvalar[it], r, yukseklik, parlak = p) }
                else {
                    val t = ((System.nanoTime() - gecisBas) / 1e6f / gecisSure.coerceAtLeast(1)).coerceIn(0f, 1f)
                    when (gecisAnTuru) {
                        2 -> if (t < 0.5f) ciz(yuvalar[once], r, yukseklik, parlak = (1 - 2 * t) * p) else ciz(yuvalar[hedef], r, yukseklik, parlak = (2 * t - 1) * p)
                        3 -> {
                            ciz(yuvalar[once], r, yukseklik, parlak = p)
                            GLES30.glEnable(GLES30.GL_SCISSOR_TEST); GLES30.glScissor(r.left.toInt(), (yukseklik - r.bottom).toInt(), (r.width() * t).toInt(), r.height().toInt())
                            ciz(yuvalar[hedef], r, yukseklik, parlak = p); GLES30.glDisable(GLES30.GL_SCISSOR_TEST)
                        }
                        else -> { ciz(yuvalar[once], r, yukseklik, parlak = p); ciz(yuvalar[hedef], r, yukseklik, alfa = t, parlak = p) }
                    }
                }
                katmanlarCiz(r, yukseklik); return
            }
            var tw = r.width(); var th = r.height()
            if (tw / th > TUVAL_W / TUVAL_H) tw = th * TUVAL_W / TUVAL_H else th = tw * TUVAL_H / TUVAL_W
            val x0 = r.left + (r.width() - tw) / 2; val y0 = r.top + (r.height() - th) / 2; val k = tw / TUVAL_W
            for ((i, c) in hucreler) ciz(yuvalar[i], RectF(x0 + c.left * k, y0 + c.top * k, x0 + c.right * k, y0 + c.bottom * k), yukseklik, parlak = p)
            katmanlarCiz(r, yukseklik)
        }

        /** Kayıt yüzeyine çizer (önce siyaha boyanır) */
        private fun hedefeCiz(hedef: Surface, w: Int, h: Int, cizim: () -> Unit) {
            val es = egl(hedef) ?: return
            val dpy = EGL14.eglGetCurrentDisplay()
            val ciz = EGL14.eglGetCurrentSurface(EGL14.EGL_DRAW); val oku = EGL14.eglGetCurrentSurface(EGL14.EGL_READ); val bag = EGL14.eglGetCurrentContext()
            if (!EGL14.eglMakeCurrent(dpy, es, es, bag)) return
            GLES30.glViewport(0, 0, w, h); GLES30.glClearColor(0f, 0f, 0f, 1f); GLES30.glClear(GLES30.GL_COLOR_BUFFER_BIT)
            cizim()
            EGLExt.eglPresentationTimeANDROID(dpy, es, System.nanoTime())
            EGL14.eglSwapBuffers(dpy, es)
            EGL14.eglMakeCurrent(dpy, ciz, oku, bag)
        }
    }

    private val PARCA = """#version 300 es
#extension GL_OES_EGL_image_external_essl3 : require
precision highp float;
uniform samplerExternalOES uKaynak; uniform mat4 uTexMat; uniform int uDondur; uniform float uAlfa; uniform float uParlak;
in vec2 vUv; out vec4 renk;
void main() {
  vec2 uv = vUv;
  if (uDondur == 1) uv = vec2(uv.y, 1.0 - uv.x);
  else if (uDondur == 2) uv = vec2(1.0 - uv.x, 1.0 - uv.y);
  else if (uDondur == 3) uv = vec2(1.0 - uv.y, uv.x);
  renk = vec4(texture(uKaynak, (uTexMat * vec4(uv, 0.0, 1.0)).xy).rgb * uParlak, uAlfa);
}"""

    /** Logo / alt yazı: Android Bitmap'i (önceden çarpılmış alfa), satır 0 üstte */
    private val RESIM = """#version 300 es
precision mediump float;
uniform sampler2D uResim; uniform float uAlfa;
in vec2 vUv; out vec4 renk;
void main() { renk = texture(uResim, vec2(vUv.x, 1.0 - vUv.y)) * uAlfa; }"""
}
