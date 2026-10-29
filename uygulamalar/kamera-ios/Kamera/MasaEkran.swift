import SwiftUI

/// Masa ekranı (Android MasaActivity düzeni): dikeyde üstte canlı (16:9), altında 2×2 kaynaklar;
/// yatayda canlı solda (%70), kaynaklar sağda sütun. Kaynağa dokun → canlı; basılı tut → Canlıya al / Döndür / Kaldır.
struct MasaEkran: View {
    var kapat: () -> Void
    @StateObject private var m = Masa()
    @Environment(\.scenePhase) private var evre
    @State private var kaynakAcik = false
    @State private var adres = ""

    var body: some View {
        // iPad'de yönetmen masası (MasaIpad.swift); iPhone'da bu düzen
        Group {
            if UIDevice.current.userInterfaceIdiom == .pad {
                MasaIpad(m: m, kapat: kapat, kaynakAcik: $kaynakAcik)
            } else {
                telefon
            }
        }
        .preferredColorScheme(.dark)
        .statusBarHidden()
        .onAppear { m.ac() }
        .onDisappear { m.kapat() }
        .onChange(of: evre) { _, yeni in if yeni == .active { m.usbTara() } }
        .sheet(isPresented: $kaynakAcik) { kaynakSayfasi }
    }

