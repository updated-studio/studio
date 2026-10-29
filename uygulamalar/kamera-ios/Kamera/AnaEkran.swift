import AVFoundation
import SwiftUI

enum ProPanelTuru { case mod, ayar }

/// Kamera ekranı, Apple Kamera'nın (iOS 26) düzeninde (Fatih'in 28 Ekim ekran görüntüleri):
/// üstte ve altta siyah bant, arada görüntü. Görüntünün üstünde ortada biçim bilgisi (değişen değerler sarı, dokununca BİÇİM);
/// altta gerçek mercekler (0,5 · 1× · 2 · tele; dijital yakınlaştırma yok), deklanşör, solda flaş (PRO'da mod), sağda "⋯" kontroller.
/// Alt bantta son çekim, kapsül mod seçici, ön/arka. Paneller alttan açılan yuvarlak köşeli cam pano (başlık + ✕).
/// Telefon yan tutulunca deklanşör sağ kenarda dikey ortada; mercekler ve modlar onun yanında dikey sıralanır.
struct AnaEkran: View {
    @StateObject private var kamera = Kamera()
    enum Panel: Equatable { case proKartlar, proAyar, poz, bd, odak, kilavuz, kontroller, bicim, gosterge, grup(Grup), favori(Favori) }
    /// Ekrandaki menü grupları (Fatih 29 Ekim): "⋯" tek dokunuşla son açılan grubu açar, alttaki şeritten diğerlerine geçilir
    enum Grup: String, CaseIterable, Identifiable {
        case kayit, pozlama, renk, ses, gosterge
        var id: String { rawValue }
        var ad: String { switch self { case .kayit: return "Kayıt"; case .pozlama: return "Pozlama"; case .renk: return "Renk"; case .ses: return "Ses"; case .gosterge: return "Göstergeler" } }
        var simge: String { switch self { case .kayit: return "video"; case .pozlama: return "plusminus.circle"; case .renk: return "camera.filters"; case .ses: return "mic"; case .gosterge: return "chart.bar.xaxis" } }
    }
    @State private var panel: Panel?
    @AppStorage("k.sonGrup") private var sonGrup = Grup.pozlama.rawValue
    @State private var renkSekme = 0
    /// Merceklerin yerinde açık tek satır seçim (Denetimler'den ya da kısayoldan)
    @State private var acikSatir: Favori?
    /// Kısayolları düzenleme (Apple Kamera "Düzenle"); vazgeçince eski liste geri gelir
    @State private var duzenleme = false
    @State private var yedekFavoriler: [Favori] = []
    @State private var uyariMod: ProMod?
    @State private var arayuz: UIInterfaceOrientation = .portrait
    @State private var yardim = false
    @State private var ayarlar = false
    @State private var giris = !GirisEkran.soruldu && UserDefaults.standard.string(forKey: "giris") == nil
    /// Masa (çok kamera), Wi-Fi kamera ya da Monitör açıkken ana kamera durur
    @State private var ekran: Ekran?
    enum Ekran: String, Identifiable { case masa, wifi, monitor; var id: String { rawValue } }
    @Environment(\.scenePhase) private var evre

    static let mavi = Color(red: 106 / 255, green: 152 / 255, blue: 248 / 255)
    static let cam = Color(white: 0.16).opacity(0.78)
    /// Dairesel düğmeler (Apple Kamera'daki koyu gri)
    static let gri = Color(white: 0.3).opacity(0.78)

    var body: some View {
        GeometryReader { g in
            let yatay = g.size.width > g.size.height
            ZStack {
                Color.black.ignoresSafeArea()
                // Önizleme iki düzende de aynı görünüm: döndürünce yeniden kurulmaz (eskiden yan çevirince kararıp takılıyordu)
                goruntu.ignoresSafeArea()
                CekimKararmasi(sayac: kamera.cekimAni).ignoresSafeArea().allowsHitTesting(false)
                if yatay { yatayDuzen(g) } else { dikeyDuzen(g) }
                if !kamera.izinVar { izinUyarisi }
                if let p = kamera.proIlerleme {
                    Text(p)
                        .font(p.count <= 3 ? .system(size: 80, weight: .bold, design: .rounded) : Tema.mono)
                        .padding(.horizontal, 16).padding(.vertical, 10)
                        .background(Capsule().fill(Color.black.opacity(p.count <= 3 ? 0 : 0.55)))
                        .shadow(color: .black.opacity(0.6), radius: 4)
                        .allowsHitTesting(false)
                }
                if let m = uyariMod { ProUyari(mod: m) { uyariMod = nil } }
                if giris { GirisEkran { e in giris = false; ekran = e } }
            }
            .foregroundStyle(.white)
            .onAppear { yonBildir() }
            .onChange(of: g.size) { _, _ in yonBildir() }
        }
        .onAppear {
            if !GirisEkran.soruldu, let g = UserDefaults.standard.string(forKey: "giris"), g == "monitor" || g == "masa" {
                GirisEkran.soruldu = true; ekran = g == "masa" ? .masa : .monitor
            }
            if ekran == nil { kamera.baslat() }
        }
        .onChange(of: evre) { _, yeni in
            guard ekran == nil else { return }
            if yeni == .active { kamera.baslat() } else if yeni == .background { kamera.durdur() }
        }
        .onChange(of: ekran) { _, yeni in
            if yeni == nil { kamera.baslat() } else { kamera.durdur() }
        }
        .onChange(of: kamera.mod) { _, m in panel = m == .pro ? .proKartlar : nil }
        .onChange(of: panel) { _, p in if p != .kontroller && duzenleme { duzenleme = false } }
        .fullScreenCover(item: $ekran) { e in
            switch e {
            case .masa: MasaEkran { ekran = nil }
            case .wifi: WifiKameraEkran { ekran = nil }
            case .monitor: MonitorEkran { ekran = nil }
            }
        }
        .sheet(isPresented: $ayarlar) {
            KameraAyarlar(kamera: kamera, wifiKamera: { ekranAc(.wifi) }, masa: { ekranAc(.masa) })
        }
    }

