// ElevenLabs ile seslendirme + kelime zamanları (altyazı ve sahne zamanlaması için).
//   npm run seslendir -- <id> [--ses <voiceId>] [--model eleven_v4] [--metin metin.txt] [--ad <dosya adı>]
// Çıktı: public/audio/<ad>.mp3 (depoya girmez), src/projects/<id>/altyazi.json, video.json → audio.voice / audio.elevenlabs.
// Metindeki [excited] gibi v4 duygu etiketleri sese gider, altyazıya girmez.
// Anahtar: Claude ortamında ağ vekili ekler (xi-api-key); yerelde ELEVENLABS_API_KEY ortam değişkeni.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {args, root} from './_lib.mjs';

const {pos, opt} = args();
const id = pos[0];
const dir = path.join(root, 'src/projects', id);
const vPath = path.join(dir, 'video.json');
const v = JSON.parse(fs.readFileSync(vPath, 'utf8'));
const el = v.audio?.elevenlabs ?? {};
const voiceId = opt.ses ?? el.voiceId;
const model = opt.model ?? el.model ?? 'eleven_v4';
const metinDosya = opt.metin ?? el.text ?? 'metin.txt';
const ad = opt.ad ?? `${id}-ses`;
const text = fs.readFileSync(path.join(dir, metinDosya), 'utf8').trim();
const body = JSON.stringify({text, model_id: model, language_code: 'tr', ...(el.settings ? {voice_settings: el.settings} : {})});
const key = process.env.ELEVENLABS_API_KEY ?? 'proxy-injected';
const out = execFileSync('curl', ['-sS', '-H', `xi-api-key: ${key}`, '-H', 'Content-Type: application/json', '-d', body,
  `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`], {maxBuffer: 1 << 28}).toString();
const d = JSON.parse(out);
if (!d.audio_base64) { console.error(out.slice(0, 400)); process.exit(1); }
fs.mkdirSync(path.join(root, 'public/audio'), {recursive: true});
fs.writeFileSync(path.join(root, 'public/audio', `${ad}.mp3`), Buffer.from(d.audio_base64, 'base64'));
const a = d.alignment;
const words = [];
let cur = '', s = 0, e = 0, inTag = false;
a.characters.forEach((c, i) => {
  if (c === '[') inTag = true;
  if (inTag) { if (c === ']') inTag = false; return; } // duygu etiketi: altyazıya girmez
  if (/\s/.test(c)) { if (cur) words.push({w: cur, s: +s.toFixed(3), e: +e.toFixed(3)}); cur = ''; return; }
  if (!cur) s = a.character_start_times_seconds[i];
  cur += c; e = a.character_end_times_seconds[i];
});
if (cur) words.push({w: cur, s: +s.toFixed(3), e: +e.toFixed(3)});
fs.writeFileSync(path.join(dir, 'altyazi.json'), JSON.stringify(words));
v.audio.voice = `audio/${ad}.mp3`;
v.audio.elevenlabs = {...el, voiceId, model, text: metinDosya};
fs.writeFileSync(vPath, JSON.stringify(v, null, 2) + '\n');
console.log(`✓ ${ad}.mp3 · ${words.length} kelime · ${words[words.length - 1].e.toFixed(1)} sn · ${model}`);
