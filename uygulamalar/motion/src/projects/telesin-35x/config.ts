import raw from './video.json';
import words from './altyazi.json';
export const cfg = raw;
type W = {w: string; s: number; e: number};
/** Ses kelimeleri (zamanlama için, sesin söylediği gibi). */
export const sesKelimeleri = words as W[];
/** Altyazı: ses doğal okur ("f bir kırk sekizden"), ekranda doğru yazım görünür ("ƒ/1.48'den") — video.json "altyaziGoster". */
const norm = (s: string) => s.toLocaleLowerCase('tr').replace(/[.,;:!?]/g, '');
export const altyazi: W[] = (() => {
  const out: W[] = [];
  const kurallar = (raw.altyaziGoster ?? []).map((k) => ({t: k.soyle.split(' ').map(norm), g: k.goster}));
  for (let i = 0; i < sesKelimeleri.length; ) {
    const k = kurallar.find((r) => r.t.every((t, j) => sesKelimeleri[i + j] && norm(sesKelimeleri[i + j].w) === t));
    if (k) {
      const last = sesKelimeleri[i + k.t.length - 1];
      const punct = last.w.match(/[.,;:!?]+$/)?.[0] ?? '';
      out.push({w: k.g + punct, s: sesKelimeleri[i].s, e: last.e});
      i += k.t.length;
    } else { out.push(sesKelimeleri[i]); i++; }
  }
  return out;
})();
const FPS = raw.fps;
export const sceneStart = (id: string) => {
  let from = 0;
  for (const s of raw.scenes) { if (s.id === id) return from; from += s.frames; }
  throw new Error(id);
};
/** Seslendirmede bir kelimenin başladığı an, verilen sahneye göre kare olarak (ses değişse de animasyon sese oturur). */
export const at = (scene: string, word: string, n = 0, end = false) => {
  const hits = sesKelimeleri.filter((w) => w.w.toLocaleLowerCase('tr').replace(/[.,;:!?]/g, '').startsWith(word.toLocaleLowerCase('tr')));
  const w = hits[n] ?? hits[hits.length - 1];
  if (!w) return 0;
  return Math.round((end ? w.e : w.s) * FPS) - sceneStart(scene);
};
export const INTER = "'Inter', system-ui, sans-serif";
