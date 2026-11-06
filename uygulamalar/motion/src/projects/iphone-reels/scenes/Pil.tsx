import React from 'react';
import {useCurrentFrame} from 'remotion';
import {LiquidGlass} from '../../../components/LiquidGlass';
import {EASE, drift, enterP, fadeIn, tween} from '../../../lib/motion-dinamik';
import {INTER, at, cfg} from '../config';
import {Scene, Title, useSafe} from './Shared';

const c = cfg.copy.pil;
const Battery: React.FC<{x: number; y: number; label: string; value: number; start: number; strong: boolean; scale: number}> = ({x, y, label, value, start, strong, scale}) => {
  const f = useCurrentFrame();
  const v = tween(f, start, start + 60, 0, value, EASE.out);
  const fill = v / 40;
  const H = 620;
  return (
    <LiquidGlass x={x} y={y + drift(f, 4, 300, x)} w={300} h={H} r={70} scale={scale * (0.85 + 0.15 * enterP(f, 0))} opacity={fadeIn(f, 0)} hue={strong ? 'mavi' : 'mor'}>
      <div style={{position: 'absolute', left: 18, right: 18, bottom: 18, height: (H - 36) * fill, borderRadius: 54, background: strong ? 'linear-gradient(180deg, #7DD3FC, #2563EB)' : 'rgba(255,255,255,0.28)', boxShadow: strong ? '0 0 40px rgba(37,99,235,0.7)' : 'none'}} />
      <div style={{position: 'absolute', top: 40, width: '100%', textAlign: 'center', fontFamily: INTER, color: '#fff'}}>
        <div style={{fontWeight: 600, fontSize: 36, opacity: 0.85}}>{label}</div>
        <div style={{fontWeight: 800, fontSize: 130, letterSpacing: '-0.05em', lineHeight: 1}}>{Math.round(v)}</div>
        <div style={{fontWeight: 500, fontSize: 32, opacity: 0.8}}>{c.unit}</div>
      </div>
    </LiquidGlass>
  );
};

/** Sahne 4 · Pil: iki cam pil dolar (34 – 31 saat), ardından şarj halkası (15 dk'da %50). */
export const Pil: React.FC = () => {
  const f = useCurrentFrame();
  const L = useSafe();
  const n34 = at('pil', '34');
  const n31 = at('pil', '31');
  const ust = at('pil', 'üstüne');
  const shift = tween(f, ust - 10, ust + 30, 0, 1, EASE.inOut);
  const ring = tween(f, at('pil', '15') , at('pil', '15') + 70, 0, 0.5, EASE.out);
  const mins = Math.round(tween(f, at('pil', '15'), at('pil', '15') + 70, 0, 15, EASE.out));
  const R = 150;
  const C = 2 * Math.PI * R;
  return (
    <Scene hue="mavi" cam={[{f: 0, scale: 1.02}, {f: 570, scale: 1.06}]}>
      <div style={{opacity: 1 - shift}}><Title text={c.title} start={2} size={84} x={L.cx} y={-590} w={L.safeW} /></div>
      <div style={{position: 'absolute', left: 0, top: -340 * shift, transform: `scale(${1 - 0.25 * shift})`, transformOrigin: `${L.cx}px -300px`}}>
        <Battery x={L.cx - 175} y={-60} label="18 Pro" value={c.new} start={n34} strong scale={1} />
        <Battery x={L.cx + 175} y={-60} label="17 Pro" value={c.old} start={n31} strong={false} scale={1} />
      </div>
      {f >= ust && (
        <LiquidGlass x={L.cx} y={270} w={L.safeW} h={380} r={60} opacity={fadeIn(f, ust)} scale={0.9 + 0.1 * enterP(f, ust)}>
          <div style={{display: 'flex', alignItems: 'center', gap: 40, padding: '30px 48px', fontFamily: INTER, color: '#fff'}}>
            <svg width={R * 2 + 30} height={R * 2 + 30}>
              <circle cx={R + 15} cy={R + 15} r={R} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={22} />
              <circle cx={R + 15} cy={R + 15} r={R} fill="none" stroke="#7DD3FC" strokeWidth={22} strokeLinecap="round" strokeDasharray={`${C * ring} ${C}`} transform={`rotate(-90 ${R + 15} ${R + 15})`} style={{filter: 'drop-shadow(0 0 12px rgba(125,211,252,0.8))'}} />
              <text x={R + 15} y={R + 32} textAnchor="middle" fontFamily="Inter" fontWeight={800} fontSize={64} fill="#fff">%{Math.round(ring * 100)}</text>
            </svg>
            <div>
              <div style={{fontWeight: 800, fontSize: 110, letterSpacing: '-0.04em', lineHeight: 1}}>{mins} dk</div>
              <div style={{fontWeight: 500, fontSize: 34, opacity: 0.8, marginTop: 10}}>{c.chargeSub}</div>
            </div>
          </div>
        </LiquidGlass>
      )}
    </Scene>
  );
};
