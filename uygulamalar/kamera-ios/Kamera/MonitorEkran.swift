import AVFoundation
import SwiftUI
import UniformTypeIdentifiers

/// Monitör ekranı — Android MainActivity düzeni: tam ekran görüntü; üstte kamera değerleri ve zaman kodu, solda
/// KAYNAK · BÜYÜT · ODAK · TEMİZ · DÜZEN, sağda ayarlar · kayıt · son kayıt · kalan süre, altta araçlar ve ses göstergesi.
/// Görüntüye dokununca katmanlar gizlenir/görünür; değerlere dokununca altta seçenek şeridi açılır.
struct MonitorEkran: View {
    var kapat: () -> Void
    @StateObject private var m = Monitor()
    @Environment(\.scenePhase) private var evre
    @Environment(\.horizontalSizeClass) private var boyutSinifi
    @State private var arayuzAcik = true
    @State private var acikParam: Monitor.Param?
    @State private var panelAcik = false
    @State private var sekme: Monitor.Sekme = .kayit
    @State private var lutAl = false
    @State private var adres = ""

    private static let sari = Tema.sari
    private static let koyu = Color(red: 30 / 255, green: 30 / 255, blue: 30 / 255)
    private static let koyu2 = Color(red: 44 / 255, green: 44 / 255, blue: 44 / 255)
    private static let gri = Color(red: 140 / 255, green: 140 / 255, blue: 140 / 255)
    private var genis: Bool { boyutSinifi == .regular && UIDevice.current.userInterfaceIdiom == .pad }
    private static let yay = Animation.spring(response: 0.34, dampingFraction: 0.9)
    private var a: BolmeAyari { m.ayarlar[m.etkin] }

    var body: some View {
        GeometryReader { g in
            let yatay = g.size.width > g.size.height
            ZStack {
                Color.black.ignoresSafeArea()
                bolmeler(yatay, g.size).ignoresSafeArea()
                // iPad: masaüstü sınıfı düzen (üst durum çubuğu, sol araç rayı, alt ölçüm çubuğu, sağda denetçi panel);
                // iPhone: yatayda Blackmagic Camera düzeni, dikeyde tek elle kullanım (MONITOR_TASARIM.md)
                if genis { ipadKatman } else if yatay { yatayKatman } else { dikeyKatman }
                if let b = m.bildirim { bildirimKutusu(b) }
                if panelAcik {
                    if genis {
                        HStack(spacing: 0) {
                            Spacer(minLength: 0)
                            panel.frame(width: min(420, g.size.width * 0.46))
                                .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
                                .padding(12)
                        }
                        .transition(.move(edge: .trailing).combined(with: .opacity))
                    } else {
                        VStack(spacing: 0) {
                            Color.black.opacity(0.001).frame(maxHeight: yatay ? 0 : g.size.height * 0.3)
                                .onTapGesture { withAnimation(Self.yay) { panelAcik = false } }
                            panel.clipShape(UnevenRoundedRectangle(topLeadingRadius: 24, topTrailingRadius: 24, style: .continuous))
                        }
                        .ignoresSafeArea(edges: .bottom)
                        .transition(.move(edge: .bottom))
                    }
                }
            }
        }
        .foregroundStyle(.white)
        .preferredColorScheme(.dark)
        .statusBarHidden()
        .persistentSystemOverlays(.hidden)
        .onAppear { m.ac() }
        .onDisappear { m.kapat() }
        .onChange(of: evre) { _, yeni in
            if yeni == .background { m.kapat() } else if yeni == .active { m.ac() }
        }
        .fileImporter(isPresented: $lutAl, allowedContentTypes: [UTType(filenameExtension: "cube") ?? .data, .data, .text], allowsMultipleSelection: true) { s in
            if case let .success(urller) = s { lutlariAl(urller) }
        }
    }

    // MARK: bölmeler

    @ViewBuilder private func bolmeler(_ yatay: Bool, _ boyut: CGSize) -> some View {
        let duzen = yatay ? AnyLayout(HStackLayout(spacing: 2)) : AnyLayout(VStackLayout(spacing: 2))
        duzen {
            ForEach(0..<m.bolmeSayisi, id: \.self) { i in bolme(i) }
            if m.kip == .olcum {
                OlcumPaneli(o: m.olcum)
                    .frame(width: yatay ? boyut.width * 0.7 / 1.7 : nil, height: yatay ? nil : boyut.height * 1.1 / 2.1)
            }
        }
    }

    private func bolme(_ i: Int) -> some View {
        ZStack {
            MonitorGorunum(cizici: m.ciziciler[i])
            if !m.bagli[i] {
                VStack(spacing: 6) {
                    if m.kaynakAdi[i].isEmpty { Text("Kaynak yok").font(.headline) } else { ProgressView(); Text(m.kaynakAdi[i]).font(.footnote) }
                    Text("KAYNAK'tan seç: telefon kamerası, USB (iPad) ya da Wi-Fi kamera").font(.caption).foregroundStyle(Self.gri)
                }
                .multilineTextAlignment(.center).padding(24)
            }
            if i == m.etkin { kompozisyon(i) }
            if i == m.etkin, let e = m.egim { Terazi(egim: e) }
            if m.kip == .iki && i == m.etkin { Rectangle().strokeBorder(Self.sari, lineWidth: 2) }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            if acikParam != nil { withAnimation(Self.yay) { acikParam = nil } }
            else if m.kip == .iki && m.etkin != i { m.etkinYap(i) }
            else { withAnimation(Self.yay) { arayuzAcik.toggle() } }
        }
    }

