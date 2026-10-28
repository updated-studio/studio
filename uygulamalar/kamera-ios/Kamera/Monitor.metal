#include <metal_stdlib>
using namespace metal;

// Monitör araçları — Android MonitorGorunum.kt'deki PARCA gölgelendiricisinin birebir karşılığı.
// Sıra: dönüş/ayna/büyütme → kaynak → LUT → mono → false color | zebra | peaking → kılavuzlar.
// uv: sol üst (0,0), sağ alt (1,1).

struct MonitorAyar {
    float lutBoyut; int lutAcik;
    int peaking; float peakEsik; float peakR, peakG, peakB;
    int zebra; float zebraEsik; int sahte; int mono;
    float zoom; int ayna; int cevir; int dondur;
    float kilavuz; int izgara; int merkez; float guvenli;
    float oran; float pikselX, pikselY; float cikisX, cikisY;
};

struct KoseCikti { float4 konum [[position]]; float2 uv; };

vertex KoseCikti monitorKose(uint vid [[vertex_id]]) {
    float2 k = float2((vid & 1) ? 1.0 : -1.0, (vid & 2) ? -1.0 : 1.0);
    KoseCikti c;
    c.konum = float4(k, 0.0, 1.0);
    c.uv = float2(k.x * 0.5 + 0.5, 0.5 - k.y * 0.5);
    return c;
}

constexpr sampler orneyici(filter::linear, address::clamp_to_edge);

static float2 kaynakUv(float2 uv, constant MonitorAyar &a) {
    uv = (uv - 0.5) / a.zoom + 0.5;
    if (a.ayna == 1) uv.x = 1.0 - uv.x;
    if (a.cevir == 1) uv.y = 1.0 - uv.y;
    // Saat yönünde dönüş: ekrandaki nokta kaynağın hangi noktası
    if (a.dondur == 1) uv = float2(uv.y, 1.0 - uv.x);
    else if (a.dondur == 2) uv = float2(1.0 - uv.x, 1.0 - uv.y);
    else if (a.dondur == 3) uv = float2(1.0 - uv.y, uv.x);
    return uv;
}

static float3 al(texture2d<float> t, float2 uv, constant MonitorAyar &a) { return t.sample(orneyici, kaynakUv(uv, a)).rgb; }

static float parlak(float3 c) { return dot(c, float3(0.2126, 0.7152, 0.0722)); }

static float3 sahteRenk(float y) {
    // ARRI benzeri false color: mor kırpılmış siyah, mavi gölge, yeşil %18 gri, pembe ten, sarı/kırmızı patlama
    if (y < 0.025) return float3(0.5, 0.0, 0.6);
    if (y < 0.10) return float3(0.1, 0.3, 0.9);
    if (y < 0.38) return float3(y * 0.8);
    if (y < 0.48) return float3(0.1, 0.75, 0.25);
    if (y < 0.56) return float3(y * 0.8);
    if (y < 0.68) return float3(0.95, 0.55, 0.7);
    if (y < 0.94) return float3(y * 0.8);
    if (y < 0.99) return float3(1.0, 0.85, 0.0);
    return float3(1.0, 0.0, 0.0);
}

fragment float4 monitorParca(KoseCikti g [[stage_in]],
                             texture2d<float> kaynak [[texture(0)]],
                             texture3d<float> lut [[texture(1)]],
                             constant MonitorAyar &a [[buffer(0)]]) {
    float2 uv = g.uv;
    float3 c = al(kaynak, uv, a);
    if (a.lutAcik == 1) {
        float s = a.lutBoyut;
        c = lut.sample(orneyici, clamp(c, 0.0, 1.0) * ((s - 1.0) / s) + 0.5 / s).rgb;
    }
    if (a.mono == 1) c = float3(parlak(c));
    float y = parlak(c);
    if (a.sahte == 1) c = sahteRenk(y);
    if (a.zebra == 1 && y >= a.zebraEsik) {
        float serit = fmod(g.konum.x + g.konum.y, 16.0);
        if (serit < 7.0) c = mix(c, float3(1.0), 0.85);
    }
    if (a.peaking == 1) {
        float2 d = float2(a.pikselX, a.pikselY) * 1.5 / a.zoom;
        float tl = parlak(al(kaynak, uv + float2(-d.x, -d.y), a)), t = parlak(al(kaynak, uv + float2(0.0, -d.y), a)), tr = parlak(al(kaynak, uv + float2(d.x, -d.y), a));
        float l = parlak(al(kaynak, uv - float2(d.x, 0.0), a)), r = parlak(al(kaynak, uv + float2(d.x, 0.0), a));
        float bl = parlak(al(kaynak, uv + float2(-d.x, d.y), a)), b = parlak(al(kaynak, uv + float2(0.0, d.y), a)), br = parlak(al(kaynak, uv + d, a));
        float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br, gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
        float gg = sqrt(gx * gx + gy * gy);
        if (gg > a.peakEsik * 2.0) c = mix(c, float3(a.peakR, a.peakG, a.peakB), clamp((gg - a.peakEsik * 2.0) * 6.0, 0.0, 1.0));
    }
    // Kadraj kılavuzu: hedef oranın dışı karartılır, sınırına çizgi
    float2 px = 1.0 / float2(a.cikisX, a.cikisY);
    if (a.kilavuz > 0.0) {
        float kx = 1.0, ky = 1.0;
        if (a.kilavuz > a.oran) ky = a.oran / a.kilavuz; else kx = a.kilavuz / a.oran;
        float2 m = abs(uv - 0.5) * 2.0;
        if (m.x > kx || m.y > ky) c *= 0.35;
        else if (m.x > kx - px.x * 4.0 || m.y > ky - px.y * 4.0) c = mix(c, float3(1.0), 0.8);
    }
    if (a.guvenli > 0.0) {
        float2 m = abs(uv - 0.5) * 2.0;
        if ((abs(m.x - a.guvenli) < px.x * 3.0 && m.y < a.guvenli) || (abs(m.y - a.guvenli) < px.y * 3.0 && m.x < a.guvenli)) c = mix(c, float3(1.0, 0.85, 0.2), 0.8);
    }
    if (a.izgara == 1) {
        float2 g3 = abs(fract(uv * 3.0 + 0.5) - 0.5) / 3.0;
        if (g3.x < px.x * 1.5 || g3.y < px.y * 1.5) c = mix(c, float3(1.0), 0.5);
    }
    if (a.merkez == 1) {
        float2 m = abs(uv - 0.5) * float2(a.cikisX, a.cikisY);
        if ((m.x < 1.5 && m.y < 18.0) || (m.y < 1.5 && m.x < 18.0)) c = float3(1.0);
    }
    return float4(c, 1.0);
}
