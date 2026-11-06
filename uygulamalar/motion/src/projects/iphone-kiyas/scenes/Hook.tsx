import React from 'react';
import {useCurrentFrame} from 'remotion';
import {Stage} from '../../../components/Stage';
import {GlassBg, GlassCard} from '../../../components/Glass';
import {Kinetic} from '../../../components/Kinetic';
import {belowUp} from '../../../components/UpMark';
import {C, FONT_BODY, FONT_MONO} from '../../../lib/brand';
import {useLayout} from '../../../lib/layout';
import {dinamik, drift, enterP, fadeIn} from '../../../lib/motion-dinamik';
import {cfg} from '../config';

/** Sahne 1 · Hangisi? — soru başlığı, iki model cam kartta; yeni olan mavi ışıkla vurgulu. */
export const Hook: React.FC = () => {
  const f = useCurrentFrame();
  const L = useLayout();
  const v = L.pick({
    port: {head: 132, cw: L.safeW, ch: 300, gap: 32, cardsTop: -120, row: false},
    land: {head: 120, cw: 760, ch: 300, gap: 48, cardsTop: -40, row: true},
    feed: {head: 108, cw: L.safeW, ch: 230, gap: 24, cardsTop: -150, row: false},
  });
  return (
    <Stage bg={C.dark.bg}>
      <GlassBg />
      <div style={{position: 'absolute', left: L.safe.left, top: belowUp(L) + 12}}>
        <Kinetic text={cfg.copy.headline} start={8} size={v.head} maxWidth={L.safeW} align="left" step={6} m={dinamik} rise={60} />
      </div>
      <div style={{position: 'absolute', left: L.safe.left, top: v.cardsTop, display: 'flex', flexDirection: v.row ? 'row' : 'column', gap: v.gap}}>
        {cfg.copy.models.map((m, i) => {
          const s = 40 + i * 10;
          const aktif = i === 0 ? fadeIn(f, 110, 30) * (0.75 + 0.25 * Math.sin(f / 22)) : 0;
          return (
            <div key={m.name} style={{opacity: fadeIn(f, s), transform: `translateY(${(1 - enterP(f, s)) * 60 + drift(f, 3, 300, i)}px)`}}>
              <GlassCard w={v.cw} h={v.ch} aktif={aktif}>
                <div style={{fontFamily: FONT_MONO, fontSize: 30, color: C.dark.text3, letterSpacing: '0.04em'}}>{m.date.toLocaleUpperCase('tr-TR')}</div>
                <div style={{fontFamily: FONT_BODY, fontWeight: 600, fontSize: 76, marginTop: 14, lineHeight: 1.1}}>{m.name}</div>
                <div style={{fontFamily: FONT_MONO, fontWeight: 600, fontSize: 40, marginTop: 18, color: i === 0 ? C.white : C.dark.text2}}>
                  <span style={{background: i === 0 ? C.blue : 'transparent', border: i === 0 ? 'none' : `1px solid ${C.dark.line}`, padding: '4px 14px', borderRadius: 10}}>{m.chip}</span>
                </div>
              </GlassCard>
            </div>
          );
        })}
      </div>
    </Stage>
  );
};
