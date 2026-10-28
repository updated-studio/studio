import AVFoundation
import SwiftUI

enum ProPanelTuru { case mod, ayar }

/// Kamera ekranı (Android 0.11 KameraActivity düzeni): tam ekran görüntü, üstünde okunaklı katmanlar.
/// Üstte Monitör · Flaş · biçim · PRO · ? · Ayarlar; altta yakınlaştırma, araç şeridi (pozlama, beyaz denge, odak, kılavuz, yardımcı, terazi),
/// kaydırmalı mod şeridi (TIMELAPSE · VİDEO · FOTO · PRO MODLAR · PORTRE · MONİTÖR), son çekim, deklanşör, ön/arka.
struct AnaEkran: View {
    @StateObject private var kamera = Kamera()
    enum Panel: Equatable { case proKartlar, proAyar, poz, bd, odak, kilavuz }
    @State private var panel: Panel?
    @State private var uyariMod: ProMod?
    @State private var yardim = false
    @State private var ayarlar = false
    @State private var giris = !GirisEkran.soruldu && UserDefaults.standard.string(forKey: "giris") == nil
    @State private var zoomBas: CGFloat?
    /// Masa (çok kamera), Wi-Fi kamera ya da Monitör açıkken ana kamera durur
    @State private var ekran: Ekran?
    enum Ekran: String, Identifiable { case masa, wifi, monitor; var id: String { rawValue } }
    @Environment(\.scenePhase) private var evre

    private static let mavi = Color(red: 106 / 255, green: 152 / 255, blue: 248 / 255)
    private static let cam = Color(red: 38 / 255, green: 42 / 255, blue: 48 / 255).opacity(0.67)

