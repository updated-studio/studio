import React from 'react';
import {AbsoluteFill} from 'remotion';
import {useLayout} from '../lib/layout';

/**
 * Güvenli alan çizgileri — YALNIZ kontrol karelerinde (npm run stills), videoya girmez.
 * Turuncu kesik çizgi: marka kiti §6 güvenli alanı (16:9 kenar 96/54 · 9:16 üst 250 alt 340 kenar 64 · 4:5 kenar 64 üst/alt 96).
 * Mavi kesik çizgi: ana öğe için merkezdeki 1080×1080 kare (kesimlerde kaybolmasın).
 */
export const SafeGuides: React.FC = () => {
  const L = useLayout();
  const s = L.safe;
  const box = (l: number, t: number, w: number, h: number, color: string): React.CSSProperties => ({
    position: 'absolute', left: L.W / 2 + l, top: L.H / 2 + t, width: w, height: h, border: `3px dashed ${color}`, boxSizing: 'border-box', pointerEvents: 'none',
  });
  const sq = Math.min(1080, L.W, L.H);
  return (
    <AbsoluteFill style={{zIndex: 9999}}>
      <div style={box(s.left, s.top, s.right - s.left, s.bottom - s.top, '#FF6B1A')} />
      <div style={box(-sq / 2, -sq / 2, sq, sq, '#2563EB')} />
    </AbsoluteFill>
  );
};
