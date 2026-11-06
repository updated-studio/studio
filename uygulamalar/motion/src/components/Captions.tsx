import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {C, FONT_BODY} from '../lib/brand';
import {useLayout} from '../lib/layout';
import {CAM} from './Glass';

export type Word = {w: string; s: number; e: number}; // saniye

/** Kelimeleri en fazla `max` kelimelik, cümle sonunda bölünen gruplara ayırır (Autocut "Kelime Vurgusu" mantığı). */
export const groupWords = (words: Word[], max = 3, maxChars = 22) => {
  const groups: Word[][] = [];
  let cur: Word[] = [];
  for (const w of words) {
    const len = cur.map((x) => x.w).join(' ').length + w.w.length;
    if (cur.length >= max || (cur.length && len > maxChars)) { groups.push(cur); cur = []; }
    cur.push(w);
    if (/[.!?;:]$/.test(w.w)) { groups.push(cur); cur = []; }
  }
  if (cur.length) groups.push(cur);
  return groups;
};

/**
 * Akıcı altyazı (Autocut'ın kelime vurgusu, marka diliyle): konuşulan kelime mavi zemin beyaz yazı (kit: mavide beyaz),
 * diğerleri beyaz; grup cam bir şeridin üstünde. Kelimeler sözle aynı anda hafif büyüyerek gelir, grup değişiminde kayma yok, sadece solma.
 * Konum: alt güvenli çizginin hemen üstü (9:16'da alt 340 px platformun).
 */
export const Captions: React.FC<{words: Word[]; offset?: number; max?: number; font?: string; weight?: number}> = ({words, offset = 0, max = 3, font = FONT_BODY, weight = 600}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const L = useLayout();
  const t = f / fps - offset;
  const groups = groupWords(words, max);
  const g = groups.find((gr) => t >= gr[0].s - 0.05 && t < gr[gr.length - 1].e + 0.25);
  if (!g) return null;
  const size = L.pick({port: 64, land: 56, feed: 56});
  const gIn = Math.min(1, (t - (g[0].s - 0.05)) / 0.12);
  const clean = (w: string) => w.replace(/[.,;:!?"“”]+$/g, '');
  return (
    <div style={{position: 'absolute', left: L.W / 2 + (L.safe.left + L.safe.right) / 2, top: L.H / 2 + L.safe.bottom - size * 1.9, transform: 'translateX(-50%)', zIndex: 800, opacity: gIn}}>
      <div lang="tr" style={{display: 'flex', gap: size * 0.22, padding: `${size * 0.18}px ${size * 0.28}px`, borderRadius: 18, background: CAM.kart, border: `1px solid ${CAM.kenar}`,
        boxShadow: `${CAM.isik}, ${CAM.golge}`, WebkitBackdropFilter: CAM.bulanik, backdropFilter: CAM.bulanik, whiteSpace: 'nowrap'}}>
        {g.map((w, i) => {
          const on = t >= w.s && t < w.e + 0.04;
          const said = t >= w.s;
          const pop = Math.min(1, Math.max(0, (t - w.s) / 0.1));
          return (
            <span key={i} style={{fontFamily: font, fontWeight: weight, fontSize: size, lineHeight: 1.2, padding: `0 ${size * 0.12}px`, borderRadius: 10,
              background: on ? C.blue : 'transparent', color: said ? C.white : 'rgba(242,242,242,0.45)', transform: `scale(${on ? 1 + 0.06 * (1 - Math.abs(pop - 0.5) * 2) : 1})`, display: 'inline-block'}}>
              {clean(w.w)}
            </span>
          );
        })}
      </div>
    </div>
  );
};
