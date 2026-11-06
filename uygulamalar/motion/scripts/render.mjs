// Final render: 1920×1080 ana video + 9:16 ve 1:1 kesimler. H.264, yuv420p, CRF 16.
import fs from 'node:fs';
import path from 'node:path';
import {renderMedia, selectComposition} from '@remotion/renderer';
import {CHANNEL, FORMATS, args, pickFormats, browserExecutable, loadProject, makeBundle, root, today} from './_lib.mjs';

const {pos, opt} = args();
const id = pos[0] ?? 'demo';
const v = loadProject(id);
const konu = v.slug ?? id;
const formats = pickFormats(v, opt);
if (!/^[a-z0-9-]+$/.test(konu)) throw new Error(`slug kurala uymuyor (küçük harf, Türkçe karakter yok, tire): ${konu}`);
const serveUrl = await makeBundle();
const outDir = path.join(root, 'out', id);
fs.mkdirSync(outDir, {recursive: true});

for (const fmt of formats) {
  const composition = await selectComposition({serveUrl, id: `${id}-${fmt}`, browserExecutable});
  const outputLocation = path.join(outDir, `${today()}-${konu}-${CHANNEL[fmt]}.mp4`);
  let last = -1;
  await renderMedia({
    serveUrl, composition, codec: 'h264', crf: 16, pixelFormat: 'yuv420p', imageFormat: 'jpeg', jpegQuality: 92,
    outputLocation, browserExecutable, concurrency: opt.concurrency ? Number(opt.concurrency) : null,
    onProgress: ({progress}) => {
      const p = Math.floor(progress * 10);
      if (p !== last) { last = p; process.stdout.write(`  ${fmt} %${p * 10}\n`); }
    },
  });
  console.log(`✓ ${path.relative(root, outputLocation)}`);
}
