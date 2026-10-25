import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// İmza bilgisi (android {} içinde "java" başka anlama geldiği için burada okunur)
val imza = Properties().apply { val f = file("/opt/updated/monitor-imza/imza.properties"); if (f.exists()) f.inputStream().use { load(it) } }
// Güncelleme adresi: indirme klasörünün adı yalnız sunucuda (depoya girmez)
val indirKlasoru = file("/opt/updated/monitor-imza/indir-klasoru").takeIf { it.exists() }?.readText()?.trim().orEmpty()

android {
    namespace = "tr.com.updated.monitor"
    compileSdk = 35
    defaultConfig {
        applicationId = "tr.com.updated.monitor"
        minSdk = 29            // Android 10: GLES 3, MediaStore klasörleri; Camera2 harici kamera (UVC) Android 14+ cihazlarda
        targetSdk = 35
        versionCode = 12
        versionName = "0.7.0"
        buildConfigField("String", "GUNCELLEME_ADRESI", "\"" + (if (indirKlasoru.isEmpty()) "" else "https://studio.updated.com.tr/indir/$indirKlasoru/") + "\"")
        ndk { abiFilters += listOf("arm64-v8a") } // güncel Android telefonların hepsi; ML Kit kitaplıkları diğer işlemciler için APK'yı 3 kat büyütüyordu
    }
    // İmza anahtarı yalnız sunucuda (/opt/updated/monitor-imza, depoya girmez). Aynı anahtar = sonraki sürümler güncelleme olarak kurulur.
    signingConfigs {
        create("updated") {
            if (imza.isNotEmpty()) {
                storeFile = file(imza.getProperty("storeFile")); storePassword = imza.getProperty("storePassword")
                keyAlias = imza.getProperty("keyAlias"); keyPassword = imza.getProperty("keyPassword")
            }
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (imza.isNotEmpty()) signingConfigs.getByName("updated") else signingConfigs.getByName("debug")
        }
    }
    buildFeatures { buildConfig = true }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    val media3 = "1.4.1"
    implementation("androidx.media3:media3-exoplayer:$media3")
    implementation("androidx.media3:media3-exoplayer-rtsp:$media3")
    implementation("androidx.media3:media3-exoplayer-hls:$media3")
    implementation("androidx.media3:media3-datasource-rtmp:$media3")
    // Akıllı kompozisyon yardımcısı: konu ve yüz algılama telefonun içinde (internetsiz), modeller uygulamayla gelir
    implementation("com.google.mlkit:object-detection:17.0.2")
    implementation("com.google.mlkit:face-detection:16.1.7")
}