    private func yonBildir() {
        let y = UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.interfaceOrientation }.first ?? .portrait
        kamera.yonGuncelle(y)
        arayuz = y
    }

    /// Ayarlar kapandıktan sonra tam ekran açılır (iki sunum üst üste binmesin)
    private func ekranAc(_ e: Ekran) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) { ekran = e }
    }

    private func monitoreGec() {
        guard !kamera.kayitta else { kamera.bildirim = "Önce kaydı durdur."; return }
        ekran = .monitor
    }

    // MARK: düzenler

    private func dikeyDuzen(_ g: GeometryProxy) -> some View {
        let ust: CGFloat = 52, alt: CGFloat = 96
        // Önizleme tam ekran (Monitör'deki gibi); menüler görüntünün üstünde, okunsun diye üstte ve altta hafif karartma
        return ZStack {
            VStack(spacing: 0) {
                LinearGradient(colors: [.black.opacity(0.6), .clear], startPoint: .top, endPoint: .bottom).frame(height: ust + 70)
                Spacer(minLength: 0)
                LinearGradient(colors: [.clear, .black.opacity(0.65)], startPoint: .top, endPoint: .bottom).frame(height: alt + 200)
            }
            .ignoresSafeArea()
            .allowsHitTesting(false)
            VStack(spacing: 0) {
                ustBant.frame(height: ust)
                bilgi.padding(.top, 10)
                cipler.padding(.top, 8)
                Spacer(minLength: 0)
                if let b = kamera.bildirim { bildirimKutusu(b) }
                if kamera.mod == .timelapse && panel == nil { sureSira(dikey: false).padding(.bottom, 14) }
                if panel == nil {
                    if let f = acikSatir { FavoriSatir(f: f, kamera: kamera).padding(.bottom, 14) } else { mercekler(dikey: false).padding(.bottom, 20) }
                }
                HStack {
                    solDugme
                    Spacer()
                    deklansor
                    Spacer()
                    kontrolDugme
                }
                .padding(.horizontal, 36)
                .padding(.bottom, 16)
                if let p = panel {
                    panelKabi(p, enYuksek: g.size.height * 0.48)
                } else {
                    altBant(genislik: g.size.width).frame(height: alt)
                }
            }
        }
    }

    private func yatayDuzen(_ g: GeometryProxy) -> some View {
        ZStack {
            HStack(spacing: 0) {
                Spacer(minLength: 0)
                LinearGradient(colors: [.clear, .black.opacity(0.6)], startPoint: .leading, endPoint: .trailing).frame(width: 190)
            }
            .ignoresSafeArea()
            .allowsHitTesting(false)
            HStack(spacing: 0) {
                ZStack {
                    VStack(spacing: 0) {
                        HStack(alignment: .top) {
                            ustDugmeler
                            Spacer()
                        }
                        .overlay(alignment: .top) { bilgi }
                        .padding(.horizontal, 12).padding(.top, 8)
                        cipler.padding(.top, 6)
                        Spacer(minLength: 0)
                        if let b = kamera.bildirim { bildirimKutusu(b) }
                        if kamera.mod == .timelapse && panel == nil { sureSira(dikey: false).padding(.bottom, 10) }
                        if panel == nil, let f = acikSatir { FavoriSatir(f: f, kamera: kamera).frame(maxWidth: 480).padding(.bottom, 10) }
                        if let p = panel {
                            HStack {
                                panelKabi(p, enYuksek: g.size.height * 0.82).frame(maxWidth: 480)
                                Spacer(minLength: 0)
                            }
                        }
                    }
                    if panel == nil {
                        HStack(spacing: 14) {
                            Spacer()
                            mercekler(dikey: true)
                            modSecici(dikey: true, genislik: 0)
                        }
                        .padding(.trailing, 10)
                    }
                }
                sagSutun
                    .frame(width: 104)
                    .frame(maxHeight: .infinity)
            }
        }
    }

    /// Yan tutuşta sağ kenar: son çekim, kontroller, deklanşör (dikey ortada), flaş / PRO, ön/arka
    private var sagSutun: some View {
        VStack(spacing: 0) {
            sonCekim
            Spacer(minLength: 8)
            kontrolDugme
            Spacer(minLength: 8)
            deklansor
            Spacer(minLength: 8)
            solDugme
            Spacer(minLength: 8)
            cevirDugme
        }
        .padding(.vertical, 14)
    }

    // MARK: görüntü

    /// Görüntü ekranı doldurunca (aspect fill) karenin ekrandaki tam dikdörtgeni; taşan kenarlar ekran dışında kalır
    static func doldurAlan(oran: CGFloat, boyut: CGSize) -> CGRect {
        guard oran > 0, boyut.width > 0, boyut.height > 0 else { return CGRect(origin: .zero, size: boyut) }
        if boyut.width / boyut.height > oran {
            let h = boyut.width / oran
            return CGRect(x: 0, y: (boyut.height - h) / 2, width: boyut.width, height: h)
        }
        let w = boyut.height * oran
        return CGRect(x: (boyut.width - w) / 2, y: 0, width: w, height: boyut.height)
    }

    private var goruntu: some View {
        GeometryReader { tam in
            let alan = AnaEkran.doldurAlan(oran: kamera.goruntuOrani, boyut: tam.size)
            ZStack {
                Onizleme(oturum: kamera.oturum, yonu: arayuz) { nokta in
                    panel = nil
                    kamera.odakla(nokta)
                }
                .simultaneousGesture(LongPressGesture(minimumDuration: 0.6).onEnded { _ in kamera.odakSerbest() })
                if kamera.gostergeGorunur {
                    // Görüntü araçları: aynı kare GPU'da araçlarla çizilir (yalnız ekranda)
                    MonitorGorunum(cizici: kamera.cizici).allowsHitTesting(false)
                }
                if kamera.gostergeGorunur && kamera.histogram {
                    KoseHistogram(o: kamera.histo)
                        .frame(width: 112, height: 56)
                        .position(x: 76, y: tam.size.height * 0.2)
                        .allowsHitTesting(false)
                }
                KompozisyonKatman(tur: kamera.kompTur, yon: kamera.kompYon, alan: alan, asistan: kamera.asistanAcik, konu: kamera.asistanAcik ? kamera.konu : nil,
                                  konuAdi: kamera.konuAdi, analiz: kamera.analiz, egim: kamera.egim, egimTaban: kamera.egimTaban)
                if let i = kamera.ipucu {
                    Text(i)
                        .font(.subheadline.weight(.bold))
                        .padding(.horizontal, 14).padding(.vertical, 8)
                        .background(Capsule().fill(Color(red: 18 / 255, green: 20 / 255, blue: 24 / 255).opacity(0.72)))
                        .position(x: tam.size.width / 2, y: tam.size.height * 0.62)
                        .allowsHitTesting(false)
                }
            }
        }
    }

    // MARK: üst

    private var ustBant: some View {
        Group {
            if duzenleme {
                HStack {
                    bantDugme("Vazgeç") { kamera.favoriler = yedekFavoriler; duzenlemeBitir() }
                    Spacer()
                    bantDugme("Bitti") { duzenlemeBitir() }
                }
                .padding(.horizontal, 16)
            } else {
                normalUstBant
            }
        }
    }

    private func bantDugme(_ ad: String, eylem: @escaping () -> Void) -> some View {
        Button(action: eylem) {
            Text(ad).font(.system(size: 15, weight: .medium))
                .padding(.horizontal, 14).frame(height: 32)
                .background(Capsule().fill(AnaEkran.cam))
                .overlay(Capsule().stroke(Color.white.opacity(0.2), lineWidth: 1))
        }
    }

    private func duzenlemeBasla() {
        yedekFavoriler = kamera.favoriler
        acikSatir = nil
        withAnimation(.easeOut(duration: 0.18)) { duzenleme = true; panel = .kontroller }
    }

    private func duzenlemeBitir() {
        withAnimation(.easeOut(duration: 0.18)) { duzenleme = false; panel = nil }
    }

    private var normalUstBant: some View {
        HStack { ustDugmeler; Spacer() }
            .overlay(alignment: .trailing) {
                kucukDaire("gearshape.fill", aciklama: "Ayarlar") { ayarlar = true }.disabled(kamera.kayitta)
            }
            .padding(.horizontal, 16)
    }

    private var ustDugmeler: some View {
        HStack(spacing: 10) {
            kucukDaire("display", renk: AnaEkran.mavi, aciklama: "Monitör (harici kamera)") { monitoreGec() }
            Button { withAnimation(.easeOut(duration: 0.15)) { yardim.toggle() } } label: {
                Text("?").font(.system(size: 16, weight: .heavy))
                    .foregroundStyle(yardim ? .black : .white)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(yardim ? Tema.sari : AnaEkran.cam))
            }
            .accessibilityLabel("Açıklamalar")
        }
    }

    private func kucukDaire(_ sistem: String, renk: Color = .white, aciklama: String, eylem: @escaping () -> Void) -> some View {
        Button(action: eylem) {
            Image(systemName: sistem).font(.system(size: 15, weight: .semibold)).foregroundStyle(renk)
                .frame(width: 36, height: 36).background(Circle().fill(AnaEkran.cam))
        }
        .accessibilityLabel(aciklama)
        .yardimBalonu(yardim, aciklama)
    }

    /// Görüntünün üstünde ortada (Apple Kamera'daki kısayollar): biçim, sabitlenenler, sabitlenmemiş ama elle değişmiş değerler (sarı).
    /// Dokun: aç/kapa değişir ya da o ayarın seçimi açılır; uzun bas: düzenleme (⊖ ile kaldır, alttan ekle).
    private var bilgi: some View {
        HStack(alignment: .center, spacing: 18) {
            if duzenleme {
                HStack(spacing: 14) {
                    ForEach(kamera.favoriler) { f in
                        KisayolOge(f: f, kamera: kamera)
                            .frame(width: 40, height: 40)
                            .background(Circle().fill(Color.black.opacity(0.4)))
                            .overlay(alignment: .topLeading) {
                                Button { withAnimation { kamera.favoriAcKapa(f) } } label: {
                                    Image(systemName: "minus").font(.system(size: 10, weight: .heavy)).foregroundStyle(.black)
                                        .frame(width: 18, height: 18).background(Circle().fill(Color(white: 0.85)))
                                }
                                .offset(x: -6, y: -6)
                                .accessibilityLabel("\(f.ad) kaldır")
                            }
                    }
                    if kamera.favoriler.isEmpty { Text("Aşağıdan ekle").font(.footnote).foregroundStyle(.white.opacity(0.7)) }
                }
                .padding(.horizontal, 18).frame(minWidth: 220, minHeight: 52)
                .overlay(Capsule().stroke(Color.white.opacity(0.35), lineWidth: 1))
            } else {
                Button { panelAc(.bicim) } label: { ikiSatir(bilgiOgeleri.first ?? ("", "", false)) }
                    .yardimBalonu(yardim, "Biçim")
                ForEach(kamera.favoriler) { f in
                    Button { kisayolDokun(f) } label: { KisayolOge(f: f, kamera: kamera) }
                        .overlay(alignment: .bottom) { if acikSatir == f { Circle().fill(Tema.sari).frame(width: 4, height: 4).offset(y: 7) } }
                }
                ForEach(Array(bilgiOgeleri.dropFirst().enumerated()), id: \.offset) { _, o in ikiSatir(o) }
            }
        }
        .shadow(color: .black.opacity(0.5), radius: 3)
        .disabled(kamera.kayitta && !duzenleme)
        .onLongPressGesture(minimumDuration: 0.5) { if !duzenleme && !kamera.kayitta { duzenlemeBasla() } }
    }

    private func ikiSatir(_ o: (String, String, Bool)) -> some View {
        VStack(spacing: 0) {
            Text(o.0).font(.system(size: 17, weight: .semibold, design: .rounded))
            Text(o.1).font(.system(size: 10, weight: .bold, design: .rounded))
        }
        .foregroundStyle(o.2 ? Tema.sari : .white)
    }

    /// Kısayola ya da Denetimler dairesine dokununca
    private func kisayolDokun(_ f: Favori) {
        if f.anahtar { kamera.favoriDegistir(f); return }
        if FavoriSatir.satirli(f) {
            withAnimation(.easeOut(duration: 0.15)) { panel = nil; acikSatir = acikSatir == f ? nil : f }
        } else {
            acikSatir = nil
            withAnimation(.easeOut(duration: 0.18)) { panel = panel == .favori(f) ? nil : .favori(f) }
        }
    }

    private var bilgiOgeleri: [(String, String, Bool)] {
        let parca = kamera.cozunurluk.components(separatedBy: " · ")
        var l: [(String, String, Bool)] = [(parca.first ?? "", parca.dropFirst().first ?? "", false)]
        if kamera.mod == .pro {
            let a = kamera.proAyar
            l.append((ProMod.isoYazi(a.iso), "ISO", a.iso != nil))
            if let e = a.enst { l.append((ProMod.enstYazi(e), "S", true)) }
            return l
        }
        if kamera.flas == .acik || kamera.flas == .fener, !kamera.favoriler.contains(.flas) { l.append(("⚡︎", kamera.flas == .fener ? "FENER" : "FLAŞ", true)) }
        let fav = Set(kamera.favoriler)
        if abs(kamera.ev) >= 0.05, !fav.contains(.ev) { l.append((Cetvel.evYazi(kamera.ev), "EV", true)) }
        if let i = kamera.secilenIso, !fav.contains(.iso) { l.append(("\(Int(i))", "ISO", true)) }
        if let e = kamera.secilenEnst, !fav.contains(.enst) { l.append((kamera.enstGoster(e), kamera.mod == .video && kamera.enstAci ? "AÇI" : "S", true)) }
        if let k = kamera.bd, !fav.contains(.bd) { l.append(("\(Int(k))", "K", true)) }
        if kamera.mod == .video {
            if kamera.kodek.prores { l.append((kamera.kodek.kisa, "PRORES", true)) }
            if kamera.renkModu != .sdr { l.append((kamera.renkModu.kisa, "", true)) }
        }
        if kamera.stil.etkin { l.append((kamera.stil.hazir == .standart ? "Özel" : kamera.stil.hazir.ad, kamera.stil.kaydaGom ? "STİL ●" : "STİL", true)) }
        if kamera.mod.foto, kamera.zamanlayici > 0 { l.append(("\(kamera.zamanlayici)", "SN", true)) }
        return l
    }

    /// Kayıt süresi, PRO mod özeti, kılavuz ve sahne önerileri
    private var cipler: some View {
        VStack(spacing: 8) {
            if kamera.kayitta, let bas = kamera.kayitBasi {
                TimelineView(.periodic(from: bas, by: 1)) { an in
                    let gecen = an.date.timeIntervalSince(bas)
                    Text(kamera.mod == .timelapse ? "\(Kamera.saat(gecen))  →  \(Kamera.saat(Double(Timelapse.videoMs(kamera.tlKare)) / 1000))" : Kamera.saat(gecen))
                        .font(.system(size: 17, weight: .semibold, design: .rounded).monospacedDigit())
                        .padding(.horizontal, 10).padding(.vertical, 3)
                        .background(RoundedRectangle(cornerRadius: 6).fill(Color(red: 1, green: 59 / 255, blue: 48 / 255)))
                }
            }
            if kamera.mod == .pro {
                cip(Text(kamera.proMod.ozet(kamera.proAyar) + "  ›"), simge: kamera.proMod.simge, renk: Tema.sari) { panelAc(.proAyar) }
                    .yardimBalonu(yardim, "Dokun: ISO, S, WB, mercek")
            }
            // AI Kadraj: düşünürken yalnız küçük bir işaret; öneri oturunca tek öneri, tetik kelimeye dokununca uygulanır
            if kamera.asistanAcik && !kamera.kayitta {
                if let o = kamera.kompOneri {
                    cip(Text("Kadraj: ") + Text(o.tur.ad).bold().foregroundColor(AnaEkran.mavi), simge: "sparkles", renk: AnaEkran.mavi) { kamera.kompOneriUygula() }
                } else if let s = kamera.sahneOnerisi {
                    cip(Text("Sahne: ") + Text(s.ad).bold().foregroundColor(AnaEkran.mavi), simge: "sparkles", renk: AnaEkran.mavi) { kamera.sahneUygula() }
                } else if kamera.aiDusunuyor {
                    Label("AI Kadraj inceliyor", systemImage: "sparkles").font(.caption.weight(.semibold)).foregroundStyle(.white.opacity(0.7))
                        .padding(.horizontal, 10).padding(.vertical, 4).background(Capsule().fill(AnaEkran.cam.opacity(0.6)))
                        .transition(.opacity)
                }
            }
        }
    }

    private func cip(_ yazi: Text, simge: String, renk: Color, eylem: @escaping () -> Void) -> some View {
        Button(action: eylem) {
            HStack(spacing: 6) {
                Image(systemName: simge).foregroundStyle(renk)
                yazi.lineLimit(1).minimumScaleFactor(0.75)
            }
            .font(.subheadline.weight(.semibold))
            .padding(.horizontal, 12).padding(.vertical, 7)
            .background(Capsule().fill(AnaEkran.cam))
        }
    }

    // MARK: mercekler (yalnız telefonun gerçek mercekleri)

    private func mercekler(dikey: Bool) -> some View {
        let d = kamera.zoomDuraklari
        let yakin = d.min { abs($0 - kamera.zoom) < abs($1 - kamera.zoom) }
        let duzen = dikey ? AnyLayout(VStackLayout(spacing: 6)) : AnyLayout(HStackLayout(spacing: 6))
        return duzen {
            ForEach(dikey ? Array(d.reversed()) : d, id: \.self) { z in
                let secili = z == yakin
                Button { kamera.yakinlastir(z) } label: {
                    Text(AnaEkran.fmt(z) + (secili ? "×" : ""))
                        .font(.system(size: secili ? 13 : 12, weight: .semibold, design: .rounded))
                        .foregroundStyle(secili ? Tema.sari : .white)
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(secili ? AnaEkran.gri : Color.clear))
                        .shadow(color: .black.opacity(secili ? 0 : 0.5), radius: 2)
                }
                .accessibilityLabel("Mercek \(AnaEkran.fmt(z))×")
            }
        }
        .disabled(kamera.kayitta || kamera.proCalisiyor)
        .yardimBalonu(yardim, kamera.mod == .pro ? "Mercek (moda kaydedilir)" : "Mercek")
    }

    static func fmt(_ v: CGFloat) -> String {
        if abs(v - v.rounded()) < 0.05 { return "\(Int(v.rounded()))" }
        return String(format: "%.1f", v).replacingOccurrences(of: ".", with: ",")
    }

    /// TIMELAPSE: kare aralığı hızlı seçimi
    private func sureSira(dikey: Bool) -> some View {
        HStack(spacing: 6) {
            ForEach(Timelapse.hizli, id: \.self) { ms in
                let s = kamera.tlAralik == ms
                Button { kamera.tlAralik = ms } label: {
                    Text(Timelapse.aralikYazi(ms)).font(.caption.weight(.bold))
                        .foregroundStyle(s ? Tema.sari : .white)
                        .padding(.horizontal, 10).frame(height: 30)
                        .background(Capsule().fill(s ? AnaEkran.gri : Color.black.opacity(0.4)))
                }
            }
        }
        .disabled(kamera.kayitta)
    }

    // MARK: deklanşör sırası

    /// Solda: PRO'da modun kartları, diğerlerinde flaş (açıkken sarı halka)
    @ViewBuilder private var solDugme: some View {
        if kamera.mod == .pro {
            yuvarlak(simge: kamera.proMod.simge, etkin: true, aciklama: "PRO modlar") { panelAc(.proKartlar) }
        } else {
            yuvarlak(simge: kamera.flas == .kapali ? "bolt.slash.fill" : (kamera.flas == .oto ? "bolt.badge.automatic.fill" : "bolt.fill"),
                     etkin: kamera.flas != .kapali, aciklama: "Flaş") { kamera.flasDegistir() }
        }
    }

    /// Sağda: kontroller (pozlama, beyaz denge, odak, kılavuz…); bir değer elle değişmişse sarı halka
    private var kontrolDugme: some View {
        Button { acikSatir = nil; panelAc(.kontroller) } label: {
            VStack(spacing: 5) {
                ForEach(0..<2, id: \.self) { _ in
                    HStack(spacing: 5) { ForEach(0..<3, id: \.self) { _ in Circle().frame(width: 4.5, height: 4.5) } }
                }
            }
            .foregroundStyle(degisik ? Tema.sari : .white)
            .frame(width: 44, height: 44)
            .background(Circle().fill(AnaEkran.gri))
            .overlay(Circle().stroke(degisik || grupAcik ? Tema.sari : .clear, lineWidth: 1.5).padding(0.5))
        }
        .accessibilityLabel("Kontroller")
        .yardimBalonu(yardim, "Kontroller")
    }

    private var grupAcik: Bool { if case .some(.grup) = panel { return true }; return panel == .kontroller }

    private var degisik: Bool {
        abs(kamera.ev) >= 0.05 || kamera.secilenIso != nil || kamera.secilenEnst != nil || kamera.bd != nil || kamera.odakKonum != nil
            || kamera.kompTur != .kapali || kamera.asistanAcik || kamera.teraziAcik || kamera.gostergeEtkin
    }

    private func yuvarlak(simge: String, etkin: Bool, aciklama: String, eylem: @escaping () -> Void) -> some View {
        Button(action: eylem) {
            Image(systemName: simge).font(.system(size: 17, weight: .medium))
                .foregroundStyle(etkin ? Tema.sari : .white)
                .frame(width: 44, height: 44)
                .background(Circle().fill(AnaEkran.gri))
                .overlay(Circle().stroke(etkin ? Tema.sari : .clear, lineWidth: 1.5).padding(0.5))
        }
        .accessibilityLabel(aciklama)
        .yardimBalonu(yardim, aciklama)
        .disabled(kamera.proCalisiyor)
    }

    private var deklansor: some View {
        Button {
            panel = nil
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            kamera.deklansor(yon: ekranYonu)
        } label: {
            ZStack {
                Circle().stroke(Color(white: 0.8), lineWidth: 3).frame(width: 70, height: 70)
                if kamera.proCalisiyor || ((kamera.mod == .video || kamera.mod == .timelapse) && kamera.kayitta) {
                    RoundedRectangle(cornerRadius: 7).fill(Color(red: 1, green: 59 / 255, blue: 48 / 255)).frame(width: 26, height: 26)
                } else if kamera.mod.foto {
                    Circle().fill(.white).frame(width: 59, height: 59)
                } else {
                    Circle().fill(Color(red: 1, green: 59 / 255, blue: 48 / 255)).frame(width: 59, height: 59)
                }
            }
            .animation(.easeOut(duration: 0.15), value: kamera.kayitta)
        }
        // Seri çekim hareketleri yalnız seri PRO modda (diğer modlarda düğmenin dokunuşunu yutmasın)
        .simultaneousGesture(LongPressGesture(minimumDuration: 0.35).onEnded { _ in kamera.seriBasla(yon: ekranYonu) }, including: seriAcik ? .all : .subviews)
        .simultaneousGesture(DragGesture(minimumDistance: 0).onEnded { _ in kamera.seriBitir() }, including: seriAcik ? .all : .subviews)
        .accessibilityLabel(kamera.mod.foto ? "Fotoğraf çek" : (kamera.kayitta ? "Kaydı durdur" : "Kaydı başlat"))
        .yardimBalonu(yardim, kamera.mod == .pro && kamera.proMod.seri ? "Basılı tut: seri" : (kamera.uzunPozlama && kamera.mod == .foto ? "Uzun pozlama" : "Çek"))
    }

    private var seriAcik: Bool { kamera.mod == .pro && kamera.proMod.seri }

    private var ekranYonu: AVCaptureVideoOrientation {
        Onizleme.yon(UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.interfaceOrientation }.first ?? .portrait)
    }

    // MARK: alt bant

    private func altBant(genislik: CGFloat) -> some View {
        HStack(spacing: 10) {
            sonCekim
            modSecici(dikey: false, genislik: genislik - 160)
            cevirDugme
        }
        .padding(.horizontal, 14)
    }

    private var sonCekim: some View {
        Button {
            if let u = URL(string: "photos-redirect://") { UIApplication.shared.open(u) }
        } label: {
            Group {
                if let r = kamera.sonResim { Image(uiImage: r).resizable().scaledToFill() } else { Color(white: 0.11) }
            }
            .frame(width: 44, height: 44)
            .clipShape(Circle())
        }
        .accessibilityLabel("Son çekim")
        .yardimBalonu(yardim, "Son çekim")
    }

    private var cevirDugme: some View {
        Button { kamera.cevir() } label: {
            Image(systemName: "arrow.triangle.2.circlepath").font(.system(size: 17, weight: .medium))
                .frame(width: 44, height: 44).background(Circle().fill(Color(white: 0.17)))
        }
        .accessibilityLabel("Ön / arka")
        .yardimBalonu(yardim, "Ön / arka")
        .disabled(kamera.kayitta || kamera.proCalisiyor)
    }

    /// Kapsül mod seçici: seçili mod koyu iç kapsülde sarı; kenarlar silikleşir
    private func modSecici(dikey: Bool, genislik: CGFloat) -> some View {
        let duzen = dikey ? AnyLayout(VStackLayout(spacing: 2)) : AnyLayout(HStackLayout(spacing: 2))
        let icerik = ScrollViewReader { kaydir in
            ScrollView(dikey ? .vertical : .horizontal, showsIndicators: false) {
                duzen {
                    if !dikey { Color.clear.frame(width: max(0, genislik / 2 - 60), height: 1) }
                    ForEach(Kamera.Mod.allCases, id: \.self) { m in
                        modDugme(m.rawValue, secili: kamera.mod == m, renk: Tema.sari) {
                            if m == kamera.mod { if m == .pro { panelAc(.proKartlar) }; return }
                            guard !kamera.kayitta else { kamera.bildirim = "Kayıt sürerken mod değişmez."; return }
                            kamera.modDegistir(m)
                        }
                        .id(m.rawValue)
                    }
                    modDugme("MONİTÖR", secili: false, renk: AnaEkran.mavi) { monitoreGec() }
                    if !dikey { Color.clear.frame(width: max(0, genislik / 2 - 60), height: 1) }
                }
                .padding(dikey ? .vertical : .horizontal, 6)
            }
            .onAppear { kaydir.scrollTo(kamera.mod.rawValue, anchor: .center) }
            .onChange(of: kamera.mod) { _, m in withAnimation { kaydir.scrollTo(m.rawValue, anchor: .center) } }
        }
        return icerik
            .mask(LinearGradient(stops: [.init(color: .clear, location: 0), .init(color: .black, location: 0.14),
                                         .init(color: .black, location: 0.86), .init(color: .clear, location: 1)],
                                 startPoint: dikey ? .top : .leading, endPoint: dikey ? .bottom : .trailing))
            .frame(width: dikey ? 104 : nil, height: dikey ? 230 : 42)
            .background(Capsule().fill(Color(white: 0.11)))
            .disabled(kamera.proCalisiyor)
    }

    private func modDugme(_ ad: String, secili: Bool, renk: Color, eylem: @escaping () -> Void) -> some View {
        Button(action: eylem) {
            Text(ad).font(.system(size: 13, weight: .medium)).tracking(0.8).lineLimit(1)
                .foregroundStyle(secili ? renk : .white.opacity(0.9))
                .padding(.horizontal, 12).frame(height: 34)
                .background(Capsule().fill(secili ? Color.black.opacity(0.55) : .clear))
                .overlay(Capsule().stroke(secili ? Color.white.opacity(0.12) : .clear, lineWidth: 1))
        }
    }

    // MARK: paneller (alttan cam pano: ✕ solda, başlık ortada)

    private func panelKabi(_ p: Panel, enYuksek: CGFloat) -> some View {
        VStack(spacing: 8) {
            ZStack {
                Text(panelBaslik(p)).font(.system(size: 15, weight: .semibold)).tracking(1.2).lineLimit(1)
                HStack {
                    if p == .kontroller && !duzenleme {
                        Button { duzenlemeBasla() } label: {
                            Text("Düzenle").font(.system(size: 14, weight: .semibold))
                                .padding(.horizontal, 14).frame(height: 34).background(Capsule().fill(Color.white.opacity(0.13)))
                        }
                        .disabled(kamera.kayitta)
                    } else if !duzenleme {
                        Button { withAnimation(.easeOut(duration: 0.15)) { panel = nil } } label: {
                            Image(systemName: "xmark").font(.system(size: 14, weight: .semibold))
                                .frame(width: 34, height: 34).background(Circle().fill(Color.white.opacity(0.13)))
                        }
                        .accessibilityLabel("Kapat")
                    }
                    Spacer()
                    if p == .kontroller && !duzenleme {
                        Button { withAnimation(.easeOut(duration: 0.15)) { panel = nil } } label: {
                            Image(systemName: "xmark").font(.system(size: 14, weight: .semibold))
                                .frame(width: 34, height: 34).background(Circle().fill(Color.white.opacity(0.13)))
                        }
                        .accessibilityLabel("Kapat")
                    }
                }
            }
            ViewThatFits(in: .vertical) {
                panelIcerik(p)
                ScrollView(showsIndicators: false) { panelIcerik(p) }
            }
            .frame(maxHeight: enYuksek)
            if case let .grup(g) = p { grupCubugu(g) }
        }
        .padding(.horizontal, 14).padding(.top, 14).padding(.bottom, 18)
        .background(
            RoundedRectangle(cornerRadius: 38, style: .continuous).fill(.ultraThinMaterial)
                .overlay(RoundedRectangle(cornerRadius: 38, style: .continuous).fill(Color(white: 0.32).opacity(0.45)))
                .overlay(RoundedRectangle(cornerRadius: 38, style: .continuous).stroke(Color.white.opacity(0.14), lineWidth: 1))
        )
        .environment(\.colorScheme, .dark)
        .padding(.horizontal, 8)
        .padding(.bottom, 4)
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    private func panelBaslik(_ p: Panel) -> String {
        switch p {
        case .proKartlar: return "PRO MODLAR"
        case .proAyar: return kamera.proMod.ad.uppercased(with: Locale(identifier: "tr"))
        case .poz: return "POZLAMA"
        case .bd: return "BEYAZ DENGE"
        case .odak: return "ODAK"
        case .kilavuz: return "KOMPOZİSYON"
        case .kontroller: return duzenleme ? "KAMERA DENETİMLERİNİ EKLE" : "DENETİMLER"
        case .bicim: return "BİÇİM"
        case .gosterge: return "GÖSTERGELER"
        case let .grup(g): return g.ad.uppercased(with: Locale(identifier: "tr"))
        case let .favori(f): return FavoriSatir.baslik(f)
        }
    }

    @ViewBuilder private func panelIcerik(_ p: Panel) -> some View {
        switch p {
        case .proKartlar:
            ProModSecici(kamera: kamera) { m in
                panel = nil
                // Seçili moda bir kez daha dokununca normale (FOTO) dönülür
                if m == kamera.proMod { kamera.modDegistir(.foto); kamera.bildirim = "Normal fotoğraf"; return }
                kamera.proModSec(m)
                uyariMod = m
            }
        case .proAyar: ProOzellestir(kamera: kamera)
        case .poz: Cetvel(tur: .poz, kamera: kamera)
        case .bd: Cetvel(tur: .bd, kamera: kamera)
        case .odak: Cetvel(tur: .odak, kamera: kamera)
        case .kilavuz: KilavuzMenu(kamera: kamera)
        case .kontroller: kontroller
        case .bicim: BicimPanel(kamera: kamera)
        case .gosterge: GostergeMenu(kamera: kamera)
        case let .grup(g): grupIcerik(g)
        case let .favori(f): FavoriPanel(f: f, kamera: kamera)
        }
    }

    private func panelAc(_ p: Panel) {
        withAnimation(.easeOut(duration: 0.18)) { panel = panel == p ? nil : p }
    }

    /// PRO MODLAR'da pozlama, beyaz denge ve odak modun kendi ayarlarında
    private func cetvelAc(_ p: Panel) { panelAc(kamera.mod == .pro ? .proAyar : p) }

    // MARK: menü grupları

    private func grupCubugu(_ secili: Grup) -> some View {
        HStack(spacing: 2) {
            ForEach(Grup.allCases) { g in
                Button {
                    sonGrup = g.rawValue
                    withAnimation(.easeOut(duration: 0.15)) { panel = .grup(g) }
                } label: {
                    VStack(spacing: 3) {
                        Image(systemName: g.simge).font(.system(size: 15, weight: .medium))
                        Text(g.ad).font(.system(size: 10, weight: .medium)).lineLimit(1).minimumScaleFactor(0.8)
                    }
                    .foregroundStyle(g == secili ? .black : .white.opacity(0.9))
                    .frame(maxWidth: .infinity).frame(height: 44)
                    .background(Capsule().fill(g == secili ? Tema.sari : .clear))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(g.ad)
            }
        }
        .padding(4)
        .background(Capsule().fill(Color.white.opacity(0.08)))
    }

    @ViewBuilder private func grupIcerik(_ g: Grup) -> some View {
        switch g {
        case .kayit:
            VStack(alignment: .leading, spacing: 10) {
                BicimPanel(kamera: kamera)
                if kamera.mod == .video { KayitHizli(kamera: kamera) }
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 4), spacing: 14) {
                    if kamera.mod != .pro {
                        kontrol(kamera.flas == .kapali ? "bolt.slash.fill" : "bolt.fill", "Flaş", ["Kapalı", "Oto", "Açık", "Fener"][kamera.flas.rawValue],
                                etkin: kamera.flas != .kapali) { kamera.flasDegistir() }
                    }
                    if kamera.mod == .foto || kamera.mod == .portre {
                        kontrol("timer", "Zamanlayıcı", kamera.zamanlayici == 0 ? "Kapalı" : "\(kamera.zamanlayici) sn", etkin: kamera.zamanlayici > 0) {
                            kamera.zamanlayici = kamera.zamanlayici == 0 ? 3 : (kamera.zamanlayici == 3 ? 10 : 0)
                        }
                    }
                    kontrol("display", "Monitör", "Harici", etkin: false) { monitoreGec() }
                    kontrol("gearshape", "Ayarlar", "Tümü", etkin: false) { panel = nil; ayarlar = true }
                }
            }
        case .pozlama:
            if kamera.mod == .pro {
                ProOzellestir(kamera: kamera)
            } else {
                VStack(alignment: .leading, spacing: 14) {
                    Cetvel(tur: .poz, kamera: kamera)
                    Cetvel(tur: .odak, kamera: kamera)
                }
            }
        case .renk:
            VStack(spacing: 10) {
                Picker("", selection: $renkSekme) {
                    Text("Stiller").tag(0)
                    Text("Beyaz denge").tag(1)
                }
                .pickerStyle(.segmented)
                if renkSekme == 0 { StilPedi(kamera: kamera) } else { Cetvel(tur: .bd, kamera: kamera) }
            }
        case .ses:
            SesHizli(kamera: kamera)
        case .gosterge:
            VStack(spacing: 12) {
                GostergeMenu(kamera: kamera)
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 4), spacing: 14) {
                    kontrol("squareshape.split.3x3", "Kılavuz", kamera.kompTur == .kapali ? "Kapalı" : kamera.kompTur.ad,
                            etkin: kamera.kompTur != .kapali) { panelAc(.kilavuz) }
                    kontrol("wand.and.stars", "Yardımcı", kamera.asistanAcik ? "Açık" : "Kapalı", etkin: kamera.asistanAcik) { kamera.asistanAcik.toggle() }
                    kontrol("level", "Terazi", kamera.teraziAcik ? "Açık" : "Kapalı", etkin: kamera.teraziAcik) { kamera.teraziAcik.toggle() }
                }
            }
        }
    }

    /// Denetimler: iOS 27 Kamera'daki gibi yuvarlak daire ızgarası. Uzun basınca (ya da "Düzenle") üst şeride sabitlenecekler seçilir.
    private var kontroller: some View {
        VStack(spacing: 14) {
            if duzenleme {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 4), spacing: 14) {
                    ForEach(Favori.allCases) { f in
                        let secili = kamera.favoriler.contains(f)
                        Button { if !secili { kamera.favoriAcKapa(f) } } label: {
                            DenetimDaire(f: f, kamera: kamera, kucuk: true, soluk: secili)
                        }
                        .buttonStyle(.plain)
                    }
                }
                Button { withAnimation(.easeOut(duration: 0.15)) { kamera.favoriler = Favori.varsayilan } } label: {
                    Text("Temel Ayarlara Sıfırla").font(.system(size: 14, weight: .semibold))
                        .padding(.horizontal, 18).frame(height: 36)
                        .background(Capsule().fill(Color.white.opacity(0.13)))
                }
                .buttonStyle(.plain)
            } else {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 3), spacing: 16) {
                    ForEach(Favori.allCases) { f in
                        Button { kisayolDokun(f) } label: { DenetimDaire(f: f, kamera: kamera) }
                            .buttonStyle(.plain)
                            .sabitlenebilir(f, kamera)
                    }
                }
                HStack(spacing: 10) {
                    kucukGecis("display", "Monitör") { monitoreGec() }
                    kucukGecis("gearshape", "Genel Ayarlar") { panel = nil; ayarlar = true }
                }
            }
        }
        .padding(.top, 4)
    }

    private func kucukGecis(_ simge: String, _ ad: String, eylem: @escaping () -> Void) -> some View {
        Button(action: eylem) {
            Label(ad, systemImage: simge).font(.system(size: 13, weight: .semibold))
                .padding(.horizontal, 14).frame(height: 34)
                .background(Capsule().fill(Color.white.opacity(0.13)))
        }
        .buttonStyle(.plain)
    }

    private var pozYazi: String {
        if let e = kamera.secilenEnst { return kamera.enstGoster(e) }
        if let i = kamera.secilenIso { return "ISO \(Int(i))" }
        return abs(kamera.ev) < 0.05 ? "Oto" : Cetvel.evYazi(kamera.ev)
    }

    private func kontrol(_ simge: String, _ ad: String, _ deger: String, etkin: Bool, eylem: @escaping () -> Void) -> some View {
        Button(action: eylem) {
            VStack(spacing: 5) {
                Image(systemName: simge).font(.system(size: 17, weight: .medium))
                    .foregroundStyle(etkin ? Tema.sari : .white)
                    .frame(width: 46, height: 46)
                    .background(Circle().fill(Color.white.opacity(0.12)))
                    .overlay(Circle().stroke(etkin ? Tema.sari : .clear, lineWidth: 1.5))
                Text(ad).font(.system(size: 11, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.7)
                Text(deger).font(.system(size: 10, weight: .medium)).foregroundStyle(etkin ? Tema.sari : .white.opacity(0.6))
                    .lineLimit(1).minimumScaleFactor(0.7)
            }
        }
        .buttonStyle(.plain)
    }

    private func bildirimKutusu(_ yazi: String) -> some View {
        Text(yazi)
            .font(.footnote.weight(.semibold))
            .padding(.horizontal, 14).padding(.vertical, 8)
            .background(Capsule().fill(Tema.yuzey))
            .padding(.bottom, 10)
            .task(id: yazi) {
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                kamera.bildirim = nil
            }
    }

    private var izinUyarisi: some View {
        VStack(spacing: 12) {
            Text("Kamera izni gerekiyor").font(.headline)
            Text("Ayarlar → UPDATED Kamera → Kamera'yı aç.").font(.subheadline).foregroundStyle(Tema.metin2)
            Button("Ayarları aç") {
                if let u = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(u) }
            }
            .buttonStyle(.borderedProminent).tint(Tema.sari).foregroundStyle(.black)
        }
        .padding(24)
    }
}

