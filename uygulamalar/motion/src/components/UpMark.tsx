import React from 'react';
import {Img, staticFile, useCurrentFrame} from 'remotion';
import {brand} from '../lib/brand';
import {useLayout} from '../lib/layout';
import {fadeIn} from '../lib/motion';

/**
 * Sabit UP işareti — her videoda sol üstte, güvenli alanın köşesinde (kullanıcı kararı, 6 Kasım 2026).
 * Zemine göre renk (kit §2): koyu/mavi zeminde beyaz, açık zeminde siyah, turuncuda siyah.
 * `hide`: işaretin görünmeyeceği kare aralıkları (ör. kapanıştaki büyük logo sahnesi).
 */
/** UP işaretinin yüksekliği (içerik bunun altından başlar). */
export const upHeight = (mode: 'land' | 'port' | 'feed') => ({land: 64, port: 84, feed: 72})[mode];
/** İşaretin altındaki ilk serbest satır (merkezden y). */
export const belowUp = (L: {mode: 'land' | 'port' | 'feed'; safe: {top: number}}) => L.safe.top + upHeight(L.mode) + 28;

export const UpMark: React.FC<{color?: 'white' | 'black'; hide?: [number, number][]; start?: number}> = ({color = 'white', hide = [], start = 0}) => {
  const f = useCurrentFrame();
  const L = useLayout();
  if (hide.some(([a, b]) => f >= a && f < b)) return null;
  const h = upHeight(L.mode);
  const src = brand.logo[`up-${color}`];
  return (
    <Img src={staticFile(src)} style={{position: 'absolute', left: L.W / 2 + L.safe.left, top: L.H / 2 + L.safe.top, height: h, zIndex: 900, opacity: fadeIn(f, start, 12)}} />
  );
};
