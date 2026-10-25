package tr.com.updated.monitor

/**
 * Sahneler (Fatih'in fikri): her sahne kameranın ayarlarını o çekime göre kurar. Telefon uzun pozlamayı veremiyorsa
 * kareler birleştirilir: ışık izinde en parlak noktalar birikir (MAX), gece ve Samanyolu'nda ortalama alınıp kumlanma azalır (ORT).
 */
enum class Sahne(val ad: String, val aciklama: String) {
    KAPALI("Kapalı", "Ayarlar el ile ya da otomatik."),
    ISIK_IZI("Işık izi", "Tripod gerekir. Seçilen süre boyunca kareler üst üste konur; yalnız hareket eden ışıklar iz bırakır."),
    SAMANYOLU("Samanyolu", "Tripod ve karanlık bir yer. Odak sonsuz, yüksek ISO, uzun pozlama; telefon izin vermiyorsa 16 karenin ortalaması."),
    GECE("Gece", "Elde gece çekimi: telefonun gece modu ya da 8 karenin ortalaması (kumlanma azalır)."),
    GUN_BATIMI("Gün batımı", "Sıcak renkler korunur, pozlama biraz kısılır."),
    SPOR("Spor", "Hızlı hareket: kısa enstantane, sürekli odak."),
    PORTRE("Portre", "Pozlama ve odak yüze göre."),
    MANZARA("Manzara", "Uzak ve geniş kadraj: keskin, doygun.");

    /** Kare birleştirme türü (null: tek çekim) */
    enum class Birlestir { MAX, ORT }
}

/** Otomatik sahne önerisi için ölçümler: pozlama (ISO × saniye), yön, renk, yüz */
data class SahneOlcum(val isoSaniye: Float?, val yukariBakiyor: Boolean, val ortParlak: Float, val kirmiziMavi: Float, val buyukYuz: Boolean)

/** Ölçümlere göre sahne önerir; emin değilse null. Eşikler: gün ışığı ≈ 0,1 · iç mekân ≈ 10 · gece ≥ 60 (ISO × saniye) */
fun sahneOner(o: SahneOlcum): Sahne? {
    val e = o.isoSaniye ?: return null
    return when {
        e >= 60f && o.yukariBakiyor -> Sahne.SAMANYOLU
        e >= 60f -> Sahne.GECE
        o.buyukYuz -> Sahne.PORTRE
        e < 20f && o.kirmiziMavi > 1.35f && o.ortParlak in 0.15f..0.7f -> Sahne.GUN_BATIMI
        else -> null
    }
}
