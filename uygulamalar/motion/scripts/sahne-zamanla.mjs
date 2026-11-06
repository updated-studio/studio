// Sahne uzunluklarını seslendirmeden hesaplar: her sahnenin video.json'da "basla" kelimesi vardır
// (ör. {"id":"pil","basla":"Pil"}; aynı kelime birden çok geçiyorsa "basla":"Peki#2").
// Kullanım: npm run zamanla -- <id>   → video.json'daki frames ve durationSec güncellenir.
import fs from 'node:fs';
import path from 'node:path';
import {args, root} from './_lib.mjs';

const {pos} = args();
const id = pos[0];
const dir = path.join(root, 'src/projects', id);
const vPath = path.join(dir, 'video.json');
const v = JSON.parse(fs.readFileSync(vPath, 'utf8'));
const words = JSON.parse(fs.readFileSync(path.join(dir, 'altyazi.json'), 'utf8'));
const norm = (s) => s.toLocaleLowerCase('tr').replace(/[.,;:!?"“”]/g, '');
const startOf = (anchor) => {
  if (!anchor) return 0;
  const [w, n] = anchor.split('#');
  const hits = words.filter((x) => norm(x.w).startsWith(norm(w)));
  const hit = hits[(Number(n) || 1) - 1];
  if (!hit) throw new Error(`Seste "${anchor}" yok`);
  return hit.s;
};
const tail = v.kuyrukSn ?? 1.4; // son kelimeden sonra (kapanış, logo)
const starts = v.scenes.map((s, i) => (i === 0 ? 0 : Math.max(0, startOf(s.basla) - 0.12)));
const end = words[words.length - 1].e + tail;
v.scenes.forEach((s, i) => {
  const a = Math.round(starts[i] * v.fps);
  const b = Math.round((i + 1 < starts.length ? starts[i + 1] : end) * v.fps);
  s.frames = b - a;
  if (s.key !== undefined) s.key = Math.min(s.key, s.frames - 1);
});
const total = v.scenes.reduce((a, s) => a + s.frames, 0);
v.durationSec = Number((total / v.fps).toFixed(4));
fs.writeFileSync(vPath, JSON.stringify(v, null, 2) + '\n');
v.scenes.forEach((s, i) => console.log(`${s.id.padEnd(8)} ${starts[i].toFixed(2)} sn  ${s.frames} kare`));
console.log(`toplam ${total} kare = ${v.durationSec} sn`);
