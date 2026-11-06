import React from 'react';
import demoCfg from './demo/video.json';
import {DemoVideo} from './demo/Video';
import haberCfg from './haber/video.json';
import {HaberVideo} from './haber/Video';
import iphoneCfg from './iphone-kiyas/video.json';
import reelsCfg from './iphone-reels/video.json';
import telesinCfg from './telesin-35x/video.json';
import {TelesinVideo} from './telesin-35x/Video';
import {IphoneReels} from './iphone-reels/Video';
import {IphoneKiyas} from './iphone-kiyas/Video';

/** Proje kaydı. Yeni proje: `npm run new -- <slug>` sonra buraya ekleyin. */
export const projects: {id: string; title: string; fps: number; frames: number; Component: React.FC; safeTop?: number}[] = [
  {id: telesinCfg.id, title: telesinCfg.title, fps: telesinCfg.fps, frames: telesinCfg.scenes.reduce((a, s) => a + (s.frames ?? 0), 0), Component: TelesinVideo},
  {id: reelsCfg.id, title: reelsCfg.title, fps: reelsCfg.fps, frames: reelsCfg.scenes.reduce((a, s) => a + s.frames, 0), Component: IphoneReels, safeTop: (reelsCfg as {safeTop?: number}).safeTop},
  {id: iphoneCfg.id, title: iphoneCfg.title, fps: iphoneCfg.fps, frames: iphoneCfg.scenes.reduce((a, s) => a + s.frames, 0), Component: IphoneKiyas},
  {id: haberCfg.id, title: haberCfg.title, fps: haberCfg.fps, frames: haberCfg.scenes.reduce((a, s) => a + s.frames, 0), Component: HaberVideo},
  {id: demoCfg.id, title: demoCfg.title, fps: demoCfg.fps, frames: demoCfg.scenes.reduce((a, s) => a + s.frames, 0), Component: DemoVideo},
];
