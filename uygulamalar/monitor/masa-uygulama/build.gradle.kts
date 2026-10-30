// İkinci uygulamanın iskeleti: Masa + Monitör (Kamera'sız). Adı, simgesi ve paket kimliği henüz belli değil; yayına girmez,
// derlenmesi yalnız :masa modülünün :kamera'ya bağlı olmadığını gösterir. Bilgiler gelince doldurulur.
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "tr.com.updated.masa.uygulama"
    compileSdk = 35
    defaultConfig {
        applicationId = "tr.com.updated.masa" // geçici
        minSdk = 29
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        ndk { abiFilters += listOf("arm64-v8a") }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation(project(":masa"))
}
