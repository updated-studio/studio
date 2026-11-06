import React from 'react';
import {Sequence, staticFile, Html5Audio, useCurrentFrame} from 'remotion';
import {EASE} from '../lib/motion';

export type CursorKey = {f: number; x: number; y: number; click?: boolean};

/** Gerçek el gibi: düz çizgi yok, yay (quadratic bezier, kontrol noktası mesafenin ~%15'i), ease-in-out, küçük overshoot ile oturma. */
export const cursorPos = (keys: CursorKey[], f: number) => {
  if (f <= keys[0].f) return {x: keys[0].x, y: keys[0].y};
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (f <= b.f) {
      const raw = (f - a.f) / Math.max(1, b.f - a.f);
      // ease-in-out + son %15'te hafif overshoot
      const t = EASE.inOut(raw); // marka: overshoot yok
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 1;
      const side = i % 2 === 0 ? 1 : -1;
      const cx = (a.x + b.x) / 2 + (-dy / dist) * dist * 0.15 * side;
      const cy = (a.y + b.y) / 2 + (dx / dist) * dist * 0.15 * side;
      const u = 1 - t;
      return {x: u * u * a.x + 2 * u * t * cx + t * t * b.x, y: u * u * a.y + 2 * u * t * cy + t * t * b.y};
    }
  }
  const last = keys[keys.length - 1];
  return {x: last.x, y: last.y};
};

export const Cursor: React.FC<{keys: CursorKey[]; appear?: number; sound?: boolean}> = ({keys, appear = 0, sound = true}) => {
  const f = useCurrentFrame();
  const {x, y} = cursorPos(keys, f);
  const clicks = keys.filter((k) => k.click).map((k) => k.f);
  const op = Math.min(1, Math.max(0, (f - appear) / 8));
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: x,
          top: y,
          transform: 'scale(1.6)',
          transformOrigin: '4px 4px',
          opacity: op,
          zIndex: 50,
        }}
      >
        <svg width="34" height="40" viewBox="0 0 34 40" style={{display: 'block'}}>
          <path d="M3 2 L3 31 L10.5 24.5 L15.5 36.5 L21 34 L16 22.5 L26 22.5 Z" fill="#fff" stroke="#0B0D12" strokeWidth="2.2" strokeLinejoin="round" />
        </svg>
      </div>
      {sound && clicks.map((c) => <Click key={c} at={c} />)}
    </>
  );
};

/** Hafif tık sesi (npm run setup ile üretilir). */
export const Click: React.FC<{at: number; volume?: number}> = ({at, volume = 0.45}) => (
  <Sequence from={at} durationInFrames={20} layout="none">
    <Html5Audio src={staticFile('sfx/click.wav')} volume={volume} />
  </Sequence>
);
