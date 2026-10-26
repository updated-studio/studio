package tr.com.updated.monitor

import android.content.Context
import android.hardware.usb.UsbConstants
import android.graphics.BitmapFactory
import android.graphics.Rect
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbManager
import android.os.Handler
import android.os.HandlerThread
import android.view.Surface
import com.serenegiant.usb.USBMonitor
import com.serenegiant.usb.UVCCamera
import com.serenegiant.usb.UVCParam

/**
 * Doğrudan USB görüntü (UVC) kaynağı: Android'in "harici kamera" desteği olmayan telefonlarda da çalışır (libuvc + libusb,
 * UVCAndroid kitaplığı). Sony, Canon gibi fotoğraf makineleri "USB yayını" (USB Streaming) modunda, HDMI→USB çeviriciler
 * her zaman UVC'dir. Görüntü MonitorGorunum'ün yüzeyine çizilir; araçlar (odak, zebra, LUT, ölçümler) aynen çalışır.
 */
class UvcKaynak(private val ctx: Context, val aygit: UsbDevice, private val kareSayaci: () -> Long, private val basladi: (String) -> Unit = {}) : Kaynak {
    override val ad: String = "USB: " + (aygit.productName ?: aygit.manufacturerName ?: "Görüntü aygıtı")
    private val is_ = HandlerThread("uvc").also { it.start() }
    private val h = Handler(is_.looper)
    private var izleyici: USBMonitor? = null
    private var kamera: UVCCamera? = null
    @Volatile private var bitti = false
    @Volatile private var libuvcKare = 0L
    private var baslamaSonucu = 0
    private var baglanti: UsbDeviceConnection? = null
    private var okuyucu: Thread? = null
    private var cizici: Thread? = null
    var cozunurluk: String = ""; private set
    /** Kaynağın kare hızı (kayıt için) */
    var fps = 30; private set

