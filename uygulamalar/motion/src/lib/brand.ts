import raw from '../../brand/brand.json';

export type FontSpec = {family: string; fontsource: string; weights: number[]; uppercase?: boolean};
type Brand = {
  name: string;
  domain: string;
  lang: string;
  colors: {black: string; white: string; blue: string; orange: string; gray: string; text: string; text2: string; text3: string; line: string; on: Record<string, string>;
    dark: {bg: string; surface: string; surface2: string; line: string; text: string; text2: string; text3: string}};
  fonts: {display: FontSpec; body: FontSpec; mono: FontSpec};
  type: {headingLineHeight: number; videoMin: number};
  shape: {radius: number; line: number; lineStrong: number};
  motion: {ease: [number, number, number, number]; fastMs: number; baseMs: number; slowMs: number; overshoot: boolean; rotate: boolean; parallax: boolean; typewriter: boolean; logoRevealMs: number};
  safe: {land: {x: number; y: number}; port: {top: number; bottom: number; x: number}; feed: {x: number; y: number}};
  copy: {banned: string[]; address: string};
  logo: Record<string, string>; // 'yatay-white', 'dikey-black', 'up-blue', 'yatay-domain-white' …
};
export const brand = raw as unknown as Brand;
const k = brand.colors;

/**
 * Video teması (marka kiti §3): beyaz + açık gri ağırlıklı, siyah haber zemini, mavi ana, turuncu yüzeyde TEK öğe.
 * Saydamlık, gradyan, gölge yok (grafik kanalları). Turuncu zeminde yazı siyah, mavi zeminde beyaz.
 */
export const C = {
  ...k,
  bg: k.gray,
  surface: k.white,
  surface2: k.gray,
  muted: k.text2,
  primary: k.blue,
  accent: k.orange,
};
export const FONT_DISPLAY = `'${brand.fonts.display.family}', Impact, sans-serif`;
export const FONT_BODY = `'${brand.fonts.body.family}', system-ui, sans-serif`;
export const FONT_MONO = `'${brand.fonts.mono.family}', ui-monospace, monospace`;
export const R = brand.shape.radius; // 0
