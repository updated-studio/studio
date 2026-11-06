import React from 'react';
import {AbsoluteFill, Html5Audio, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {loadBrandFonts, loadFonts} from '../../lib/fonts';
import {Captions} from '../../components/Captions';
import {UpMark} from '../../components/UpMark';
import {useLayout} from '../../lib/layout';
import {INTER, altyazi, cfg} from './config';
import {Alan, Eis, Filtre, Fiyat, Hook, Kit, Odak, Optik} from './scenes/Sahneler';
import {Final} from './scenes/Final';

loadBrandFonts();
loadFonts([{family: 'Inter', fontsource: 'inter', weights: [400, 500, 600, 700, 800]}]);
const SCENES: Record<string, React.FC> = {hook: Hook, kit: Kit, odak: Odak, optik: Optik, eis: Eis, filtre: Filtre, alan: Alan, fiyat: Fiyat, final: Final};

/** Kit §7: firmadan gelen ürün / iş birliği videoda açıkça görünür — sağ üstte, logo hizasında, bütün video boyunca. */
const Isbirligi: React.FC = () => {
  const L = useLayout();
  const f = useCurrentFrame();
  return <div style={{position: 'absolute', right: L.W / 2 - L.safe.right, top: L.H / 2 + L.safe.top + 22, fontFamily: INTER, fontWeight: 600, fontSize: 28, color: 'rgba(255,255,255,0.85)', opacity: Math.min(1, f / 12), padding: '6px 16px', borderRadius: 99, border: '1px solid rgba(255,255,255,0.35)', background: 'rgba(0,0,0,0.25)'}}>{cfg.copy.isbirligi}</div>;
};

export const TelesinVideo: React.FC = () => {
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
      <UpMark />
      <Isbirligi />
      <Captions words={altyazi} font={INTER} weight={700} />
      {cfg.audio.voice && <Html5Audio src={staticFile(cfg.audio.voice)} volume={cfg.audio.voiceVolume} />}
      {cfg.audio.music && (
        <Html5Audio src={staticFile(cfg.audio.music)} volume={(f) => interpolate(f, [0, 20, durationInFrames - 50, durationInFrames], [0, cfg.audio.musicVolume, cfg.audio.musicVolume, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})} />
      )}
    </AbsoluteFill>
  );
};
