import React from 'react';
import {useCurrentFrame} from 'remotion';
import {At, Fill, Stage} from '../../../components/Stage';
import {Background} from '../../../components/Background';
import {Camera} from '../../../components/Camera';
import {Counter, useCount} from '../../../components/Counter';
import {HeadBlock, Kinetic} from '../../../components/Kinetic';
import {Click} from '../../../components/Cursor';
import {useLayout} from '../../../lib/layout';
import {exitP, tween} from '../../../lib/motion';
import {cfg} from '../config';
import {Studio} from './Studio';

const c = cfg.copy.payoff;
const LIVE = (i: number) => 12 + i * 8; // Yayında kaskadı
const COUNT = 40;
const PULL = COUNT + 60; // sayaç 0'a inince kamera geri çekilir
const HEAD = 176;
const EXIT = 342;

/** Sahne 4 · Payoff — kanallar sırayla Yayında, sayaç 12 → 0, kamera geri çekilir, başlık siyah blokta. */
export const Payoff: React.FC = () => {
  const f = useCurrentFrame();
  const L = useLayout();
  const left = useCount(cfg.copy.hook.counterTo, 0, COUNT);
  const ex = exitP(f, EXIT);
  return (
    <Stage>
      <Background />
      <Fill style={{opacity: 1 - ex}}>
        <Stage bg="transparent">
          <Camera keys={[{f: 0, scale: 1}, {f: PULL, scale: 1}, {f: PULL + 60, scale: L.pick({land: 0.9, port: 0.92, feed: 0.9})}]} microPush={0}>
            <At>
              <Studio mode={L.mode} text={cfg.copy.fix.headline} textOp={1} chars={cfg.copy.fix.headline.length} buttonPress={0}
                cards={[0, 1, 2, 3].map((i) => ({inP: 1, inOp: 1, status: f >= LIVE(i) ? 'yayinda' : 'planlandi', progress: tween(f, LIVE(i), LIVE(i) + 20, 0.66, 1)}))}
                counter={<Counter from={cfg.copy.hook.counterTo} to={0} start={COUNT} />} counterAlert={left > 0} />
            </At>
          </Camera>
          <At>
            <HeadBlock p={tween(f, HEAD - 6, HEAD + 14, 0, 1)}>
              <Kinetic text={c.headline} start={HEAD + 6} size={L.pick({land: 150, port: 132, feed: 116})} maxWidth={L.safeW - 100} step={8} highlight={c.highlight} />
            </HeadBlock>
          </At>
        </Stage>
      </Fill>
      {[0, 1, 2, 3].map((i) => <Click key={i} at={LIVE(i)} volume={0.25} />)}
    </Stage>
  );
};
