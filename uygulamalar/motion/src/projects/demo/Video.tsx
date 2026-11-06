import React from 'react';
import {AbsoluteFill, Html5Audio, Sequence, interpolate, staticFile, useVideoConfig} from 'remotion';
import {loadBrandFonts} from '../../lib/fonts';
import {cfg} from './config';
import {Hook} from './scenes/Hook';
import {Problem} from './scenes/Problem';
import {Fix} from './scenes/Fix';
import {Payoff} from './scenes/Payoff';
import {Cta} from './scenes/Cta';

loadBrandFonts();

const SCENES: Record<string, React.FC> = {hook: Hook, problem: Problem, fix: Fix, payoff: Payoff, cta: Cta};

export const totalFrames = cfg.scenes.reduce((a, s) => a + s.frames, 0);

export const DemoVideo: React.FC = () => {
  const {durationInFrames} = useVideoConfig();
  let from = 0;
  return (
    <AbsoluteFill style={{background: '#000'}}>
      {cfg.scenes.map((s) => {
        const C = SCENES[s.id];
        const el = (
          <Sequence key={s.id} from={from} durationInFrames={s.frames} name={s.name}>
            <C />
          </Sequence>
        );
        from += s.frames;
        return el;
      })}
      {cfg.audio.music && (
        <Html5Audio
          src={staticFile(cfg.audio.music)}
          volume={(f) => interpolate(f, [0, 30, durationInFrames - 60, durationInFrames], [0, cfg.audio.musicVolume, cfg.audio.musicVolume, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}
        />
      )}
    </AbsoluteFill>
  );
};
