import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {Stage} from '../../../components/Stage';
import {GlassBg, GlassCard} from '../../../components/Glass';
import {Kinetic} from '../../../components/Kinetic';
import {belowUp} from '../../../components/UpMark';
import {C, FONT_BODY, FONT_MONO} from '../../../lib/brand';
import {useLayout} from '../../../lib/layout';
import {EASE, dinamik, enterP, fadeIn} from '../../../lib/motion-dinamik';
import {cfg} from '../config';

const c = cfg.copy.kamera;
const STOP_AT = [90, 230, 370, 510]; // her diyafram değerinde ~2 sn durur
const OPEN = [0.64, 0.56, 0.38, 0.24]; // açıklık / dış yarıçap (görsel, ölçekli değil)

/** Diyafram: 6 bıçak; açıklık değerler arasında yumuşak geçer, kapanırken bıçaklar hafif döner. */
const Iris: React.FC<{open: number; size: number}> = ({open, size}) => {
  const R = size / 2;
  const r = R * open;
  const rot = (0.64 - open) * 90;
  const pts = Array.from({length: 6}, (_, i) => {
    const a = ((i * 60 + rot) * Math.PI) / 180;
    return [R + r * Math.cos(a), R + r * Math.sin(a)];
  });
  const hex = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ') + 'Z';
  const blades = pts.map((p, i) => {
    const a = ((i * 60 + rot + 75) * Math.PI) / 180;
    return <line key={i} x1={p[0]} y1={p[1]} x2={R + R * 0.97 * Math.cos(a)} y2={R + R * 0.97 * Math.sin(a)} stroke="rgba(255,255,255,0.18)" strokeWidth={2} />;
  });
  return (
    <svg width={size} height={size} style={{display: 'block'}}>
      <defs>
        <radialGradient id="lens" cx="40%" cy="38%" r="70%">
          <stop offset="0%" stopColor="#5B8CFF" /><stop offset="45%" stopColor={C.blue} /><stop offset="100%" stopColor="#0B1C4A" />
        </radialGradient>
      </defs>
      <circle cx={R} cy={R} r={R} fill="url(#lens)" />
      <path d={`M0,0 H${size} V${size} H0 Z ${hex}`} fill="#1C1C1C" fillRule="evenodd" clipPath="circle()" style={{clipPath: `circle(${R}px at ${R}px ${R}px)`}} />
      {blades}
      <circle cx={R} cy={R} r={R - 1} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={2} />
    </svg>
  );
};

export const Kamera: React.FC = () => {
  const f = useCurrentFrame();
  const L = useLayout();
  const v = L.pick({
    port: {iris: 400, cardW: L.safeW, top: -330, head: 112},
    land: {iris: 380, cardW: 1100, top: -150, head: 104},
    feed: {iris: 300, cardW: L.safeW, top: -300, head: 96},
  });
  const open = interpolate(f, STOP_AT.flatMap((s) => [s - 40, s]), OPEN.flatMap((o, i) => [i ? OPEN[i - 1] : OPEN[0], o]), {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.inOut});
  const idx = STOP_AT.reduce((a, s, i) => (f >= s - 20 ? i : a), 0);
  return (
    <Stage bg={C.dark.bg}>
      <GlassBg />
      <div style={{position: 'absolute', left: L.safe.left, top: belowUp(L) + 12}}>
        <div style={{fontFamily: FONT_MONO, fontSize: 30, color: C.dark.text3, letterSpacing: '0.04em', opacity: fadeIn(f, 0)}}>{c.label.toLocaleUpperCase('tr-TR')}</div>
        <Kinetic text={c.headline} start={6} size={v.head} maxWidth={L.safeW} align="left" step={6} m={dinamik} rise={50} />
      </div>
      <div style={{position: 'absolute', left: L.safe.left, top: v.top, opacity: fadeIn(f, 20), transform: `translateY(${(1 - enterP(f, 20)) * 60}px)`}}>
        <GlassCard w={v.cardW} aktif={0.8} pad={40}>
          <div style={{display: 'flex', flexDirection: L.mode === 'land' ? 'row' : 'column', alignItems: 'center', gap: 36}}>
            <Iris open={open} size={v.iris} />
            <div style={{textAlign: L.mode === 'land' ? 'left' : 'center'}}>
              <div style={{fontFamily: FONT_MONO, fontWeight: 600, fontSize: 112, lineHeight: 1}}>{c.stops[idx]}</div>
              <div style={{display: 'flex', gap: 10, marginTop: 20, justifyContent: L.mode === 'land' ? 'flex-start' : 'center'}}>
                {c.stops.map((s, i) => (
                  <span key={s} style={{fontFamily: FONT_MONO, fontSize: 28, padding: '4px 10px', borderRadius: 8, background: i === idx ? C.blue : 'transparent', color: i === idx ? C.white : C.dark.text3}}>{s}</span>
                ))}
              </div>
              <div style={{fontFamily: FONT_BODY, fontWeight: 500, fontSize: 34, color: C.dark.text2, marginTop: 24}}>{c.yeni}</div>
            </div>
          </div>
        </GlassCard>
      </div>
      <div style={{position: 'absolute', left: L.safe.left, top: v.top + (L.mode === 'land' ? 500 : v.iris + 380), opacity: fadeIn(f, 600), transform: `translateY(${(1 - enterP(f, 600)) * 40}px)`}}>
        <GlassCard w={v.cardW} pad={28} r={18}>
          <div style={{fontFamily: FONT_BODY, fontWeight: 500, fontSize: 36, color: C.dark.text2}}>{c.eski}</div>
        </GlassCard>
      </div>
    </Stage>
  );
};