    /// Kompozisyon kılavuzu, konu kutusu, yön tarifi ve öneri (görüntünün ekrandaki dikdörtgenine çizilir)
    @ViewBuilder private func kompozisyon(_ i: Int) -> some View {
        if m.bagli[i], m.kompTur != .kapali || m.asistanAcik {
            GeometryReader { g in
                let oran = m.goruntuOrani
                let alan: CGRect = {
                    // Görüntü bölmeyi doldurur (kenarlar kırpılır)
                    if g.size.width / max(g.size.height, 1) > oran {
                        let h = g.size.width / oran; return CGRect(x: 0, y: (g.size.height - h) / 2, width: g.size.width, height: h)
                    }
                    let w = g.size.height * oran; return CGRect(x: (g.size.width - w) / 2, y: 0, width: w, height: g.size.height)
                }()
                ZStack {
                    KompozisyonKatman(tur: m.kompTur, yon: m.kompYon, alan: alan, asistan: m.asistanAcik, konu: m.konu, konuAdi: m.konuAdi, analiz: m.analiz)
                    if let t = m.ipucu {
                        Text(t)
                            .font(.subheadline.weight(.bold))
                            .padding(.horizontal, 14).padding(.vertical, 8)
                            .background(Capsule().fill(Self.koyu.opacity(0.72)))
                            .position(x: g.size.width / 2, y: g.size.height * 0.72)
                            .allowsHitTesting(false)
                    }
                    if let o = m.kompOneri {
                        Button { m.kompOneriUygula() } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "lightbulb").foregroundStyle(Self.sari)
                                Text("Öneri: \(o.tur.ad)  ›  Uygula").lineLimit(1)
                            }
                            .font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                            .padding(.horizontal, 12).padding(.vertical, 7)
                            .background(Capsule().fill(Self.koyu.opacity(0.8)))
                        }
                        .position(x: g.size.width / 2, y: g.size.height * 0.2)
                    }
                }
            }
            .clipped()
        }
    }

    // MARK: yatay düzen

    private var yatayKatman: some View {
        VStack(spacing: 0) {
            if arayuzAcik {
                VStack(spacing: 0) {
                    HStack(spacing: 0) {
                        degerHucreleri(dar: false, tcIle: true)
                    }
                    .frame(height: 56)
                    if acikParam != nil { paramSeridi }
                }
                .background(LinearGradient(colors: [.black.opacity(0.72), .clear], startPoint: .top, endPoint: .bottom).ignoresSafeArea())
            } else { Spacer().frame(height: 56) }
            HStack(alignment: .center, spacing: 0) {
                if arayuzAcik {
                    VStack(spacing: 8) { solDugmeler(dikey: false) }
                        .frame(width: 60).padding(.leading, 8).padding(.vertical, 6)
                }
                Spacer()
                sagSutun.frame(width: 96).padding(.trailing, 4)
            }
            .frame(maxHeight: .infinity)
            if arayuzAcik {
                VStack(alignment: .leading, spacing: 6) {
                    if m.sesGosterge { SesGostergesi(sol: m.ses.0, sag: m.ses.1).frame(width: 150, height: 20).padding(.leading, 76) }
                    HStack(spacing: 10) {
                        if m.koseHisto { KoseHistogram(o: m.kose).frame(width: 140, height: 48) }
                        araclar
                    }
                    .padding(.horizontal, 12)
                }
                .padding(.bottom, 4)
                .background(LinearGradient(colors: [.clear, .black.opacity(0.65)], startPoint: .top, endPoint: .bottom).ignoresSafeArea())
            }
        }
    }

    // MARK: iPad düzeni

    private var ipadKatman: some View {
        VStack(spacing: 0) {
            if arayuzAcik {
                VStack(spacing: 8) {
                    HStack(spacing: 0) { degerHucreleri(dar: false, tcIle: true) }
                        .frame(height: 58)
                        .padding(.horizontal, 8)
                        .yuzey(20)
                    if acikParam != nil { paramSeridi.frame(maxWidth: 760) }
                }
                .padding(.horizontal, 16).padding(.top, 10)
            }
            HStack(alignment: .center, spacing: 0) {
                if arayuzAcik {
                    VStack(spacing: 10) { solDugmeler(dikey: true) }
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(width: 68).padding(8)
                        .yuzey(22)
                        .padding(.leading, 16)
                        .transition(.move(edge: .leading).combined(with: .opacity))
                }
                Spacer()
                VStack(spacing: 18) {
                    ayarDugmesi
                    kayitDugmesi(boy: 72)
                    sonKayitKutusu(dikey: false)
                }
                .padding(.vertical, 16).padding(.horizontal, 10)
                .yuzey(26)
                .padding(.trailing, 16)
            }
            .frame(maxHeight: .infinity)
            if arayuzAcik {
                HStack(spacing: 14) {
                    if m.koseHisto { KoseHistogram(o: m.kose).frame(width: 168, height: 52) }
                    if m.sesGosterge { SesGostergesi(sol: m.ses.0, sag: m.ses.1).frame(width: 180, height: 22) }
                    araclar
                }
                .padding(.horizontal, 12).padding(.vertical, 8)
                .yuzey(22)
                .padding(.horizontal, 16).padding(.bottom, 12)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
    }

    // MARK: dikey düzen

    private var dikeyKatman: some View {
        VStack(spacing: 0) {
            if arayuzAcik {
                VStack(spacing: 2) {
                    zamanKodu(buyuk: true).frame(maxWidth: .infinity)
                    HStack(spacing: 0) { degerHucreleri(dar: true, tcIle: false) }.frame(height: 50)
                    if acikParam != nil { paramSeridi }
                }
                .padding(.top, 4)
                .background(LinearGradient(colors: [.black.opacity(0.72), .clear], startPoint: .top, endPoint: .bottom).ignoresSafeArea())
            }
            Spacer()
            VStack(alignment: .leading, spacing: 8) {
                if arayuzAcik {
                    if m.sesGosterge { SesGostergesi(sol: m.ses.0, sag: m.ses.1).frame(width: 150, height: 20).padding(.leading, 16) }
                    HStack(spacing: 8) { solDugmeler(dikey: true) }.frame(height: 48).padding(.horizontal, 12)
                    HStack(spacing: 8) {
                        if m.koseHisto { KoseHistogram(o: m.kose).frame(width: 84, height: 40) }
                        araclar
                    }
                    .padding(.horizontal, 12)
                }
                HStack {
                    ayarDugmesi.frame(width: 70)
                    Spacer()
                    kayitDugmesi(boy: 76)
                    Spacer()
                    sonKayitKutusu(dikey: true).frame(width: 110)
                }
                .padding(.horizontal, 8)
                .padding(.top, 6)
            }
            .padding(.bottom, 6)
            .background(LinearGradient(colors: [.clear, .black.opacity(0.7)], startPoint: .top, endPoint: .bottom).ignoresSafeArea())
        }
    }

    // MARK: üst şerit

    @ViewBuilder private func degerHucreleri(dar: Bool, tcIle: Bool) -> some View {
        let kontrol = m.kontrolVar
        let k = m.kamAyar
        hucre(dar ? "FPS" : "KARE HIZI", kontrol ? (k.fps.map(String.init) ?? "OTO") : "—", .fps)
        hucre(dar ? "ENST." : "ENSTANTANE", kontrol ? enstantaneYazi(k.enstantane, fps: k.fps ?? 30) : "—", .enstantane)
        hucre(dar ? "DİYAF." : "DİYAFRAM", m.diyafram.map { "f/" + virgul($0, 1) } ?? "—", .diyafram)
        if tcIle { zamanKodu(buyuk: false).frame(minWidth: 190, maxWidth: .infinity) }
        hucre("ISO", kontrol ? (k.iso.map { "\(Int($0))" } ?? "OTO") : "—", .iso)
        hucre(dar ? "BD" : "BEYAZ DENGESİ", kontrol ? (k.kelvin.map { "\($0)K" } ?? "OTO") : "—", .wb)
        hucre(dar ? "POZ." : "POZLAMA", kontrol ? evYazi(k.ev) : "—", .ev)
    }

    private func hucre(_ etiket: String, _ deger: String, _ p: Monitor.Param) -> some View {
        Button {
            withAnimation(Self.yay) { acikParam = acikParam == p ? nil : p }
        } label: {
            VStack(spacing: 2) {
                Text(etiket).font(.system(size: 10, weight: .semibold)).tracking(0.8).foregroundStyle(.white.opacity(0.84)).lineLimit(1)
                Text(deger).font(.system(size: 17, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.7)
            }
            .shadow(color: .black.opacity(0.8), radius: 3, y: 1)
            .foregroundStyle(acikParam == p ? Self.sari : .white)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(acikParam == p ? Color.white.opacity(0.1) : .clear).padding(3))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    /// Kayıtta geçen süre (saat:dk:sn:kare), değilse saat
    private func zamanKodu(buyuk: Bool) -> some View {
        TimelineView(.periodic(from: .now, by: m.kayitta ? 1.0 / 30 : 1)) { an in
            Text(tcYazi(an.date))
                .font(.system(size: buyuk ? 34 : 26, weight: .bold, design: .monospaced))
                .foregroundStyle(m.kayitta ? .red : .white)
                .shadow(color: .black.opacity(0.8), radius: 3, y: 1)
                .lineLimit(1).minimumScaleFactor(0.6)
        }
    }

    private func tcYazi(_ simdi: Date) -> String {
        if let bas = m.kayitBasi {
            let ms = Int(simdi.timeIntervalSince(bas) * 1000), fps = m.kamAyar.fps ?? 30
            return String(format: "%02d:%02d:%02d:%02d", ms / 3_600_000, ms / 60_000 % 60, ms / 1000 % 60, (ms % 1000) * fps / 1000)
        }
        let c = Calendar.current.dateComponents([.hour, .minute, .second], from: simdi)
        return String(format: "%02d:%02d:%02d:00", c.hour ?? 0, c.minute ?? 0, c.second ?? 0)
    }

    private func enstantaneYazi(_ t: Double?, fps: Int) -> String {
        guard let t else { return "OTO" }
        if abs(360 * Double(fps) * t - 180) < 6 { return "180°" }
        return t >= 1 ? "\(Int(t)) sn" : "1/\(Int((1 / t).rounded()))"
    }

    private func evYazi(_ ev: Float) -> String { abs(ev) < 0.01 ? "0" : (ev > 0 ? "+" : "−") + virgul(abs(ev), 1) }
    private func virgul(_ v: Float, _ basamak: Int) -> String { String(format: "%.\(basamak)f", v).replacingOccurrences(of: ".", with: ",") }

    // MARK: seçenek şeridi

    private var paramSeridi: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(paramBaslik).font(.system(size: 11, weight: .semibold)).tracking(1).foregroundStyle(Self.gri)
            paramIcerik
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .yuzey(20, dolgu: Color.black.opacity(0.5))
        .padding(.horizontal, genis ? 0 : 8)
        .transition(.move(edge: .top).combined(with: .opacity))
    }

    private var paramBaslik: String {
        switch acikParam {
        case .fps: return "KARE HIZI"
        case .enstantane: return "ENSTANTANE"
        case .diyafram: return "DİYAFRAM"
        case .iso: return "ISO"
        case .wb: return "BEYAZ DENGESİ"
        case .ev: return "POZLAMA TELAFİSİ"
        case .odak: return "ODAK"
        case nil: return ""
        }
    }

    @ViewBuilder private var paramIcerik: some View {
        if !m.kontrolVar {
            Text(m.etkinCihaz == nil ? "Bu ayar yalnız telefon kamerasında var; Wi-Fi kamerada ayarlar o telefondan yapılır."
                 : "USB kaynakta bu ayar kameranın kendisinden yapılır.").font(.footnote)
        } else {
            switch acikParam {
            case .fps:
                cipSatiri {
                    cip("OTO", m.kamAyar.fps == nil) { m.kamAyar.fps = nil; m.kamAyarDegisti(oturumYenile: true) }
                    ForEach(m.fpsler, id: \.self) { f in cip("\(f)", m.kamAyar.fps == f) { m.kamAyar.fps = f; m.kamAyarDegisti(oturumYenile: true) } }
                }
            case .enstantane:
                let fps = m.kamAyar.fps ?? 30
                cipSatiri {
                    cip("OTO", m.kamAyar.enstantane == nil) { m.kamAyar.enstantane = nil; m.kamAyarDegisti() }
                    let yarim = 1 / Double(fps * 2)
                    cip("180° (1/\(fps * 2))", m.kamAyar.enstantane.map { abs($0 - yarim) < 1e-6 } ?? false) { m.kamAyar.enstantane = yarim; m.kamAyarDegisti() }
                    ForEach([24, 30, 50, 60, 100, 125, 250, 500, 1000, 2000, 4000].filter { m.enstantaneAraligi?.contains(1 / Double($0)) ?? false }, id: \.self) { n in
                        cip("1/\(n)", m.kamAyar.enstantane.map { abs($0 - 1 / Double(n)) < 1e-7 } ?? false) { m.kamAyar.enstantane = 1 / Double(n); m.kamAyarDegisti() }
                    }
                }
            case .diyafram:
                Text(m.diyafram.map { "Bu kameranın diyaframı sabit: f/\(virgul($0, 1)). Pozlamayı ISO, enstantane ve ND filtreyle ayarla." } ?? "Diyafram kameranın kendisinden ayarlanır.")
                    .font(.footnote)
            case .iso:
                cipSatiri {
                    cip("OTO", m.kamAyar.iso == nil) { m.kamAyar.iso = nil; m.kamAyarDegisti() }
                    ForEach(Kamera.isoListesi(min: m.isoAraligi?.lowerBound ?? 50, max: m.isoAraligi?.upperBound ?? 3200), id: \.self) { v in
                        cip("\(Int(v))", m.kamAyar.iso == v) { m.kamAyar.iso = v; m.kamAyarDegisti() }
                    }
                }
            case .wb:
                cipSatiri {
                    cip("OTO", m.kamAyar.kelvin == nil) { m.kamAyar.kelvin = nil; m.kamAyar.ton = nil; m.kamAyarDegisti() }
                    ForEach([3200, 4000, 5600, 6500, 7500], id: \.self) { k in cip("\(k)K", m.kamAyar.kelvin == k) { m.kamAyar.kelvin = k; m.kamAyarDegisti() } }
                }
                // İki çubuk (Fatih 30 Ekim): üstte Kelvin, altta yeşil-macenta; çubuğa dokununca BD elle olur
                HStack(spacing: 10) {
                    Text("K").font(.caption.weight(.bold)).foregroundStyle(Self.gri).frame(width: 18)
                    Slider(value: Binding(get: { Double(m.kamAyar.kelvin ?? 5600) }, set: { m.kamAyar.kelvin = Int(($0 / 50).rounded() * 50); m.kamAyarDegisti() }), in: 2500...10000)
                        .tint(LinearGradient(colors: [.orange, .white, .blue], startPoint: .leading, endPoint: .trailing))
                    Text(m.kamAyar.kelvin.map { "\($0)K" } ?? "OTO").font(.system(size: 13, weight: .semibold).monospacedDigit()).frame(width: 58, alignment: .trailing)
                }
                TonCubugu(deger: m.kamAyar.ton ?? 0) { t in
                    if m.kamAyar.kelvin == nil { m.kamAyar.kelvin = 5600 }
                    m.kamAyar.ton = t == 0 ? nil : t; m.kamAyarDegisti()
                }
                Text("K: ışığın sıcaklığı · alt çubuk: sola yeşil, sağa macenta (LED ve floresandaki yeşili giderir). Ortaya çift dokun: sıfır.")
                    .font(.caption).foregroundStyle(Self.gri)
            case .ev:
                let r = m.evAraligi ?? -2...2
                cipSatiri {
                    ForEach((-9...9).map { Float($0) / 3 }.filter { r.contains($0) }, id: \.self) { v in
                        cip(evYazi(v), abs(m.kamAyar.ev - v) < 0.01) { m.kamAyar.ev = v; m.kamAyarDegisti() }
                    }
                }
            case .odak:
                cipSatiri {
                    cip("OTO (AF)", m.kamAyar.odak == nil) { m.kamAyar.odak = nil; m.kamAyarDegisti() }
                    if m.elleOdak { cip("Sonsuz", m.kamAyar.odak == 0) { m.kamAyar.odak = 0; m.kamAyarDegisti() } }
                }
                if m.elleOdak {
                    Slider(value: Binding(get: { Double(m.kamAyar.odak ?? 0) }, set: { m.kamAyar.odak = Float($0); m.kamAyarDegisti() }), in: 0...1)
                        .tint(Self.sari)
                    Text("Sola: sonsuz · sağa: en yakın. Odak yardımını (ODAK) açarak keskinliği gör.").font(.caption).foregroundStyle(Self.gri)
                }
            case nil:
                EmptyView()
            }
        }
    }

    private func cipSatiri<C: View>(@ViewBuilder _ icerik: () -> C) -> some View {
        ScrollView(.horizontal, showsIndicators: false) { HStack(spacing: 6) { icerik() } }
    }

    private func cip(_ ad: String, _ secili: Bool, _ eylem: @escaping () -> Void) -> some View {
        Button(action: eylem) {
            Text(ad).font(.system(size: 14, weight: .semibold))
                .foregroundStyle(secili ? .black : .white)
                .padding(.horizontal, 14).frame(minHeight: 36)
                .background(Capsule().fill(secili ? Self.sari : Color.white.opacity(0.1)))
        }
        .buttonStyle(.plain)
    }

    // MARK: sol düğmeler

    @ViewBuilder private func solDugmeler(dikey: Bool) -> some View {
        kare("", "KAYNAK", simge: "arrow.left.arrow.right") { panelAc(.kaynak) }
        kare(a.zoom > 1 ? "\(Int(a.zoom))x" : "1x", "BÜYÜT", secili: a.zoom > 1) {
            m.ayarlar[m.etkin].zoom = a.zoom == 1 ? 2 : (a.zoom == 2 ? 4 : 1)
        }
        kare(m.kamAyar.odak == nil ? "AF" : "MF", "ODAK", secili: acikParam == .odak) {
            withAnimation(Self.yay) { acikParam = acikParam == .odak ? nil : .odak }
        }
        kare("", "TEMİZ", secili: a.temiz, simge: "eye") { m.ayarlar[m.etkin].temiz.toggle() }
        kare("", "DÜZEN", simge: "square.grid.2x2") { panelAc(.monitor) }
    }

    private func kare(_ ad: String, _ alt: String, secili: Bool = false, simge: String? = nil, eylem: @escaping () -> Void) -> some View {
        Button(action: eylem) {
            VStack(spacing: 2) {
                if let simge { Image(systemName: simge).font(.system(size: 18, weight: .semibold)) }
                else { Text(ad).font(.system(size: 15, weight: .bold)) }
                if genis { Text(alt).font(.system(size: 9, weight: .semibold)).foregroundStyle(secili ? Color(white: 0.3) : .white.opacity(0.8)) }
            }
            .foregroundStyle(secili ? .black : .white)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .frame(minHeight: 44)
            .background {
                if secili { RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color.white) }
                else if !genis { RoundedRectangle(cornerRadius: 14, style: .continuous).fill(.clear).yuzey(14) }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(alt)
    }

    // MARK: araçlar (alt şerit)

    private var araclar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                arac(Uygulama.geriBuyuk, "chevron.left", false) { kapat() }
                arac("ODAK", "viewfinder", a.peaking) { m.ayarlar[m.etkin].peaking.toggle() }
                arac("ZEBRA", "square.stack", a.zebra, ozelZebra: true) { m.ayarlar[m.etkin].zebra.toggle() }
                arac("FALSE", "drop.halffull", a.falseColor) { m.ayarlar[m.etkin].falseColor.toggle() }
                arac("STİL", "camera.filters", a.lutAcik || a.stil?.etkin == true) { panelAc(.lut) }
                arac("KILAVUZ", "crop", a.kilavuz > 0 || a.izgara) {
                    if a.kilavuz > 0 || a.izgara { m.ayarlar[m.etkin].kilavuz = 0; m.ayarlar[m.etkin].izgara = false } else { m.ayarlar[m.etkin].kilavuz = 2.39 }
                }
                arac(m.kompTur == .kapali ? "KOMPOZİSYON" : m.kompTur.ad.uppercased(with: Locale(identifier: "tr")), "squareshape.split.3x3", m.kompTur != .kapali) { m.kompAcKapa() }
                arac("YARDIMCI", "person.crop.square", m.asistanAcik) { m.asistanAcik.toggle() }
                arac("TERAZİ", "level", m.teraziAcik) { m.teraziAcik.toggle() }
            }
        }
    }

    private func arac(_ ad: String, _ simge: String, _ secili: Bool, ozelZebra: Bool = false, eylem: @escaping () -> Void) -> some View {
        Button(action: eylem) {
            VStack(spacing: 3) {
                if ozelZebra { ZebraSimge().frame(width: 20, height: 20) } else { Image(systemName: simge).font(.system(size: 19, weight: .semibold)) }
                if genis { Text(ad).font(.system(size: 9, weight: .semibold)).tracking(0.4) }
            }
            .foregroundStyle(secili ? .black : .white)
            .frame(minWidth: genis ? 62 : 44, minHeight: genis ? 50 : 44)
            .padding(.horizontal, genis ? 4 : 0)
            .background {
                if genis { RoundedRectangle(cornerRadius: 14, style: .continuous).fill(secili ? Self.sari : Color.white.opacity(0.06)) }
                else if secili { Circle().fill(Self.sari) }
                else { Circle().fill(.clear).yuvarlakYuzey() }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(ad)
    }

    // MARK: sağ sütun

    private var sagSutun: some View {
        VStack(spacing: 6) {
            ayarDugmesi
            Spacer()
            kayitDugmesi(boy: 64)
            Spacer()
            sonKayitKutusu(dikey: false)
        }
        .padding(.vertical, 8)
    }

    private var ayarDugmesi: some View {
        Button { panelAc(.kayit) } label: {
            Image(systemName: "slider.horizontal.3").font(.system(size: 22, weight: .semibold))
                .frame(width: 48, height: 44)
                .shadow(color: .black.opacity(0.8), radius: 3)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Ayarlar")
    }

    private func kayitDugmesi(boy: CGFloat) -> some View {
        KayitDugmesi(kayitta: m.kayitta)
            .frame(width: boy, height: boy)
            .contentShape(Circle())
            .onTapGesture { m.kayitDugmesi() }
            .onLongPressGesture { m.ekranGoruntusu() }
            .accessibilityLabel(m.kayitta ? "Kaydı durdur (basılı tut: ekran görüntüsü)" : "Kaydı başlat (basılı tut: ekran görüntüsü)")
            .accessibilityAddTraits(.isButton)
    }

    private func sonKayitKutusu(dikey: Bool) -> some View {
        VStack(spacing: 4) {
            Button {
                if let u = URL(string: "photos-redirect://") { UIApplication.shared.open(u) }
            } label: {
                ZStack {
                    RoundedRectangle(cornerRadius: 6).fill(Self.koyu)
                    if let r = m.sonKayit { Image(uiImage: r).resizable().scaledToFill() }
                }
                .frame(width: 64, height: dikey ? 40 : 28)
                .clipShape(RoundedRectangle(cornerRadius: 6))
            }
            .buttonStyle(.plain)
            Text(m.kalanYazi).font(.system(size: 10, weight: .semibold)).foregroundStyle(.white.opacity(0.84))
                .multilineTextAlignment(.center).lineLimit(2).minimumScaleFactor(0.7)
                .shadow(color: .black.opacity(0.8), radius: 2)
        }
    }

    private func bildirimKutusu(_ b: String) -> some View {
        VStack {
            Text(b).font(.footnote.weight(.semibold))
                .padding(.horizontal, 14).padding(.vertical, 8)
                .background(Capsule().fill(Tema.yuzey))
                .padding(.top, 70)
            Spacer()
        }
        .allowsHitTesting(false)
        .task(id: b) {
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            if m.bildirim == b { m.bildirim = nil }
        }
    }

    // MARK: ayarlar paneli

    private func panelAc(_ s: Monitor.Sekme) {
        sekme = s
        acikParam = nil
        withAnimation(Self.yay) { panelAcik = true }
    }

    private var panel: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 0) {
                        ForEach(Monitor.Sekme.allCases) { s in
                            Button { withAnimation(.snappy(duration: 0.22)) { sekme = s } } label: {
                                Label(s.rawValue, systemImage: s.simge).font(.system(size: 13, weight: .semibold)).tracking(0.6)
                                    .labelStyle(.titleAndIcon)
                                    .foregroundStyle(s == sekme ? .black : .white.opacity(0.8))
                                    .padding(.horizontal, 12).frame(height: 32)
                                    .background(Capsule().fill(s == sekme ? Color.white : Color.white.opacity(0.08)))
                            }
                            .buttonStyle(.plain)
                            .padding(.leading, 6)
                        }
                    }
                }
                Button { withAnimation(Self.yay) { panelAcik = false } } label: {
                    Image(systemName: "xmark").font(.system(size: 18, weight: .semibold)).frame(width: 56, height: 48)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Kapat")
            }
            .frame(height: 56)
            .padding(.leading, 6)
            .overlay(alignment: .top) {
                if !genis { Capsule().fill(Color.white.opacity(0.3)).frame(width: 36, height: 5).padding(.top, 5) }
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 4) {
                    if m.kip == .iki && sekme != .kayit { aciklama("\(m.etkin + 1). bölmenin ayarları (bölmeye dokunarak değiştir)") }
                    sekmeIcerik
                }
                .padding(.horizontal, genis ? 22 : 24).padding(.top, 8).padding(.bottom, 28)
                .frame(maxWidth: 760, alignment: .leading)
                .frame(maxWidth: .infinity)
            }
        }
        .background(.ultraThinMaterial)
        .background(Color(red: 12 / 255, green: 13 / 255, blue: 16 / 255).opacity(genis ? 0.72 : 0.86))
        .environment(\.colorScheme, .dark)
    }

    private func bag<T>(_ k: WritableKeyPath<BolmeAyari, T>) -> Binding<T> {
        Binding(get: { m.ayarlar[m.etkin][keyPath: k] }, set: { m.ayarlar[m.etkin][keyPath: k] = $0 })
    }

    @ViewBuilder private var sekmeIcerik: some View {
        switch sekme {
        case .kayit:
            baslik("GÖRÜNTÜ", ilk: true)
            if m.kontrolVar {
                if m.kayitta { aciklama("Kayıt sürerken çözünürlük ve kare hızı değişmez.") }
                let b = m.boyutlar
                secenek("ÇÖZÜNÜRLÜK", b.map { $0.replacingOccurrences(of: "x", with: "×") }, b.firstIndex(of: m.kamAyar.boyut ?? "1920x1080") ?? 0) {
                    m.kamAyar.boyut = b[$0]; m.kamAyarDegisti(oturumYenile: true)
                }
                let f = m.fpsler
                secenek("KARE HIZI", ["OTO"] + f.map(String.init), m.kamAyar.fps.flatMap { v in f.firstIndex(of: v).map { $0 + 1 } } ?? 0) {
                    m.kamAyar.fps = $0 == 0 ? nil : f[$0 - 1]; m.kamAyarDegisti(oturumYenile: true)
                }
            } else {
                aciklama("USB ve Wi-Fi kaynağında çözünürlük ve kare hızı kaynaktan gelir; kayıt görüntüyü olduğu gibi alır.")
            }
            baslik("DOSYA")
            secenek("KODEK", ["H.264", "H.265 (HEVC)"], m.hevc ? 1 : 0) { m.hevc = $0 == 1 }
            let hizlar = [10, 20, 35, 50, 80, 100, 150]
            secenek("BİT HIZI", hizlar.map { "\($0) Mb/sn" }, hizlar.firstIndex(of: m.mbps) ?? 3) { m.mbps = hizlar[$0] }
            if m.kontrolVar {
                anahtar("GÖRÜNTÜ SABİTLEME", Binding(get: { m.kamAyar.sabitleme }, set: { m.kamAyar.sabitleme = $0; m.kamAyarDegisti(oturumYenile: true) }))
            }
            baslik("SES")
            anahtar("SES KAYDI", $m.sesKayit)
            aciklama("Mikrofon: iPhone/iPad mikrofonu ya da takılı USB ses girişi.")
            baslik("CİHAZ")
            anahtar("EKRAN PARLAKLIĞI EN YÜKSEK", $m.parlaklikTam)
            aciklama("Kayıtlar Fotoğraflar'a gider ve temizdir (odak, zebra, kılavuz, stil kayda girmez). Kayıt düğmesine basılı tutunca ekran görüntüsü alınır. Sürüm \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "") (\(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "")) · güncellemeler TestFlight'tan gelir.")
        case .monitor:
            baslik("ODAK", ilk: true)
            anahtar("ODAK YARDIMI", bag(\.peaking))
            secenek("ODAK RENGİ", ["Kırmızı", "Mavi", "Beyaz", "Sarı"], a.peakRenk) { m.ayarlar[m.etkin].peakRenk = $0 }
            let esik: [Float] = [0.1, 0.18, 0.3]
            secenek("ODAK HASSASİYETİ", ["Hassas", "Normal", "Kaba"], esik.firstIndex { abs($0 - a.peakEsik) < 0.01 } ?? 1) { m.ayarlar[m.etkin].peakEsik = esik[$0] }
            let zum: [Float] = [1, 2, 4]
            secenek("BÜYÜTME", ["1x", "2x", "4x"], zum.firstIndex(of: a.zoom) ?? 0) { m.ayarlar[m.etkin].zoom = zum[$0] }
            baslik("POZLAMA")
            anahtar("ZEBRA", bag(\.zebra))
            let zeb: [Float] = [0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 0.995]
            secenek("ZEBRA SEVİYESİ", ["%70", "%75", "%80", "%85", "%90", "%95", "%100"], zeb.firstIndex { abs($0 - a.zebraEsik) < 0.01 } ?? 5) { m.ayarlar[m.etkin].zebraEsik = zeb[$0] }
            anahtar("FALSE COLOR", bag(\.falseColor))
            anahtar("SİYAH-BEYAZ", bag(\.monokrom))
            baslik("EKRAN")
            secenek("EKRAN DÜZENİ", Monitor.Kip.allCases.map(\.rawValue), Monitor.Kip.allCases.firstIndex(of: m.kip) ?? 0) { m.kipSec(Monitor.Kip.allCases[$0]) }
            if m.kip == .iki { aciklama("İki kaynak: ikinci bölmeye dokunup KAYNAK'tan seç. Aynı anda iki USB/telefon kamerası cihaz destekliyorsa açılır; Wi-Fi kamera her zaman olur.") }
            anahtar("TEMİZ GÖRÜNTÜ", bag(\.temiz))
        case .kompozisyon:
            baslik("AKILLI KADRAJ", ilk: true)
            anahtar("AKILLI YARDIMCI", $m.asistanAcik)
            aciklama("Yüzü ya da en belirgin konuyu bulur, en yakın güçlü noktaya ok gösterir; konu yerine oturunca ibre yeşile döner. Cihazın içinde çalışır. Büyütme açıkken durur.")
            anahtar("KOMPOZİSYON ÖNERİSİ", $m.oneriAcik)
            aciklama("Konuya en az hareketle uyan kılavuzu üstte önerir; dokununca uygulanır.")
            baslik("KOMPOZİSYON")
            secenek("KILAVUZ", KompTur.allCases.map(\.ad), KompTur.allCases.firstIndex(of: m.kompTur) ?? 0) { m.kompTur = KompTur.allCases[$0] }
            if m.kompTur == .spiral || m.kompTur == .ucgen {
                secenek("YÖN", ["Sağ alt", "Sol alt", "Sağ üst", "Sol üst"], m.kompYon) { m.kompYon = $0 }
            }
            anahtar("TERAZİ (UFUK)", $m.teraziAcik)
            baslik("ÇERÇEVE")
            let oran: [Float] = [0, 2.39, 2.35, 2, 1.85, 16 / 9, 4 / 3, 0.8, 9 / 16, 1]
            secenek("KADRAJ ORANI", ["Kapalı", "2,39:1", "2,35:1", "2:1", "1,85:1", "16:9", "4:3", "4:5", "9:16", "1:1"], oran.firstIndex { abs($0 - a.kilavuz) < 0.01 } ?? 0) {
                m.ayarlar[m.etkin].kilavuz = oran[$0]
            }
            let guv: [Float] = [0, 0.9, 0.8]
            secenek("GÜVENLİ ALAN", ["Kapalı", "%90", "%80"], guv.firstIndex { abs($0 - a.guvenli) < 0.01 } ?? 0) { m.ayarlar[m.etkin].guvenli = guv[$0] }
            anahtar("IZGARA (ÜÇTE BİR)", bag(\.izgara))
            anahtar("MERKEZ İŞARETİ", bag(\.merkez))
        case .lut:
            aciklama("Kamera'daki Stiller: hazır görünüm, film reçetesi ya da kendi .cube LUT'un. Etkin bölmeye uygulanır, yalnız ekrana; kayıt temiz kalır.")
            MonitorStilleri(stil: Binding(get: { m.ayarlar[m.etkin].stil ?? Stil() }, set: { m.ayarlar[m.etkin].stil = $0 }),
                            lutAdi: bag(\.lutAdi), lutAcik: bag(\.lutAcik)) { lutAl = true }
        case .olcum:
            baslik("EKRANDA", ilk: true)
            anahtar("HİSTOGRAM (ALT ŞERİT)", $m.koseHisto)
            anahtar("SES GÖSTERGESİ", $m.sesGosterge)
            aciklama("Ses −60…0 dBFS, yeşil → sarı (−12) → kırmızı (−3).")
            baslik("ÖLÇÜM PANELİ")
            aciklama("GÖRÜNTÜ → EKRAN DÜZENİ → Görüntü + ölçümler seçilince yanda açılır. Panelde görünecekler:")
            ForEach(OlcumHesap.Tur.allCases) { t in
                anahtar(t.rawValue.uppercased(with: Locale(identifier: "tr")), Binding(get: { m.olcum.gorunen.contains(t) }, set: { ac in
                    var g = m.olcum.gorunen.filter { $0 != t }
                    if ac { g = OlcumHesap.Tur.allCases.filter { g.contains($0) || $0 == t } }
                    m.olcum.gorunen = g
                }))
            }
        case .kaynak:
            baslik("KAYNAKLAR", ilk: true)
            ForEach(Monitor.cihazListesi(), id: \.uniqueID) { d in
                satir(Monitor.cihazAdi(d), secili: m.kaynaklar[m.etkin] == .cihaz(d.uniqueID) || (m.kaynaklar[m.etkin] == nil && m.etkinCihaz?.uniqueID == d.uniqueID)) { m.cihazSec(d) }
            }
            ForEach(m.bulunanWifi) { w in
                satir("Wi-Fi kamera: \(w.ad)", secili: { if case .wifi(let ad, _) = m.kaynaklar[m.etkin] { return ad == w.ad }; return false }()) { m.wifiSec(w.ad) }
            }
            if UIDevice.current.userInterfaceIdiom == .pad {
                if !Monitor.cihazListesi().contains(where: { $0.deviceType == .external }) {
                    aciklama("USB görüntü kaynağı yok. HDMI→USB çeviriciyi ya da kamerayı USB-C ile tak; fotoğraf makinesini \"USB yayını\" (USB Streaming) moduna al.")
                }
            } else {
                aciklama("iPhone USB kamera kabul etmiyor (Apple sınırı). USB/HDMI kaynak için iPad kullan; iPhone'da telefon kamerası ve Wi-Fi kamera var.")
            }
            HStack {
                TextField("Wi-Fi kamera (192.168.1.20) ya da ağ yayını (https://…/index.m3u8)", text: $adres)
                    .keyboardType(.numbersAndPunctuation).autocorrectionDisabled().textInputAutocapitalization(.never)
                    .padding(.horizontal, 12).frame(height: 44)
                    .background(RoundedRectangle(cornerRadius: 8).fill(Self.koyu2))
                Button("Bağlan") {
                    let y = adres.trimmingCharacters(in: .whitespaces)
                    if y.contains("://") { m.agSec(y) } else { m.wifiSec(y, adres: y) }
                    adres = ""
                }
                    .disabled(adres.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            .padding(.vertical, 8)
            if case .ag(let u) = m.kaynaklar[m.etkin] { satir("Ağ yayını: \(u)", secili: true) {} }
            aciklama("Ağ yayını: HLS (…/index.m3u8) ya da http(s) video; iOS RTSP/RTMP açmaz. Wi-Fi kamera: başka bir iPhone'da UPDATED Kamera → Wi-Fi kamera, Android'de Ayarlar → Wi-Fi kamera ol. Aynı ağdaysa burada kendiliğinden listelenir.")
            baslik("GÖRÜNTÜYÜ ÇEVİR")
            let ana: [Float] = [1, 1.33, 1.5, 1.6, 1.8, 2]
            secenek("ANAMORFİK AÇMA", ["Kapalı", "1,33x", "1,5x", "1,6x", "1,8x", "2x"], ana.firstIndex { abs($0 - a.desqueeze) < 0.01 } ?? 0) { m.ayarlar[m.etkin].desqueeze = ana[$0] }
            secenek("DÖNDÜR", ["0°", "90°", "180°", "270°"], a.dondur / 90) { m.ayarlar[m.etkin].dondur = $0 * 90 }
            anahtar("AYNA", bag(\.ayna))
            anahtar("TERS ÇEVİR", bag(\.cevir))
        }
    }

    /// Grup başlığı: gruplar arası boşluk, ince çizgi
    private func baslik(_ ad: String, ilk: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if !ilk { Rectangle().fill(Color.white.opacity(0.08)).frame(height: 0.5) }
            Text(ad).font(.system(size: 12, weight: .semibold)).tracking(1.4).foregroundStyle(Self.gri)
        }
        .padding(.top, ilk ? 6 : 26).padding(.bottom, 2)
    }

    private func aciklama(_ metin: String) -> some View {
        Text(metin).font(.system(size: 13)).foregroundStyle(Self.gri).padding(.top, 12).padding(.bottom, 6)
    }

    private func etiket(_ ad: String) -> some View {
        Text(ad).font(.system(size: 14, weight: .semibold)).tracking(0.7)
    }

    private func anahtar(_ ad: String, _ deger: Binding<Bool>) -> some View {
        Toggle(isOn: deger) { etiket(ad) }
            .tint(Self.sari)
            .frame(minHeight: 48)
    }

    private func secenek(_ ad: String, _ liste: [String], _ secili: Int, _ degis: @escaping (Int) -> Void) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            etiket(ad)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(Array(liste.enumerated()), id: \.offset) { i, s in cip(s, i == secili) { degis(i) } }
                }
            }
        }
        .padding(.vertical, 8)
    }

    private func satir(_ ad: String, secili: Bool, simge: String? = nil, sil: (() -> Void)? = nil, tik: @escaping () -> Void) -> some View {
        HStack {
            Button(action: tik) {
                HStack(spacing: 10) {
                    if let simge { Image(systemName: simge).foregroundStyle(Self.gri) }
                    Text(ad).font(.system(size: 15, weight: secili ? .bold : .regular)).multilineTextAlignment(.leading)
                    Spacer()
                    if secili { Image(systemName: "checkmark").foregroundStyle(Self.sari) }
                }
                .frame(minHeight: 48)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if let sil {
                Button(action: sil) { Image(systemName: "trash").foregroundStyle(Self.gri).frame(width: 44, height: 44) }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Sil")
            }
        }
        .overlay(alignment: .bottom) { Rectangle().fill(Color.white.opacity(0.08)).frame(height: 1) }
    }

    private func lutlariAl(_ urller: [URL]) {
        var son: String?
        for u in urller {
            let izin = u.startAccessingSecurityScopedResource()
            defer { if izin { u.stopAccessingSecurityScopedResource() } }
            guard let metin = try? String(contentsOf: u, encoding: .utf8) else { m.bildirim = "LUT okunamadı: \(u.lastPathComponent)"; continue }
            do {
                _ = try Lut.oku(ad: u.lastPathComponent, metin: metin)
                let ad = u.deletingPathExtension().lastPathComponent + ".cube"
                try metin.write(to: Lut.klasor.appendingPathComponent(ad), atomically: true, encoding: .utf8)
                son = ad
            } catch {
                m.bildirim = "LUT okunamadı: \(error.localizedDescription)"
            }
        }
        if let son {
            m.ayarlar[m.etkin].lutAdi = son
            m.ayarlar[m.etkin].lutAcik = true
        }
    }
}

