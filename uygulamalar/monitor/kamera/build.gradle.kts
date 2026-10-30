// Kamera: çekim ekranı, ayarlar, stiller ve kayıttan sonra işleme, ekranı Masa'ya gönderme
plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    // Kod tr.com.updated.monitor paketinde kalır; ad alanı yalnız modülün kendi R/BuildConfig sınıfları için ayrı
    namespace = "tr.com.updated.monitor.kamera"
    compileSdk = 35
    defaultConfig { minSdk = 29 }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    api(project(":ortak"))
}
