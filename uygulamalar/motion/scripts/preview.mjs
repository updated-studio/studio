// Hızlı önizleme: tek format, düşük çözünürlük, hızlı kodlama. Taslak içindir, yayına çıkmaz.
//   npm run onizleme -- <id>                       9:16, %40 boyut, tüm video
//   npm run onizleme -- <id> --format 16x9
//   npm run onizleme -- <id> --scene facts         yalnız bir sahne
//   npm run onizleme -- <id> --scale 0.6
import fs from 'node:fs';
import path from 'node:path';
import {renderMedia, selectComposition} from '@remotion/renderer';
import {args, browserExecutable, loadProject, makeBundle, pickFormats, root} from './_lib.mjs';

const {pos, opt} = args();
const id = pos[0] ?? 'haber';
const scale = opt.scale ? Number(opt.scale) : 0.4;
const v = loadProject(id);
const fmt = typeof opt.format === 'string' ? opt.format : pickFormats(v, opt)[0];
let frameRange = null;
if (typeof opt.scene === 'string') {
  let from = 0;
  for (const s of v.scenes) {
    if (s.id === opt.scene) { frameRange = [from, from + s.frames - 1]; break; }
    from += s.frames;
  }
  if (!frameRange) throw new Error(`Sahne yok: ${opt.scene} (${v.scenes.map((s) => s.id).join(', ')})`);
}
const t0 = Date.now();
const serveUrl = await makeBundle();
const composition = await selectComposition({serveUrl, id: `${id}-${fmt}`, browserExecutable});
const outDir = path.join(root, 'out', id, 'onizleme');
fs.mkdirSync(outDir, {recursive: true});
const outputLocation = path.join(outDir, `onizleme-${fmt}${opt.scene ? '-' + opt.scene : ''}.mp4`);
await renderMedia({
  serveUrl, composition, codec: 'h264', crf: 30, x264Preset: 'veryfast', pixelFormat: 'yuv420p',
  imageFormat: 'jpeg', jpegQuality: 70, scale, frameRange, outputLocation, browserExecutable,
});
console.log(`✓ ${path.relative(root, outputLocation)}  (${((Date.now() - t0) / 1000).toFixed(0)} sn)`);
