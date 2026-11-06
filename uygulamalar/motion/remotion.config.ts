import {Config} from '@remotion/cli/config';
import fs from 'node:fs';

// Bulut ortamında hazır gelen headless Chromium; Mac'te yoksa Remotion kendi indirdiğini kullanır.
const HEADLESS = '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
if (fs.existsSync(HEADLESS)) Config.setBrowserExecutable(HEADLESS);

Config.setVideoImageFormat('jpeg');
Config.setCodec('h264');
Config.setCrf(16);
Config.setPixelFormat('yuv420p');
