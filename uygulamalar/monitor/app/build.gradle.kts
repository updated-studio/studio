import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// İmza bilgisi (android {} içinde "java" başka anlama geldiği için burada okunur)
val imza = Properties().apply { val f = file("/opt/updated/monitor-imza/imza.properties"); if (f.exists()) f.inputStream().use { load(it) } }

android {
    namespace = "tr.com.updated.monitor"
    compileSdk = 35
    defaultConfig {
        applicationId = "tr.com.updated.monitor"
        minSdk = 28            // Android 9: GLES 3, Camera2 harici kamera (UVC) Android 14+ cihazlarda
        targetSdk = 35
        versionCode = 2
        versionName = "0.2.0"
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
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    val media3 = "1.4.1"
    implementation("androidx.media3:media3-exoplayer:$media3")
    implementation("androidx.media3:media3-exoplayer-rtsp:$media3")
    implementation("androidx.media3:media3-exoplayer-hls:$media3")
    implementation("androidx.media3:media3-datasource-rtmp:$media3")
}