    private var telefon: some View {
        GeometryReader { g in
            let yatay = g.size.width > g.size.height
            VStack(spacing: 8) {
                ustCubuk
                if yatay {
                    HStack(spacing: 8) {
                        canliAlan.frame(width: g.size.width * 0.7 - 12)
                        ScrollView { VStack(spacing: 8) { hucreler } }
                    }
                } else {
                    canliAlan.aspectRatio(16 / 9, contentMode: .fit)
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) { hucreler }
                    Spacer(minLength: 0)
                }
            }
            .padding(.horizontal, 8)
            .padding(.bottom, 8)
        }
        .background(Tema.zemin.ignoresSafeArea())
        .foregroundStyle(.white)
    }

    private var ustCubuk: some View {
        HStack(spacing: 12) {
            Button(action: kapat) {
                Label("Kamera", systemImage: "chevron.left").font(.footnote.weight(.bold))
            }
            .disabled(m.kayitta)
            Text("MASA").font(.footnote.weight(.heavy)).foregroundStyle(Tema.vurgu)
            SsdCipi(k: m.klasor, kilitli: m.kayitta)
            if m.kayitta, let bas = m.kayitBasi {
                TimelineView(.periodic(from: bas, by: 1)) { an in
                    Label(sure(an.date.timeIntervalSince(bas)), systemImage: "record.circle.fill")
                        .font(Tema.mono).foregroundStyle(.red)
                }
            }
            Spacer()
            if let b = m.bildirim {
                Text(b).font(.caption.weight(.semibold)).lineLimit(2)
                    .task(id: b) {
                        try? await Task.sleep(nanoseconds: 3_000_000_000)
                        if m.bildirim == b { m.bildirim = nil }
                    }
            }
            Button { kaynakAcik = true } label: {
                Label("Kaynak", systemImage: "plus").font(.footnote.weight(.bold))
                    .padding(.horizontal, 12).frame(height: 32)
                    .background(Capsule().fill(Color.white.opacity(0.12)))
            }
        }
        .frame(height: 44)
    }

    private var canliAlan: some View {
        let y = m.yuvalar.first { $0.id == m.canli }
        return ZStack(alignment: .topLeading) {
            Goruntu(gorunum: m.program)
            if y == nil {
                VStack(spacing: 6) {
                    Text("Kaynak yok").font(.headline)
                    Text("Kamera telefonunda Ayarlar → Wi-Fi kamera'yı aç (aynı Wi-Fi), ya da iPad'e USB kamera tak.")
                        .font(.caption).foregroundStyle(Tema.metin2).multilineTextAlignment(.center)
                }
                .padding(24)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            if let y {
                Text(m.kayitta && !m.kayitOzeti.isEmpty ? "CANLI · \(y.ad) · \(m.kayitOzeti)" : "CANLI · \(y.ad)").font(.caption.weight(.heavy))
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(Capsule().fill(Color.red))
                    .padding(8)
            }
            kayitDugmesi
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                .padding(12)
        }
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(m.kayitta ? Color.red : Color.white.opacity(0.15), lineWidth: m.kayitta ? 3 : 1))
    }

    private var kayitDugmesi: some View {
        Button { m.kayitDegistir() } label: {
            ZStack {
                Circle().stroke(.white, lineWidth: 4).frame(width: 64, height: 64)
                RoundedRectangle(cornerRadius: m.kayitta ? 6 : 26)
                    .fill(.red)
                    .frame(width: m.kayitta ? 26 : 52, height: m.kayitta ? 26 : 52)
            }
            .animation(.easeOut(duration: 0.15), value: m.kayitta)
        }
        .accessibilityLabel(m.kayitta ? "Kaydı durdur" : "Kaydı başlat")
    }

    @ViewBuilder private var hucreler: some View {
        ForEach(0..<Masa.enCok, id: \.self) { i in
            if i < m.yuvalar.count {
                let y = m.yuvalar[i]
                YuvaHucre(y: y, canli: y.id == m.canli, kayitBasi: m.kayitBasi)
                    .onTapGesture { m.canliYap(y) }
                    .contextMenu {
                        Button("Canlıya al") { m.canliYap(y) }
                        Button("Döndür (90°)") { m.dondur(y) }
                        Button("Kaldır", role: .destructive) { m.kaldir(y) }
                    }
            } else {
                RoundedRectangle(cornerRadius: 8)
                    .strokeBorder(Color.white.opacity(0.15), style: StrokeStyle(lineWidth: 1, dash: [5, 4]))
                    .aspectRatio(16 / 9, contentMode: .fit)
                    .overlay(Text("Boş").font(.caption).foregroundStyle(Tema.metin2))
                    .onTapGesture { kaynakAcik = true }
            }
        }
    }

    private var kaynakSayfasi: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Wi-Fi kameralar aynı ağdaysa kendiliğinden eklenir: kamera telefonunda UPDATED Kamera → Wi-Fi kamera. Android telefonlarda Ayarlar → Masa → Wi-Fi kamera ol.")
                        .font(.footnote).foregroundStyle(Tema.metin2)
                    if !m.aglarIzni {
                        Text("Yerel ağ izni kapalı olabilir: Ayarlar → UPDATED Kamera → Yerel Ağ.").font(.footnote).foregroundStyle(.orange)
                    }
                }
                Section("Adresle ekle") {
                    TextField("Kameranın adresi (ör. 192.168.1.20)", text: $adres)
                        .keyboardType(.numbersAndPunctuation)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                    Button("Ekle") { m.adresleEkle(adres); adres = ""; kaynakAcik = false }
                        .disabled(adres.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                Section("USB") {
                    Button("USB kameraları yeniden ara") { m.usbTara(); kaynakAcik = false }
                    Text("iPad'e USB-C ile takılı kameralar (UVC: çoğu web kamerası, Sony USB yayın modu, aksiyon kameralarının web kamerası modu) kendiliğinden eklenir. iPhone USB kamera kabul etmez.")
                        .font(.footnote).foregroundStyle(Tema.metin2)
                }
            }
            .navigationTitle("Kaynak ekle")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Kapat") { kaynakAcik = false } } }
        }
        .preferredColorScheme(.dark)
    }

    private func sure(_ s: TimeInterval) -> String {
        let t = Int(s)
        return t >= 3600 ? String(format: "%d:%02d:%02d", t / 3600, t / 60 % 60, t % 60) : String(format: "%d:%02d", t / 60, t % 60)
    }
}

private struct YuvaHucre: View {
    @ObservedObject var y: Yuva
    let canli: Bool
    let kayitBasi: Date?

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            Goruntu(gorunum: y.gorunum)
            if !y.bagli {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            if y.kaydediyor, let bas = kayitBasi {
                KayitRozeti(bas: bas).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing).padding(6)
            }
            HStack(spacing: 4) {
                Image(systemName: y.wifi ? "wifi" : "cable.connector")
                Text(y.ad).lineLimit(1)
            }
            .font(.caption2.weight(.bold))
            .padding(.horizontal, 6).padding(.vertical, 3)
            .background(Capsule().fill(Color.black.opacity(0.55)))
            .padding(6)
        }
        .aspectRatio(16 / 9, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(canli ? Color.red : Color.white.opacity(0.15), lineWidth: canli ? 3 : 1))
        .contentShape(Rectangle())
    }
}
