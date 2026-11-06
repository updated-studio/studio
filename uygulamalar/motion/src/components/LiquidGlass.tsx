import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';

/**
 * Liquid Glass (Apple iOS 26 tarzı) — kodla:
 *  1) Panel, arkasındaki zemini KENDİ İÇİNDE yeniden çizer: hafif büyütülmüş (mercek), bükülmüş (kırılma, SVG displacement),
 *     bulanık ve doygun. Böylece cam gerçekten arkasını "kırıyor" gibi görünür (CSS backdrop-filter bunu yapamaz).
 *  2) Kenarda ışık: köşegen beyaz kenar (rim), üstte ince parlama, içte yumuşak ışık.
 *  3) Yavaş gezen parlak bir yansıma şeridi.
 * Koşul: zemin (<Backdrop>) kare numarasının saf fonksiyonu ve panel ile AYNI koordinat uzayında (Stage merkezi) olmalı.
 */
export const GlassDefs: React.FC = () => (
  <svg width={0} height={0} style={{position: 'absolute'}}>
    <filter id="lg-refract" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.006 0.009" numOctaves={2} seed={7} result="n" />
      <feDisplacementMap in="SourceGraphic" in2="n" scale={46} xChannelSelector="R" yChannelSelector="G" />
    </filter>
  </svg>
);

/** Canlı, yavaş akan renk zemini — camın kırabileceği bir şey olsun. */
export const Backdrop: React.FC<{hue?: 'mavi' | 'mor' | 'turuncu'}> = ({hue = 'mavi'}) => {
  const f = useCurrentFrame();
  const {width: W, height: H} = useVideoConfig();
  const s = (p: number, a: number) => Math.sin(f / p + a);
  const pal = {mavi: ['#2563EB', '#22D3EE', '#7C3AED', '#FF6B1A'], mor: ['#7C3AED', '#2563EB', '#EC4899', '#22D3EE'], turuncu: ['#FF6B1A', '#F43F5E', '#2563EB', '#FACC15']}[hue];
  return (
    <div style={{position: 'absolute', left: -W / 2, top: -H / 2, width: W, height: H, background: '#04060C', overflow: 'hidden'}}>
      <div style={{position: 'absolute', inset: 0, background: `
        radial-gradient(42% 30% at ${30 + 12 * s(140, 0)}% ${22 + 8 * s(170, 1)}%, ${pal[0]}cc, transparent 70%),
        radial-gradient(36% 26% at ${78 + 10 * s(160, 2)}% ${40 + 10 * s(130, 3)}%, ${pal[1]}99, transparent 70%),
        radial-gradient(48% 34% at ${45 + 14 * s(190, 4)}% ${78 + 8 * s(150, 5)}%, ${pal[2]}bb, transparent 72%),
        radial-gradient(26% 18% at ${12 + 8 * s(120, 6)}% ${62 + 10 * s(180, 7)}%, ${pal[3]}88, transparent 70%)`}} />
      <div style={{position: 'absolute', inset: 0, opacity: 0.5,
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
        backgroundSize: '90px 90px', backgroundPosition: `${(f * 0.3) % 90}px ${(f * 0.5) % 90}px`}} />
    </div>
  );
};

export const LiquidGlass: React.FC<{
  x: number; y: number; w: number; h: number; r?: number; scale?: number; opacity?: number; mag?: number; blur?: number;
  hue?: 'mavi' | 'mor' | 'turuncu'; children?: React.ReactNode; style?: React.CSSProperties; dark?: number;
}> = ({x, y, w, h, r = 48, scale = 1, opacity = 1, mag = 1.12, blur = 10, hue = 'mavi', children, style, dark = 0.18}) => {
  const f = useCurrentFrame();
  const {width: W, height: H} = useVideoConfig();
  const left = x - w / 2;
  const top = y - h / 2;
  const sheen = ((f * 0.9) % (w + h + 600)) - 300;
  return (
    <div style={{position: 'absolute', left, top, width: w, height: h, borderRadius: r, transform: `scale(${scale})`, opacity,
      boxShadow: '0 40px 90px rgba(0,0,0,0.45), 0 10px 24px rgba(0,0,0,0.3)', ...style}}>
      <div style={{position: 'absolute', inset: 0, borderRadius: r, overflow: 'hidden'}}>
        <div style={{position: 'absolute', left: -W / 2 - left, top: -H / 2 - top, width: W, height: H, transform: `scale(${mag})`,
          transformOrigin: `${x + W / 2}px ${y + H / 2}px`, filter: `url(#lg-refract) blur(${blur}px) saturate(1.8) brightness(1.18)`}}>
          <div style={{position: 'absolute', left: W / 2, top: H / 2}}><Backdrop hue={hue} /></div>
        </div>
        <div style={{position: 'absolute', inset: 0, background: `linear-gradient(165deg, rgba(255,255,255,0.20), rgba(255,255,255,0.04) 42%, rgba(0,0,0,${dark}) 100%)`}} />
        <div style={{position: 'absolute', left: sheen, top: -h, width: 90, height: h * 3, transform: 'rotate(28deg)', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.10), transparent)'}} />
      </div>
      <div style={{position: 'absolute', inset: 0, borderRadius: r, padding: 1.6, pointerEvents: 'none',
        background: 'linear-gradient(140deg, rgba(255,255,255,0.95), rgba(255,255,255,0.10) 30%, rgba(255,255,255,0.04) 62%, rgba(255,255,255,0.55))',
        WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude'}} />
      <div style={{position: 'absolute', inset: 0, borderRadius: r, pointerEvents: 'none', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.6), inset 0 -1px 1px rgba(255,255,255,0.12), inset 0 0 40px rgba(255,255,255,0.07)'}} />
      <div style={{position: 'relative', width: '100%', height: '100%'}}>{children}</div>
    </div>
  );
};
