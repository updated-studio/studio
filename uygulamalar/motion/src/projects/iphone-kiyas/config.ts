import raw from './video.json';
import words from './altyazi-deneme.json';
export const cfg = raw;
export const altyazi = words as {w: string; s: number; e: number}[];