    override fun baslat(yuzey: Surface, boyut: (Int, Int) -> Unit, hata: (String) -> Unit) {
        val m = USBMonitor(ctx, object : USBMonitor.OnDeviceConnectListener {
            override fun onAttach(d: UsbDevice) {}
            override fun onDetach(d: UsbDevice) { if (d.deviceName == aygit.deviceName) hata("USB kablosu çıkarıldı.") }
            override fun onCancel(d: UsbDevice) { hata("USB erişimine izin verilmedi. Kabloyu çıkarıp takınca gelen soruda \"İzin ver\"e bas.") }
            override fun onDeviceClose(d: UsbDevice, b: USBMonitor.UsbControlBlock) {}
            override fun onDeviceOpen(d: UsbDevice, blok: USBMonitor.UsbControlBlock, yeni: Boolean) {
                if (bitti || d.deviceName != aygit.deviceName) return
                h.post {
                    if (yiginMi()) { // libuvc yığın uçta yük boyunda (ör. 1,4 MB) tek aktarım ister; usbfs reddeder. Doğrudan yalın okuyucu.
                        runCatching { izleyici?.unregister() }; runCatching { izleyici?.destroy() }; izleyici = null
                        runCatching { yalinBaslat(yuzey, boyut, hata) }.onFailure { e -> hata("USB görüntü başlatılamadı: ${e.message}"); HataKaydi.not("uvc-yalin", e.stackTraceToString() + "\n" + usbOzet(aygit)) }
                        return@post
                    }
                    try {
                        // Bazı telefonlarda çekirdeğin kendi UVC sürücüsü aygıtı tutar (libusb "meşgul" -6 der). Android'in
                        // claimInterface(zorla) çağrısı o sürücüyü ayırır; bırakınca arayüz bize kalır.
                        surucuyuAyir(blok)
                        val k = UVCCamera(UVCParam())
                        var r = k.open(blok)
                        if (r == -6) { Thread.sleep(500); surucuyuAyir(blok); r = k.open(blok) }
                        if (r != 0) { hata("USB görüntü açılamadı (kod $r)."); HataKaydi.not("uvc", "open $r · ${usbOzet(aygit)}"); return@post }
                        kamera = k
                        val l = k.supportedSizeList.orEmpty()
                        if (l.isEmpty()) { hata("Aygıt görüntü biçimi bildirmedi."); HataKaydi.not("uvc", "boyut yok · ${usbOzet(aygit)}"); return@post }
                        // Denenecek biçimler: önce 1080p'yi geçmeyen MJPEG (büyükten küçüğe), sonra diğer MJPEG, sonra sıkıştırılmamış.
                        // Görüntü 4 sn içinde gelmezse sıradakine geçilir (bazı makineler bazı boyut/kare hızlarında hiç kare göndermez).
                        val mj = l.filter { it.type == UVCCamera.UVC_VS_FRAME_MJPEG }
                        val adaylar = (mj.filter { it.height <= 1080 }.sortedByDescending { it.width * it.height } + mj.filter { it.height > 1080 }.sortedBy { it.width * it.height } +
                            l.filter { it.type != UVCCamera.UVC_VS_FRAME_MJPEG && it.height <= 1080 }.sortedByDescending { it.width * it.height }).distinctBy { "${it.type}:${it.width}x${it.height}" }.take(6)
                        fun dene(i: Int) {
                            if (bitti) return
                            if (i >= adaylar.size) {
                                // libuvc kare alamadı: kitaplığı kapatıp Android'in kendi USB API'siyle okumayı dene
                                HataKaydi.not("uvc", "libuvc kare gelmedi · başlatma $baslamaSonucu · kitaplığa ulaşan kare $libuvcKare · biçimler ${runCatching { k.supportedSize }.getOrNull()?.take(1500)} · ${uclar()} · ${usbOzet(aygit)}")
                                runCatching { k.stopPreview() }; runCatching { k.destroy() }; kamera = null
                                runCatching { izleyici?.unregister() }; runCatching { izleyici?.destroy() }; izleyici = null
                                yalinBaslat(yuzey, boyut, hata); return
                            }
                            val s = adaylar[i]
                            runCatching { k.stopPreview() }
                            val fps = s.fpsList?.filter { it in 24..30 }?.maxOrNull() ?: s.fpsList?.maxOrNull() ?: s.fps
                            runCatching { k.setPreviewSize(s.width, s.height, s.type, fps) }.getOrElse { runCatching { k.setPreviewSize(s.width, s.height, s.type) } }
                            this@UvcKaynak.fps = fps.takeIf { it in 1..120 } ?: 30
                            cozunurluk = "${s.width}×${s.height} · ${fps} fps · ${if (s.type == UVCCamera.UVC_VS_FRAME_MJPEG) "MJPEG" else "YUV"}"
                            boyut(s.width, s.height)
                            k.setPreviewDisplay(yuzey)
                            runCatching { k.setFrameCallback({ libuvcKare++ }, UVCCamera.PIXEL_FORMAT_RAW) }
                            baslamaSonucu = runCatching { UVCCamera::class.java.getDeclaredMethod("nativeStartPreview", Long::class.javaPrimitiveType).let { m -> m.isAccessible = true; m.invoke(k, UVCCamera::class.java.getDeclaredField("mNativePtr").let { f -> f.isAccessible = true; f.getLong(k) }) as Int } }
                                .getOrElse { k.startPreview(); 0 }
                            val once = kareSayaci()
                            h.postDelayed({ if (!bitti && kareSayaci() == once) dene(i + 1) else if (!bitti) { basladi(cozunurluk); HataKaydi.not("uvc-tamam", "$cozunurluk · ${usbOzet(aygit)}") } }, if (i == adaylar.size - 1) 6000 else 4000)
                        }
                        dene(0)
                    } catch (e: Throwable) {
                        hata("USB görüntü başlatılamadı: ${e.message}"); HataKaydi.not("uvc", e.stackTraceToString() + "\n" + usbOzet(aygit))
                    }
                }
            }
        }, h)
        izleyici = m
        m.register()
        m.requestPermission(aygit) // izin varsa doğrudan açar, yoksa Android sorar
    }

