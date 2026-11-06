import React from 'react';
import {AbsoluteFill, Html5Audio, Sequence, staticFile} from 'remotion';
import {loadBrandFonts} from '../../lib/fonts';
import {UpMark} from '../../components/UpMark';
import {Captions} from '../../components/Captions';
import {altyazi, cfg} from './config';
import {Hook} from './scenes/Hook';
import {Kamera} from './scenes/Kamera';

loadBrandFonts();
const SCENES: Record<string, React.FC> = {hook: Hook, kamera: Kamera};

export const IphoneKiyas: React.FC = () => {
  let from = 0;
  return (
    <AbsoluteFill style={{background: '#000'}}>
      {cfg.scenes.map((s) => {
        const S = SCENES[s.id];
        const el = <Sequence key={s.id} from={from} durationInFrames={s.frames} name={s.name}><S /></Sequence>;
        from += s.frames;
        return el;
      })}
      <UpMark />
      <Captions words={altyazi} />
      {cfg.audio.voice && <Html5Audio src={staticFile(cfg.audio.voice)} volume={cfg.audio.voiceVolume} />}
    </AbsoluteFill>
  );
};