    var body: some View {
        GeometryReader { g in
            ZStack {
                Tema.zemin.ignoresSafeArea()
                GeometryReader { tam in
                    let alan = AVMakeRect(aspectRatio: CGSize(width: kamera.goruntuOrani, height: 1), insideRect: CGRect(origin: .zero, size: tam.size))
                    ZStack {
                        Onizleme(oturum: kamera.oturum) { nokta in
                            panel = nil
                            kamera.odakla(nokta)
                        }
                        .simultaneousGesture(MagnifyGesture()
                            .onChanged { d in
                                if zoomBas == nil { zoomBas = kamera.zoom }
                                kamera.yakinlastir((zoomBas ?? 1) * d.magnification)
                            }
                            .onEnded { _ in zoomBas = nil })
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
                .ignoresSafeArea()
                if !kamera.izinVar { izinUyarisi }
                VStack(spacing: 0) {
                    ustSerit
                        .background(LinearGradient(colors: [.black.opacity(0.55), .clear], startPoint: .top, endPoint: .bottom).ignoresSafeArea())
                    cipler
                    Spacer()
                    if let b = kamera.bildirim { bildirimKutusu(b) }
                    panelGorunum.padding(.bottom, 8)
                    altKisim(genislik: g.size.width)
                        .background(LinearGradient(colors: [.clear, .black.opacity(0.65)], startPoint: .top, endPoint: .bottom).ignoresSafeArea())
                }
                .frame(width: g.size.width)
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

    // MARK: üst

    private var ustSerit: some View {
        HStack(spacing: 8) {
            camDugme(sistem: "display", renk: AnaEkran.mavi, aciklama: "Monitör (harici kamera)") { monitoreGec() }
            camDugme(sistem: kamera.flas == .kapali ? "bolt.slash.fill" : (kamera.flas == .oto ? "bolt.badge.automatic.fill" : "bolt.fill"),
                     renk: kamera.flas == .acik || kamera.flas == .fener ? Tema.vurgu : .white, aciklama: "Flaş") { kamera.flasDegistir() }
            Spacer(minLength: 4)
            if !kamera.kayitta {
                Button { ayarlar = true } label: {
                    Text(kamera.cozunurluk).font(Tema.mono).lineLimit(1).minimumScaleFactor(0.7)
                        .padding(.horizontal, 12).frame(height: 32)
                        .background(Capsule().fill(AnaEkran.cam))
                }
                .yardimBalonu(yardim, "Çözünürlük ve biçim")
            }
            Spacer(minLength: 4)
            Button { monitoreGec() } label: {
                Text("PRO").font(.subheadline.weight(.bold)).frame(width: 52, height: 40).background(Capsule().fill(AnaEkran.cam))
            }
            .yardimBalonu(yardim, "Elle ayar ekranı")
            Button { withAnimation(.easeOut(duration: 0.15)) { yardim.toggle() } } label: {
                Text("?").font(.system(size: 17, weight: .heavy))
                    .foregroundStyle(yardim ? .black : .white)
                    .frame(width: 40, height: 40)
                    .background(Circle().fill(yardim ? Tema.vurgu : AnaEkran.cam))
            }
            .accessibilityLabel("Açıklamalar")
            camDugme(sistem: "gearshape.fill", renk: .white, aciklama: "Ayarlar") { ayarlar = true }
                .disabled(kamera.kayitta)
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 14)
        .padding(.top, 6)
        .padding(.bottom, 10)
    }

    private func camDugme(sistem: String, renk: Color, aciklama: String, eylem: @escaping () -> Void) -> some View {
        Button(action: eylem) {
            Image(systemName: sistem).font(.system(size: 16, weight: .semibold)).foregroundStyle(renk)
                .frame(width: 40, height: 40).background(Circle().fill(AnaEkran.cam))
        }
        .accessibilityLabel(aciklama)
        .yardimBalonu(yardim, aciklama)
    }

    /// Üstteki bilgi çipleri: kayıt süresi, PRO mod özeti, kılavuz ve sahne önerileri
    private var cipler: some View {
        VStack(spacing: 8) {
            if kamera.kayitta, let bas = kamera.kayitBasi {
                TimelineView(.periodic(from: bas, by: 1)) { an in
                    let gecen = an.date.timeIntervalSince(bas)
                    Text(kamera.mod == .timelapse ? "●  \(Kamera.saat(gecen))  →  \(Kamera.saat(Double(Timelapse.videoMs(kamera.tlKare)) / 1000))" : "●  \(Kamera.saat(gecen))")
                        .font(Tema.mono)
                        .padding(.horizontal, 12).padding(.vertical, 5)
                        .background(Capsule().fill(Color(red: 229 / 255, green: 72 / 255, blue: 77 / 255)))
                }
            }
            if kamera.mod == .pro {
                cip(Text(kamera.proMod.ozet(kamera.proAyar) + "  ›"), simge: "slider.horizontal.3", renk: Tema.vurgu) { panelAc(.proAyar) }
                    .yardimBalonu(yardim, "Dokun: ISO, S, WB")
            }
            if let o = kamera.kompOneri, !kamera.kayitta {
                cip(Text("Öneri: \(o.tur.ad)  ›  Uygula"), simge: "lightbulb", renk: AnaEkran.mavi) { kamera.kompOneriUygula() }
            }
            if let s = kamera.sahneOnerisi {
                cip(Text("Sahne: \(s.ad)  ›  Uygula"), simge: "sparkles", renk: AnaEkran.mavi) { kamera.sahneUygula() }
            }
        }
        .padding(.top, 2)
    }

    private func cip(_ yazi: Text, simge: String, renk: Color, eylem: @escaping () -> Void) -> some View {
        Button(action: eylem) {
            HStack(spacing: 6) {
                Image(systemName: simge).foregroundStyle(renk)
                yazi.lineLimit(1).minimumScaleFactor(0.75)
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 12).padding(.vertical, 7)
            .background(Capsule().fill(AnaEkran.cam))
        }
    }

    // MARK: paneller

    @ViewBuilder private var panelGorunum: some View {
        switch panel {
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
        case nil: EmptyView()
        }
    }

    private func panelAc(_ p: Panel) {
        withAnimation(.easeOut(duration: 0.15)) { panel = panel == p ? nil : p }
    }

    /// PRO MODLAR'da pozlama, beyaz denge ve odak modun kendi ayarlarında
    private func cetvelAc(_ p: Panel) { panelAc(kamera.mod == .pro ? .proAyar : p) }

    // MARK: alt

    private func altKisim(genislik: CGFloat) -> some View {
        VStack(spacing: 10) {
            zoomSira
            if kamera.mod == .timelapse { sureSira }
            aracSerit
            modSerit(genislik: genislik)
            altSira
        }
        .padding(.top, 18)
        .padding(.bottom, 8)
    }

    private var zoomSira: some View {
        let d = kamera.zoomDuraklari
        let yakin = d.min { abs($0 - kamera.zoom) < abs($1 - kamera.zoom) }
        return HStack(spacing: 10) {
            ForEach(d, id: \.self) { z in
                let secili = z == yakin
                Button { kamera.yakinlastir(z) } label: {
                    Text(secili ? (abs(kamera.zoom - z) < 0.05 ? AnaEkran.fmt(z) : AnaEkran.fmt(kamera.zoom)) + "×" : AnaEkran.fmt(z))
                        .font(.system(size: secili ? 14 : 13, weight: .bold))
                        .foregroundStyle(secili ? Tema.vurgu : .white)
                        .frame(width: secili ? 44 : 38, height: secili ? 44 : 38)
                        .background(Circle().fill(Color(red: 20 / 255, green: 22 / 255, blue: 26 / 255).opacity(0.62)))
                }
            }
        }
        .disabled(kamera.kayitta || kamera.proCalisiyor)
    }

    static func fmt(_ v: CGFloat) -> String {
        if v < 1 { return ".\(Int((v * 10).rounded()))" }
        if abs(v - v.rounded()) < 0.05 { return "\(Int(v.rounded()))" }
        return String(format: "%.1f", v).replacingOccurrences(of: ".", with: ",")
    }

    /// TIMELAPSE: kare aralığı hızlı seçimi
    private var sureSira: some View {
        HStack(spacing: 6) {
            ForEach(Timelapse.hizli, id: \.self) { ms in
                let s = kamera.tlAralik == ms
                Button { kamera.tlAralik = ms } label: {
                    Text(Timelapse.aralikYazi(ms)).font(.caption.weight(.bold))
                        .foregroundStyle(s ? .black : .white)
                        .padding(.horizontal, 10).frame(height: 30)
                        .background(Capsule().fill(s ? Tema.vurgu : Color.black.opacity(0.45)))
                }
            }
        }
        .disabled(kamera.kayitta)
    }

    private var aracSerit: some View {
        HStack(spacing: 0) {
            arac("plusminus.circle", abs(kamera.ev) < 0.05 && kamera.secilenIso == nil ? "Pozlama" : (kamera.secilenIso.map { "ISO \(Int($0))" } ?? Cetvel.evYazi(kamera.ev)),
                 etkin: abs(kamera.ev) >= 0.05 || kamera.secilenIso != nil || panel == .poz, aciklama: "Parlaklık") { cetvelAc(.poz) }
            arac("thermometer.sun", kamera.bd.map { "\(Int($0))K" } ?? "Beyaz", etkin: kamera.bd != nil || panel == .bd, aciklama: "Renk sıcaklığı") { cetvelAc(.bd) }
            arac("scope", kamera.odakKonum == nil ? "Odak" : "MF", etkin: kamera.odakKonum != nil || panel == .odak, aciklama: "Odak") { cetvelAc(.odak) }
            arac("squareshape.split.3x3", kamera.kompTur == .kapali ? "Kılavuz" : kamera.kompTur.ad, etkin: kamera.kompTur != .kapali || panel == .kilavuz,
                 aciklama: "Kadraj çizgileri") { panelAc(.kilavuz) }
            arac("wand.and.stars", "Yardımcı", etkin: kamera.asistanAcik, aciklama: "Kadraj önerisi") { kamera.asistanAcik.toggle() }
            arac("level", "Terazi", etkin: kamera.teraziAcik, aciklama: "Eğim") { kamera.teraziAcik.toggle() }
        }
        .padding(.horizontal, 8)
    }

    private func arac(_ simge: String, _ yazi: String, etkin: Bool, aciklama: String, eylem: @escaping () -> Void) -> some View {
        Button(action: eylem) {
            VStack(spacing: 3) {
                Image(systemName: simge).font(.system(size: 18, weight: .semibold))
                Text(yazi).font(.system(size: 10, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.7)
            }
            .foregroundStyle(etkin ? Tema.vurgu : .white)
            .frame(maxWidth: .infinity, minHeight: 44)
        }
        .yardimBalonu(yardim, aciklama)
    }

    private func modSerit(genislik: CGFloat) -> some View {
        ScrollViewReader { kaydir in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 4) {
                    Color.clear.frame(width: max(0, genislik / 2 - 50), height: 1)
                    ForEach(Kamera.Mod.allCases, id: \.self) { m in
                        modDugme(m.rawValue, secili: kamera.mod == m, renk: Tema.vurgu) {
                            if m == kamera.mod { if m == .pro { panelAc(.proKartlar) }; return }
                            guard !kamera.kayitta else { kamera.bildirim = "Kayıt sürerken mod değişmez."; return }
                            kamera.modDegistir(m)
                        }
                        .id(m.rawValue)
                    }
                    modDugme("MONİTÖR", secili: false, renk: AnaEkran.mavi) { monitoreGec() }
                    Color.clear.frame(width: max(0, genislik / 2 - 50), height: 1)
                }
            }
            .onAppear { kaydir.scrollTo(kamera.mod.rawValue, anchor: .center) }
            .onChange(of: kamera.mod) { _, m in withAnimation { kaydir.scrollTo(m.rawValue, anchor: .center) } }
        }
        .frame(height: 34)
        .disabled(kamera.proCalisiyor)
    }

    private func modDugme(_ ad: String, secili: Bool, renk: Color, eylem: @escaping () -> Void) -> some View {
        Button(action: eylem) {
            Text(ad).font(.system(size: 14, weight: .bold).width(.condensed))
                .foregroundStyle(secili ? renk : .white.opacity(0.63))
                .padding(.horizontal, 10).padding(.vertical, 6)
        }
    }

    private var altSira: some View {
        HStack {
            Button {
                if let u = URL(string: "photos-redirect://") { UIApplication.shared.open(u) }
            } label: {
                Group {
                    if let r = kamera.sonResim { Image(uiImage: r).resizable().scaledToFill() } else { Color.white.opacity(0.08) }
                }
                .frame(width: 52, height: 52)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.white.opacity(0.4), lineWidth: 1.5))
            }
            .accessibilityLabel("Son çekim")
            .yardimBalonu(yardim, "Son çekim")
            Spacer()
            deklansor
                .yardimBalonu(yardim, kamera.mod == .pro && kamera.proMod.seri ? "Basılı tut: seri" : "Çek")
            Spacer()
            Button { kamera.cevir() } label: {
                Image(systemName: "arrow.triangle.2.circlepath").font(.system(size: 20, weight: .semibold))
                    .frame(width: 52, height: 52).background(Circle().fill(AnaEkran.cam))
            }
            .accessibilityLabel("Ön / arka")
            .yardimBalonu(yardim, "Ön / arka")
            .disabled(kamera.kayitta || kamera.proCalisiyor)
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 28)
    }

    private var deklansor: some View {
        Button {
            panel = nil
            kamera.deklansor(yon: ekranYonu)
        } label: {
            ZStack {
                Circle().stroke(.white, lineWidth: 4).frame(width: 76, height: 76)
                if (kamera.mod == .pro && kamera.proCalisiyor) || ((kamera.mod == .video || kamera.mod == .timelapse) && kamera.kayitta) {
                    RoundedRectangle(cornerRadius: 6).fill(.red).frame(width: 30, height: 30)
                } else if kamera.mod.foto {
                    Circle().fill(.white).frame(width: 62, height: 62)
                } else {
                    Circle().fill(.red).frame(width: 60, height: 60)
                }
            }
            .animation(.easeOut(duration: 0.15), value: kamera.kayitta)
        }
        .simultaneousGesture(LongPressGesture(minimumDuration: 0.35).onEnded { _ in kamera.seriBasla(yon: ekranYonu) })
        .simultaneousGesture(DragGesture(minimumDistance: 0).onEnded { _ in kamera.seriBitir() })
        .accessibilityLabel(kamera.mod.foto ? "Fotoğraf çek" : (kamera.kayitta ? "Kaydı durdur" : "Kaydı başlat"))
    }

    private var ekranYonu: AVCaptureVideoOrientation {
        Onizleme.yon(UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.interfaceOrientation }.first ?? .portrait)
    }

    private func bildirimKutusu(_ yazi: String) -> some View {
        Text(yazi)
            .font(.footnote.weight(.semibold))
            .padding(.horizontal, 14).padding(.vertical, 8)
            .background(Capsule().fill(Tema.yuzey))
            .padding(.bottom, 8)
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
            .buttonStyle(.borderedProminent).tint(Tema.vurgu)
        }
        .padding(24)
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
                    .background(Capsule().fill(Tema.vurgu))
                    .foregroundStyle(.black)
                    .offset(y: -24)
                    .allowsHitTesting(false)
            }
        }
    }
}
