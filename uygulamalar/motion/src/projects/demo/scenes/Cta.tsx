import React from 'react';
import {useCurrentFrame} from 'remotion';
import {At, Stage} from '../../../components/Stage';
import {Background} from '../../../components/Background';
import {Camera} from '../../../components/Camera';
import {Logo} from '../../../components/Logo';
import {C, FONT_BODY} from '../../../lib/brand';
import {useLayout} from '../../../lib/layout';
import {T, enterP, fadeIn, tween} from '../../../lib/motion';
import {cfg} from '../config';
import {Studio} from './Studio';

const c = cfg.copy.cta;
const LOGO = 24;

/** Sahne 5 · Logo + CTA — mavi zemin, beyaz logo soldan sağa 0,8 sn; geniş alanda yatay, dikey alanda dikey logo (kit §2). */
export const Cta: React.FC = () => {
  const f = useCurrentFrame();
  const L = useLayout();
  const v = L.pick({
    land: {logo: 'yatay' as const, h: 150, logoY: -90, tagY: 90, ctaY: 200},
    port: {logo: 'dikey' as const, h: 360, logoY: -200, tagY: 120, ctaY: 240},
    feed: {logo: 'dikey' as const, h: 300, logoY: -170, tagY: 100, ctaY: 210},
  });
  const away = tween(f, 0, 20, 0, 1);
  const after = LOGO + T.logo;
  return (
    <Stage bg={C.blue}>
      <Background color={C.blue} />
      <At transform={`scale(${0.9 - away * 0.25})`} style={{opacity: 1 - away}}>
        <Studio mode={L.mode} text={cfg.copy.fix.headline} textOp={1} chars={cfg.copy.fix.headline.length} buttonPress={0}
          cards={[0, 1, 2, 3].map(() => ({inP: 1, inOp: 1, status: 'yayinda', progress: 1}))} counter={0} />
      </At>
      <Camera keys={[{f: 0, scale: 1}, {f: 300, scale: 1.03}]} microPush={0}>
        <At y={v.logoY}><Logo form={v.logo} color="white" start={LOGO} height={v.h} /></At>
        <At y={v.tagY} style={{opacity: fadeIn(f, after + 6)}} transform={`translateY(${(1 - enterP(f, after + 6)) * 20}px)`}>
          <div style={{fontFamily: FONT_BODY, fontWeight: 600, fontSize: 48, color: C.white, width: 'max-content', maxWidth: L.safeW}}>{c.tagline}</div>
        </At>
        <At y={v.ctaY} style={{opacity: fadeIn(f, after + 20)}} transform={`translateY(${(1 - enterP(f, after + 20)) * 20}px)`}>
          <div style={{background: C.white, color: C.black, fontFamily: FONT_BODY, fontWeight: 600, fontSize: 40, padding: '18px 36px', whiteSpace: 'nowrap'}}>{c.cta}</div>
        </At>
      </Camera>
    </Stage>
  );
};
