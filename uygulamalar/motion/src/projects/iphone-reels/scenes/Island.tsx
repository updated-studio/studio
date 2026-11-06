import React from 'react';
import {useCurrentFrame} from 'remotion';
import {LiquidGlass} from '../../../components/LiquidGlass';
import {EASE, enterP, fadeIn, tween} from '../../../lib/motion-dinamik';
import {INTER, at, cfg} from '../config';
import {Pill, Scene, useSafe} from './Shared';

const c = cfg.copy.island;
/** Sahne 5 · Dynamic Island küçülür, yanında üç canlı etkinlik belirir — telefonun üst kısmına yakın çekim. */
export const Island: React.FC = () => {
  const f = useCurrentFrame();
  const L = useSafe();
  const kucul = at('island', 'küçüldü');
  const uc = at('island', 'üç');
  const w = tween(f, kucul - 6, kucul + 26, 340, 250, EASE.outBack);
  const act = (i: number) => enterP(f, uc + i * 6, 28);
  return (
    <Scene hue="mor" cam={[{f: 0, scale: 1.1}, {f: 276, scale: 1.0}]}>
      <LiquidGlass x={L.cx} y={360} w={880} h={1500} r={150} opacity={fadeIn(f, 0)} mag={1.15} blur={5}>
        <div style={{position: 'absolute', left: '50%', top: 56, transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 16}}>
          <div style={{width: 74 * act(1), height: 74, borderRadius: 37, background: '#000', transform: `scale(${act(1)})`, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
            <div style={{width: 30, height: 30, borderRadius: 15, background: '#34D399', opacity: act(1)}} />
          </div>
          <div style={{width: w, height: 74, borderRadius: 37, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 22px', boxSizing: 'border-box'}}>
            <div style={{width: 30, height: 30, borderRadius: 8, background: '#FF6B1A', opacity: act(0)}} />
            <div style={{fontFamily: INTER, fontWeight: 700, fontSize: 26, color: '#fff', opacity: act(0)}}>3:42</div>
          </div>
          <div style={{width: 74 * act(2), height: 74, borderRadius: 37, background: '#000', transform: `scale(${act(2)})`, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
            <div style={{width: 30, height: 30, borderRadius: 15, background: '#60A5FA', opacity: act(2)}} />
          </div>
        </div>
      </LiquidGlass>
      <Pill text={c.a} x={L.cx} y={-560} w={L.safeW} start={kucul} size={40} />
      <Pill text={c.b} x={L.cx} y={-420} w={L.safeW} start={uc + 4} size={40} hue="mor" />
    </Scene>
  );
};
