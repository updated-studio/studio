import React from 'react';
import {useCurrentFrame} from 'remotion';
import {Logo} from '../../../components/Logo';
import {fadeIn} from '../../../lib/motion-dinamik';
import {INTER, cfg} from '../config';
import {Phone, Scene, Title, useSafe} from './Shared';

/** Sahne 6 · Fatih tarzı kapanış: okura tek, doğal bir soru. Sonda logo, kaynak satırı. */
export const Final: React.FC = () => {
  const f = useCurrentFrame();
  const L = useSafe();
  return (
    <Scene hue="mor" cam={[{f: 0, scale: 1.0}, {f: 240, scale: 1.05}]}>
      <Phone x={L.cx - 120} y={265} w={215} label="17 Pro" opacity={0.55} />
      <Phone x={L.cx + 120} y={250} w={230} label="18 Pro" opacity={0.75} hue="mor" />
      <Title text={cfg.copy.final.q} start={0} size={108} x={L.cx} y={-590} w={L.safeW} />
      <div style={{position: 'absolute', left: L.cx, top: -180, transform: 'translateX(-50%)'}}><Logo form="yatay" color="white" height={64} start={120} /></div>
      <div style={{position: 'absolute', left: L.safe.left, width: L.safeW, textAlign: 'center', top: -90, fontFamily: INTER, fontSize: 28, color: 'rgba(255,255,255,0.6)', opacity: fadeIn(f, 60)}}>{cfg.copy.source}</div>
    </Scene>
  );
};
