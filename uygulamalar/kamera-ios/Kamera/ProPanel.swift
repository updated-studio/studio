import SwiftUI

/// PRO MODLAR: 3×3 mod kartları (koyu yarı saydam zemin)
struct ProModSecici: View {
    @ObservedObject var kamera: Kamera
    var secildi: (ProMod) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                ForEach(ProMod.allCases) { m in
                    Button { secildi(m) } label: {
                        VStack(spacing: 6) {
                            Image(systemName: m.simge).font(.system(size: 22, weight: .semibold))
                            Text(m.ad).font(.caption.weight(.semibold)).lineLimit(1).minimumScaleFactor(0.8)
                        }
                        .foregroundStyle(kamera.proMod == m ? Tema.sari : .white)
                        .frame(maxWidth: .infinity, minHeight: 68)
                        .background(RoundedRectangle(cornerRadius: 12).fill(Color.white.opacity(kamera.proMod == m ? 0.14 : 0.06)))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(kamera.proMod == m ? Tema.sari : .clear, lineWidth: 1.5))
                    }
                }
            }
            Text("Seçili moda tekrar dokun: normal fotoğrafa döner").font(.caption2).foregroundStyle(Tema.metin2)
                .frame(maxWidth: .infinity)
        }
        .padding(.horizontal, 4)
    }
}

/// Mod seçince çıkan uyarı (tripod vb.); boşluğa dokununca kapanır
struct ProUyari: View {
    let mod: ProMod
    var kapat: () -> Void

    var body: some View {
        ZStack {
            Color.black.opacity(0.45).ignoresSafeArea().onTapGesture(perform: kapat)
            VStack(spacing: 10) {
                Image(systemName: mod.simge).font(.system(size: 30, weight: .semibold)).foregroundStyle(Tema.sari)
                Text(mod.ad).font(.headline)
                Text(mod.uyari).font(.subheadline).multilineTextAlignment(.center).foregroundStyle(Tema.metin2)
                Text("Kapatmak için boş bir yere dokunun").font(.caption2).foregroundStyle(Tema.metin2.opacity(0.7)).padding(.top, 4)
            }
            .padding(22)
            .frame(maxWidth: 320)
            .background(RoundedRectangle(cornerRadius: 18).fill(Tema.yuzey))
            .onTapGesture(perform: kapat)
        }
    }
}

/// Özelleştir: amiral gemisi telefonların Pro yazımı (ISO, S, EV, WB, AF/MF, T), yanında tek kelime Türkçe karşılığı; hazır seçenekler
struct ProOzellestir: View {
    @ObservedObject var kamera: Kamera

    private var a: ProAyar { kamera.proAyar }
    private func degistir(_ f: (inout ProAyar) -> Void) { var y = kamera.proAyar; f(&y); kamera.proAyarDegistir(y) }

    /// Telefonun baz ISO'su listenin başına, sonra hazır basamaklar (telefonun aralığında)
    private var isolar: [Float?] {
        let baz = kamera.bazIso
        guard baz > 0 else { return ProMod.ISOLAR }
        let ust = kamera.isoDegerleri.last ?? 6400
        let ustler: [Float?] = ProMod.ISOLAR.compactMap { $0 }.filter { $0 > baz * 1.05 && $0 <= ust }.map { Optional($0) }
        return [nil, baz] + ustler
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(kamera.proMod.ad.uppercased()).font(.caption.weight(.bold)).foregroundStyle(Tema.metin2)
                Spacer()
                if a != kamera.proMod.varsayilan {
                    Button("Varsayılana dön") { kamera.proVarsayilan() }.font(.caption.weight(.semibold)).foregroundStyle(Tema.sari)
                }
            }
            satir("ISO", "Duyarlılık", isolar, secili: a.iso, yazi: ProMod.isoYazi, baz: { $0 != nil && $0 == kamera.bazIso }) { v in degistir { $0.iso = v } }
            satir("S", "Enstantane", ProMod.ENSTLER, secili: a.enst, yazi: ProMod.enstYazi) { v in degistir { $0.enst = v } }
            if a.iso == nil && a.enst == nil {
                satir("EV", "Telafi", ProMod.EVLER, secili: a.ev, yazi: ProMod.evYazi) { v in degistir { $0.ev = v } }
            }
            if !kamera.onde, kamera.zoomDuraklari.count > 1 {
                let varsayilan = Double(kamera.proMod.tele ? (kamera.zoomDuraklari.last ?? 1) : 1)
                satir("LENS", "Mercek", kamera.zoomDuraklari.map { Double($0) }, secili: a.mercek ?? varsayilan,
                      yazi: { AnaEkran.fmt(CGFloat($0)) + "×" }) { v in degistir { $0.mercek = v } }
            }
            satir("WB", "Renk", ProMod.BDLER, secili: a.bd, yazi: ProMod.bdYazi) { v in degistir { $0.bd = v } }
            satir("AF/MF", "Odak", ProAyar.Odak.allCases, secili: a.odak, yazi: ProMod.odakYazi) { v in degistir { $0.odak = v } }
            if kamera.proMod.sureVar {
                satir("T", "Süre", ProMod.SURELER, secili: a.sure, yazi: ProMod.sureYazi) { v in degistir { $0.sure = v } }
            }
            satir("⏱", "Zamanlayıcı", ProMod.ZAMANLAR, secili: a.zamanlayici, yazi: ProMod.zamanYazi) { v in degistir { $0.zamanlayici = v } }
            if let b = kamera.proBirlestirilecek {
                Text(b == .enParlak ? "Kareler üst üste bindirilir (ışık izleri birikir)." : "Telefon bu süreyi tek karede veremiyor; kareler birleştirilir.")
                    .font(.caption2).foregroundStyle(Tema.metin2)
            }
        }
        .padding(.horizontal, 4)
    }

    private func satir<T: Equatable>(_ ad: String, _ tr: String, _ secenekler: [T], secili: T, yazi: @escaping (T) -> String,
                                     baz: @escaping (T) -> Bool = { _ in false }, sec: @escaping (T) -> Void) -> some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 0) {
                Text(ad).font(Tema.mono)
                Text(tr).font(.system(size: 9, weight: .medium)).foregroundStyle(Tema.metin2)
            }
            .frame(width: 66, alignment: .leading)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(Array(secenekler.enumerated()), id: \.offset) { _, v in
                        let s = v == secili, b = baz(v)
                        Button { sec(v) } label: {
                            VStack(spacing: 0) {
                                Text(yazi(v)).font(Tema.mono)
                                if b { Text("baz").font(.system(size: 9, weight: .semibold)) }
                            }
                            .foregroundStyle(s ? .black : (b ? Tema.baz : .white))
                            .padding(.horizontal, 10)
                            .frame(minHeight: 34)
                            .background(Capsule().fill(s ? (b ? Tema.baz : Tema.sari) : Color.white.opacity(0.1)))
                        }
                    }
                }
            }
        }
    }
}
