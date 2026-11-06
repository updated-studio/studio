import React from 'react';
import {useCurrentFrame} from 'remotion';
import {At, Stage} from '../../../components/Stage';
import {Background} from '../../../components/Background';
import {Camera} from '../../../components/Camera';
import {Cursor} from '../../../components/Cursor';
import {useLayout} from '../../../lib/layout';
import {enterP, fadeIn, pressMix, tween} from '../../../lib/motion';
import {cfg} from '../config';
import {CardState, Status, Studio, studioGeom} from './Studio';

const c = cfg.copy.fix;
const PASTE = 66; // başlık alana yapıştırılır (daktilo efekti yasak — kit §13)
const CLICK = 156;
const CARD_IN = 176;
/** Kart i'nin İncelemede penceresi. Pencereler çakışmaz → yüzeyde aynı anda tek turuncu öğe (kit §3). */
export const REVIEW = (i: number) => 236 + i * 40;

export const fixCard = (f: number, i: number): CardState => {
  const r = REVIEW(i);
  const status: Status = f < r ? 'taslak' : f < r + 40 ? 'inceleme' : 'planlandi';
  return {inP: enterP(f, CARD_IN + i * 6), inOp: fadeIn(f, CARD_IN + i * 6), status, progress: tween(f, r, r + 40, 0.15, 0.66)};
};

/** Sahne 3 · Çözüm — başlık bir kez yazılır, "Kanallara gönder", kanallar sırayla incelemeden geçer. */
export const Fix: React.FC = () => {
  const f = useCurrentFrame();
  const L = useLayout();
  const g = studioGeom(L.mode);
  const wx = (x: number) => x - g.W / 2;
  const wy = (y: number) => y - g.H / 2;
  const field = {x: wx(g.field.x + g.field.w * 0.4), y: wy(g.field.y + g.field.h / 2)};
  const btn = {x: wx(g.button.x + g.button.w / 2), y: wy(g.button.y + g.button.h / 2)};
  const focus = {x: (wx(g.field.x) + wx(g.button.x + g.button.w)) / 2, y: (field.y + btn.y) / 2};
  const zoom = L.pick({land: 1.18, port: 1.0, feed: 1.0});
  const textOp = fadeIn(f, PASTE, 7); // 120 ms solma
  return (
    <Stage>
      <Background />
      <Camera keys={[{f: 0, scale: 1, x: 0, y: 0}, {f: 24, scale: 1, x: 0, y: 0}, {f: 72, scale: zoom, ...focus}, {f: 168, scale: zoom, ...focus}, {f: 220, scale: 1, x: 0, y: 0}]} microPush={0.00002}>
        <At style={{opacity: fadeIn(f, 0)}} transform={`translateY(${(1 - enterP(f, 0)) * 30}px)`}>
          <Studio mode={L.mode} text={f >= PASTE ? c.headline : ''} textOp={textOp} chars={Math.round(tween(f, PASTE, PASTE + 40, 0, c.headline.length))}
            buttonPress={pressMix(f, CLICK)} cards={[0, 1, 2, 3].map((i) => fixCard(f, i))} counter={cfg.copy.hook.counterTo} />
        </At>
        <Cursor appear={20} keys={[
          {f: 0, x: field.x - 100, y: field.y + 220},
          {f: 58, x: field.x, y: field.y + 6, click: true},
          {f: 110, x: field.x + 40, y: field.y + 20},
          {f: 150, x: btn.x, y: btn.y + 6},
          {f: CLICK, x: btn.x, y: btn.y + 6, click: true},
          {f: 230, x: btn.x + 120, y: btn.y + 300},
        ]} />
      </Camera>
    </Stage>
  );
};
