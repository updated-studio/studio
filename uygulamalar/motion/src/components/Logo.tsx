import React from 'react';
import {Img, staticFile, useCurrentFrame} from 'remotion';
import {brand} from '../lib/brand';
import {T, tween} from '../lib/motion';

export type LogoForm = 'yatay' | 'dikey' | 'up';
export type LogoColor = 'white' | 'black' | 'blue' | 'orange';

/**
 * UPDATED logosu — SVG'ler studio/public/marka/logo/svg'den gelir (npm run brand). Logo asla fontla yazılmaz (kit §2).
 * Zemin → renk (kit §2): koyu/mavi zemin beyaz, açık zemin siyah, turuncu zemin siyah.
 * Animasyon: harfler soldan sağa açılır, 0,8 sn (kit §13).
 */
export const Logo: React.FC<{form: LogoForm; color: LogoColor; height: number; start?: number; animate?: boolean; domain?: boolean}> = ({
  form, color, height, start = 0, animate = true, domain = false,
}) => {
  const f = useCurrentFrame();
  const key = `${form}${domain ? '-domain' : ''}-${color}`;
  const src = brand.logo[key];
  if (!src) throw new Error(`Logo yok: ${key} — npm run brand`);
  const p = animate ? tween(f, start, start + T.logo, 0, 1) : 1;
  return <Img src={staticFile(src)} style={{height, display: 'block', clipPath: `inset(-2% ${(1 - p) * 102}% -2% -2%)`}} />;
};
