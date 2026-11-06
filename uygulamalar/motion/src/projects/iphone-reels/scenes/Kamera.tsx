import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {LiquidGlass} from '../../../components/LiquidGlass';
import {EASE, drift, enterP, exitP, fadeIn} from '../../../lib/motion-dinamik';
import {INTER, at, cfg} from '../config';
import {Pill, Scene, Title, useSafe} from './Shared';

const c = cfg.copy.kamera;
const OPEN: Record<string, number> = {'ƒ/1.48': 0.66, 'ƒ/1.8': 0.56, 'ƒ/2.8': 0.4, 'ƒ/4.0': 0.26};

const Iris: React.FC<{open: number; size: number}> = ({open, size}) => {
  const R = size / 2;
  const blades = Array.from({length: 6}, (_, i) => {
    const rot = (0.66 - open) * 70;
    const a = ((i * 60 + rot) * Math.PI) / 180;
    const r = R * open;
    // her bıçak: açıklığın bir kenarından dış çembere uzanan yay biçimli dilim
    const p1 = [R + r * Math.cos(a), R + r * Math.sin(a)];
    const a2 = a + Math.PI / 3;
    const p2 = [R + r * Math.cos(a2), R + r * Math.sin(a2)];
    const o1 = [R + R * 1.05 * Math.cos(a + 1.5), R + R * 1.05 * Math.sin(a + 1.5)];
    const o2 = [R + R * 1.05 * Math.cos(a + 0.4), R + R * 1.05 * Math.sin(a + 0.4)];
    const shade = 20 + i * 3;
    return <path key={i} d={`M${p1} L${p2} L${o1} L${o2} Z`} fill={`rgb(${shade},${shade},${shade + 4})`} stroke="rgba(255,255,255,0.10)" strokeWidth={1.5} />;
  });
  return (
    <svg width={size} height={size} style={{display: 'block', borderRadius: '50%'}}>
      <defs>
        <radialGradient id="ln" cx="38%" cy="34%" r="75%"><stop offset="0%" stopColor="#9DB8FF" /><stop offset="35%" stopColor="#3B6CF6" /><stop offset="75%" stopColor="#0E1F5C" /><stop offset="100%" stopColor="#020617" /></radialGradient>
        <clipPath id="cc"><circle cx={R} cy={R} r={R} /></clipPath>
      </defs>
      <g clipPath="url(#cc)"><circle cx={R} cy={R} r={R} fill="url(#ln)" />{blades}</g>
      <circle cx={R * 0.78} cy={R * 0.72} r={R * 0.1} fill="rgba(255,255,255,0.35)" />
    </svg>
  );
};

/** Sahne 3 · "Asıl fark kamerada" → cam mercek içinde diyafram; ƒ/1.48'den ƒ/4'e, sesle aynı anda. */
export const Kamera: React.FC = () => {
  const f = useCurrentFrame();
  const L = useSafe();
  const ana = at('kamera', 'ana');
  const fStart = at('kamera', 'f', 0);
  const dorde = at('kamera', 'dörde');
  const yani = at('kamera', 'yani');
  const grup = at('kamera', 'grup');
  // diyafram: ƒ/1.48 → ƒ/4 (seste), sonra "karanlıkta" açık, "grup" kapalı
  const open = interpolate(f, [fStart, dorde + 10, yani, yani + 24, grup, grup + 24], [0.66, 0.26, 0.26, 0.66, 0.66, 0.26], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.inOut});
  const stop = Object.entries(OPEN).reduce((best, [k, v]) => (Math.abs(v - open) < Math.abs(OPEN[best] - open) ? k : best), 'ƒ/1.48');
  const leadOut = exitP(f, ana - 8);
  const lp = enterP(f, ana, 34);
  return (
    <Scene hue="mavi" cam={[{f: 0, scale: 1.0}, {f: ana, scale: 1.0}, {f: ana + 60, scale: 1.04}, {f: 732, scale: 1.07}]}>
      <div style={{opacity: 1 - leadOut}}><Title text={c.lead} start={4} size={120} x={L.cx} y={-200} w={L.safeW} /></div>
      {f >= ana - 4 && (
        <>
          <Title text={c.title} start={ana} size={92} x={L.cx} y={-590} w={L.safeW} />
          <LiquidGlass x={L.cx} y={-170 + drift(f, 4, 320)} w={600} h={600} r={300} scale={0.7 + 0.3 * lp} opacity={fadeIn(f, ana)} mag={1.25}>
            <div style={{position: 'absolute', inset: 42}}><Iris open={open} size={516} /></div>
          </LiquidGlass>
          <div style={{position: 'absolute', left: L.cx - 300, width: 600, top: 150, textAlign: 'center', fontFamily: INTER, color: '#fff', opacity: fadeIn(f, ana + 10)}}>
            <div style={{fontWeight: 800, fontSize: 96, letterSpacing: '-0.03em'}}>{stop}</div>
            <div style={{fontWeight: 500, fontSize: 32, opacity: 0.75}}>{c.label}</div>
          </div>
        </>
      )}
      <Pill text={c.a} x={L.cx} y={442} w={L.safeW} start={yani} size={38} />
      {f >= grup && <Pill text={c.b} x={L.cx} y={442} w={L.safeW} start={grup} size={38} hue="mor" />}
      <Pill text={c.old} x={L.cx} y={348} w={440} start={at('kamera', 'değişken') + 10} size={30} hue="turuncu" />
    </Scene>
  );
};
