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
    companion object { const val EN_COK = 4; const val KAYIT_W = 1920; const val KAYIT_H = 1080 }

    /** Kaynak yuvası: yüzeyi (kaynak buraya çizer), boyutu, kaç derece döndürülerek gösterileceği */
    inner class Yuva(val no: Int) {
        @Volatile var boyut = intArrayOf(1920, 1080)
        @Volatile var dondur = 0
        @Volatile var kare = 0L
        internal var doku: SurfaceTexture? = null
        internal var tex = 0
        internal val mat = FloatArray(16)
        @Volatile internal var yeni = false
        fun tampon(w: Int, h: Int) { boyut = intArrayOf(w, h); doku?.setDefaultBufferSize(w, h); requestRender() }
        /** Ekranda görünen en/boy (dönüşle) */
        fun oran(): Float { val d = dondur % 180 != 0; return if (d) boyut[1].toFloat() / boyut[0] else boyut[0].toFloat() / boyut[1] }
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
        private var program = 0
        private var gw = 1; private var gh = 1
        private val dortgen: FloatBuffer = ByteBuffer.allocateDirect(8 * 4).order(ByteOrder.nativeOrder()).asFloatBuffer().apply { put(floatArrayOf(-1f, -1f, 1f, -1f, -1f, 1f, 1f, 1f)); position(0) }
        /** Kayıt yüzeyleri için EGL yüzeyleri (yüzey kaldırılınca silinir) */
        private val egller = HashMap<Surface, android.opengl.EGLSurface>()

        override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
            program = MonitorGorunum.programYap(MonitorGorunum.KOSE, PARCA)
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
            val canliYeni = yuvalar[canli].yeni
            val yeniler = BooleanArray(EN_COK) { yuvalar[it].yeni }
            for (y in yuvalar) if (y.yeni) { y.yeni = false; runCatching { y.doku?.updateTexImage(); y.doku?.getTransformMatrix(y.mat) } }
            GLES30.glClearColor(0f, 0f, 0f, 1f); GLES30.glViewport(0, 0, gw, gh); GLES30.glClear(GLES30.GL_COLOR_BUFFER_BIT)
            GLES30.glUseProgram(program)
            if (tablet) {
                val (oniz, prog, kucukler) = tabletAlanlar(gw.toFloat(), gh.toFloat(), ustPay, altPay)
                siradaki.takeIf { it in 0 until EN_COK && dolu[it] }?.let { ciz(yuvalar[it], oniz, gh) }
                if (dolu[canli]) ciz(yuvalar[canli], prog, gh)
                kucukler.forEachIndexed { i, r -> if (dolu[i]) ciz(yuvalar[i], r, gh) }
            } else {
                val (canliA, kucukler) = alanlar(gw.toFloat(), gh.toFloat(), ustPay, altPay)
                if (dolu[canli]) ciz(yuvalar[canli], canliA, gh)
                kucukler.forEachIndexed { i, r -> if (dolu[i]) ciz(yuvalar[i], r, gh) }
            }
            egllerTemizle()
            if (canliYeni && dolu[canli]) kayitYuzeyi?.let { hedefeCiz(it, kayitW, kayitH, canli) }
            for (i in 0 until EN_COK) if (yeniler[i] && dolu[i]) isoHedef[i]?.let { (s, w, h) -> hedefeCiz(s, w, h, i) }
        }

        /** Kaynağı alana sığdırarak çizer (alan ekran koordinatında, üstten) */
        private fun ciz(y: Yuva, r: RectF, yukseklik: Int) {
            val oran = y.oran(); var vw = r.width(); var vh = r.height()
            if (vw / vh > oran) vw = vh * oran else vh = vw / oran
            val x = r.left + (r.width() - vw) / 2; val ust = r.top + (r.height() - vh) / 2
            GLES30.glViewport(x.toInt(), (yukseklik - ust - vh).toInt(), vw.toInt(), vh.toInt())
            GLES30.glActiveTexture(GLES30.GL_TEXTURE0); GLES30.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, y.tex)
            GLES30.glUniform1i(GLES30.glGetUniformLocation(program, "uKaynak"), 0)
            GLES30.glUniformMatrix4fv(GLES30.glGetUniformLocation(program, "uTexMat"), 1, false, y.mat, 0)
            GLES30.glUniform1i(GLES30.glGetUniformLocation(program, "uDondur"), ((360 - y.dondur) % 360) / 90)
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

        /** Yuvayı kayıt yüzeyine sığdırarak çizer (kenarlar siyah) */
        private fun hedefeCiz(hedef: Surface, w: Int, h: Int, i: Int) {
            val es = egl(hedef) ?: return
            val dpy = EGL14.eglGetCurrentDisplay()
            val ciz = EGL14.eglGetCurrentSurface(EGL14.EGL_DRAW); val oku = EGL14.eglGetCurrentSurface(EGL14.EGL_READ); val bag = EGL14.eglGetCurrentContext()
            if (!EGL14.eglMakeCurrent(dpy, es, es, bag)) return
            GLES30.glViewport(0, 0, w, h); GLES30.glClearColor(0f, 0f, 0f, 1f); GLES30.glClear(GLES30.GL_COLOR_BUFFER_BIT)
            ciz(yuvalar[i], RectF(0f, 0f, w.toFloat(), h.toFloat()), h)
            EGLExt.eglPresentationTimeANDROID(dpy, es, System.nanoTime())
            EGL14.eglSwapBuffers(dpy, es)
            EGL14.eglMakeCurrent(dpy, ciz, oku, bag)
        }
    }

    private val PARCA = """#version 300 es
#extension GL_OES_EGL_image_external_essl3 : require
precision highp float;
uniform samplerExternalOES uKaynak; uniform mat4 uTexMat; uniform int uDondur;
in vec2 vUv; out vec4 renk;
void main() {
  vec2 uv = vUv;
  if (uDondur == 1) uv = vec2(uv.y, 1.0 - uv.x);
  else if (uDondur == 2) uv = vec2(1.0 - uv.x, 1.0 - uv.y);
  else if (uDondur == 3) uv = vec2(1.0 - uv.y, uv.x);
  renk = vec4(texture(uKaynak, (uTexMat * vec4(uv, 0.0, 1.0)).xy).rgb, 1.0);
}"""
}
