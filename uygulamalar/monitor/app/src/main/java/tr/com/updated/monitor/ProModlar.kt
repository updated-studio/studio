package tr.com.updated.monitor

import android.content.SharedPreferences
import android.hardware.camera2.CameraMetadata
import org.json.JSONObject

/**
 * Hazır çekim modları (Huawei Pura'nın pro modları gibi): her modun baştan ayarlı değerleri var, kullanıcı hazır seçeneklerle değiştirir,
 * değişiklik mod başına saklanır, "Varsayılana dön" ile silinir. Telefon uzun pozlamayı veremiyorsa `birlestir` ile kareler birleştirilir.
 */
data class ProAyar(
    val iso: Int?,              // null: otomatik
    val enstNs: Long?,          // null: otomatik
    val odak: Int,              // ODAK_* (aşağıda)
    val bd: Int,                // CameraMetadata.CONTROL_AWB_MODE_*
    val ev: Float,              // pozlama telafisi (yalnız otomatik pozlamada)
    val sureSn: Int,            // kare birleştirme süresi (0: tek kare / sabit kare sayısı)
    val zamanlayici: Int,       // sn
) {
    fun json() = JSONObject().put("iso", iso ?: 0).put("enst", enstNs ?: 0L).put("odak", odak).put("bd", bd).put("ev", ev.toDouble()).put("sure", sureSn).put("zaman", zamanlayici).toString()
    companion object {
        const val ODAK_OTO = 0; const val ODAK_SUREKLI = 1; const val ODAK_SONSUZ = 2; const val ODAK_2M = 3
        fun json(s: String, v: ProAyar): ProAyar = runCatching { JSONObject(s).let { j ->
            ProAyar(j.optInt("iso").takeIf { it > 0 }, j.optLong("enst").takeIf { it > 0 }, j.optInt("odak", v.odak), j.optInt("bd", v.bd), j.optDouble("ev", v.ev.toDouble()).toFloat(),
                j.optInt("sure", v.sureSn), j.optInt("zaman", v.zamanlayici)) } }.getOrDefault(v)
    }
}

private const val SN = 1_000_000_000L
private const val OTO_BD = CameraMetadata.CONTROL_AWB_MODE_AUTO
private const val BD_4000 = CameraMetadata.CONTROL_AWB_MODE_FLUORESCENT
private const val BD_3200 = CameraMetadata.CONTROL_AWB_MODE_INCANDESCENT

