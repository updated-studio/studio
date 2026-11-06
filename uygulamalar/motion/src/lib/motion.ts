/**
 * Hareket kuralları — launch-motion skill + UPDATED marka kiti §13. Çatışmada MARKA KİTİ kazanır:
 *  - tek eğri cubic-bezier(0.2, 0, 0, 1); zıplama/esnek eğri (overshoot) yok
 *  - süreler: hızlı 120 ms, standart 200 ms, yavaş 320 ms
 *  - döndürme, paralaks, daktilo efekti yok
 * Skill'den kalanlar: lineer hareket yok, ofsetli giriş, çıkış girişten hızlı, sayaç ~1 sn, önemli bilgi ≥1.5 sn.
 */
import {Easing, interpolate} from 'remotion';
import {brand} from './brand';

export const FPS = 60;
const ms = (x: number) => Math.round((x / 1000) * FPS);

export const T = {
  enter: ms(brand.motion.slowMs), // 19 kare (320 ms)
  exit: ms(brand.motion.baseMs), // 12 kare (200 ms) — çıkış girişten hızlı
  press: ms(brand.motion.fastMs), // 7 kare (120 ms) — buton yalnızca zemin rengi değiştirir
  offset: 4, // grup içi ofset
  count: 60, // sayaçlar ~1 sn
  hold: 90, // önemli bilgi ekranda ≥1.5 sn
  panMin: 48, // kamera pan ≥0.8 sn
  logo: ms(brand.motion.logoRevealMs), // logo soldan sağa 0.8 sn
} as const;

const B = brand.motion.ease;
const brandEase = Easing.bezier(B[0], B[1], B[2], B[3]);
export const EASE = {
  brand: brandEase,
  out: brandEase,
  inOut: brandEase, // kitte tek eğri var; kamera dahil hepsi bu
  in: Easing.bezier(0.4, 0, 1, 1), // yalnızca çıkışlar (kaybolma) — hızlanarak çıkar
};

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

export const tween = (f: number, start: number, end: number, from: number, to: number, easing: (t: number) => number = EASE.brand) =>
  interpolate(f, [start, end], [from, to], {...clamp, easing});

/** Giriş 0 → 1. Marka: overshoot yok. */
export const enterP = (f: number, start: number, dur: number = T.enter) => tween(f, start, start + dur, 0, 1);
export const fadeIn = (f: number, start: number, dur: number = T.enter) => tween(f, start, start + dur * 0.7, 0, 1);
export const exitP = (f: number, start: number, dur: number = T.exit) => tween(f, start, start + dur, 0, 1, EASE.in);

/** Buton basması: marka §13 "Buton: yalnızca zemin rengi değişir" → 0..1 karışım (ölçek yok). */
export const pressMix = (f: number, at: number) => interpolate(f, [at, at + 2, at + T.press], [0, 1, 0], clamp);

export const stagger = (base: number, i: number, step: number = T.offset) => base + i * step;

export const rand = (seed: number) => {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
};
