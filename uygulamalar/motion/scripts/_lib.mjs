import fs from 'node:fs';
import path from 'node:path';
import {bundle} from '@remotion/bundler';

export const root = path.resolve(import.meta.dirname, '..');
export const HEADLESS = '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
export const browserExecutable = fs.existsSync(HEADLESS) ? HEADLESS : null;
export const FORMATS = ['16x9', '9x16', '4x5'];
// Kit §15 dosya adı: yyyy-aa-gg-konu-kanal.uzanti (küçük harf, Türkçe karakter ve boşluk yok)
export const CHANNEL = {'16x9': 'youtube', '9x16': 'reels', '4x5': 'ig'};
export const today = () => new Date().toISOString().slice(0, 10);

export const args = () => {
  const a = process.argv.slice(2);
  const opt = {};
  const pos = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith('--')) opt[a[i].slice(2)] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
    else pos.push(a[i]);
  }
  return {pos, opt};
};

export const loadProject = (id) => {
  const p = path.join(root, 'src/projects', id, 'video.json');
  if (!fs.existsSync(p)) throw new Error(`Proje yok: ${id} (${p})`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
};

export const makeBundle = async () => {
  process.stdout.write('… paketleniyor\n');
  return bundle({entryPoint: path.join(root, 'src/index.ts'), publicDir: path.join(root, 'public')});
};
