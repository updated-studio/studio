import React from 'react';
import {useCurrentFrame} from 'remotion';
import {Stage} from '../../../components/Stage';
import {Background} from '../../../components/Background';
import {Camera} from '../../../components/Camera';
import {Click} from '../../../components/Cursor';
import {C} from '../../../lib/brand';
import {useLayout} from '../../../lib/layout';
import {EASE, tween} from '../../../lib/motion-dinamik';
import {Header, headerGeom} from './Header';

const MOVE = 168;
const PUSH = 1.04; // kamera en fazla bu kadar yaklaşır; başlık bu orana göre içeride başlar ki güvenli alandan taşmasın // başlık üste taşınır → sonraki sahneyle birebir aynı yer (eşleşen kesme)

/** Sahne 1 · Hook — etiket kayar, blok soldan açılır, kelimeler düşer; sonunda başlık bloğu üst başlığa küçülür. */
export const Hook: React.FC = () => {
  const f = useCurrentFrame();
  const L = useLayout();
  const g = headerGeom(L.mode);
  const p = tween(f, MOVE, MOVE + 30, 0, 1, EASE.inOut);
  const top = g.hookTop + (L.safe.top - g.hookTop) * p;
  const s = 1 + (g.topScale - 1) * p;
  return (
    <Stage bg={C.dark.bg}>
      <Background color={C.dark.bg} />
      <Camera keys={[{f: 0, scale: 1}, {f: MOVE, scale: PUSH}, {f: MOVE + 30, scale: 1}]} microPush={0}>
        <div style={{position: 'absolute', left: L.safe.left / PUSH, top, transform: `scale(${s})`, transformOrigin: '0 0'}}>
          <Header animate width={(L.mode === 'land' ? 1500 : L.safeW) / PUSH} />
        </div>
      </Camera>
      <Click at={6} volume={0.4} />
    </Stage>
  );
};
