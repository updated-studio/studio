import React from 'react';
import {Img, staticFile, useCurrentFrame} from 'remotion';
import {Stage} from '../../../components/Stage';
import {Camera, CamKey} from '../../../components/Camera';
import {Backdrop, GlassDefs, LiquidGlass} from '../../../components/LiquidGlass';
import {useLayout} from '../../../lib/layout';
import {drift, enterP, fadeIn} from '../../../lib/motion-dinamik';
import {INTER} from '../config';

export const Scene: React.FC<{cam?: CamKey[]; hue?: 'mavi' | 'mor' | 'turuncu'; children: React.ReactNode}> = ({cam = [{f: 0, scale: 1}, {f: 600, scale: 1.04}], hue = 'mavi', children}) => (
  <Stage bg="#04060C">
    <GlassDefs />
    <Camera keys={cam} microPush={0}>
      <Backdrop hue={hue} />
      {children}
    </Camera>
  </Stage>
);

/** Kelime kelime giren büyük başlık (overshoot), Inter. */
export const Title: React.FC<{text: string; start: number; size: number; x?: number; y: number; w?: number; color?: string; weight?: number; align?: 'left' | 'center'}> = ({
  text, start, size, x = 0, y, w = 900, color = '#fff', weight = 800, align = 'center',
}) => {
  const f = useCurrentFrame();
  return (
    <div lang="tr" style={{position: 'absolute', left: x - w / 2, top: y, width: w, textAlign: align, fontFamily: INTER, fontWeight: weight, fontSize: size, lineHeight: 1.08, letterSpacing: '-0.035em', color}}>
      {text.split(' ').map((word, i) => {
        const s = start + i * 4;
        return (
          <span key={i} style={{display: 'inline-block', marginRight: '0.24em', opacity: fadeIn(f, s), transform: `translateY(${(1 - enterP(f, s)) * size * 0.6}px) scale(${0.9 + 0.1 * enterP(f, s)})`}}>
            {word}
          </span>
        );
      })}
    </div>
  );
};

/** Liquid glass hap (kısa bilgi satırı) — girişte yaylanır, sonra hafif süzülür. */
export const Pill: React.FC<{text: string; x: number; y: number; w: number; start: number; size?: number; hue?: 'mavi' | 'mor' | 'turuncu'}> = ({text, x, y, w, start, size = 42, hue}) => {
  const f = useCurrentFrame();
  const p = enterP(f, start);
  if (f < start) return null;
  return (
    <LiquidGlass x={x} y={y + (1 - p) * 60 + drift(f, 3, 280, x)} w={w} h={size * 2.2} r={size * 1.1} scale={0.85 + 0.15 * p} opacity={fadeIn(f, start)} hue={hue}>
      <div style={{height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: INTER, fontWeight: 600, fontSize: size, color: '#fff', letterSpacing: '-0.01em'}}>{text}</div>
    </LiquidGlass>
  );
};

/** Telefon silueti (vektör, cam). Kamera platosu + Dynamic Island. */
export const Phone: React.FC<{x: number; y: number; w: number; scale?: number; opacity?: number; label?: string; island?: number; hue?: 'mavi' | 'mor' | 'turuncu'}> = ({x, y, w, scale = 1, opacity = 1, label, island = 0.34, hue}) => {
  const h = w * 2.05;
  return (
    <LiquidGlass x={x} y={y} w={w} h={h} r={w * 0.18} scale={scale} opacity={opacity} hue={hue} mag={1.18} blur={6}>
      <div style={{position: 'absolute', left: '50%', top: w * 0.07, width: w * island, height: w * 0.09, transform: 'translateX(-50%)', borderRadius: 99, background: '#000'}} />
      {label && <div style={{position: 'absolute', bottom: w * 0.1, width: '100%', textAlign: 'center', fontFamily: INTER, fontWeight: 700, fontSize: w * 0.13, color: '#fff', letterSpacing: '-0.03em'}}>{label}</div>}
    </LiquidGlass>
  );
};

export const useSafe = () => {
  const L = useLayout();
  return {...L, cx: (L.safe.left + L.safe.right) / 2};
};

/** Gerçek ürün/örnek fotoğrafı cam çerçevede; künye (kit §8: "Görsel: Apple"). */
export const PhotoCard: React.FC<{src: string; x: number; y: number; w: number; h: number; r?: number; start?: number; fit?: 'cover' | 'contain'; pos?: string; label?: string; kunye?: boolean | string; hue?: 'mavi' | 'mor' | 'turuncu'; z?: number}> = ({
  src, x, y, w, h, r = 56, start = 0, fit = 'cover', pos = 'center', label, kunye = true, hue, z,
}) => {
  const f = useCurrentFrame();
  const p = enterP(f, start, 34);
  return (
    <LiquidGlass x={x} y={y + (1 - p) * 80 + drift(f, 3, 320, x)} w={w} h={h} r={r} scale={0.88 + 0.12 * p} opacity={fadeIn(f, start)} hue={hue} style={{zIndex: z}}>
      <Img src={staticFile(src)} style={{position: 'absolute', inset: 10, width: w - 20, height: h - 20, objectFit: fit, objectPosition: pos, borderRadius: r - 10}} />
      {label && <div style={{position: 'absolute', left: 0, right: 0, bottom: 26, textAlign: 'center', fontFamily: INTER, fontWeight: 700, fontSize: 40, color: '#fff', letterSpacing: '-0.02em', textShadow: '0 2px 12px rgba(0,0,0,0.6)'}}>{label}</div>}
      {kunye && <div style={{position: 'absolute', right: 22, top: 18, fontFamily: INTER, fontWeight: 500, fontSize: 20, color: 'rgba(255,255,255,0.75)', textShadow: '0 1px 6px rgba(0,0,0,0.7)'}}>{typeof kunye === 'string' ? kunye : 'Görsel: Apple'}</div>}
    </LiquidGlass>
  );
};
