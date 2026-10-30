import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// İmza bilgisi (android {} içinde "java" başka anlama geldiği için burada okunur)
val imza = Properties().apply { val f = file("/opt/updated/monitor-imza/imza.properties"); if (f.exists()) f.inputStream().use { load(it) } }

android {
    // Kod ve kaynaklar modüllerde (ortak, kamera, masa); paket kimliği (applicationId) değişmez, güncelleme olarak kurulur
    namespace = "tr.com.updated.monitor.uygulama"
    compileSdk = 35
    defaultConfig {
        applicationId = "tr.com.updated.monitor"
        minSdk = 29            // Android 10: GLES 3, MediaStore klasörleri; Camera2 harici kamera (UVC) Android 14+ cihazlarda
        targetSdk = 35
        versionCode = 39
        versionName = "0.19.0"
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
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
    // Ekran görüntüsü testleri (telefon olmadan): Robolectric gerçek çizimle (native graphics) ekranları PNG'ye döker
    testOptions { unitTests { isIncludeAndroidResources = true; all { it.maxHeapSize = "1200m"; it.systemProperty("robolectric.graphicsMode", "NATIVE") } } }
}

dependencies {
    // Kamera uygulaması: yalnız Kamera (Multi Cam ve Monitör UpCam Studio'da, Fatih 30 Ekim); Multi Cam yalnız ekran testleri için
    implementation(project(":kamera"))
    testImplementation(project(":masa"))
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.14.1")
    testImplementation("androidx.test:core:1.6.1")
}
