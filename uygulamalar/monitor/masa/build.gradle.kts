// Masa: çok kameralı kayıt ve program (Wi-Fi kameraları, Luna, USB görüntü)
plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    // Kod tr.com.updated.monitor paketinde kalır; ad alanı yalnız modülün kendi R/BuildConfig sınıfları için ayrı
    namespace = "tr.com.updated.monitor.masa"
    compileSdk = 35
    defaultConfig { minSdk = 29 }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    api(project(":ortak"))
}
