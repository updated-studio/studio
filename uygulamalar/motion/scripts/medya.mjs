// Depoya girmeyen medyayı (ürün görselleri) video.json → gorselIndir adreslerinden yeniden indirir.
//   npm run medya -- <id>
// Ses: npm run seslendir -- <id> · Müzik: video.json → audio.epidemic (Claude, Epidemic bağlayıcısıyla yeniden indirir).
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {args, loadProject, root} from './_lib.mjs';

const id = args().pos[0];
const v = loadProject(id);
for (const [rel, url] of Object.entries(v.gorselIndir ?? {})) {
  const out = path.join(root, 'public', rel);
  if (fs.existsSync(out)) { console.log(`= ${rel}`); continue; }
  fs.mkdirSync(path.dirname(out), {recursive: true});
  execFileSync('curl', ['-sS', '-L', '-o', out, url]);
  console.log(`✓ ${rel}`);
}
