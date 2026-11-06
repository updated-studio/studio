import React from 'react';
import {useCurrentFrame} from 'remotion';
import {EASE} from '../lib/motion';

export type CamKey = {f: number; scale?: number; x?: number; y?: number};

/**
 * Sahne başına TEK kamera. Anahtar kareler arasında her zaman easy-ease (inOut).
 * x/y: dünyanın hangi noktası ekran merkezine gelsin. Üstüne sürekli mikro-push eklenir
 * (altın kural: hiçbir şey tam durmaz).
 */
export const Camera: React.FC<{keys: CamKey[]; microPush?: number; children: React.ReactNode}> = ({
  keys,
  microPush = 0.00004,
  children,
}) => {
  const f = useCurrentFrame();
  const ks = [...keys].sort((a, b) => a.f - b.f);
  const val = (prop: 'scale' | 'x' | 'y', def: number) => {
    const list = ks.map((k) => ({f: k.f, v: k[prop]})).filter((k) => k.v !== undefined) as {f: number; v: number}[];
    if (!list.length) return def;
    if (f <= list[0].f) return list[0].v;
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i];
      const b = list[i + 1];
      if (f <= b.f) return a.v + (b.v - a.v) * EASE.inOut((f - a.f) / (b.f - a.f));
    }
    return list[list.length - 1].v;
  };
  const s = val('scale', 1) * (1 + f * microPush);
  const x = val('x', 0);
  const y = val('y', 0);
  return (
    <div style={{position: 'absolute', left: 0, top: 0, transform: `scale(${s}) translate(${-x}px, ${-y}px)`}}>
      {children}
    </div>
  );
};
