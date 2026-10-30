pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement { repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS); repositories { google(); mavenCentral() } }
rootProject.name = "UpdatedMonitor"
include(":app")
// Modüller: ortak (paylaşılan kod ve kaynaklar), kamera, masa. masa-uygulama: ikinci uygulamanın iskeleti (yayına girmez)
include(":ortak", ":kamera", ":masa", ":masa-uygulama")