    private fun surucuyuAyir(blok: USBMonitor.UsbControlBlock) {
        val c = runCatching { blok.connection }.getOrNull() ?: return
        for (i in 0 until aygit.interfaceCount) {
            val arayuz = aygit.getInterface(i)
            if (arayuz.interfaceClass != UsbConstants.USB_CLASS_VIDEO) continue
            runCatching { if (c.claimInterface(arayuz, true)) c.releaseInterface(arayuz) }
        }
    }

    /** Görüntü akışı yığın (bulk) uçtan mı (eşzamanlı alt ayar yok) */
    private fun yiginMi() = (0 until aygit.interfaceCount).map { aygit.getInterface(it) }.filter { it.interfaceClass == UsbConstants.USB_CLASS_VIDEO && it.interfaceSubclass == 2 }
        .let { l -> l.isNotEmpty() && l.none { a -> (0 until a.endpointCount).any { a.getEndpoint(it).type == UsbConstants.USB_ENDPOINT_XFER_ISOC } } }

    /** Tanı için: görüntü akış arayüzlerinin uçları (B = yığın/bulk, E = eşzamanlı/isochronous) ve paket boyları */
    private fun uclar() = (0 until aygit.interfaceCount).map { aygit.getInterface(it) }.filter { it.interfaceClass == UsbConstants.USB_CLASS_VIDEO && it.interfaceSubclass == 2 }
        .joinToString(" ") { a -> "vs${a.id}/alt${a.alternateSetting}:" + (0 until a.endpointCount).joinToString(",") { e -> a.getEndpoint(e).let { u -> (if (u.type == UsbConstants.USB_ENDPOINT_XFER_BULK) "B" else if (u.type == UsbConstants.USB_ENDPOINT_XFER_ISOC) "E" else "?") + u.maxPacketSize } } }

