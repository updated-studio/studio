/**
 * "Dinamik" hareket profili — reels / shorts / YouTube içerikleri için (launch-motion skill'in değerleri).
 * Görsel kimlik (renk, font, logo, köşe 0) aynı kalır; yalnızca HAREKET daha enerjik:
 * hafif overshoot'lu girişler (~0.5 sn), ofsetli kaskadlar, hızlı çıkışlar.
 * Sakin profil (marka kiti §13): ./motion.ts — arayüz/tanıtım videoları için.
 * Aynı API: sahne dosyasında import yolunu değiştirmek profili değiştirir.
 */
import {Easing, interpolate} from 'remotion';
import {T as TK, tween as tw, rand, stagger as st} from './motion';

export const T = {...TK, enter: 30, exit: 16, offset: 3} as const;

export const EASE = {
  outBack: Easing.bezier(0.34, 1.56, 0.64, 1),
  out: Easing.bezier(0.16, 1, 0.3, 1),
  in: Easing.bezier(0.7, 0, 0.84, 0),
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
};
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

export const tween = (f: number, a: number, b: number, from: number, to: number, easing: (t: number) => number = EASE.inOut) => tw(f, a, b, from, to, easing);
export const enterP = (f: number, start: number, dur: number = T.enter) => tween(f, start, start + dur, 0, 1, EASE.outBack);
export const fadeIn = (f: number, start: number, dur: number = T.enter) => tween(f, start, start + dur * 0.6, 0, 1, EASE.out);
export const exitP = (f: number, start: number, dur: number = T.exit) => tween(f, start, start + dur, 0, 1, EASE.in);
export const wipe = (f: number, start: number, dur = 24) => tween(f, start, start + dur, 0, 1, EASE.out);
export const pressMix = (f: number, at: number) => interpolate(f, [at, at + 2, at + 8], [0, 1, 0], clamp);
export const drift = (f: number, amp = 3, period = 300, phase = 0) => Math.sin((f / period) * Math.PI * 2 + phase) * amp;
export const stagger = (base: number, i: number, step: number = T.offset) => st(base, i, step);
export {rand};

export type MotionAPI = {enterP: typeof enterP; fadeIn: typeof fadeIn; exitP: typeof exitP};
export const dinamik: MotionAPI = {enterP, fadeIn, exitP};
