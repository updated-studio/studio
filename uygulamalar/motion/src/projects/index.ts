import React from 'react';
import demoCfg from './demo/video.json';
import {DemoVideo} from './demo/Video';
import haberCfg from './haber/video.json';
import {HaberVideo} from './haber/Video';

/** Proje kaydı. Yeni proje: `npm run new -- <slug>` sonra buraya ekleyin. */
export const projects: {id: string; title: string; fps: number; frames: number; Component: React.FC}[] = [
  {id: haberCfg.id, title: haberCfg.title, fps: haberCfg.fps, frames: haberCfg.scenes.reduce((a, s) => a + s.frames, 0), Component: HaberVideo},
  {id: demoCfg.id, title: demoCfg.title, fps: demoCfg.fps, frames: demoCfg.scenes.reduce((a, s) => a + s.frames, 0), Component: DemoVideo},
];
