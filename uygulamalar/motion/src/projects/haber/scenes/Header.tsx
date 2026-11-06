import React from 'react';
import {useCurrentFrame} from 'remotion';
import {Kinetic} from '../../../components/Kinetic';
import {C, FONT_DISPLAY, brand} from '../../../lib/brand';
import {Mode, useLayout} from '../../../lib/layout';
import {dinamik, enterP, fadeIn, wipe} from '../../../lib/motion-dinamik';
import {cfg} from '../config';

/** Etiket + başlık bloğu (şablon örneklerindeki stil): turuncu etiket siyah yazı, başlık siyah blokta. Tek ebeveyn (null) altında. */
export const headerGeom = (mode: Mode) =>
  ({
    port: {size: 150, tag: 72, hookTop: 0, topScale: 0.5},
    land: {size: 150, tag: 64, hookTop: -230, topScale: 0.42},
    feed: {size: 124, tag: 60, hookTop: -90, topScale: 0.45},
  })[mode];

export const Header: React.FC<{animate: boolean}> = ({animate}) => {
  const f = useCurrentFrame();
  const L = useLayout();
  const g = headerGeom(L.mode);
  const w = L.mode === 'land' ? 1500 : L.safeW;
  const A = animate ? f : 10_000; // animasyonsuz = son durum
  return (
    <div lang="tr" style={{width: w}}>
      <div style={{display: 'inline-block', background: C.orange, color: C.black, fontFamily: FONT_DISPLAY, fontWeight: 900, fontSize: g.tag, lineHeight: 1,
        padding: `${g.tag * 0.16}px ${g.tag * 0.33}px`, opacity: fadeIn(A, 6), transform: `translateX(${(1 - enterP(A, 6)) * -80}px)`}}>
        {cfg.copy.tag.toLocaleUpperCase('tr-TR')}
      </div>
      <div style={{marginTop: g.tag * 0.45, background: C.black, padding: `${g.size * 0.22}px ${g.size * 0.3}px`, clipPath: `inset(0 ${(1 - wipe(A, 14)) * 100}% 0 0)`}}>
        <Kinetic text={cfg.copy.headline} start={animate ? 22 : -100} size={g.size} maxWidth={w - g.size * 0.6} align="left" step={6} m={dinamik} rise={70} />
      </div>
    </div>
  );
};
export const HEADER_LINE = brand.type.headingLineHeight;
