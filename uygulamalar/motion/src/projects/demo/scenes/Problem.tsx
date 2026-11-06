import React from 'react';
import {useCurrentFrame} from 'remotion';
import {At, Fill, Stage} from '../../../components/Stage';
import {Background} from '../../../components/Background';
import {Camera, CamKey} from '../../../components/Camera';
import {Cursor, CursorKey} from '../../../components/Cursor';
import {HeadBlock, Kinetic} from '../../../components/Kinetic';
import {Window} from '../../../components/Window';
import {C} from '../../../lib/brand';
import {useLayout} from '../../../lib/layout';
import {enterP, exitP, fadeIn, stagger, tween} from '../../../lib/motion';
import {cfg} from '../config';

const c = cfg.copy.problem;
const EXIT = 402;
const HEAD = 270;
const ROW = 68;
const TOP = 64 + 3 + 8;

/** Sahne 2 · Problem — aynı başlık üç araçta elle taşınır; imleç yaylarla, kamera takip eder. */
export const Problem: React.FC = () => {
  const f = useCurrentFrame();
  const L = useLayout();
  const v = L.pick({
    land: {w: 600, h: 400, gap: 660, axis: 'x' as const, zoom: 1.3, out: 0.84},
    port: {w: 900, h: 400, gap: 520, axis: 'y' as const, zoom: 1.05, out: 0.82},
    feed: {w: 640, h: 400, gap: 700, axis: 'x' as const, zoom: 1.4, out: 0.8},
  });
  const pos = [-1, 0, 1].map((k) => (v.axis === 'x' ? {x: k * v.gap, y: 0} : {x: 0, y: k * v.gap}));
  const [doc, design, plan] = pos;
  const rowY = (w: {y: number}, i: number) => w.y - v.h / 2 + TOP + ROW * i + ROW / 2;
  const left = (w: {x: number}) => w.x - v.w / 2;

  const cursor: CursorKey[] = [
    {f: 0, x: left(doc) + 360, y: rowY(doc, 0) + 120},
    {f: 45, x: left(doc) + 200, y: rowY(doc, 0), click: true},
    {f: 62, x: left(doc) + 210, y: rowY(doc, 0) + 6},
    {f: 120, x: left(design) + 200, y: rowY(design, 2), click: true},
    {f: 150, x: left(design) + 300, y: rowY(design, 2) + 60}, // tereddüt
    {f: 178, x: left(design) + 250, y: rowY(design, 2) + 30},
    {f: 230, x: left(plan) + 200, y: rowY(plan, 1), click: true},
    {f: 262, x: left(plan) + 250, y: rowY(plan, 1) + 50},
  ];
  const cam: CamKey[] = [
    {f: 0, scale: v.zoom, ...doc}, {f: 70, ...doc}, {f: 120, ...design}, {f: 180, ...design},
    {f: 230, ...plan}, {f: 262, scale: v.zoom, ...plan}, {f: 312, scale: v.out, x: 0, y: 0},
  ];
  const ex = exitP(f, EXIT);

  const Row: React.FC<{text: string; hi?: boolean; style?: React.CSSProperties}> = ({text, hi, style}) => (
    <div style={{height: ROW, display: 'flex', alignItems: 'center', padding: '0 16px', fontSize: 36, color: C.text, borderBottom: `1px solid ${C.line}`,
      background: hi ? C.gray : 'transparent', borderLeft: `3px solid ${hi ? C.blue : 'transparent'}`, whiteSpace: 'nowrap', ...style}}>{text}</div>
  );
  const win = (i: number, title: string, rows: React.ReactNode) => (
    <At x={pos[i].x} y={pos[i].y} style={{opacity: fadeIn(f, stagger(0, i))}} transform={`translateY(${(1 - enterP(f, stagger(0, i))) * 30}px)`}>
      <Window title={title} w={v.w} h={v.h}>{rows}</Window>
    </At>
  );

  return (
    <Stage>
      <Background />
      <Fill style={{opacity: 1 - ex}}>
        <div style={{position: 'absolute', left: '50%', top: '50%'}}>
          <Camera keys={cam} microPush={0.00002}>
            {win(0, c.apps.doc, c.doc.map((t, i) => <Row key={t} text={t} hi={i === 0 && f >= 45 && f < 135} />))}
            {win(1, c.apps.design, (
              <>
                {c.design.map((t) => <Row key={t} text={t} />)}
                <Row text={c.doc[0]} hi={f >= 122 && f < 170} style={{opacity: fadeIn(f, 122, 12)}} />
              </>
            ))}
            {win(2, c.apps.plan, c.plan.map((t, i) => <Row key={t} text={i === 1 && f >= 236 ? `${t} · ${c.doc[0]}` : t} hi={i === 1 && f >= 230} />))}
            <Cursor keys={cursor} appear={4} />
          </Camera>
        </div>
        <Stage bg="transparent">
          <At>
            <HeadBlock p={tween(f, HEAD - 6, HEAD + 14, 0, 1)}>
              <Kinetic text={c.headline} start={HEAD + 6} size={L.pick({land: 150, port: 128, feed: 112})} maxWidth={L.safeW - 100} step={8} highlight={c.highlight} />
            </HeadBlock>
          </At>
        </Stage>
      </Fill>
    </Stage>
  );
};