    /**
     * Yalın UVC okuyucu (libuvc'siz): bazı fotoğraf makineleri (ör. Sony) görüntüyü yığın (bulk) uçtan gönderir ve libuvc bu
     * telefonlarda kare alamaz. Burada biçim pazarlığı (probe/commit) Android'in denetim aktarımıyla yapılır, yığın uçtan gelen
     * UVC yükleri MJPEG karelere birleştirilir, çözülüp yüzeye çizilir. Yalnız yığın uç ve MJPEG biçimi için.
     */
    private fun yalinBaslat(yuzey: Surface, boyut: (Int, Int) -> Unit, hata: (String) -> Unit) {
        val um = ctx.getSystemService(Context.USB_SERVICE) as UsbManager
        val c = um.openDevice(aygit) ?: run { hata("USB görüntü açılamadı (yalın)."); HataKaydi.not("uvc-yalin", "openDevice null · ${usbOzet(aygit)}"); return }
        baglanti = c
        val arayuzler = (0 until aygit.interfaceCount).map { aygit.getInterface(it) }
        val vc = arayuzler.firstOrNull { it.interfaceClass == UsbConstants.USB_CLASS_VIDEO && it.interfaceSubclass == 1 }
        val vs = arayuzler.firstOrNull { a -> a.interfaceClass == UsbConstants.USB_CLASS_VIDEO && a.interfaceSubclass == 2 &&
            (0 until a.endpointCount).any { a.getEndpoint(it).let { u -> u.type == UsbConstants.USB_ENDPOINT_XFER_BULK && u.direction == UsbConstants.USB_DIR_IN } } }
        if (vs == null) { hata("Makine bağlandı ama görüntü göndermedi."); HataKaydi.not("uvc-yalin", "yığın uç yok · ${uclar()} · ${usbOzet(aygit)}"); return }
        val uc = (0 until vs.endpointCount).map { vs.getEndpoint(it) }.first { it.type == UsbConstants.USB_ENDPOINT_XFER_BULK && it.direction == UsbConstants.USB_DIR_IN }
        vc?.let { c.claimInterface(it, true) }
        // Önceki bağlantı (yeniden takma, kaynağı yeniden açma) arayüzü henüz bırakmamış olabilir: kısa aralıklarla yeniden dene
        var alindi = false
        for (n in 0 until 12) { if (bitti) return; if (c.claimInterface(vs, true)) { alindi = true; break }; Thread.sleep(250) }
        if (!alindi) { hata("USB görüntü arayüzü alınamadı."); HataKaydi.not("uvc-yalin", "claim yok · ${usbOzet(aygit)}"); return }
        c.controlTransfer(0x02, 0x01, 0, uc.address, null, 0, 500) // uç durdurulmuşsa (önceki deneme) aç: CLEAR_FEATURE(ENDPOINT_HALT)
        c.setInterface(vs) // SET_INTERFACE alt 0: bazı aygıtlar akıştan önce bunu bekler (Linux sürücüsü de yapar)

        // Ham tanımlayıcılardan: UVC sürümü (denetim boyu) ve bu arayüzün MJPEG çerçeveleri
        val d = c.rawDescriptors ?: ByteArray(0)
        fun u16(i: Int) = (d[i].toInt() and 0xFF) or ((d[i + 1].toInt() and 0xFF) shl 8)
        fun u32(i: Int) = u16(i) or (u16(i + 2) shl 16)
        var bcd = 0x0100; var arayuzNo = -1; var arayuzSinif = 0; var arayuzAlt = 0; var bicim = -1
        data class Cerceve(val bicim: Int, val no: Int, val w: Int, val h: Int, val aralik: Int)
        val cerceveler = mutableListOf<Cerceve>()
        var i = 0
        while (i + 2 < d.size) {
            val uz = d[i].toInt() and 0xFF; if (uz < 2 || i + uz > d.size) break
            val tur = d[i + 1].toInt() and 0xFF
            if (tur == 4 && uz >= 9) { arayuzNo = d[i + 2].toInt() and 0xFF; arayuzSinif = d[i + 5].toInt() and 0xFF; arayuzAlt = d[i + 6].toInt() and 0xFF }
            else if (tur == 0x24 && arayuzSinif == UsbConstants.USB_CLASS_VIDEO) {
                val alt = d[i + 2].toInt() and 0xFF
                if (arayuzAlt == 1 && alt == 1 && uz >= 5) bcd = u16(i + 3)
                if (arayuzAlt == 2 && arayuzNo == vs.id) when (alt) {
                    6 -> bicim = d[i + 3].toInt() and 0xFF          // VS_FORMAT_MJPEG
                    4, 0x10 -> bicim = -1                          // sıkıştırılmamış / çerçeve tabanlı: desteklenmiyor
                    7 -> if (bicim > 0 && uz >= 26) cerceveler += Cerceve(bicim, d[i + 3].toInt() and 0xFF, u16(i + 5), u16(i + 7), u32(i + 21))
                }
            }
            i += uz
        }
        val s = cerceveler.filter { it.h <= 1080 }.maxByOrNull { it.w * it.h } ?: cerceveler.minByOrNull { it.w * it.h }
        if (s == null) { hata("Makine bağlandı ama desteklenen görüntü biçimi bulunamadı."); HataKaydi.not("uvc-yalin", "MJPEG çerçeve yok · ${usbOzet(aygit)}"); return }

        // Biçim pazarlığı: PROBE (SET_CUR → GET_CUR), sonra COMMIT
        val boy = if (bcd >= 0x0150) 48 else if (bcd >= 0x0110) 34 else 26
        fun denetim(al: Boolean, secici: Int, b: ByteArray) = c.controlTransfer(if (al) 0xA1 else 0x21, if (al) 0x81 else 0x01, secici shl 8, vs.id, b, b.size, 1000)
        val p = ByteArray(boy)
        denetim(true, 1, p)
        p[0] = 1; p[1] = 0; p[2] = s.bicim.toByte(); p[3] = s.no.toByte()
        for (k in 0..3) p[4 + k] = (s.aralik ushr (8 * k)).toByte()
        val r1 = denetim(false, 1, p); val r2 = denetim(true, 1, p); val r3 = denetim(false, 2, p)
        fun pu32(o: Int) = (p[o].toInt() and 0xFF) or ((p[o + 1].toInt() and 0xFF) shl 8) or ((p[o + 2].toInt() and 0xFF) shl 16) or ((p[o + 3].toInt() and 0xFF) shl 24)
        val enKare = pu32(18).takeIf { it in 1..(64 shl 20) } ?: (s.w * s.h * 2)
        val yuk = pu32(22).takeIf { it in 512..(8 shl 20) } ?: 16384
        val fps = if (s.aralik > 0) 10_000_000 / s.aralik else 0
        if (fps in 1..120) this.fps = fps
        val ozet = "${s.w}×${s.h} · $fps fps · MJPEG · yalın"
        cozunurluk = ozet
        boyut(s.w, s.h)

        // Okuma: her yığın aktarımı bir UVC yükü (başlık + veri); FID değişimi ya da EOF kareyi bitirir
        val kuyruk = java.util.concurrent.ArrayBlockingQueue<ByteArray>(2)
        var bayt = 0L; var kare = 0; var cozulmeyen = 0; var hataSay = 0; var cizilen = 0
        okuyucu = Thread({
            // Yük (payload) 1 MB'ı aşabilir; usbfs tek seferde bu kadarını kabul etmez. 64 KB'lık parçalarla okunur: başlık yalnız
            // yükün ilk parçasında; kısa parça ya da yük boyuna ulaşmak yükü bitirir.
            val parca = 65536
            val tampon = ByteArray(parca)
            val birikim = java.io.ByteArrayOutputStream(enKare)
            var fid = -1; var bosSure = 0L; var son = System.currentTimeMillis(); var yukte = 0; var bfh = 0; var atla = false
            while (!bitti) {
                val iste = minOf(parca, yuk - yukte) // yük sınırını aşma: kısa paket gelmezse sonraki yüke taşar
                val n = c.bulkTransfer(uc, tampon, iste, 500)
                val simdi = System.currentTimeMillis()
                if (n < 0) {
                    hataSay++; bosSure += simdi - son; son = simdi; yukte = 0
                    if (hataSay % 200 == 0) Thread.sleep(5)
                    if (bosSure > 8000 && kare == 0) { if (!bitti) { hata("Makine bağlandı ama görüntü göndermedi."); HataKaydi.not("uvc-yalin", "veri yok · probe $r1/$r2/$r3 · yük $yuk · bayt $bayt · aktarım hatası $hataSay · ${uclar()} · ${usbOzet(aygit)}") }; return@Thread }
                    continue
                }
                bosSure = 0; son = simdi; bayt += n
                var bas = 0
                if (yukte == 0) { // yeni yük: başlık
                    if (n < 2) continue
                    val hle = tampon[0].toInt() and 0xFF
                    if (hle < 2 || hle > n) { atla = true } else {
                        bfh = tampon[1].toInt() and 0xFF; bas = hle; atla = bfh and 0x40 != 0
                        val f = bfh and 1
                        if (fid >= 0 && f != fid && birikim.size() > 0) { kuyruk.offer(birikim.toByteArray()); kare++; birikim.reset() }
                        fid = f
                        if (atla) birikim.reset()
                    }
                }
                if (!atla && n > bas) birikim.write(tampon, bas, n - bas)
                yukte += n
                if (n < iste || yukte >= yuk) { // yük bitti
                    if (!atla && bfh and 2 != 0 && birikim.size() > 0) { kuyruk.offer(birikim.toByteArray()); kare++; birikim.reset() }
                    yukte = 0; atla = false
                }
            }
        }, "uvc-oku").also { it.start() }
        cizici = Thread({
            val sec = BitmapFactory.Options().apply { inMutable = true }
            val hedef = Rect()
            while (!bitti) {
                val b = runCatching { kuyruk.poll(500, java.util.concurrent.TimeUnit.MILLISECONDS) }.getOrNull() ?: continue
                if (b.size < 4 || b[0] != 0xFF.toByte() || b[1] != 0xD8.toByte()) { cozulmeyen++; continue }
                val bmp = runCatching { BitmapFactory.decodeByteArray(b, 0, b.size, sec) }.getOrNull()
                    ?: runCatching { sec.inBitmap = null; BitmapFactory.decodeByteArray(b, 0, b.size, sec) }.getOrNull()
                if (bmp == null) { cozulmeyen++; continue }
                sec.inBitmap = bmp
                runCatching {
                    val tuval = yuzey.lockCanvas(null) // libuvc de CPU üreticisiydi; aynı yolla çiz
                    hedef.set(0, 0, tuval.width, tuval.height); tuval.drawBitmap(bmp, null, hedef, null)
                    yuzey.unlockCanvasAndPost(tuval)
                }.onSuccess { if (cizilen++ == 0) { basladi(ozet); HataKaydi.not("uvc-tamam", "$ozet · ${usbOzet(aygit)}") } }
            }
        }, "uvc-ciz").also { it.start() }
        // 6 sn sonra hâlâ çizilen yoksa ayrıntıyı kaydet (veri geliyor ama kare çıkmıyor durumu)
        h.postDelayed({ if (!bitti && cizilen == 0) HataKaydi.not("uvc-yalin", "çizilen yok · probe $r1/$r2/$r3 · yük $yuk · bayt $bayt · kare $kare · çözülemeyen $cozulmeyen · aktarım hatası $hataSay · ${uclar()} · ${usbOzet(aygit)}") }, 6000)
    }

