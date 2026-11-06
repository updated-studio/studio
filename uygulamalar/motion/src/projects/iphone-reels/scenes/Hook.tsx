import React from 'react';
import {useCurrentFrame} from 'remotion';
import {drift, enterP} from '../../../lib/motion-dinamik';
import {at, cfg} from '../config';
import {Phone, Scene, Title, useSafe} from './Shared';

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
      <Phone x={L.cx - 150 + drift(f, 4, 260)} y={110 + (1 - p1) * 900} w={320} label={c.left} opacity={0.9} island={0.36} />
      <Phone x={L.cx + 150 + drift(f, 4, 300, 1)} y={60 + (1 - p2) * 900} w={350} label={c.right} island={0.28} hue="mor" />
      <Title text={c.title} start={2} size={128} x={L.cx} y={-560} w={L.safeW} />
      <Title text={c.sub} start={sub} size={60} x={L.cx} y={-400} w={L.safeW} weight={600} color="rgba(255,255,255,0.78)" />
    </Scene>
  );
};
