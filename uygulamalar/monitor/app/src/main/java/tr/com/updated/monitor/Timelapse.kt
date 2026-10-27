package tr.com.updated.monitor

/**
 * Timelapse (hızlandırılmış çekim): her `aralikMs`'de bir kare alınır, video `FPS` hızında oynar.
 * Örnek: 2 sn aralık, 30 fps → 1 dakikalık çekim 2 saniyelik video olur (60 kat hızlı).
 * Kareler ekrandaki görüntüden (MonitorGorunum) kodlayıcıya çizilir; zaman damgası gerçek saatten değil kare sırasından gelir,
 * böylece kare arası ne kadar uzun olursa olsun video akıcı oynar.
 */
object Timelapse {
    const val FPS = 30
    /** Mod şeridinin üstündeki hızlı seçim (ms) */
    val HIZLI = longArrayOf(1000, 2000, 5000, 10_000, 30_000)
    /** Ayarlardaki tam liste (ms) */
    val ARALIKLAR = longArrayOf(500, 1000, 2000, 3000, 5000, 10_000, 30_000, 60_000)
    /** Çekim süresi sınırı (dakika); 0 = durdurana kadar */
    val SURELER = intArrayOf(0, 10, 30, 60, 120)

    /** Kaç kat hızlı oynar */
    fun hiz(aralikMs: Long, fps: Int = FPS): Float = aralikMs * fps / 1000f
    /** n. karenin videodaki zamanı (ns) */
    fun kareZamaniNs(sira: Long, fps: Int = FPS): Long = sira * 1_000_000_000L / fps
    /** Çekilen kare sayısından video süresi (ms) */
    fun videoMs(kare: Long, fps: Int = FPS): Long = kare * 1000L / fps
    /** Verilen çekim süresinden (ms) çıkacak video süresi (ms) */
    fun videoMsSuredan(cekimMs: Long, aralikMs: Long, fps: Int = FPS): Long = videoMs(cekimMs / aralikMs + 1, fps)

    fun aralikYazi(ms: Long): String = when {
        ms % 60_000 == 0L -> "${ms / 60_000} dk"
        ms % 1000 == 0L -> "${ms / 1000} sn"
        else -> "%.1f sn".format(ms / 1000f).replace('.', ',')
    }
    fun sureYazi(dk: Int): String = when { dk == 0 -> "Sınırsız"; dk % 60 == 0 -> "${dk / 60} sa"; else -> "$dk dk" }
    /** 0:04 · 1:12:05 */
    fun saat(ms: Long): String {
        val s = ms / 1000; val sa = s / 3600; val dk = s / 60 % 60; val sn = s % 60
        return if (sa > 0) "%d:%02d:%02d".format(sa, dk, sn) else "%d:%02d".format(dk, sn)
    }
}
