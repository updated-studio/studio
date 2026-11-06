import React from 'react';
import {useCurrentFrame} from 'remotion';
import {Logo} from '../../../components/Logo';
import {fadeIn} from '../../../lib/motion-dinamik';
import {PhotoCard, Scene, Title, useSafe} from '../../iphone-reels/scenes/Shared';
import {INTER, cfg} from '../config';

/** 9 · Fatih tarzı kapanış sorusu + logo + iş birliği ve kaynak satırı. */
export const Final: React.FC = () => {
  const f = useCurrentFrame();
  const L = useSafe();
  return (
    <Scene hue="turuncu" cam={[{f: 0, scale: 1.0}, {f: 320, scale: 1.05}]}>
      <Title text={cfg.copy.final.q} start={0} size={100} x={L.cx} y={-590} w={L.safeW} />
      <div style={{position: 'absolute', left: L.cx, top: -215, transform: 'translateX(-50%)'}}><Logo form="yatay" color="white" height={56} start={110} /></div>
      <div style={{position: 'absolute', left: L.safe.left, width: L.safeW, textAlign: 'center', top: -125, fontFamily: INTER, fontSize: 28, color: 'rgba(255,255,255,0.7)', opacity: fadeIn(f, 60)}}>{cfg.copy.isbirligi} · {cfg.copy.kaynak}</div>
      <PhotoCard src={cfg.gorseller.kit} x={L.cx} y={170} w={L.safeW} h={420} start={20} kunye="Görsel: Telesin" fit="contain" />
    </Scene>
  );
};
