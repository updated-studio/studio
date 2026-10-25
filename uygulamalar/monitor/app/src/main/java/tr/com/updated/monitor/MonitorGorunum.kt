package tr.com.updated.monitor

import android.content.Context
import android.graphics.Bitmap
import android.graphics.SurfaceTexture
import android.opengl.GLES11Ext
import android.opengl.GLES30
import android.opengl.GLSurfaceView
import android.opengl.Matrix
import android.view.Surface
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10

/**
 * Tek monitör bölmesi: kaynak görüntüsü (kamera, UVC çevirici ya da ağ yayını) bir SurfaceTexture'a düşer; her karede gölgelendirici
 * LUT, false color, zebra, odak tepe noktası (peaking), anamorfik açma, büyütme, ayna/çevirme ve kadraj kılavuzlarını uygular.
 * Karşılaştırma kipinde aynı kare yan yana iki kez çizilir (solda ham, sağda araçlı). Ölçümler için küçük kopya okunur (OlcumHesap).
 */
class MonitorGorunum(context: Context) : GLSurfaceView(context) {

    var ayarlar = Ayarlar()
    @Volatile var karsilastir = false
    @Volatile var kaynakBoyut = intArrayOf(1920, 1080)
    var yuzeyHazir: ((Surface) -> Unit)? = null           // kaynak bu yüzeye çizer
    var olcumKaresi: ((ByteBuffer, Int, Int) -> Unit)? = null // küçük RGBA kopya (ölçümler)
    @Volatile private var bekleyenLut: Lut? = null
    @Volatile private var ekranGoruntusuIste: ((Bitmap) -> Unit)? = null

    private val r = Isleyici()

    init {
        setEGLContextClientVersion(3)
        preserveEGLContextOnPause = true
        setRenderer(r)
        renderMode = RENDERMODE_WHEN_DIRTY
    }

    fun lutYukle(lut: Lut) { bekleyenLut = lut; ayarlar.lutAcik = true; requestRender() }
    fun ekranGoruntusu(geri: (Bitmap) -> Unit) { ekranGoruntusuIste = geri; requestRender() }
    fun yenile() = requestRender()
    /** Görüntünün bölme içindeki alanı (kenar boşlukları hariç; kompozisyon kılavuzu bunun üstüne çizilir) */
    fun goruntuAlani(): android.graphics.RectF {
        val a = ayarlar; val donuk = yanDurur()
        val kw = (if (donuk) kaynakBoyut[1] else kaynakBoyut[0]).toFloat() * a.desqueeze
        val kh = (if (donuk) kaynakBoyut[0] else kaynakBoyut[1]).toFloat()
        val w = width.toFloat(); val h = height.toFloat(); val oran = kw / kh
        return if (w / h > oran) { val vw = h * oran; android.graphics.RectF((w - vw) / 2, 0f, (w + vw) / 2, h) } else { val vh = w / oran; android.graphics.RectF(0f, (h - vh) / 2, w, (h + vh) / 2) }
    }

    /** Kaynağın boyutu belli olunca: oran ve tampon boyutu (kamera bu boyutta yazar) */
    fun tampon(w: Int, h: Int) { kaynakBoyut = intArrayOf(w, h); yuzeyDokusu?.setDefaultBufferSize(w, h); requestRender() }
    @Volatile private var yuzeyDokusu: SurfaceTexture? = null
    /** Telefon kamerasında ekranın dönüşünü dengeleyen otomatik açı; kullanıcının DÖNDÜR ayarı bunun üstüne eklenir */
    @Volatile var otoDondur = 0
        set(v) { field = v; requestRender() }
    /** Android, telefon kamerasının karesini dokuya zaten 90° çevirerek veriyor mu (getTransformMatrix'ten okunur) */
    @Volatile private var dokuDonuk = false
    private fun toplamDondur() = (otoDondur + ayarlar.dondur) % 360
    /** Ekrandaki görüntünün en/boyu kaynağın tersi mi */
    private fun yanDurur() = (toplamDondur() % 180 != 0) != dokuDonuk

