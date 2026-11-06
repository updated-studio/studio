import React from 'react';
import {useCurrentFrame} from 'remotion';
import {At, Stage} from '../../../components/Stage';
import {Background} from '../../../components/Background';
import {Camera} from '../../../components/Camera';
import {Kinetic} from '../../../components/Kinetic';
import {Counter} from '../../../components/Counter';
import {C, FONT_MONO} from '../../../lib/brand';
import {useLayout} from '../../../lib/layout';
import {enterP, exitP, fadeIn} from '../../../lib/motion';
import {cfg} from '../config';
import {ChannelTile} from './ChannelTile';

const c = cfg.copy.hook;
const EXIT = 226;

/** Sahne 1 · Hook — siyah haber zemini; dört kanal kartı tek tek gelir, sayaç 0 → 12, başlık kelime kelime. */
export const Hook: React.FC = () => {
  const f = useCurrentFrame();
  const L = useLayout();
  const v = L.pick({
    land: {grid: {x: 400, y: 40}, head: {x: -380, y: 40, size: 150, w: 760, align: 'left' as const}},
    port: {grid: {x: 0, y: -170}, head: {x: 0, y: 360, size: 140, w: 900, align: 'center' as const}},
    feed: {grid: {x: 0, y: -170}, head: {x: 0, y: 330, size: 116, w: 940, align: 'center' as const}},
  });
  const tw = 400, th = 166, gap = 24;
  const ex = exitP(f, EXIT);
  return (
    <Stage bg={C.black}>
      <Background color={C.black} />
      <Camera keys={[{f: 0, scale: 1}, {f: 240, scale: 1.04}]} microPush={0}>
        <At x={v.grid.x} y={v.grid.y} style={{opacity: 1 - ex}}>
          <div style={{position: 'relative', width: tw * 2 + gap, height: th * 2 + gap}}>
            {cfg.copy.channels.map((ch, i) => {
              const s = 8 + i * 8; // tek tek
              return (
                <div key={ch.name} style={{position: 'absolute', left: (i % 2) * (tw + gap), top: Math.floor(i / 2) * (th + gap), opacity: fadeIn(f, s), transform: `translateY(${(1 - enterP(f, s)) * 40}px)`}}>
                  <ChannelTile name={ch.name} format={ch.format} w={tw} />
                </div>
              );
            })}
          </div>
        </At>
        <At x={v.head.x} y={v.head.y}>
          <Kinetic text={c.headline} start={66} exitAt={EXIT} size={v.head.size} maxWidth={v.head.w} align={v.head.align} highlight={c.highlight} step={7} />
        </At>
      </Camera>
      <At x={L.safe.right - 190} y={L.safe.top + 40} style={{opacity: fadeIn(f, 20) * (1 - ex)}}>
        <div style={{width: 380, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', borderBottom: `3px solid ${C.white}`, paddingBottom: 8}}>
          <span style={{fontFamily: FONT_MONO, fontSize: 28, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.04em'}}>{c.counterLabel.toLocaleUpperCase('tr-TR')}</span>
          <Counter from={0} to={c.counterTo} start={30} style={{fontSize: 56, color: C.white}} />
        </div>
      </At>
    </Stage>
  );
};