    override fun durdur() {
        bitti = true
        h.post {
            runCatching { okuyucu?.join(1000) }; runCatching { cizici?.join(1000) }
            baglanti?.let { c -> runCatching { c.close() } }; baglanti = null
            runCatching { kamera?.stopPreview() }; runCatching { kamera?.destroy() }; kamera = null
            runCatching { izleyici?.unregister() }; runCatching { izleyici?.destroy() }; izleyici = null
            is_.quitSafely()
        }
    }

    companion object {
        /** Görüntü sınıfı (UVC) arayüzü olan USB aygıtları */
        fun aygitlar(ctx: Context): List<UsbDevice> {
            val um = ctx.getSystemService(Context.USB_SERVICE) as UsbManager
            return um.deviceList.values.filter { gorunturVar(it) }
        }
        fun gorunturVar(d: UsbDevice) = (0 until d.interfaceCount).any { d.getInterface(it).interfaceClass == UsbConstants.USB_CLASS_VIDEO }
        /** Tanı için: aygıtın sınıfları (görüntü yoksa kamera hangi modda: PTP = 6, depolama = 8) */
        fun usbOzet(d: UsbDevice): String {
            val ar = (0 until d.interfaceCount).map { d.getInterface(it) }.joinToString(",") { "${it.interfaceClass}/${it.interfaceSubclass}" }
            return "${d.manufacturerName ?: "?"} ${d.productName ?: "?"} (vid ${"%04x".format(d.vendorId)} pid ${"%04x".format(d.productId)}) sınıf ${d.deviceClass} arayüzler [$ar]"
        }
        fun ptpMi(d: UsbDevice) = (0 until d.interfaceCount).any { d.getInterface(it).interfaceClass == UsbConstants.USB_CLASS_STILL_IMAGE }
    }
}
