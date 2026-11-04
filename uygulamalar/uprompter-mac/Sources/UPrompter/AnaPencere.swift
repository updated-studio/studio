import SwiftUI
import AppKit

struct AnaPencere: View {
    var body: some View {
        HStack(spacing: 0) {
            MetinListesi().frame(width: 250)
            Divider()
            Duzenleyici().frame(minWidth: 380, maxWidth: .infinity)
            Divider()
            AyarPaneli().frame(width: 300)
        }
    }
}

struct MetinListesi: View {
    @EnvironmentObject var depo: MetinDeposu

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Metinler").font(.system(size: 20, weight: .bold))
                Spacer()
                Button { depo.ekle() } label: { Image(systemName: "plus") }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                    .help("Yeni metin")
                    .accessibilityLabel("Yeni metin")
            }
            .padding(.horizontal, 14)
            .padding(.top, 16)

            List(selection: $depo.seciliID) {
                ForEach(depo.metinler) { m in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(m.baslik.isEmpty ? "Adsız metin" : m.baslik)
                            .font(.system(size: 13, weight: .semibold))
                            .lineLimit(1)
                        Text(Ozet.sureYazisi(m.govde) + " · " + Ozet.tarih(m.degisti))
                            .font(.system(size: 11))
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 3)
                    .tag(m.id)
                    .contextMenu {
                        Button("Sil", role: .destructive) { depo.sil(m.id) }
                    }
                }
            }
            .listStyle(.sidebar)

            Text("Metinler bu Mac'te saklanır.")
                .font(.system(size: 11))
                .foregroundStyle(.secondary)
                .padding(.horizontal, 14)
                .padding(.bottom, 12)
        }
    }
}

struct Duzenleyici: View {
    @EnvironmentObject var depo: MetinDeposu
    @EnvironmentObject var oturum: Oturum

    var body: some View {
        if let m = depo.secili {
            VStack(alignment: .leading, spacing: 10) {
                TextField("Başlık", text: depo.baslikBaglama(m.id))
                    .textFieldStyle(.plain)
                    .font(.system(size: 24, weight: .bold))
                HStack(spacing: 10) {
                    Text(Ozet.ayrinti(m.govde))
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.tail)
                    Spacer(minLength: 8)
                    Button(oturum.panelGorunur ? "Prompter'ı gizle" : "Prompter'ı göster") {
                        PanelYoneticisi.ortak.degistir()
                    }
                    .fixedSize()
                    Button {
                        oturum.degistir()
                    } label: {
                        Label(oturum.calisiyor ? "Durdur" : "Başlat",
                              systemImage: oturum.calisiyor ? "pause.fill" : "play.fill")
                    }
                    .buttonStyle(.borderedProminent)
                    .keyboardShortcut(.return, modifiers: .command)
                    .fixedSize()
                }
                TextEditor(text: depo.govdeBaglama(m.id))
                    .font(.system(size: 15))
                    .scrollContentBackground(.hidden)
                    .padding(12)
                    .background(RoundedRectangle(cornerRadius: 12).fill(Color(nsColor: .textBackgroundColor)))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(nsColor: .separatorColor)))
                Text("Köşeli parantez içindeki notlar ([DURAKLA] gibi) okunmaz, prompter'da işaret olarak görünür.")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }
            .padding(20)
        } else {
            Text("Soldan bir metin seçin ya da + ile yenisini ekleyin.")
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

struct AyarPaneli: View {
    @EnvironmentObject var ayarlar: Ayarlar
    @EnvironmentObject var oturum: Oturum
    @EnvironmentObject var guncelleyici: Guncelleyici

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Bolum("Kaydırma")
                Picker("Kaydırma", selection: $ayarlar.kip) {
                    ForEach(Kip.allCases) { Text($0.ad).tag($0) }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                if ayarlar.kip == .ses {
                    MotorSecimi()
                    if oturum.mikrofon.sorunlu {
                        MikrofonSorunu(durum: oturum.mikrofon)
                    }
                }
                Kaydirici(ad: "Sabit hız", deger: $ayarlar.hiz, aralik: 10...160, adim: 2, birim: "pt/sn")

                Bolum("Görünüm")
                Kaydirici(ad: "Yazı boyutu", deger: $ayarlar.yaziBoyu, aralik: 16...56, adim: 1, birim: "pt")
                Kaydirici(ad: "Genişlik", deger: $ayarlar.genislik, aralik: 360...1100, adim: 10, birim: "pt")
                Kaydirici(ad: "Görünen satır", deger: $ayarlar.satir, aralik: 2...8, adim: 1, birim: "")

                Bolum("Seçenekler")
                Anahtar(ad: "Ekran paylaşımında gizle", deger: $ayarlar.paylasimdaGizle)
                Anahtar(ad: "Ayna (cam teleprompter için)", deger: $ayarlar.ayna)
                Anahtar(ad: "Başlamadan 3 sn geri sayım", deger: $ayarlar.geriSayim)

                Bolum("Kısayollar (her yerde çalışır)")
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(Array(Kisayollar.liste.enumerated()), id: \.offset) { _, k in
                        HStack {
                            Text(k.simge).font(.system(size: 12, design: .monospaced))
                            Spacer()
                            Text(k.aciklama).font(.system(size: 12)).foregroundStyle(.secondary)
                        }
                    }
                }

                Bolum("Güncelleme")
                Text("Sürüm \(guncelleyici.mevcutSurum) · yapı \(guncelleyici.mevcutYapi)")
                    .font(.system(size: 12, design: .monospaced))
                Anahtar(ad: "Açılışta güncellemeye bak", deger: $ayarlar.otomatikGuncelle)
                Button("Şimdi denetle") {
                    Task { await guncelleyici.denetle(sessiz: false) }
                }
                .disabled(guncelleyici.calisiyor)
                if !guncelleyici.durum.isEmpty {
                    Text(guncelleyici.durum)
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(20)
        }
    }
}

