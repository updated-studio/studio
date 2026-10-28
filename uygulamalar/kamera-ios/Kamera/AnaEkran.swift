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
    enum Panel: Equatable { case proKartlar, proAyar, poz, bd, odak, kilavuz, kontroller, bicim }
    @State private var panel: Panel?
    @State private var uyariMod: ProMod?
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
            if !GirisEkran.soruldu, UserDefaults.standard.string(forKey: "giris") == "monitor" { GirisEkran.soruldu = true; ekran = .monitor }
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
        return ZStack {
            VStack(spacing: 0) {
                Color.black.frame(height: ust)
                goruntu
                Color.black.frame(height: alt)
            }
            VStack(spacing: 0) {
                ustBant.frame(height: ust)
                bilgi.padding(.top, 10)
                cipler.padding(.top, 8)
                Spacer(minLength: 0)
                if let b = kamera.bildirim { bildirimKutusu(b) }
                if kamera.mod == .timelapse && panel == nil { sureSira(dikey: false).padding(.bottom, 14) }
                if panel == nil { mercekler(dikey: false).padding(.bottom, 20) }
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
        HStack(spacing: 0) {
            ZStack {
                goruntu
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
                .background(Color.black.ignoresSafeArea())
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

    private var goruntu: some View {
        GeometryReader { tam in
            let alan = AVMakeRect(aspectRatio: CGSize(width: kamera.goruntuOrani, height: 1), insideRect: CGRect(origin: .zero, size: tam.size))
            ZStack {
                Onizleme(oturum: kamera.oturum) { nokta in
                    panel = nil
                    kamera.odakla(nokta)
                }
                .simultaneousGesture(LongPressGesture(minimumDuration: 0.6).onEnded { _ in kamera.odakSerbest() })
                KompozisyonKatman(tur: kamera.kompTur, yon: kamera.kompYon, alan: alan, asistan: kamera.asistanAcik, konu: kamera.konu,
                                  konuAdi: kamera.konuAdi, analiz: kamera.analiz, egim: kamera.egim, egimTaban: kamera.egimTaban)
                if let i = kamera.ipucu {
                    Text(i)
                        .font(.subheadline.weight(.bold))
                        .padding(.horizontal, 14).padding(.vertical, 8)
                        .background(Capsule().fill(Color(red: 18 / 255, green: 20 / 255, blue: 24 / 255).opacity(0.72)))
                        .position(x: alan.midX, y: alan.maxY - min(alan.width, alan.height) * 0.11 - 52)
                        .allowsHitTesting(false)
                }
            }
        }
    }

    // MARK: üst

    private var ustBant: some View {
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

    /// Görüntünün üstünde ortada: biçim (4K / 60, 12 MP / JPEG) ve elle değişen değerler sarı. Dokununca BİÇİM.
    private var bilgi: some View {
        Button { panelAc(.bicim) } label: {
            HStack(alignment: .top, spacing: 18) {
                ForEach(Array(bilgiOgeleri.enumerated()), id: \.offset) { _, o in
                    VStack(spacing: 0) {
                        Text(o.0).font(.system(size: 17, weight: .semibold, design: .rounded))
                        Text(o.1).font(.system(size: 10, weight: .bold, design: .rounded))
                    }
                    .foregroundStyle(o.2 ? Tema.sari : .white)
                }
            }
            .shadow(color: .black.opacity(0.5), radius: 3)
        }
        .disabled(kamera.kayitta)
        .yardimBalonu(yardim, "Biçim")
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
        if kamera.flas == .acik || kamera.flas == .fener { l.append(("⚡︎", kamera.flas == .fener ? "FENER" : "FLAŞ", true)) }
        if abs(kamera.ev) >= 0.05 { l.append((Cetvel.evYazi(kamera.ev), "EV", true)) }
        if let i = kamera.secilenIso { l.append(("\(Int(i))", "ISO", true)) }
        if let e = kamera.secilenEnst { l.append((e >= Kamera.bulb ? "BULB" : ProMod.enstYazi(e), "S", true)) }
        if let k = kamera.bd { l.append(("\(Int(k))", "K", true)) }
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
            if let o = kamera.kompOneri, !kamera.kayitta {
                cip(Text("Öneri: \(o.tur.ad)  ›  Uygula"), simge: "lightbulb", renk: AnaEkran.mavi) { kamera.kompOneriUygula() }
            }
            if let s = kamera.sahneOnerisi {
                cip(Text("Sahne: \(s.ad)  ›  Uygula"), simge: "sparkles", renk: AnaEkran.mavi) { kamera.sahneUygula() }
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
                        .font(.system(size: secili ? 15 : 14, weight: .semibold, design: .rounded))
                        .foregroundStyle(secili ? Tema.sari : .white)
                        .frame(width: 42, height: 42)
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
        Button { panelAc(.kontroller) } label: {
            VStack(spacing: 5) {
                ForEach(0..<2, id: \.self) { _ in
                    HStack(spacing: 5) { ForEach(0..<3, id: \.self) { _ in Circle().frame(width: 5.5, height: 5.5) } }
                }
            }
            .foregroundStyle(degisik ? Tema.sari : .white)
            .frame(width: 54, height: 54)
            .background(Circle().fill(AnaEkran.gri))
            .overlay(Circle().stroke(degisik || panel == .kontroller ? Tema.sari : .clear, lineWidth: 2.5).padding(1))
        }
        .accessibilityLabel("Kontroller")
        .yardimBalonu(yardim, "Kontroller")
    }

    private var degisik: Bool {
        abs(kamera.ev) >= 0.05 || kamera.secilenIso != nil || kamera.secilenEnst != nil || kamera.bd != nil || kamera.odakKonum != nil
            || kamera.kompTur != .kapali || kamera.asistanAcik || kamera.teraziAcik
    }

    private func yuvarlak(simge: String, etkin: Bool, aciklama: String, eylem: @escaping () -> Void) -> some View {
        Button(action: eylem) {
            Image(systemName: simge).font(.system(size: 20, weight: .semibold))
                .foregroundStyle(etkin ? Tema.sari : .white)
                .frame(width: 54, height: 54)
                .background(Circle().fill(AnaEkran.gri))
                .overlay(Circle().stroke(etkin ? Tema.sari : .clear, lineWidth: 2.5).padding(1))
        }
        .accessibilityLabel(aciklama)
        .yardimBalonu(yardim, aciklama)
        .disabled(kamera.proCalisiyor)
    }

    private var deklansor: some View {
        Button {
            panel = nil
            kamera.deklansor(yon: ekranYonu)
        } label: {
            ZStack {
                Circle().stroke(Color(white: 0.75), lineWidth: 4).frame(width: 80, height: 80)
                if kamera.proCalisiyor || ((kamera.mod == .video || kamera.mod == .timelapse) && kamera.kayitta) {
                    RoundedRectangle(cornerRadius: 7).fill(Color(red: 1, green: 59 / 255, blue: 48 / 255)).frame(width: 32, height: 32)
                } else if kamera.mod.foto {
                    Circle().fill(.white).frame(width: 66, height: 66)
                } else {
                    Circle().fill(Color(red: 1, green: 59 / 255, blue: 48 / 255)).frame(width: 66, height: 66)
                }
            }
            .animation(.easeOut(duration: 0.15), value: kamera.kayitta)
        }
        .simultaneousGesture(LongPressGesture(minimumDuration: 0.35).onEnded { _ in kamera.seriBasla(yon: ekranYonu) })
        .simultaneousGesture(DragGesture(minimumDistance: 0).onEnded { _ in kamera.seriBitir() })
        .accessibilityLabel(kamera.mod.foto ? "Fotoğraf çek" : (kamera.kayitta ? "Kaydı durdur" : "Kaydı başlat"))
        .yardimBalonu(yardim, kamera.mod == .pro && kamera.proMod.seri ? "Basılı tut: seri" : (kamera.uzunPozlama && kamera.mod == .foto ? "Uzun pozlama" : "Çek"))
    }

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
            .frame(width: 58, height: 58)
            .clipShape(Circle())
        }
        .accessibilityLabel("Son çekim")
        .yardimBalonu(yardim, "Son çekim")
    }

    private var cevirDugme: some View {
        Button { kamera.cevir() } label: {
            Image(systemName: "arrow.triangle.2.circlepath").font(.system(size: 21, weight: .semibold))
                .frame(width: 58, height: 58).background(Circle().fill(Color(white: 0.17)))
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
            .frame(width: dikey ? 118 : nil, height: dikey ? 250 : 52)
            .background(Capsule().fill(Color(white: 0.11)))
            .disabled(kamera.proCalisiyor)
    }

    private func modDugme(_ ad: String, secili: Bool, renk: Color, eylem: @escaping () -> Void) -> some View {
        Button(action: eylem) {
            Text(ad).font(.system(size: 15, weight: .semibold)).tracking(0.6).lineLimit(1)
                .foregroundStyle(secili ? renk : .white.opacity(0.9))
                .padding(.horizontal, 14).frame(height: 42)
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
                    Button { withAnimation(.easeOut(duration: 0.15)) { panel = nil } } label: {
                        Image(systemName: "xmark").font(.system(size: 17, weight: .semibold))
                            .frame(width: 42, height: 42).background(Circle().fill(Color.white.opacity(0.13)))
                    }
                    .accessibilityLabel("Kapat")
                    Spacer()
                }
            }
            ViewThatFits(in: .vertical) {
                panelIcerik(p)
                ScrollView(showsIndicators: false) { panelIcerik(p) }
            }
            .frame(maxHeight: enYuksek)
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
        case .kontroller: return "KONTROLLER"
        case .bicim: return "BİÇİM"
        }
    }

    @ViewBuilder private func panelIcerik(_ p: Panel) -> some View {
        switch p {
        case .proKartlar:
            ProModSecici(kamera: kamera) { m in
                kamera.proModSec(m)
                panel = nil
                uyariMod = m
            }
        case .proAyar: ProOzellestir(kamera: kamera)
        case .poz: Cetvel(tur: .poz, kamera: kamera)
        case .bd: Cetvel(tur: .bd, kamera: kamera)
        case .odak: Cetvel(tur: .odak, kamera: kamera)
        case .kilavuz: KilavuzMenu(kamera: kamera)
        case .kontroller: kontroller
        case .bicim: BicimPanel(kamera: kamera)
        }
    }

    private func panelAc(_ p: Panel) {
        withAnimation(.easeOut(duration: 0.18)) { panel = panel == p ? nil : p }
    }

    /// PRO MODLAR'da pozlama, beyaz denge ve odak modun kendi ayarlarında
    private func cetvelAc(_ p: Panel) { panelAc(kamera.mod == .pro ? .proAyar : p) }

    /// Kontroller: Apple Kamera'daki gibi yuvarlak düğme ızgarası (etkin olan sarı)
    private var kontroller: some View {
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
            kontrol("plusminus.circle", "Pozlama", pozYazi, etkin: abs(kamera.ev) >= 0.05 || kamera.secilenIso != nil || kamera.secilenEnst != nil) { cetvelAc(.poz) }
            kontrol("thermometer.sun", "Beyaz denge", kamera.bd.map { "\(Int($0))K" } ?? "Oto", etkin: kamera.bd != nil) { cetvelAc(.bd) }
            kontrol("scope", "Odak", kamera.odakKonum == nil ? "Oto" : "MF", etkin: kamera.odakKonum != nil) { cetvelAc(.odak) }
            kontrol("squareshape.split.3x3", "Kılavuz", kamera.kompTur == .kapali ? "Kapalı" : kamera.kompTur.ad, etkin: kamera.kompTur != .kapali) { panelAc(.kilavuz) }
            kontrol("wand.and.stars", "Yardımcı", kamera.asistanAcik ? "Açık" : "Kapalı", etkin: kamera.asistanAcik) { kamera.asistanAcik.toggle() }
            kontrol("level", "Terazi", kamera.teraziAcik ? "Açık" : "Kapalı", etkin: kamera.teraziAcik) { kamera.teraziAcik.toggle() }
            kontrol("square.resize", "Biçim", kamera.cozunurluk.components(separatedBy: " · ").first ?? "", etkin: false) { panelAc(.bicim) }
            kontrol("display", "Monitör", "Harici", etkin: false) { monitoreGec() }
            kontrol("gearshape", "Ayarlar", "Tümü", etkin: false) { panel = nil; ayarlar = true }
        }
        .padding(.top, 4)
    }

    private var pozYazi: String {
        if let e = kamera.secilenEnst { return e >= Kamera.bulb ? "BULB" : ProMod.enstYazi(e) }
        if let i = kamera.secilenIso { return "ISO \(Int(i))" }
        return abs(kamera.ev) < 0.05 ? "Oto" : Cetvel.evYazi(kamera.ev)
    }

    private func kontrol(_ simge: String, _ ad: String, _ deger: String, etkin: Bool, eylem: @escaping () -> Void) -> some View {
        Button(action: eylem) {
            VStack(spacing: 5) {
                Image(systemName: simge).font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(etkin ? Tema.sari : .white)
                    .frame(width: 54, height: 54)
                    .background(Circle().fill(Color.white.opacity(0.12)))
                    .overlay(Circle().stroke(etkin ? Tema.sari : .clear, lineWidth: 2))
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
                satir("KARE HIZI", (kamera.fps60Var ? [30, 60] : [30]).map { f in ("\(f)", kamera.videoFps == f, { kamera.videoFps = f }) })
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
