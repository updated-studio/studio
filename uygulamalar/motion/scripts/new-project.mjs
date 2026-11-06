// Yeni video projesi: demo'yu şablon olarak kopyalar.
import fs from 'node:fs';
import path from 'node:path';
import {args, root} from './_lib.mjs';

const {pos, opt} = args();
const from = typeof opt.from === 'string' ? opt.from : 'haber';
const slug = pos[0];
if (!slug || !/^[a-z0-9-]+$/.test(slug)) { console.error('Kullanım: npm run new -- <slug> [--from haber|demo]  (küçük harf, rakam, tire)'); process.exit(1); }
const src = path.join(root, 'src/projects', from);
const dst = path.join(root, 'src/projects', slug);
if (fs.existsSync(dst)) { console.error(`Zaten var: ${dst}`); process.exit(1); }
fs.cpSync(src, dst, {recursive: true});
const vj = path.join(dst, 'video.json');
const v = JSON.parse(fs.readFileSync(vj, 'utf8'));
v.id = slug;
v.slug = slug;
v.title = `${slug} — 30 sn launch videosu`;
fs.writeFileSync(vj, JSON.stringify(v, null, 2) + '\n');
const docs = path.join(root, 'projects', slug);
fs.mkdirSync(docs, {recursive: true});
for (const f of ['brief.md', 'storyboard.md'])
  fs.copyFileSync(path.join(root, '.claude/skills/launch-motion/references', f.replace('.md', '-template.md')), path.join(docs, f));
console.log(`✓ src/projects/${slug}/ (sahne kodu) ve projects/${slug}/ (brief + storyboard) oluşturuldu.
Sonraki adım: src/projects/index.ts içine projeyi ekleyin (şablonun satırını kopyalayıp yolu ${slug} yapın).`);