/// Kayıt düğmesi (Android KayitDugmesi): beyaz halka içinde kırmızı daire; kayıtta kırmızı kare ve nabız
struct KayitDugmesi: View {
    let kayitta: Bool
    @State private var nabiz = false

    var body: some View {
        GeometryReader { g in
            let s = min(g.size.width, g.size.height)
            ZStack {
                Circle().stroke(.white, lineWidth: s * 0.06)
                RoundedRectangle(cornerRadius: kayitta ? s * 0.08 : s * 0.4)
                    .fill(Color(red: 0.9, green: 0.16, blue: 0.16))
                    .frame(width: kayitta ? s * 0.38 : s * 0.78, height: kayitta ? s * 0.38 : s * 0.78)
                    .opacity(kayitta && nabiz ? 0.55 : 1)
            }
            .frame(width: s, height: s)
            .animation(.easeOut(duration: 0.15), value: kayitta)
        }
        .onChange(of: kayitta) { _, k in
            if k { withAnimation(.easeInOut(duration: 0.7).repeatForever()) { nabiz = true } } else { nabiz = false }
        }
    }
}

/// İki kanal ses göstergesi (dBFS, −60…0): ince dik çizgiler; yeşil → sarı (−12) → kırmızı (−3), yanmayanlar soluk
struct SesGostergesi: View {
    let sol: Float
    let sag: Float

