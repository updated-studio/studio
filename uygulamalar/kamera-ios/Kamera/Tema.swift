import SwiftUI

/// Android sürümündeki Tema.kt ile aynı renkler: koyu cam yüzeyler, turuncu vurgu (UPDATED marka rengi).
enum Tema {
    static let zemin = Color(red: 12/255, green: 13/255, blue: 16/255)
    static let yuzey = Color(red: 22/255, green: 24/255, blue: 28/255).opacity(0.84)
    static let metin2 = Color.white.opacity(0.67)
    static let vurgu = Color(red: 1, green: 107/255, blue: 26/255)
    static let baz = Color(red: 1, green: 176/255, blue: 32/255)
    static let mono = Font.system(.footnote, design: .monospaced).weight(.semibold)
}
