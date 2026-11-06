import React from 'react';
import {AbsoluteFill, Html5Audio, Sequence, interpolate, staticFile, useVideoConfig} from 'remotion';
import {loadBrandFonts} from '../../lib/fonts';
import {cfg} from './config';
import {Hook} from './scenes/Hook';
import {Facts} from './scenes/Facts';
import {Cta} from './scenes/Cta';
import {LogoEnd} from './scenes/LogoEnd';

loadBrandFonts();
const SCENES: Record<string, React.FC> = {hook: Hook, facts: Facts, cta: Cta, logo: LogoEnd};

export const HaberVideo: React.FC = () => {
  const {durationInFrames} = useVideoConfig();
  let from = 0;
  return (
    <AbsoluteFill style={{background: '#000'}}>
      {cfg.scenes.map((s) => {
        const S = SCENES[s.id];
        const el = <Sequence key={s.id} from={from} durationInFrames={s.frames} name={s.name}><S /></Sequence>;
        from += s.frames;
        return el;
      })}
      {cfg.audio.music && (
        <Html5Audio src={staticFile(cfg.audio.music)}
          volume={(f) => interpolate(f, [0, 20, durationInFrames - 60, durationInFrames], [0, cfg.audio.musicVolume, cfg.audio.musicVolume, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})} />
      )}
    </AbsoluteFill>
  );
};
