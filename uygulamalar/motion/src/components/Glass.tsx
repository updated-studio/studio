import React from 'react';
import {useCurrentFrame} from 'remotion';
import {C} from '../lib/brand';
import {Fill} from './Stage';

/**
 * Cam görünüm — Stüdyo'nun cam.css'i (marka kiti §12c) koyu mod değerleriyle:
 * zemin #121212 üstünde mavi ve turuncu yumuşak ışık lekeleri, yarı saydam yüzey (%74), 1 px açık kenar,
 * üstte ince ışık çizgisi, yumuşak gölge, arkası bulanık (blur 30 px, doygunluk 1.8). Köşe: kart 18, büyük panel 26.
 * İnce ızgara: Remotion vitrinindeki Next.js tanıtımından (kullanıcı beğendi).
 */
export const CAM = {
  kart: 'rgba(28,28,28,0.74)',
  kenar: 'rgba(255,255,255,0.09)',
  isik: 'inset 0 1px 0 rgba(255,255,255,0.07)',
  golge: '0 1px 2px rgba(0,0,0,0.25), 0 8px 24px rgba(0,0,0,0.18)',
  golgeUst: '0 16px 44px rgba(0,0,0,0.45)',
  bulanik: 'blur(30px) saturate(1.8)',
  mavi: 'rgba(37,99,235,0.22)',
  turuncu: 'rgba(255,107,26,0.09)',
};

export const GlassBg: React.FC<{grid?: boolean}> = ({grid = true}) => {
  const f = useCurrentFrame();
  const d = Math.sin(f / 220) * 3; // lekeler çok yavaş nefes alır
  return (
    <Fill style={{background: C.dark.bg}}>
      <div style={{position: 'absolute', inset: 0, background: `radial-gradient(60% 50% at ${88 + d}% -10%, ${CAM.mavi}, transparent 70%),
        radial-gradient(55% 45% at ${-10 - d}% 105%, ${CAM.turuncu}, transparent 70%),
        radial-gradient(40% 35% at 15% 20%, rgba(37,99,235,0.11), transparent 70%)`}} />
      {grid && (
        <div style={{position: 'absolute', inset: 0, opacity: 0.55,
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)',
          backgroundSize: '96px 96px', backgroundPosition: 'center center',
          maskImage: 'radial-gradient(75% 65% at 50% 50%, black 35%, transparent 100%)', WebkitMaskImage: 'radial-gradient(75% 65% at 50% 50%, black 35%, transparent 100%)'}} />
      )}
    </Fill>
  );
};

/** Cam kart. `aktif`: vurgulanan kart — mavi çerçeve ve hafif mavi ışıma (Next.js örneğindeki parlayan çerçeve). */
export const GlassCard: React.FC<{children: React.ReactNode; w?: number; h?: number; r?: number; pad?: number; aktif?: number; style?: React.CSSProperties}> = ({
  children, w, h, r = 26, pad = 36, aktif = 0, style,
}) => (
  <div style={{width: w, height: h, boxSizing: 'border-box', padding: pad, borderRadius: r, background: CAM.kart,
    border: `1px solid ${aktif > 0.01 ? `rgba(37,99,235,${0.35 + 0.65 * aktif})` : CAM.kenar}`,
    boxShadow: `${CAM.isik}, ${CAM.golgeUst}${aktif > 0.01 ? `, 0 0 ${48 * aktif}px rgba(37,99,235,${0.45 * aktif}), inset 0 0 0 ${aktif}px rgba(37,99,235,${0.6 * aktif})` : ''}`,
    WebkitBackdropFilter: CAM.bulanik, backdropFilter: CAM.bulanik, color: C.dark.text, ...style}}>
    {children}
  </div>
);
