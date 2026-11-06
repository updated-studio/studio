import React from 'react';
import {useCurrentFrame} from 'remotion';
import {At, Stage} from '../../../components/Stage';
import {Background} from '../../../components/Background';
import {C, FONT_BODY} from '../../../lib/brand';
import {useLayout} from '../../../lib/layout';
import {drift, enterP, fadeIn} from '../../../lib/motion-dinamik';
import {cfg} from '../config';

/** Sahne 3 · Devamı sitede — beyaz kutu siyah yazı (şablondaki eylem kutusu). */
export const Cta: React.FC = () => {
  const f = useCurrentFrame();
  const L = useLayout();
  const p = enterP(f, 6);
  return (
    <Stage bg={C.dark.bg}>
      <Background color={C.dark.bg} />
      <At x={(L.safe.left + L.safe.right) / 2} y={drift(f, 4, 240)} transform={`scale(${0.85 + 0.15 * p})`} style={{opacity: fadeIn(f, 6)}}>
        <div lang="tr" style={{background: C.white, color: C.black, fontFamily: FONT_BODY, fontWeight: 600, fontSize: L.pick({port: 52, land: 56, feed: 48}),
          padding: '28px 48px', width: 'max-content', maxWidth: L.safeW, textAlign: 'center'}}>{cfg.copy.cta}</div>
      </At>
    </Stage>
  );
};