    private inner class Isleyici : Renderer, SurfaceTexture.OnFrameAvailableListener {
        private var program = 0
        private var oesTex = 0
        private var lutTex = 0
        private var lutBoyut = 0
        private var st: SurfaceTexture? = null
        private val texMat = FloatArray(16).also { Matrix.setIdentityM(it, 0) }
        private var gw = 1; private var gh = 1
        private var kare = 0L
        private var olcumFbo = 0; private var olcumTex = 0
        private val OW = 256; private val OH = 144
        private val olcumTampon: ByteBuffer = ByteBuffer.allocateDirect(OW * OH * 4).order(ByteOrder.nativeOrder())
        private val dortgen: FloatBuffer = ByteBuffer.allocateDirect(8 * 4).order(ByteOrder.nativeOrder()).asFloatBuffer().apply { put(floatArrayOf(-1f, -1f, 1f, -1f, -1f, 1f, 1f, 1f)); position(0) }
        private val konum = HashMap<String, Int>()

        override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
            program = programYap(KOSE, PARCA)
            val t = IntArray(2); GLES30.glGenTextures(2, t, 0)
            oesTex = t[0]; lutTex = t[1]
            GLES30.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, oesTex)
            GLES30.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_LINEAR)
            GLES30.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_LINEAR)
            GLES30.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES30.GL_TEXTURE_WRAP_S, GLES30.GL_CLAMP_TO_EDGE)
            GLES30.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES30.GL_TEXTURE_WRAP_T, GLES30.GL_CLAMP_TO_EDGE)
            // Boş 2×2×2 LUT (bağlı kalsın diye)
            lutYaz(Lut("", 2, floatArrayOf(0f, 0f, 0f, 1f, 0f, 0f, 0f, 1f, 0f, 1f, 1f, 0f, 0f, 0f, 1f, 1f, 0f, 1f, 0f, 1f, 1f, 1f, 1f, 1f)))
            // Ölçüm kopyası için küçük çerçeve tamponu
            val f = IntArray(1); GLES30.glGenFramebuffers(1, f, 0); olcumFbo = f[0]
            val ot = IntArray(1); GLES30.glGenTextures(1, ot, 0); olcumTex = ot[0]
            GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, olcumTex)
            GLES30.glTexImage2D(GLES30.GL_TEXTURE_2D, 0, GLES30.GL_RGBA, OW, OH, 0, GLES30.GL_RGBA, GLES30.GL_UNSIGNED_BYTE, null)
            GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_LINEAR)
            GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, olcumFbo)
            GLES30.glFramebufferTexture2D(GLES30.GL_FRAMEBUFFER, GLES30.GL_COLOR_ATTACHMENT0, GLES30.GL_TEXTURE_2D, olcumTex, 0)
            GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)

            st?.release()
            st = SurfaceTexture(oesTex).also {
                yuzeyDokusu = it
                it.setDefaultBufferSize(kaynakBoyut[0], kaynakBoyut[1])
                it.setOnFrameAvailableListener(this)
                val yuzey = Surface(it)
                post { yuzeyHazir?.invoke(yuzey) }
            }
        }

        override fun onSurfaceChanged(gl: GL10?, w: Int, h: Int) { gw = w; gh = h }

        override fun onFrameAvailable(s: SurfaceTexture?) = requestRender()

        private fun lutYaz(l: Lut) {
            GLES30.glBindTexture(GLES30.GL_TEXTURE_3D, lutTex)
            val n = l.boyut
            val b = ByteBuffer.allocateDirect(n * n * n * 3 * 4).order(ByteOrder.nativeOrder()).asFloatBuffer().put(l.veri).also { it.position(0) }
            GLES30.glTexImage3D(GLES30.GL_TEXTURE_3D, 0, GLES30.GL_RGB16F, n, n, n, 0, GLES30.GL_RGB, GLES30.GL_FLOAT, b)
            for (p in intArrayOf(GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_TEXTURE_MAG_FILTER)) GLES30.glTexParameteri(GLES30.GL_TEXTURE_3D, p, GLES30.GL_LINEAR)
            for (p in intArrayOf(GLES30.GL_TEXTURE_WRAP_S, GLES30.GL_TEXTURE_WRAP_T, GLES30.GL_TEXTURE_WRAP_R)) GLES30.glTexParameteri(GLES30.GL_TEXTURE_3D, p, GLES30.GL_CLAMP_TO_EDGE)
            lutBoyut = n
        }

        override fun onDrawFrame(gl: GL10?) {
            bekleyenLut?.let { lutYaz(it); bekleyenLut = null }
            st?.let { it.updateTexImage(); it.getTransformMatrix(texMat)
                val d = kotlin.math.abs(texMat[0]) < 0.5f; if (d != dokuDonuk) { dokuDonuk = d; post { requestLayout(); invalidate() } } }
            GLES30.glClearColor(0f, 0f, 0f, 1f)
            GLES30.glViewport(0, 0, gw, gh)
            GLES30.glClear(GLES30.GL_COLOR_BUFFER_BIT)
            GLES30.glUseProgram(program)
            val a = ayarlar
            val donuk = yanDurur()
            val kw = (if (donuk) kaynakBoyut[1] else kaynakBoyut[0]).toFloat() * a.desqueeze
            val kh = (if (donuk) kaynakBoyut[0] else kaynakBoyut[1]).toFloat()
            if (karsilastir) {
                ciz(0, 0, gw / 2, gh, kw, kh, ham = true)
                ciz(gw / 2, 0, gw - gw / 2, gh, kw, kh, ham = false)
            } else ciz(0, 0, gw, gh, kw, kh, ham = false)

            // Ölçümler: üç karede bir, araçlar ve kılavuzlar kapalı (LUT açık: çıkışı ölçer)
            kare++
            if (olcumKaresi != null && kare % 3 == 0L) {
                GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, olcumFbo)
                ciz(0, 0, OW, OH, OW.toFloat(), OH.toFloat(), ham = false, olcum = true, tam = true)
                olcumTampon.position(0)
                GLES30.glReadPixels(0, 0, OW, OH, GLES30.GL_RGBA, GLES30.GL_UNSIGNED_BYTE, olcumTampon)
                GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)
                olcumKaresi?.invoke(olcumTampon, OW, OH)
            }
            ekranGoruntusuIste?.let { geri ->
                ekranGoruntusuIste = null
                val b = ByteBuffer.allocateDirect(gw * gh * 4).order(ByteOrder.nativeOrder())
                GLES30.glReadPixels(0, 0, gw, gh, GLES30.GL_RGBA, GLES30.GL_UNSIGNED_BYTE, b)
                val bmp = Bitmap.createBitmap(gw, gh, Bitmap.Config.ARGB_8888).apply { copyPixelsFromBuffer(b.position(0)) }
                val m = android.graphics.Matrix().apply { preScale(1f, -1f) }
                val dogru = Bitmap.createBitmap(bmp, 0, 0, gw, gh, m, false)
                post { geri(dogru) }
            }
        }

        /** Görüntüyü (kw:kh oranıyla) verilen alana sığdırarak çizer; ham = araçsız, olcum = kılavuz/vurgu yok */
        private fun ciz(x: Int, y: Int, w: Int, h: Int, kw: Float, kh: Float, ham: Boolean, olcum: Boolean = false, tam: Boolean = false) {
            var vx = x; var vy = y; var vw = w; var vh = h
            if (!tam) {
                val oran = kw / kh
                if (w.toFloat() / h > oran) { vw = (h * oran).toInt(); vx = x + (w - vw) / 2 } else { vh = (w / oran).toInt(); vy = y + (h - vh) / 2 }
            }
            GLES30.glViewport(vx, vy, vw, vh)
            val a = ayarlar
            val sade = olcum || a.temiz // temiz görüntüde araç bindirmeleri yok
            fun u(ad: String) = konum.getOrPut(ad) { GLES30.glGetUniformLocation(program, ad) }
            GLES30.glActiveTexture(GLES30.GL_TEXTURE0); GLES30.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, oesTex); GLES30.glUniform1i(u("uKaynak"), 0)
            GLES30.glActiveTexture(GLES30.GL_TEXTURE1); GLES30.glBindTexture(GLES30.GL_TEXTURE_3D, lutTex); GLES30.glUniform1i(u("uLut"), 1)
            GLES30.glUniformMatrix4fv(u("uTexMat"), 1, false, texMat, 0)
            GLES30.glUniform1f(u("uLutBoyut"), lutBoyut.toFloat())
            GLES30.glUniform1i(u("uLutAcik"), if (!ham && a.lutAcik) 1 else 0)
            GLES30.glUniform1i(u("uPeaking"), if (!ham && !sade && a.peaking) 1 else 0)
            GLES30.glUniform1f(u("uPeakEsik"), a.peakEsik)
            GLES30.glUniform3fv(u("uPeakRenk"), 1, PEAK_RENKLERI[a.peakRenk], 0)
            GLES30.glUniform1i(u("uZebra"), if (!ham && !sade && a.zebra) 1 else 0)
            GLES30.glUniform1f(u("uZebraEsik"), a.zebraEsik)
            GLES30.glUniform1i(u("uFalse"), if (!ham && !sade && a.falseColor) 1 else 0)
            GLES30.glUniform1i(u("uMono"), if (!ham && a.monokrom) 1 else 0)
            GLES30.glUniform1f(u("uZoom"), if (olcum) 1f else a.zoom)
            GLES30.glUniform1i(u("uAyna"), if (a.ayna) 1 else 0)
            GLES30.glUniform1i(u("uCevir"), if (a.cevir) 1 else 0)
            GLES30.glUniform1i(u("uDondur"), toplamDondur() / 90)
            GLES30.glUniform1f(u("uKilavuz"), if (sade) 0f else a.kilavuz)
            GLES30.glUniform1i(u("uIzgara"), if (!sade && a.izgara) 1 else 0)
            GLES30.glUniform1i(u("uMerkez"), if (!sade && a.merkez) 1 else 0)
            GLES30.glUniform1f(u("uGuvenli"), if (sade) 0f else a.guvenli)
            GLES30.glUniform1f(u("uOran"), vw.toFloat() / vh)
            GLES30.glUniform2f(u("uPiksel"), 1f / (if (yanDurur()) kaynakBoyut[1] else kaynakBoyut[0]), 1f / (if (yanDurur()) kaynakBoyut[0] else kaynakBoyut[1]))
            GLES30.glUniform2f(u("uCikis"), vw.toFloat(), vh.toFloat())
            val k = GLES30.glGetAttribLocation(program, "aKonum")
            GLES30.glEnableVertexAttribArray(k)
            GLES30.glVertexAttribPointer(k, 2, GLES30.GL_FLOAT, false, 0, dortgen)
            GLES30.glDrawArrays(GLES30.GL_TRIANGLE_STRIP, 0, 4)
        }
    }

    companion object {
        private fun gGolge(tur: Int, kod: String): Int {
            val s = GLES30.glCreateShader(tur)
            GLES30.glShaderSource(s, kod); GLES30.glCompileShader(s)
            val d = IntArray(1); GLES30.glGetShaderiv(s, GLES30.GL_COMPILE_STATUS, d, 0)
            if (d[0] == 0) throw RuntimeException("Gölgelendirici: " + GLES30.glGetShaderInfoLog(s))
            return s
        }
        fun programYap(kose: String, parca: String): Int {
            val p = GLES30.glCreateProgram()
            GLES30.glAttachShader(p, gGolge(GLES30.GL_VERTEX_SHADER, kose)); GLES30.glAttachShader(p, gGolge(GLES30.GL_FRAGMENT_SHADER, parca))
            GLES30.glLinkProgram(p)
            return p
        }

        const val KOSE = """#version 300 es
in vec2 aKonum;
out vec2 vUv;
void main() { vUv = aKonum * 0.5 + 0.5; gl_Position = vec4(aKonum, 0.0, 1.0); }"""

        // Araçlar sırası: dönüş/ayna/büyütme → kaynak → LUT → mono → false color | zebra | peaking → kılavuzlar
        const val PARCA = """#version 300 es
#extension GL_OES_EGL_image_external_essl3 : require
precision highp float;
uniform samplerExternalOES uKaynak;
uniform highp sampler3D uLut;
uniform mat4 uTexMat;
uniform float uLutBoyut; uniform int uLutAcik;
uniform int uPeaking; uniform float uPeakEsik; uniform vec3 uPeakRenk;
uniform int uZebra; uniform float uZebraEsik; uniform int uFalse; uniform int uMono;
uniform float uZoom; uniform int uAyna; uniform int uCevir; uniform int uDondur;
uniform float uKilavuz; uniform int uIzgara; uniform int uMerkez; uniform float uGuvenli;
uniform float uOran; uniform vec2 uPiksel; uniform vec2 uCikis;
in vec2 vUv; out vec4 renk;

vec2 kaynakUv(vec2 uv) {
  uv = (uv - 0.5) / uZoom + 0.5;
  if (uAyna == 1) uv.x = 1.0 - uv.x;
  if (uCevir == 1) uv.y = 1.0 - uv.y;
  if (uDondur == 1) uv = vec2(uv.y, 1.0 - uv.x);
  else if (uDondur == 2) uv = vec2(1.0 - uv.x, 1.0 - uv.y);
  else if (uDondur == 3) uv = vec2(1.0 - uv.y, uv.x);
  return (uTexMat * vec4(uv, 0.0, 1.0)).xy;
}
vec3 al(vec2 uv) { return texture(uKaynak, kaynakUv(uv)).rgb; }
vec3 lut(vec3 c) {
  if (uLutAcik == 0) return c;
  float s = uLutBoyut;
  return texture(uLut, clamp(c, 0.0, 1.0) * ((s - 1.0) / s) + 0.5 / s).rgb;
}
float parlak(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 sahteRenk(float y) {
  // ARRI benzeri false color: mor kırpılmış siyah, mavi gölge, yeşil %18 gri, pembe ten, sarı/kırmızı patlama
  if (y < 0.025) return vec3(0.5, 0.0, 0.6);
  if (y < 0.10) return vec3(0.1, 0.3, 0.9);
  if (y < 0.38) return vec3(y * 0.8);
  if (y < 0.48) return vec3(0.1, 0.75, 0.25);
  if (y < 0.56) return vec3(y * 0.8);
  if (y < 0.68) return vec3(0.95, 0.55, 0.7);
  if (y < 0.94) return vec3(y * 0.8);
  if (y < 0.99) return vec3(1.0, 0.85, 0.0);
  return vec3(1.0, 0.0, 0.0);
}
void main() {
  vec2 uv = vUv;
  if (uZoom > 1.0 && (uv.x < 0.0 || uv.x > 1.0)) discard;
  vec3 c = lut(al(uv));
  if (uMono == 1) c = vec3(parlak(c));
  float y = parlak(c);
  if (uFalse == 1) c = sahteRenk(y);
  if (uZebra == 1 && y >= uZebraEsik) {
    float serit = mod(gl_FragCoord.x + gl_FragCoord.y, 16.0);
    if (serit < 7.0) c = mix(c, vec3(1.0), 0.85);
  }
  if (uPeaking == 1) {
    vec2 d = uPiksel * 1.5 / uZoom;
    float tl = parlak(al(uv + vec2(-d.x, d.y))), t = parlak(al(uv + vec2(0.0, d.y))), tr = parlak(al(uv + d));
    float l = parlak(al(uv - vec2(d.x, 0.0))), r = parlak(al(uv + vec2(d.x, 0.0)));
    float bl = parlak(al(uv - d)), b = parlak(al(uv - vec2(0.0, d.y))), br = parlak(al(uv + vec2(d.x, -d.y)));
    float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br, gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
    float g = sqrt(gx * gx + gy * gy);
    if (g > uPeakEsik * 2.0) c = mix(c, uPeakRenk, clamp((g - uPeakEsik * 2.0) * 6.0, 0.0, 1.0));
  }
  // Kadraj kılavuzu: hedef oranın dışı karartılır, sınırına çizgi
  vec2 px = 1.0 / uCikis;
  if (uKilavuz > 0.0) {
    float kx = 1.0, ky = 1.0;
    if (uKilavuz > uOran) ky = uOran / uKilavuz; else kx = uKilavuz / uOran;
    vec2 m = abs(uv - 0.5) * 2.0;
    if (m.x > kx || m.y > ky) c *= 0.35;
    else if (m.x > kx - px.x * 4.0 || m.y > ky - px.y * 4.0) c = mix(c, vec3(1.0), 0.8);
  }
  if (uGuvenli > 0.0) {
    vec2 m = abs(uv - 0.5) * 2.0;
    if ((abs(m.x - uGuvenli) < px.x * 3.0 && m.y < uGuvenli) || (abs(m.y - uGuvenli) < px.y * 3.0 && m.x < uGuvenli)) c = mix(c, vec3(1.0, 0.85, 0.2), 0.8);
  }
  if (uIzgara == 1) {
    vec2 g3 = abs(fract(uv * 3.0 + 0.5) - 0.5) / 3.0;
    if (g3.x < px.x * 1.5 || g3.y < px.y * 1.5) c = mix(c, vec3(1.0), 0.5);
  }
  if (uMerkez == 1) {
    vec2 m = abs(uv - 0.5) * uCikis;
    if ((m.x < 1.5 && m.y < 18.0) || (m.y < 1.5 && m.x < 18.0)) c = vec3(1.0);
  }
  renk = vec4(c, 1.0);
}"""
    }
}
