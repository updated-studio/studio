// Stüdyo deposundaki marka kiti (TEK KAYNAK) → brand/brand.json + public/brand/logo/
//   ../../public/marka/makine/tokens.json  (değerler)
//   ../../public/marka/logo/svg/*.svg      (logolar)
// Kit kuralı (§14): "yazılımcı tokens.json kullanır, değeri elle yazmaz". brand.json'ı elle düzenlemeyin.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const marka = path.resolve(root, '../../public/marka');
const tokensPath = path.join(marka, 'makine/tokens.json');
if (!fs.existsSync(tokensPath)) { console.error(`Marka kiti bulunamadı: ${tokensPath} (bu klasör studio deposunun uygulamalar/motion altında olmalı)`); process.exit(1); }
const t = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
const slug = (fam) => fam.toLowerCase().replace(/\s+/g, '-');
const ws = (w) => (Array.isArray(w) ? w : [w]);
const bezier = t.motion.ease.match(/cubic-bezier\(([^)]+)\)/)[1].split(',').map(Number);

// Logoları kopyala (public/brand/logo/ üretilmiş klasördür, git'e girmez)
const logoSrc = path.join(marka, 'logo/svg');
const logoDst = path.join(root, 'public/brand/logo');
fs.rmSync(logoDst, {recursive: true, force: true});
fs.mkdirSync(logoDst, {recursive: true});
const logos = {};
for (const f of fs.readdirSync(logoSrc).filter((x) => x.endsWith('.svg'))) {
  fs.copyFileSync(path.join(logoSrc, f), path.join(logoDst, f));
  const m = f.match(/^updated-(yatay|dikey|up)(-domain|-outline|-clearspace)?(?:-(white|black|blue|orange))?\.svg$/);
  if (m && m[3] && !m[2]) logos[`${m[1]}-${m[3]}`] = `brand/logo/${f}`; // yalnız düz (domain/outline olmayan) sürümler
  if (m && m[3] && m[2] === '-domain') logos[`${m[1]}-domain-${m[3]}`] = `brand/logo/${f}`;
}

const out = {
  _source: `brand/kit/tokens.json v${t.$meta.version} (${t.$meta.date}) — ELLE DÜZENLEMEYİN, "npm run brand" ile üretilir`,
  name: t.$meta.brand,
  domain: t.$meta.domain,
  lang: t.$meta.lang,
  colors: {
    black: t.color.black.value,
    white: t.color.white.value,
    blue: t.color.blue.value,
    orange: t.color.orange.value,
    gray: t.color.gray.value,
    text: t.color.ui.text,
    text2: t.color.ui['text-2'],
    text3: t.color.ui['text-3'],
    line: t.color.ui.line,
    on: t.color.on,
    dark: {bg: t.color.dark.bg, surface: t.color.dark.surface, surface2: t.color.dark['surface-2'], line: t.color.dark.line, text: t.color.dark.text, text2: t.color.dark['text-2'], text3: t.color.dark['text-3']},
  },
  fonts: {
    display: {family: t.font.baslik.family, fontsource: slug(t.font.baslik.family), weights: [...new Set([t.font.baslik.weight, t.type.h3.weight])], uppercase: t.font.baslik.transform === 'uppercase'},
    body: {family: t.font.metin.family, fontsource: slug(t.font.metin.family), weights: [...new Set([...ws(t.font.metin.weight), ...ws(t.font.arayuz.weight)])].sort()},
    mono: {family: t.font.veri.family, fontsource: slug(t.font.veri.family), weights: ws(t.font.veri.weight)},
  },
  type: {headingLineHeight: t.type.headingLineHeight.heading, videoMin: t.type.minByChannel.video, label: t.type.label},
  shape: {radius: t.shape.radius, line: t.shape.line, lineStrong: t.shape.lineStrong, shadow: t.shape.shadow},
  motion: {
    ease: bezier,
    fastMs: t.motion.fast,
    baseMs: t.motion.base,
    slowMs: t.motion.slow,
    // marka-kiti.md §13 — tokens.json'da yok, kitin metninden:
    overshoot: false, rotate: false, parallax: false, typewriter: false,
    logoRevealMs: 800,
  },
  safe: {
    land: {x: t.safeArea.video.left, y: t.safeArea.video.top},
    port: {top: t.safeArea.story.top, bottom: t.safeArea.story.bottom, x: t.safeArea.story.left},
    feed: {x: t.safeArea.instagramPost.left, y: t.safeArea.instagramPost.top},
  },
  copy: {banned: t.copy.banned, address: t.copy.address.video, maxWords: t.copy.maxWords},
  fileName: t.fileName,
  logo: logos,
};
fs.writeFileSync(path.join(root, 'brand/brand.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`✓ brand/brand.json ← studio/public/marka (tokens v${t.$meta.version}, ${Object.keys(logos).length} logo)`);
