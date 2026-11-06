import React from 'react';
import {AbsoluteFill, Html5Audio, Sequence, staticFile} from 'remotion';
import {loadBrandFonts, loadFonts} from '../../lib/fonts';
import {Captions} from '../../components/Captions';
import {UpMark} from '../../components/UpMark';
import {INTER, altyazi, cfg} from './config';
import {Hook} from './scenes/Hook';
import {Cip} from './scenes/Cip';
import {Kamera} from './scenes/Kamera';
import {Pil} from './scenes/Pil';
import {Island} from './scenes/Island';
import {Final} from './scenes/Final';

loadBrandFonts();
loadFonts([{family: 'Inter', fontsource: 'inter', weights: [400, 500, 600, 700, 800]}]);
const SCENES: Record<string, React.FC> = {hook: Hook, cip: Cip, kamera: Kamera, pil: Pil, island: Island, final: Final};

export const IphoneReels: React.FC = () => {
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
      <Captions words={altyazi} font={INTER} weight={700} />
      {cfg.audio.voice && <Html5Audio src={staticFile(cfg.audio.voice)} volume={cfg.audio.voiceVolume} />}
    </AbsoluteFill>
  );
};
