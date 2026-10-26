package tr.com.updated.monitor

import android.content.Context
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
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
    var cozunurluk: String = ""; private set

    override fun baslat(yuzey: Surface, boyut: (Int, Int) -> Unit, hata: (String) -> Unit) {
        val m = USBMonitor(ctx, object : USBMonitor.OnDeviceConnectListener {
            override fun onAttach(d: UsbDevice) {}
            override fun onDetach(d: UsbDevice) { if (d.deviceName == aygit.deviceName) hata("USB kablosu çıkarıldı.") }
            override fun onCancel(d: UsbDevice) { hata("USB erişimine izin verilmedi. Kabloyu çıkarıp takınca gelen soruda \"İzin ver\"e bas.") }
            override fun onDeviceClose(d: UsbDevice, b: USBMonitor.UsbControlBlock) {}
            override fun onDeviceOpen(d: UsbDevice, blok: USBMonitor.UsbControlBlock, yeni: Boolean) {
                if (bitti || d.deviceName != aygit.deviceName) return
                h.post {
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
                                hata("Makine bağlandı ama görüntü göndermedi. Makinede USB yayını çözünürlüğünü 1080p'ye al ve kabloyu yeniden tak.")
                                HataKaydi.not("uvc", "kare gelmedi · biçimler ${runCatching { k.supportedSize }.getOrNull()?.take(3000)} · ${usbOzet(aygit)}"); return
                            }
                            val s = adaylar[i]
                            runCatching { k.stopPreview() }
                            val fps = s.fpsList?.filter { it in 24..30 }?.maxOrNull() ?: s.fpsList?.maxOrNull() ?: s.fps
                            runCatching { k.setPreviewSize(s.width, s.height, s.type, fps) }.getOrElse { runCatching { k.setPreviewSize(s.width, s.height, s.type) } }
                            cozunurluk = "${s.width}×${s.height} · ${fps} fps · ${if (s.type == UVCCamera.UVC_VS_FRAME_MJPEG) "MJPEG" else "YUV"}"
                            boyut(s.width, s.height)
                            k.setPreviewDisplay(yuzey)
                            k.startPreview()
                            val once = kareSayaci()
                            h.postDelayed({ if (!bitti && kareSayaci() == once) dene(i + 1) else if (!bitti) { basladi(cozunurluk); HataKaydi.not("uvc-tamam", "$cozunurluk · ${usbOzet(aygit)}") } }, 4000)
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

    override fun durdur() {
        bitti = true
        h.post {
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
