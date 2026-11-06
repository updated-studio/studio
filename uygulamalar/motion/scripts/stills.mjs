// Her sahnenin anahtar karesini + sahne geçişlerini her formatta still olarak render eder,
// formata göre kontakt sayfası (tek PNG) üretir. Claude bu PNG'lere bakıp taşma/çakışma düzeltir.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {renderStill, selectComposition} from '@remotion/renderer';
import {FORMATS, args, pickFormats, browserExecutable, loadProject, makeBundle, root} from './_lib.mjs';

const {pos, opt} = args();
const id = pos[0] ?? 'demo';
const v = loadProject(id);
const formats = pickFormats(v, opt);
const serveUrl = await makeBundle();
const outDir = path.join(root, 'out', id, 'stills');
fs.mkdirSync(outDir, {recursive: true});

// Kontrol edilecek kareler: her sahnenin key karesi + geçişlerin hemen öncesi/sonrası
const frames = [];
let from = 0;
for (const [i, s] of v.scenes.entries()) {
  frames.push({f: from + (s.key ?? Math.floor(s.frames * 0.7)), label: `${i + 1}-${s.id}-key`});
  if (i > 0) frames.push({f: from + 2, label: `${i + 1}-${s.id}-start`});
  from += s.frames;
}
if (opt.frames) String(opt.frames).split(',').forEach((x) => frames.push({f: Number(x), label: `f${x}`}));

for (const fmt of formats) {
  const inputProps = {guides: !opt['no-guides']}; // güvenli alan çizgileri (varsayılan açık)
  const composition = await selectComposition({serveUrl, id: `${id}-${fmt}`, browserExecutable, inputProps});
  const files = [];
  for (const fr of frames) {
    const output = path.join(outDir, fmt, `${fr.label}.png`);
    fs.mkdirSync(path.dirname(output), {recursive: true});
    await renderStill({serveUrl, composition, frame: fr.f, output, browserExecutable, inputProps, scale: opt.scale ? Number(opt.scale) : 0.5});
    files.push(output);
    process.stdout.write(`✓ ${fmt} ${fr.label} (kare ${fr.f})\n`);
  }
  // kontakt sayfası
  const cols = fmt === '16x9' ? 3 : 5;
  const sheet = path.join(outDir, `contact-${fmt}.png`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...files.flatMap((f) => ['-i', f]), '-filter_complex',
    `${files.map((_, i) => `[${i}]pad=iw+16:ih+16:8:8:color=0x333333[p${i}]`).join(';')};${files.map((_, i) => `[p${i}]`).join('')}xstack=inputs=${files.length}:layout=${files.map((_, i) => `${i % cols === 0 ? '0' : Array.from({length: i % cols}, () => 'w0').join('+')}_${Math.floor(i / cols) === 0 ? '0' : Array.from({length: Math.floor(i / cols)}, () => 'h0').join('+')}`).join('|')}:fill=0x333333`,
    sheet]);
  console.log(`▣ ${path.relative(root, sheet)}`);
}
