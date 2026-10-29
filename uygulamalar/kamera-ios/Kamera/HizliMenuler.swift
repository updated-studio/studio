import SwiftUI

/// Kayıt grubunda VİDEO için: kodek, renk (SDR / HDR / Log), sabitleme (Genel Ayarlar'a gitmeden)
struct KayitHizli: View {
    @ObservedObject var kamera: Kamera

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            sira("KODEK", Kodek.allCases.filter { kamera.kodekler.contains($0) }.map { k in
                (k == .hevc || k == .h264 ? k.kisa : "ProRes \(k.kisa)", kamera.kodek == k, { kamera.kodek = k })
            })
            sira("RENK", kamera.renkModlari.map { r in (r.kisa, kamera.renkModu == r, { kamera.renkModu = r }) })
            sira("SABİTLEME", kamera.sabitlemeler.map { s in (s.ad, kamera.sabitleme == s, { kamera.sabitleme = s }) })
        }
        .disabled(kamera.kayitta)
        .onAppear { kamera.secenekleriYaz() }
    }

    private func sira(_ ad: String, _ secenekler: [(String, Bool, () -> Void)]) -> some View {
        HStack(spacing: 8) {
            Text(ad).bolumBasligi().frame(width: 78, alignment: .leading)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(Array(secenekler.enumerated()), id: \.offset) { _, s in Secenek(yazi: s.0, secili: s.1, sec: s.2) }
                }
            }
        }
        .padding(.leading, 10)
    }
}

/// Ses grubu: giriş ve biçim
struct SesHizli: View {
    @ObservedObject var kamera: Kamera

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label(kamera.etkinSesGirdi ?? "Mikrofon", systemImage: kamera.harici ? "mic.badge.plus" : "mic").font(.subheadline.weight(.semibold))
                Spacer()
                if kamera.harici { Text("HARİCİ").font(.caption2.weight(.bold)).foregroundStyle(.black).padding(.horizontal, 6).padding(.vertical, 2).background(Capsule().fill(Tema.sari)) }
            }
            Text("GİRİŞ").bolumBasligi()
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    Secenek(yazi: "Otomatik", secili: kamera.sesGirdi == nil) { kamera.sesGirdi = nil }
                    ForEach(kamera.sesGirdileri) { g in
                        Secenek(yazi: g.ad, alt: g.harici ? "harici" : nil, secili: kamera.sesGirdi == g.id) { kamera.sesGirdi = g.id }
                    }
                }
            }
            Text("BİÇİM").bolumBasligi()
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(SesBicimi.allCases) { b in Secenek(yazi: b.ad, secili: kamera.sesBicimi == b) { kamera.sesBicimi = b } }
                }
            }
            Text(kamera.sesBicimi.aciklama).font(.caption).foregroundStyle(Tema.metin2)
        }
        .disabled(kamera.kayitta)
        .pano()
        .onAppear { kamera.sesGirdileriYaz() }
    }
}
