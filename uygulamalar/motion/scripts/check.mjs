// Ön-render kontrolü: storyboard zamanlaması, süre, metin/varlık kontrolleri.
import fs from 'node:fs';
import path from 'node:path';
import {args, loadProject, root} from './_lib.mjs';

const {pos} = args();
const id = pos[0] ?? 'demo';
const v = loadProject(id);
const errs = [];
const warns = [];

const total = v.scenes.reduce((a, s) => a + s.frames, 0);
const target = Math.round((v.durationSec ?? 30) * v.fps);
if (total !== target) errs.push(`Sahne toplamı ${total} kare (${(total / v.fps).toFixed(2)} sn) ≠ hedef ${target} kare`);

let from = 0;
console.log(`\n${v.title}\n${'─'.repeat(60)}`);
for (const [i, s] of v.scenes.entries()) {
  const sec = (x) => `${Math.floor(x / v.fps / 60)}:${(x / v.fps % 60).toFixed(2).padStart(5, '0')}`;
  console.log(`Sahne ${i + 1} · ${s.name.padEnd(28)} ${sec(from)}–${sec(from + s.frames)}  kare ${from}–${from + s.frames}`);
  if (s.frames < 90) warns.push(`"${s.name}" ${s.frames} kare — önemli bilgi en az ~90 kare (1.5 sn) ekranda kalmalı`);
  if (s.key !== undefined && (s.key < 0 || s.key >= s.frames)) errs.push(`"${s.name}" key karesi (${s.key}) sahne dışında`);
  if (!fs.existsSync(path.join(root, 'src/projects', id, 'scenes'))) errs.push('scenes/ klasörü yok');
  from += s.frames;
}

// Font ve ses varlıkları
const brand = JSON.parse(fs.readFileSync(path.join(root, 'brand/brand.json'), 'utf8'));
for (const spec of Object.values(brand.fonts))
  for (const w of spec.weights)
    for (const sub of ['latin', 'latin-ext'])
      if (!fs.existsSync(path.join(root, 'public/fonts', `${spec.fontsource}-${sub}-${w}-normal.woff2`)))
        errs.push(`Font eksik: ${spec.fontsource} ${w} ${sub} → npm run setup`);
if (!fs.existsSync(path.join(root, 'public/sfx/click.wav'))) errs.push('public/sfx/click.wav yok → npm run setup');
if (v.audio?.music && !fs.existsSync(path.join(root, 'public', v.audio.music))) errs.push(`Müzik dosyası yok: public/${v.audio.music}${v.audio.epidemic ? ' → Epidemic\'ten yeniden indir (video.json → audio.epidemic)' : ''}`);
if (!v.audio?.music) warns.push('Müzik yok (bilerek mi? İçeriğe göre Epidemic\'ten seçilebilir)');
if (v.audio?.music?.includes('placeholder')) warns.push('Müzik yer tutucu — teslimden önce lisanslı müzikle değiştirin');


// Marka uyumu (UPDATED kit §7): yasaklı kelimeler, "AI", ünlem, kelime sınırları
const banned = brand.copy?.banned ?? [];
const strings = [];
const collect = (o, p = '') => Object.entries(o).forEach(([k, x]) => {
  if (typeof x === 'string') strings.push([`${p}${k}`, x]);
  else if (Array.isArray(x)) x.forEach((y, i) => (typeof y === 'string' ? strings.push([`${p}${k}[${i}]`, y]) : y && collect(y, `${p}${k}[${i}].`)));
  else if (x && typeof x === 'object') collect(x, `${p}${k}.`);
});
collect(v.copy);
for (const [k, s] of strings) {
  for (const b of banned) if (s.toLocaleLowerCase('tr').includes(b.toLocaleLowerCase('tr'))) errs.push(`${k}: yasaklı ifade "${b}" → "${s}"`);
  if (/\bAI\b/.test(s)) errs.push(`${k}: "AI" yerine "yapay zekâ" (kit §7) → "${s}"`);
  if ((s.match(/\?/g) ?? []).length > 1) errs.push(`${k}: tek soru işareti (kit §7)`);
}
if (v.slug && !/^[a-z0-9-]+$/.test(v.slug)) errs.push(`slug "${v.slug}": küçük harf, Türkçe karakter ve boşluk yok, tire ile (kit §15)`);
for (const [k, rel] of Object.entries(brand.logo ?? {})) if (!fs.existsSync(path.join(root, 'public', rel))) errs.push(`Logo dosyası yok: ${k} → npm run brand`);
if (!Object.keys(brand.logo ?? {}).length) errs.push('Logo yok → npm run brand');

// Metin uzunlukları (kinetik başlıklar kısa olmalı)
const walk = (o, p = '') =>
  Object.entries(o).forEach(([k, x]) => {
    if (typeof x === 'string' && /headline|tagline/.test(k) && x.split(' ').length > (brand.copy?.maxWords?.storyTitle ?? 8)) warns.push(`${p}${k}: ${x.split(' ').length} kelime — 30 sn'de okunması zor, story başlığı ≤5 kelime (kit §9)`);
    else if (x && typeof x === 'object' && !Array.isArray(x)) walk(x, `${p}${k}.`);
  });
walk(v.copy);

console.log('─'.repeat(60) + `\nToplam: ${total} kare = ${(total / v.fps).toFixed(2)} sn @ ${v.fps} fps`);
warns.forEach((w) => console.log('⚠ ' + w));
errs.forEach((e) => console.log('✗ ' + e));
if (errs.length) process.exit(1);
console.log('✓ kontrol geçti\n');