    var body: some View {
        Canvas { c, boyut in
            let n = 30
            let aralik = boyut.width / CGFloat(n)
            for (satir, db) in [sol, sag].enumerated() {
                let y = CGFloat(satir) * boyut.height / 2
                let yanan = Int(((max(-60, min(0, db)) + 60) / 60) * Float(n))
                for i in 0..<n {
                    let seviye = -60 + Float(i) * 60 / Float(n)
                    let renk: Color = i >= yanan ? Color.white.opacity(0.18) : (seviye >= -3 ? .red : (seviye >= -12 ? .yellow : .green))
                    c.fill(Path(CGRect(x: CGFloat(i) * aralik, y: y + 1, width: max(1.5, aralik * 0.45), height: boyut.height / 2 - 3)), with: .color(renk))
                }
            }
        }
        .accessibilityLabel("Ses düzeyi")
    }
}

/// Ufuk çizgisi: telefon düzken yeşil
struct Terazi: View {
    let egim: Double

    var body: some View {
        let duz = abs(egim) < 1
        VStack(spacing: 6) {
            Capsule().fill(duz ? Color.green : .white).frame(width: 160, height: 2)
                .rotationEffect(.degrees(-egim))
            Text(String(format: "%.1f°", egim).replacingOccurrences(of: ".", with: ","))
                .font(.caption.weight(.semibold).monospacedDigit())
                .foregroundStyle(duz ? .green : .white)
        }
        .shadow(color: .black.opacity(0.7), radius: 2)
        .allowsHitTesting(false)
    }
}

/// Zebra simgesi (çapraz çizgili kare)
struct ZebraSimge: View {
    var body: some View {
        Canvas { c, b in
            let r = CGRect(origin: .zero, size: b).insetBy(dx: 1.5, dy: 1.5)
            c.stroke(Path(roundedRect: r, cornerRadius: 3), with: .foreground, lineWidth: 2)
            var p = Path()
            for k in stride(from: -b.width, through: b.width, by: b.width / 3) {
                p.move(to: CGPoint(x: k, y: b.height)); p.addLine(to: CGPoint(x: k + b.width, y: 0))
            }
            c.clip(to: Path(roundedRect: r, cornerRadius: 3))
            c.stroke(p, with: .foreground, lineWidth: 2)
        }
    }
}
