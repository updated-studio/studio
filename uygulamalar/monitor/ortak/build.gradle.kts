// Ortak: iki uygulamanın (Kamera; Masa + Monitör) paylaştığı kod ve bütün kaynaklar (tasarım, LUT, ağ yayını, Luna, ölçüm, kayıt yazıcıları, PRO/Monitör ekranı)
plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

// Güncelleme adresi: indirme klasörünün adı yalnız sunucuda (depoya girmez)
val indirKlasoru = file("/opt/updated/monitor-imza/indir-klasoru").takeIf { it.exists() }?.readText()?.trim().orEmpty()

android {
    namespace = "tr.com.updated.monitor"
    compileSdk = 35
    defaultConfig {
        minSdk = 29
        buildConfigField("String", "GUNCELLEME_ADRESI", "\"" + (if (indirKlasoru.isEmpty()) "" else "https://studio.updated.com.tr/indir/$indirKlasoru/") + "\"")
    }
    buildFeatures { buildConfig = true }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    val media3 = "1.4.1"
    api("androidx.media3:media3-exoplayer:$media3")
    api("androidx.media3:media3-exoplayer-rtsp:$media3")
    api("androidx.media3:media3-exoplayer-hls:$media3")
    api("androidx.media3:media3-datasource-rtmp:$media3")
    // Stiller → "Kayda göm": video kayıttan sonra LUT ile yeniden kodlanır
    api("androidx.media3:media3-transformer:$media3")
    api("androidx.media3:media3-effect:$media3")
    api("androidx.exifinterface:exifinterface:1.3.6")
    // Akıllı kompozisyon yardımcısı: konu ve yüz algılama telefonun içinde (internetsiz), modeller uygulamayla gelir
    api("com.google.mlkit:object-detection:17.0.2")
    api("com.google.mlkit:face-detection:16.1.7")
    // Doğrudan USB görüntü (UVC): libuvc + libusb; Android'in harici kamera desteği olmayan telefonlarda da çalışır
    api("com.herohan:UVCAndroid:1.0.13")
}
