import React from 'react';
import {useCurrentFrame} from 'remotion';
import {LiquidGlass} from '../../../components/LiquidGlass';
import {EASE, drift, enterP, fadeIn, tween} from '../../../lib/motion-dinamik';
import {INTER, at, cfg} from '../config';
import {Scene, useSafe} from './Shared';

const c = cfg.copy.cip;
/** Sahne 2 · A20 Pro — cam çip karesi, ardından GPU çubukları ve %40 sayacı. */
export const Cip: React.FC = () => {
  const f = useCurrentFrame();
  const L = useSafe();
  const gpu = Math.max(30, at('cip', 'grafik') - 10);
  const p = enterP(f, 4, 32);
  const grow = tween(f, gpu + 20, gpu + 80, 0, 1, EASE.out);
  const count = Math.round(tween(f, gpu + 20, gpu + 80, 0, c.gain, EASE.out));
  const barW = L.safeW - 120;
  return (
    <Scene hue="mor" cam={[{f: 0, scale: 1.02}, {f: 348, scale: 1.06}]}>
      <LiquidGlass x={L.cx} y={-250 + drift(f, 5, 300)} w={520} h={520} r={110} scale={0.6 + 0.4 * p} opacity={fadeIn(f, 4)} hue="mor" mag={1.2}>
        <div style={{position: 'absolute', inset: 46, borderRadius: 70, border: '2px solid rgba(255,255,255,0.22)'}} />
        <div style={{height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: INTER, color: '#fff'}}>
          <div style={{fontWeight: 800, fontSize: 104, letterSpacing: '-0.04em'}}>{c.chip}</div>
          <div style={{fontWeight: 500, fontSize: 34, opacity: 0.8, marginTop: 6}}>{c.chipSub}</div>
        </div>
      </LiquidGlass>
      <LiquidGlass x={L.cx} y={300} w={L.safeW} h={360} r={56} opacity={fadeIn(f, gpu)} scale={0.92 + 0.08 * enterP(f, gpu)} hue="mor">
        <div style={{padding: '44px 56px', fontFamily: INTER, color: '#fff'}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline'}}>
            <span style={{fontWeight: 600, fontSize: 40, opacity: 0.8}}>{c.gpu}</span>
            <span style={{fontWeight: 800, fontSize: 88, letterSpacing: '-0.04em'}}>+%{count}</span>
          </div>
          {[{n: c.chip, v: 1.4, col: '#fff'}, {n: c.old, v: 1, col: 'rgba(255,255,255,0.35)'}].map((b, i) => (
            <div key={b.n} style={{marginTop: i ? 18 : 22}}>
              <div style={{fontWeight: 500, fontSize: 30, opacity: 0.75, marginBottom: 8}}>{b.n}</div>
              <div style={{height: 22, borderRadius: 11, width: (barW / 1.4) * b.v * (i ? Math.min(1, grow * 1.6) : grow), background: b.col, boxShadow: i ? 'none' : '0 0 24px rgba(255,255,255,0.6)'}} />
            </div>
          ))}
        </div>
      </LiquidGlass>
    </Scene>
  );
};
