import React from 'react';
import {useCurrentFrame} from 'remotion';
import {drift, enterP} from '../../../lib/motion-dinamik';
import {at, cfg} from '../config';
import {PhotoCard, Scene, Title, useSafe} from './Shared';

const c = cfg.copy.hook;
/** Sahne 1 · "iPhone 18 Pro çıktı. 17 Pro'dan geçmeye değer mi?" — iki cam telefon aşağıdan yaylanarak gelir. */
export const Hook: React.FC = () => {
  const f = useCurrentFrame();
  const L = useSafe();
  const sub = at('hook', 'peki');
  const p1 = enterP(f, 6, 34);
  const p2 = enterP(f, 16, 34);
  return (
    <Scene cam={[{f: 0, scale: 1.0}, {f: 264, scale: 1.06}]}>
      <div style={{position: 'absolute', left: 0, top: (1 - p1) * 900}}><PhotoCard src={cfg.gorseller.m17} x={L.cx - 190 + drift(f, 4, 260)} y={130} w={420} h={520} label={'iPhone ' + c.left} start={6} kunye={false} /></div>
      <div style={{position: 'absolute', left: 0, top: (1 - p2) * 900}}><PhotoCard src={cfg.gorseller.m18} x={L.cx + 170 + drift(f, 4, 300, 1)} y={70} w={430} h={600} label={'iPhone ' + c.right} start={16} hue="mor" /></div>
      <Title text={c.title} start={2} size={128} x={L.cx} y={-560} w={L.safeW} />
      <Title text={c.sub} start={sub} size={60} x={L.cx} y={-400} w={L.safeW} weight={600} color="rgba(255,255,255,0.78)" />
    </Scene>
  );
};
