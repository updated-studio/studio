import React from 'react';
import {useCurrentFrame} from 'remotion';
import {FONT_MONO} from '../lib/brand';
import {T, tween} from '../lib/motion';

/** Sayaç ~1 sn, tek karede atlamaz. Rakamlar Veri rolü: IBM Plex Mono (kit §4). */
export const useCount = (from: number, to: number, start: number, dur: number = T.count) => Math.round(tween(useCurrentFrame(), start, start + dur, from, to));

export const Counter: React.FC<{from: number; to: number; start: number; dur?: number; style?: React.CSSProperties}> = ({from, to, start, dur, style}) => {
  const v = useCount(from, to, start, dur);
  return <span style={{fontFamily: FONT_MONO, fontWeight: 600, fontVariantNumeric: 'tabular-nums', ...style}}>{v.toLocaleString('tr-TR')}</span>;
};
