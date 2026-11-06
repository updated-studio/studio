import {continueRender, delayRender, staticFile} from 'remotion';
import {brand} from './brand';

// latin + latin-ext birlikte yüklenir: Türkçe karakterler (ş ğ ı İ ç ö ü) latin-ext'te.
const RANGES = {
  latin:
    'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
  'latin-ext':
    'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF',
} as const;

let started = false;

/** Fontları kare 0'dan ÖNCE yükler. Yedek font (Times New Roman) = hata. */
export const loadBrandFonts = () => {
  if (started || typeof document === 'undefined') return;
  started = true;
  const handle = delayRender('Marka fontları yükleniyor');
  const faces: FontFace[] = [];
  for (const spec of Object.values(brand.fonts)) {
    for (const w of spec.weights) {
      for (const subset of Object.keys(RANGES) as (keyof typeof RANGES)[]) {
        const url = staticFile(`fonts/${spec.fontsource}-${subset}-${w}-normal.woff2`);
        const face = new FontFace(spec.family, `url(${url}) format('woff2')`, {
          weight: String(w),
          style: 'normal',
          unicodeRange: RANGES[subset],
        });
        document.fonts.add(face);
        faces.push(face);
      }
    }
  }
  Promise.all(faces.map((f) => f.load()))
    .then(() => document.fonts.ready)
    .then(() => continueRender(handle))
    .catch((err) => {
      // Font yoksa render'ı sessizce bozmak yerine durdur.
      throw new Error(`Font yüklenemedi — "npm run setup" çalıştırdınız mı? ${err}`);
    });
};
