import React from 'react';
import {useCurrentFrame} from 'remotion';
import {C, FONT_DISPLAY, brand} from '../lib/brand';
import * as kit from '../lib/motion';
import {upperTR} from '../lib/text';

export type MotionAPI = {enterP: typeof kit.enterP; fadeIn: typeof kit.fadeIn; exitP: typeof kit.exitP};

/**
 * Kelime kelime başlık — Başlık rolü: Big Shoulders Display 900, BÜYÜK HARF, satır 1,2 (Türkçe aksanlar çakışmasın),
 * harf aralığı yok. Hareket: kayma + solma (kit §13), overshoot yok.
 */
export const Kinetic: React.FC<{
  text: string; start: number; exitAt?: number; size?: number; maxWidth?: number;
  align?: 'left' | 'center'; color?: string; highlight?: string[]; highlightColor?: string; step?: number; m?: MotionAPI; rise?: number;
}> = ({text, start, exitAt, size = 120, maxWidth = 900, align = 'center', color = C.white, highlight = [], highlightColor = C.blue, step = 5, m = kit, rise = 24}) => {
  const f = useCurrentFrame();
  const {enterP, exitP, fadeIn} = m;
  const words = upperTR(text).split(' ');
  const ex = exitAt !== undefined ? exitP(f, exitAt) : 0;
  return (
    <div lang="tr" style={{fontFamily: FONT_DISPLAY, fontWeight: 900, fontSize: size, lineHeight: brand.type.headingLineHeight, maxWidth, width: 'max-content', textAlign: align, color, opacity: 1 - ex}}>
      {words.map((w, i) => {
        const s = start + i * step;
        const hl = highlight.some((h) => w.includes(upperTR(h)));
        return (
          <span key={i} style={{display: 'inline-block', marginRight: '0.22em', opacity: fadeIn(f, s), transform: `translateY(${(1 - enterP(f, s)) * rise}px)`, color: hl ? highlightColor : undefined}}>
            {w}
          </span>
        );
      })}
    </div>
  );
};

/** Haber başlığı bloğu: başlık siyah blokta (kit §9, §10). Saydam karartma yerine düz siyah blok. */
export const HeadBlock: React.FC<{children: React.ReactNode; p: number; pad?: number; bg?: string}> = ({children, p, pad = 48, bg = C.black}) => (
  <div style={{background: bg, padding: `${pad * 0.7}px ${pad}px`, clipPath: `inset(0 ${(1 - p) * 100}% 0 0)`}}>{children}</div>
);
