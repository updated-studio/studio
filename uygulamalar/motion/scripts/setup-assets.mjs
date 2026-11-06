// Fontları (latin + latin-ext → Türkçe karakterler) ve ses efektlerini hazırlar.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const brand = JSON.parse(fs.readFileSync(path.join(root, 'brand/brand.json'), 'utf8'));
const fontsDir = path.join(root, 'public/fonts');
fs.mkdirSync(fontsDir, {recursive: true});

let missing = [];
for (const spec of Object.values(brand.fonts)) {
  for (const w of spec.weights) {
    for (const subset of ['latin', 'latin-ext']) {
      const name = `${spec.fontsource}-${subset}-${w}-normal.woff2`;
      const src = path.join(root, 'node_modules/@fontsource', spec.fontsource, 'files', name);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(fontsDir, name));
      else if (!fs.existsSync(path.join(fontsDir, name))) missing.push(`@fontsource/${spec.fontsource} (${name})`);
    }
  }
}
if (missing.length) {
  console.error('Eksik fontlar:\n  ' + [...new Set(missing)].join('\n  '));
  console.error('Google Fonts ise: npm i @fontsource/<font-adi> ; özel font ise .woff2 dosyalarını public/fonts/ içine aynı adlarla koyun.');
  process.exit(1);
}
console.log('✓ fontlar public/fonts/');

const ff = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
const sfx = path.join(root, 'public/sfx');
fs.mkdirSync(sfx, {recursive: true});
// Yumuşak, kısa "tık"
ff(['-f', 'lavfi', '-i', 'sine=frequency=2400:duration=0.05', '-f', 'lavfi', '-i', 'anoisesrc=d=0.05:c=pink:a=0.4',
  '-filter_complex', '[0][1]amix=inputs=2,afade=t=out:st=0.004:d=0.045,highpass=f=900,volume=4', '-ar', '48000', path.join(sfx, 'click.wav')]);
console.log('✓ public/sfx/click.wav');

// YER TUTUCU müzik yatağı (30 sn ambient pad). Lisanslı müzikle değiştirin: public/audio/ + video.json → audio.music
const aud = path.join(root, 'public/audio');
fs.mkdirSync(aud, {recursive: true});
const notes = [110, 164.81, 220, 277.18, 329.63];
const inputs = notes.flatMap((n) => ['-f', 'lavfi', '-i', `sine=frequency=${n}:duration=31`]);
ff([...inputs, '-filter_complex',
  `${notes.map((_, i) => `[${i}]`).join('')}amix=inputs=${notes.length},tremolo=f=0.25:d=0.35,lowpass=f=1400,aecho=0.8:0.7:420:0.35,afade=t=in:d=2,afade=t=out:st=28:d=3,volume=7`,
  '-ar', '48000', path.join(aud, 'music-placeholder.wav')]);
console.log('✓ public/audio/music-placeholder.wav (yer tutucu)');
