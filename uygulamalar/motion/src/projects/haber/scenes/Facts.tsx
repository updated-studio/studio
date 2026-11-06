import React from 'react';
import {interpolateColors, useCurrentFrame} from 'remotion';
import {Fill, Stage} from '../../../components/Stage';
import {Background} from '../../../components/Background';
import {Click} from '../../../components/Cursor';
import {C, FONT_BODY, FONT_DISPLAY, FONT_MONO, brand} from '../../../lib/brand';
import {useLayout} from '../../../lib/layout';
import {drift, enterP, exitP, fadeIn} from '../../../lib/motion-dinamik';
import {cfg} from '../config';
import {Header, headerGeom} from './Header';
import {belowUp} from '../../../components/UpMark';

const START = (i: number) => 20 + i * 140;
const EXIT = 444;

/** Sahne 2 · Üç madde — numara karesi (mavi zemin beyaz mono), başlık, tek cümle; öncekiler sönükleşir. */
export const Facts: React.FC = () => {
  const f = useCurrentFrame();
  const L = useLayout();
  const g = headerGeom(L.mode);
  const v = L.pick({
    port: {top: -230, row: 290, num: 104, h: 76, t: 50},
    land: {top: -120, row: 190, num: 84, h: 60, t: 44},
    feed: {top: -190, row: 230, num: 80, h: 56, t: 40},
  });
  const ex = exitP(f, EXIT);
  return (
    <Stage bg={C.dark.bg}>
      <Background color={C.dark.bg} />
      <Fill style={{opacity: 1 - ex}}>
        <Stage bg="transparent">
          <div style={{position: 'absolute', left: L.safe.left, top: belowUp(L), transform: `scale(${g.topScale})`, transformOrigin: '0 0'}}>
            <Header animate={false} />
          </div>
          {cfg.copy.facts.map((it, i) => {
            const s = START(i);
            const next = i < 2 ? START(i + 1) : 10_000;
            const col = interpolateColors(f, [next, next + 20], [C.dark.text, C.dark.text3]);
            const sq = enterP(f, s);
            return (
              <div key={i} lang="tr" style={{position: 'absolute', left: L.safe.left, top: v.top + i * v.row + drift(f, 2, 360, i), width: L.safeW, display: 'flex', gap: v.num * 0.35, alignItems: 'flex-start'}}>
                <div style={{width: v.num, height: v.num, flexShrink: 0, background: f < next ? C.blue : C.dark.surface2, color: C.white, fontFamily: FONT_MONO, fontWeight: 600, fontSize: v.num * 0.42,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: fadeIn(f, s), transform: `scale(${sq})`}}>
                  {String(i + 1).padStart(2, '0')}
                </div>
                <div style={{flex: 1}}>
                  <div style={{fontFamily: FONT_DISPLAY, fontWeight: 900, fontSize: v.h, lineHeight: brand.type.headingLineHeight, color: col, opacity: fadeIn(f, s + 4), transform: `translateX(${(1 - enterP(f, s + 4)) * 40}px)`}}>
                    {it.h.toLocaleUpperCase('tr-TR')}
                  </div>
                  <div style={{fontFamily: FONT_BODY, fontWeight: 500, fontSize: v.t, lineHeight: 1.3, color: col, marginTop: 6, opacity: fadeIn(f, s + 12), transform: `translateY(${(1 - enterP(f, s + 12)) * 24}px)`}}>
                    {it.t}
                  </div>
                </div>
              </div>
            );
          })}
          <div style={{position: 'absolute', left: L.safe.left, top: L.safe.bottom - 40, width: L.safeW, whiteSpace: 'nowrap', fontFamily: FONT_MONO, fontSize: 28, color: C.dark.text3, opacity: fadeIn(f, 30)}}>{cfg.copy.source}</div>
        </Stage>
      </Fill>
      {cfg.copy.facts.map((_, i) => <Click key={i} at={START(i)} volume={0.3} />)}
    </Stage>
  );
};