/// BİÇİM (Apple Kamera'daki gibi): solda küçük başlık, sağda seçenekler; seçili sarı ve önünde nokta
struct BicimPanel: View {
    @ObservedObject var kamera: Kamera

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            switch kamera.mod {
            case .video:
                satir("ÇÖZ.", kamera.videoSecenekleri.map { h in (h >= 2160 ? "4K" : (h >= 1080 ? "HD" : "720p"), kamera.videoYukseklik == h, { kamera.videoYukseklik = h }) })
                satir("KARE HIZI", kamera.videoFpsler.map { f in ("\(f)", kamera.videoFps == f, { kamera.videoFps = f }) })
            case .timelapse:
                satir("ÇÖZ.", kamera.videoSecenekleri.map { h in (h >= 2160 ? "4K" : (h >= 1080 ? "HD" : "720p"), kamera.videoYukseklik == h, { kamera.videoYukseklik = h }) })
                satir("ARALIK", Timelapse.hizli.map { a in (Timelapse.aralikYazi(a), kamera.tlAralik == a, { kamera.tlAralik = a }) })
                satir("SÜRE", Timelapse.sureler.prefix(5).map { s in (Timelapse.sureYazi(s), kamera.tlSure == s, { kamera.tlSure = s }) })
            default:
                satir("ÇÖZ.", kamera.fotoBoyutlari.prefix(4).map { b in
                    (KameraAyarlar.mp(b), kamera.fotoBoyut.map { $0.width == b.width && $0.height == b.height } ?? false, { kamera.fotoBoyutSec(b) })
                })
                if kamera.rawVar { satir("RAW", [("Kapalı", !kamera.raw, { kamera.raw = false }), ("Açık", kamera.raw, { kamera.raw = true })]) }
                if kamera.mod != .pro {
                    satir("ZAMANLAYICI", [0, 3, 10].map { z in (z == 0 ? "Kapalı" : "\(z) sn", kamera.zamanlayici == z, { kamera.zamanlayici = z }) })
                }
            }
        }
        .disabled(kamera.kayitta)
    }

    private func satir(_ ad: String, _ secenekler: [(String, Bool, () -> Void)]) -> some View {
        HStack(spacing: 0) {
            Text(ad).font(.system(size: 13, weight: .medium)).tracking(0.8).foregroundStyle(.white.opacity(0.85))
                .frame(width: 104, alignment: .leading)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 22) {
                    ForEach(Array(secenekler.enumerated()), id: \.offset) { _, s in
                        Button(action: s.2) {
                            HStack(spacing: 5) {
                                if s.1 { Circle().fill(Tema.sari).frame(width: 6, height: 6) }
                                Text(s.0).font(.system(size: 19, weight: .semibold, design: .rounded))
                            }
                            .foregroundStyle(s.1 ? Tema.sari : .white)
                            .frame(minHeight: 44)
                        }
                    }
                }
            }
        }
        .padding(.leading, 10)
    }
}

extension View {
    /// "?" açıkken düğmenin üstünde tek cümlelik açıklama
    func yardimBalonu(_ acik: Bool, _ yazi: String) -> some View {
        overlay(alignment: .top) {
            if acik {
                Text(yazi)
                    .font(.caption2.weight(.semibold))
                    .fixedSize()
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(Capsule().fill(Tema.sari))
                    .foregroundStyle(.black)
                    .offset(y: -24)
                    .allowsHitTesting(false)
            }
        }
    }
}

/// Fotoğraf çekilince ekranın bir an kararması (Apple Kamera gibi)
private struct CekimKararmasi: View {
    let sayac: Int
    @State private var opaklik = 0.0
    var body: some View {
        Color.black.opacity(opaklik)
            .onChange(of: sayac) { _, _ in
                opaklik = 0.85
                withAnimation(.easeOut(duration: 0.22)) { opaklik = 0 }
            }
    }
}
