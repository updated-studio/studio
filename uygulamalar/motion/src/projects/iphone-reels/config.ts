import raw from './video.json';
import words from './altyazi.json';
export const cfg = raw;
export const altyazi = words as {w: string; s: number; e: number}[];
const FPS = raw.fps;
export const sceneStart = (id: string) => {
  let from = 0;
  for (const s of raw.scenes) { if (s.id === id) return from; from += s.frames; }
  throw new Error(id);
};
/** Seslendirmede bir kelimenin başladığı an, verilen sahneye göre kare olarak (ses değişse de animasyon sese oturur). */
export const at = (scene: string, word: string, n = 0, end = false) => {
  const hits = altyazi.filter((w) => w.w.toLocaleLowerCase('tr').replace(/[.,;:!?]/g, '').startsWith(word.toLocaleLowerCase('tr')));
  const w = hits[n] ?? hits[hits.length - 1];
  if (!w) return 0;
  return Math.round((end ? w.e : w.s) * FPS) - sceneStart(scene);
};
export const INTER = "'Inter', system-ui, sans-serif";
