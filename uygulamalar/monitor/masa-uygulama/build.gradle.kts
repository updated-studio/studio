import java.util.Properties

// UpCam Studio: ikinci uygulama (Masa + Monitör, Kamera'sız). iOS'ta tr.com.UpCam.Studio; Android paket adları küçük harf.
// Yayın: bash uygulamalar/monitor/derle.sh --masa "not" (indirme klasörünün masa/ altına; güncelleme kanalı ayrı).
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// İmza: Kamera ile aynı anahtar (yalnız sunucuda)
val imza = Properties().apply { val f = file("/opt/updated/monitor-imza/imza.properties"); if (f.exists()) f.inputStream().use { load(it) } }

android {
    namespace = "tr.com.upcam.studio.uygulama"
    compileSdk = 35
    defaultConfig {
        applicationId = "tr.com.upcam.studio"
        minSdk = 29
        targetSdk = 35
        versionCode = 3
        versionName = "0.2.1"
        ndk { abiFilters += listOf("arm64-v8a") }
    }
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
    implementation(project(":masa"))
}