enum class ProMod(val ad: String, val simge: Int, val ipucu: String, val uyari: String, val varsayilan: ProAyar,
                  /** Uzun pozlama yoksa (ya da her zaman, iz modlarında) kareler nasıl birleşir */
                  val birlestir: Sahne.Birlestir?, val herZamanBirlestir: Boolean = false,
                  /** Seri çekim (spor), en uzun objektif (kuş), otomatik ISO üst sınırı, en uzun otomatik enstantane */
                  val seri: Boolean = false, val tele: Boolean = false, val isoUst: Int? = null, val enstUstNs: Long? = null) {
    SAMANYOLU("Samanyolu", R.drawable.ic_yildiz, "Tripod, karanlık ve açık gökyüzü",
        "Tripod kullanın ya da telefonu sabitleyin. Ekran parlaklığını kısın, gözünüz karanlığa alışsın.",
        ProAyar(3200, 20 * SN, ProAyar.ODAK_SONSUZ, BD_4000, 0f, 0, 3), Sahne.Birlestir.ORT),
    YILDIZ_IZI("Yıldız izi", R.drawable.ic_dondur, "Tripod; yıldızlar çember çizer",
        "Tripod kullanın ya da telefonu sabitleyin. Çekim uzun sürer; telefonu şarja takın.",
        ProAyar(800, 20 * SN, ProAyar.ODAK_SONSUZ, BD_4000, 0f, 30 * 60, 3), Sahne.Birlestir.MAX, herZamanBirlestir = true),
    ISIK_BOYAMA("Işık boyama", R.drawable.ic_parlak, "Karanlıkta fenerle havaya çiz; tripod",
        "Tripod kullanın. Zamanlayıcı bitince ışıkla çizmeye başlayın.",
        ProAyar(100, 10 * SN, ProAyar.ODAK_2M, BD_3200, 0f, 10, 3), Sahne.Birlestir.MAX, herZamanBirlestir = true),
    ARAC_IZI("Araç ışık izi", R.drawable.ic_iz, "Yol ya da köprü; farlar çizgi olur",
        "Tripod kullanın ya da telefonu bir yere dayayın.",
        ProAyar(100, 8 * SN, ProAyar.ODAK_SONSUZ, OTO_BD, 0f, 8, 0), Sahne.Birlestir.MAX, herZamanBirlestir = true),
    IPEKSI_SU("İpeksi su", R.drawable.ic_renk, "Şelale, dalga; su pamuk gibi akar",
        "Tripod kullanın ya da telefonu sabitleyin; telefon kıpırdarsa su yerine her şey bulanıklaşır.",
        ProAyar(100, 2 * SN, ProAyar.ODAK_OTO, OTO_BD, -0.7f, 2, 2), Sahne.Birlestir.ORT),
    HAVAI_FISEK("Havai fişek", R.drawable.ic_sahne, "Tripod; patlamalar üst üste biner",
        "Tripod kullanın. İlk patlamayla birlikte deklanşöre basın.",
        ProAyar(100, 4 * SN, ProAyar.ODAK_SONSUZ, OTO_BD, 0f, 4, 0), Sahne.Birlestir.MAX, herZamanBirlestir = true),
    SPOR("Spor", R.drawable.ic_hiz, "Koşan, zıplayan; hareket donar",
        "Konuyu kadrajda takip edin; deklanşörü basılı tutunca seri çeker.",
        ProAyar(null, SN / 1000, ProAyar.ODAK_SUREKLI, OTO_BD, 0f, 0, 0), null, seri = true, isoUst = 3200),
    KUS_UCAK("Kuş ve uçak", R.drawable.ic_odak, "Gökyüzünde hızlı konu",
        "Konuyu kadrajın ortasında tutun; deklanşörü basılı tutunca seri çeker.",
        ProAyar(null, SN / 2000, ProAyar.ODAK_SUREKLI, OTO_BD, 0.3f, 0, 0), null, seri = true, tele = true, isoUst = 6400),
    GECE_SEHIR("Gece şehir", R.drawable.ic_gece, "Elde gece; kumlanma azalır",
        "Çekim bitene kadar telefonu kıpırdatmayın (yaklaşık 1 sn).",
        ProAyar(null, null, ProAyar.ODAK_OTO, OTO_BD, 0f, 0, 0), Sahne.Birlestir.ORT, herZamanBirlestir = true, enstUstNs = SN / 15);

    fun oku(t: SharedPreferences): ProAyar = t.getString("pro_$name", null)?.let { ProAyar.json(it, varsayilan) } ?: varsayilan
    fun yaz(t: SharedPreferences, a: ProAyar) { if (a == varsayilan) t.edit().remove("pro_$name").apply() else t.edit().putString("pro_$name", a.json()).apply() }

    /** Bu mod hangi ayar satırlarını gösterir (ilgisiz olanlar gizli: sporda süre, gece şehirde enstantane yok) */
    val sureVar get() = birlestir != null && herZamanBirlestir && this != GECE_SEHIR

    companion object {
        /** Hazır seçenekler (kaydırıcı yok) */
        val ISOLAR = listOf<Int?>(null, 100, 200, 400, 800, 1600, 3200, 6400)
        val ENSTLER = listOf<Long?>(null, SN / 4000, SN / 2000, SN / 1000, SN / 500, SN / 250, SN / 60, SN / 15, SN / 4, SN, 2 * SN, 4 * SN, 8 * SN, 10 * SN, 15 * SN, 20 * SN, 30 * SN)
        val ODAKLAR = listOf(ProAyar.ODAK_OTO, ProAyar.ODAK_SUREKLI, ProAyar.ODAK_SONSUZ, ProAyar.ODAK_2M)
        val BDLER = listOf(OTO_BD, BD_3200, BD_4000, CameraMetadata.CONTROL_AWB_MODE_DAYLIGHT, CameraMetadata.CONTROL_AWB_MODE_CLOUDY_DAYLIGHT)
        val EVLER = listOf(-1f, -0.7f, -0.3f, 0f, 0.3f, 0.7f, 1f)
        val SURELER = listOf(2, 4, 8, 10, 30, 60, 5 * 60, 15 * 60, 30 * 60, 60 * 60)
        val ZAMANLAR = listOf(0, 2, 3, 10)

        fun isoYazi(i: Int?) = i?.toString() ?: "Oto"
        fun enstYazi(n: Long?) = when { n == null -> "Oto"; n >= SN -> "${n / SN} sn"; else -> "1/${SN / n}" }
        fun odakYazi(o: Int) = when (o) { ProAyar.ODAK_SUREKLI -> "Sürekli"; ProAyar.ODAK_SONSUZ -> "Sonsuz"; ProAyar.ODAK_2M -> "2 m"; else -> "Oto" }
        fun bdYazi(b: Int) = when (b) { BD_3200 -> "3200K"; BD_4000 -> "4000K"; CameraMetadata.CONTROL_AWB_MODE_DAYLIGHT -> "5600K"; CameraMetadata.CONTROL_AWB_MODE_CLOUDY_DAYLIGHT -> "6500K"; else -> "Oto" }
        fun evYazi(e: Float) = if (e == 0f) "0" else "%+.1f".format(e).replace('.', ',')
        fun sureYazi(s: Int) = when { s >= 3600 -> "${s / 3600} sa"; s >= 60 -> "${s / 60} dk"; else -> "$s sn" }
        fun zamanYazi(z: Int) = if (z == 0) "Kapalı" else "$z sn"
    }

    /** Üstteki etiket: "Samanyolu · ISO 3200 · 20 sn" */
    fun ozet(a: ProAyar): String = listOfNotNull(ad, "ISO ${isoYazi(a.iso)}", a.enstNs?.let { enstYazi(it) }, if (sureVar) "${sureYazi(a.sureSn)} birleşim" else null).joinToString(" · ")
}