/// Konuşma tanıma motoru seçimi ve motora özel ayarlar.
struct MotorSecimi: View {
    @EnvironmentObject var ayarlar: Ayarlar
    @EnvironmentObject var oturum: Oturum

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Picker("Konuşma tanıma", selection: $ayarlar.motor) {
                ForEach(Motor.allCases) { Text($0.ad).tag($0) }
            }
            .font(.system(size: 13))
            Text(ayarlar.motor.aciklama)
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            if let model = ayarlar.motor.whisperModeli {
                switch oturum.mikrofon {
                case .modelIndiriliyor(let p):
                    ProgressView(value: p) { Text("Model indiriliyor").font(.system(size: 12)) }
                case .modelHazirlaniyor:
                    ProgressView { Text(oturum.mikrofon.yazi).font(.system(size: 12)) }
                        .controlSize(.small)
                default:
                    Text(WhisperKaynagi.indirildiMi(model) ? "Model bu Mac'te hazır." : "Model ilk Başlat'ta indirilecek.")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                }
            }
            if ayarlar.motor == .deepgram {
                SecureField("Deepgram API anahtarı", text: $ayarlar.deepgramAnahtari)
                    .textFieldStyle(.roundedBorder)
                    .font(.system(size: 12))
                Link("Deepgram'da ücretsiz deneme anahtarı al", destination: URL(string: "https://console.deepgram.com/signup")!)
                    .font(.system(size: 12))
            }
        }
    }
}

/// Sese göre kaydırma çalışmadığında ne yapılacağını söyler ve ilgili ayarı açar.
struct MikrofonSorunu: View {
    let durum: MikrofonDurumu

    private var aciklama: String {
        switch durum {
        case .dikteKapali:
            return "Türkçe konuşma tanıma için Mac'te Dikte açık olmalı. Sistem Ayarları › Klavye › Dikte'yi açın, dil olarak Türkçe'yi ekleyin, sonra Başlat'a yeniden basın."
        case .izinYok:
            return "Sistem Ayarları › Gizlilik ve Güvenlik'te Mikrofon ve Konuşma Tanıma altında UPrompter'ı açın."
        case .anahtarYok:
            return "Deepgram'ı kullanmak için yukarıdaki alana API anahtarınızı yapıştırın."
        case .desteklenmiyor:
            return "Bu Mac'te Türkçe konuşma tanıma şu an kullanılamıyor. Dikte'nin açık olduğunu ve internete bağlı olduğunuzu kontrol edin."
        default:
            return durum.yazi
        }
    }

    private var ayarAdresi: String {
        switch durum {
        case .izinYok: return "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
        default: return "x-apple.systempreferences:com.apple.Keyboard-Settings.extension"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(durum.yazi).font(.system(size: 13, weight: .semibold))
            Text(aciklama)
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Button(durum == .izinYok ? "Gizlilik ayarlarını aç" : "Klavye ayarlarını aç") {
                if let url = URL(string: ayarAdresi) { NSWorkspace.shared.open(url) }
            }
            .controlSize(.small)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 10).fill(Color.red.opacity(0.12)))
    }
}

struct Bolum: View {
    let ad: String
    init(_ ad: String) { self.ad = ad }
    var body: some View {
        Text(ad.uppercased(with: Locale(identifier: "tr_TR")))
            .font(.system(size: 11, weight: .semibold))
            .tracking(0.8)
            .foregroundStyle(.secondary)
            .padding(.top, 4)
    }
}

struct Kaydirici: View {
    let ad: String
    @Binding var deger: Double
    let aralik: ClosedRange<Double>
    let adim: Double
    let birim: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(ad).font(.system(size: 13))
                Spacer()
                Text("\(Int(deger.rounded()))" + (birim.isEmpty ? "" : " " + birim))
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(.secondary)
            }
            Slider(value: Binding(
                get: { deger },
                set: { deger = min(aralik.upperBound, max(aralik.lowerBound, ($0 / adim).rounded() * adim)) }
            ), in: aralik)
        }
    }
}

struct Anahtar: View {
    let ad: String
    @Binding var deger: Bool

    var body: some View {
        Toggle(isOn: $deger) {
            Text(ad).font(.system(size: 13))
        }
        .toggleStyle(.switch)
        .controlSize(.small)
    }
}
