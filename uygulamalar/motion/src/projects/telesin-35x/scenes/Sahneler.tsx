import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {LiquidGlass} from '../../../components/LiquidGlass';
import {EASE, drift, enterP, fadeIn, rand, tween} from '../../../lib/motion-dinamik';
import {PhotoCard, Pill, Scene, Title, useSafe} from '../../iphone-reels/scenes/Shared';
import {INTER, at, cfg} from '../config';

const c = cfg.copy;
const g = cfg.gorseller;
const K = 'Görsel: Telesin';
const Big: React.FC<{text: string; y: number; size: number; start: number; color?: string}> = ({text, y, size, start, color = '#fff'}) => {
  const f = useCurrentFrame();
  const L = useSafe();
  const p = enterP(f, start);
  return <div style={{position: 'absolute', left: L.safe.left, width: L.safeW, top: y, textAlign: 'center', fontFamily: INTER, fontWeight: 800, fontSize: size, letterSpacing: '-0.05em', lineHeight: 1, color, opacity: fadeIn(f, start), transform: `scale(${0.7 + 0.3 * p})`}}>{text}</div>;
};

/** 1 · "iPhone'una 400 milimetre." — odak uzaklığı 24 → 400 mm sayar. */
export const Hook: React.FC = () => {
  const f = useCurrentFrame();
  const L = useSafe();
  const mm = Math.round(interpolate(f, [6, 70], [24, 400], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.out}));
  return (
    <Scene hue="turuncu" cam={[{f: 0, scale: 1.0}, {f: 122, scale: 1.08}]}>
      <Title text={c.hook.sub} start={0} size={80} x={L.cx} y={-420} w={L.safeW} weight={600} color="rgba(255,255,255,0.8)" />
      <div style={{position: 'absolute', left: L.safe.left, width: L.safeW, top: -300, textAlign: 'center', fontFamily: INTER, fontWeight: 800, fontSize: 250, letterSpacing: '-0.06em', color: '#fff', opacity: fadeIn(f, 4)}}>
        {mm}<span style={{fontSize: 110, letterSpacing: '-0.03em'}}> mm</span>
      </div>
      <PhotoCard src={g.hero} x={L.cx} y={190} w={L.safeW} h={380} start={20} kunye={K} fit="cover" pos="center 60%" />
    </Scene>
  );
};

/** 2 · Set ve nereye takıldığı. */
export const Kit: React.FC = () => {
  const f = useCurrentFrame();
  const L = useSafe();
  const t1 = at('kit', 'master'), t2 = at('kit', 'üç'), t3 = at('kit', '4x');
  const show = (a: number, b?: number) => f >= a && (b === undefined || f < b + 12);
  return (
    <Scene hue="mavi" cam={[{f: 0, scale: 1.0}, {f: 404, scale: 1.05}]}>
      <PhotoCard src={g.kit} x={L.cx} y={-170} w={600} h={750} start={0} kunye={K} fit="contain" />
      {show(t1, t2) && <div style={{opacity: 1 - fadeIn(f, t2, 12)}}><Pill text={c.kit.a} x={L.cx} y={310} w={L.safeW} start={t1} size={44} /></div>}
      {show(t2, t3) && <div style={{opacity: 1 - fadeIn(f, t3, 12)}}><Pill text={c.kit.b} x={L.cx} y={310} w={L.safeW} start={t2} size={44} hue="turuncu" /></div>}
      {show(t3) && <Pill text={c.kit.c} x={L.cx} y={310} w={L.safeW} start={t3} size={44} hue="mor" />}
    </Scene>
  );
};

/** 3 · 100 mm × 3.5 + az kırpma = 400 mm (Telesin'in anlatımı; 100 × 3,5 = 350, fark uygulamada kırpma). */
export const Odak: React.FC = () => {
  const f = useCurrentFrame();
  const L = useSafe();
  const kirp = at('odak', 'kırpmayla'), son = at('odak', '400');
  const val = Math.round(interpolate(f, [4, 40, kirp, kirp + 30], [0, 350, 350, 400], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.out}));
  const bars = [{l: c.odak.iphone, v: 100, s: 6}, {l: c.odak.lens, v: 350, s: 22}, {l: c.odak.kirp, v: 400, s: kirp}];
  const W = L.safeW - 120;
  return (
    <Scene hue="turuncu" cam={[{f: 0, scale: 1.02}, {f: 220, scale: 1.06}]}>
      <Big text={`${val} mm`} y={-560} size={190} start={0} />
      <LiquidGlass x={L.cx} y={80} w={L.safeW} h={520} r={56} opacity={fadeIn(f, 2)}>
        <div style={{padding: '46px 60px', fontFamily: INTER, color: '#fff'}}>
          {bars.map((b) => (
            <div key={b.l} style={{marginBottom: 34, opacity: fadeIn(f, b.s)}}>
              <div style={{display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: 36}}><span>{b.l}</span><span style={{opacity: 0.8}}>{b.v} mm</span></div>
              <div style={{marginTop: 12, height: 26, borderRadius: 13, background: 'rgba(255,255,255,0.12)'}}>
                <div style={{height: '100%', borderRadius: 13, width: (W * b.v) / 400 * tween(f, b.s, b.s + 36, 0, 1, EASE.out), background: b.v === 400 && f >= son ? 'linear-gradient(90deg,#FDBA74,#FF6B1A)' : '#fff', boxShadow: '0 0 20px rgba(255,255,255,0.4)'}} />
              </div>
            </div>
          ))}
        </div>
      </LiquidGlass>
    </Scene>
  );
};

/** 4 · 12 optik eleman (tek tek belirir), 6,4 cm cetvel. */
export const Optik: React.FC = () => {
  const f = useCurrentFrame();
  const L = useSafe();
  const t12 = at('optik', '12'), t64 = at('optik', '6,4');
  const n = Math.max(0, Math.min(12, Math.floor((f - t12) / 4) + 1));
  const rulerW = L.safeW - 160;
  return (
    <Scene hue="mavi" cam={[{f: 0, scale: 1.0}, {f: 305, scale: 1.06}]}>
      <PhotoCard src={g.yakin} x={L.cx} y={-330} w={L.safeW} h={560} start={0} kunye={K} pos="60% 40%" />
      {f >= t12 - 4 && (
        <LiquidGlass x={L.cx} y={130} w={L.safeW} h={260} r={50} opacity={fadeIn(f, t12 - 4)} scale={0.92 + 0.08 * enterP(f, t12 - 4)}>
          <div style={{display: 'flex', alignItems: 'center', gap: 36, padding: '30px 44px', fontFamily: INTER, color: '#fff'}}>
            <svg width={300} height={190}>
              {Array.from({length: 12}, (_, i) => (
                <ellipse key={i} cx={22 + i * 23} cy={95} rx={i % 3 === 0 ? 14 : 9} ry={60 + ((i * 17) % 30)} fill={i < n ? 'rgba(147,197,253,0.35)' : 'transparent'} stroke={i < n ? '#BFDBFE' : 'rgba(255,255,255,0.1)'} strokeWidth={2.5} />
              ))}
            </svg>
            <div><div style={{fontWeight: 800, fontSize: 110, letterSpacing: '-0.05em', lineHeight: 1}}>{n}</div><div style={{fontWeight: 600, fontSize: 34, opacity: 0.85}}>optik eleman</div></div>
          </div>
        </LiquidGlass>
      )}
      {f >= t64 && (
        <div style={{position: 'absolute', left: L.cx - rulerW / 2, top: 300, width: rulerW, opacity: fadeIn(f, t64)}}>
          <div style={{height: 4, background: '#fff', width: rulerW * tween(f, t64, t64 + 30, 0, 1, EASE.out), borderRadius: 2}} />
          <div style={{display: 'flex', justifyContent: 'space-between', marginTop: 6}}>{Array.from({length: 7}, (_, i) => <div key={i} style={{width: 3, height: i % 3 ? 14 : 24, background: 'rgba(255,255,255,0.8)'}} />)}</div>
          <div style={{textAlign: 'center', fontFamily: INTER, fontWeight: 800, fontSize: 64, color: '#fff', marginTop: -6}}>{c.optik.boy}</div>
        </div>
      )}
    </Scene>
  );
};

/** 5 · 400 mm'de titreme → %10 kırpmayla sabit (görüntü önce titrer, sonra kırpma çerçevesi gelir ve durur). */
export const Eis: React.FC = () => {
  const f = useCurrentFrame();
  const L = useSafe();
  const sabit = at('eis', 'yüzde');
  const shake = 1 - tween(f, sabit, sabit + 24, 0, 1, EASE.out);
  const jx = (rand(Math.floor(f / 2)) - 0.5) * 34 * shake;
  const jy = (rand(Math.floor(f / 2) + 99) - 0.5) * 26 * shake;
  const H = 760, Wc = L.safeW;
  const crop = tween(f, sabit, sabit + 30, 0, 1, EASE.out);
  return (
    <Scene hue="mor" cam={[{f: 0, scale: 1.0}, {f: 370, scale: 1.04}]}>
      <div style={{position: 'absolute', left: 0, top: 0, transform: `translate(${jx}px, ${jy}px)`}}>
        <PhotoCard src={g.kus} x={L.cx} y={-180} w={Wc} h={H} start={0} kunye={K} pos="58% center" />
      </div>
      <div style={{position: 'absolute', left: L.cx - (Wc * 0.9) / 2, top: -180 - (H * 0.9) / 2, width: Wc * 0.9, height: H * 0.9, border: '4px solid #fff', borderRadius: 44, opacity: crop, boxShadow: `0 0 0 2000px rgba(0,0,0,${0.35 * crop})`}} />
      {f < sabit + 8 && <div style={{opacity: 1 - fadeIn(f, sabit, 10)}}><Pill text={c.eis.titrek} x={L.cx} y={320} w={L.safeW} start={6} size={42} hue="turuncu" /></div>}
      {f >= sabit && <Pill text={c.eis.sabit} x={L.cx} y={320} w={L.safeW} start={sabit} size={42} />}
    </Scene>
  );
};

/** 6 · 43 mm filtre dişi (ND / CPL) ve parasoley. */
export const Filtre: React.FC = () => {
  const f = useCurrentFrame();
  const L = useSafe();
  const t43 = at('filtre', '43'), tnd = at('filtre', 'nd'), tcpl = at('filtre', 'polarize'), thood = at('filtre', 'parasoley');
  const disc = enterP(f, t43, 36);
  return (
    <Scene hue="mavi" cam={[{f: 0, scale: 1.0}, {f: 343, scale: 1.05}]}>
      <PhotoCard src={g.hood} x={L.cx} y={-230} w={L.safeW} h={620} start={0} kunye={K} fit="contain" />
      <svg width={260} height={260} style={{position: 'absolute', left: L.cx + 120 + (1 - disc) * 420, top: -470, opacity: fadeIn(f, t43)}}>
        <circle cx={130} cy={130} r={118} fill="rgba(30,41,59,0.55)" stroke="#E5E7EB" strokeWidth={10} />
        <circle cx={130} cy={130} r={96} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={2} />
        <text x={130} y={145} textAnchor="middle" fontFamily="Inter" fontWeight={800} fontSize={46} fill="#fff">43 mm</text>
      </svg>
      <Pill text={c.filtre.dis} x={L.cx} y={150} w={L.safeW} start={t43} size={40} />
      <div style={{position: 'absolute', left: 0, top: 0}}>
        <Pill text={c.filtre.nd} x={L.cx - 220} y={268} w={300} start={tnd} size={40} hue="mor" />
        <Pill text={c.filtre.cpl} x={L.cx + 120} y={268} w={300} start={tcpl} size={40} hue="mor" />
      </div>
      {f >= thood && <Pill text={c.filtre.hood} x={L.cx} y={-560} w={L.safeW} start={thood} size={38} hue="turuncu" />}
    </Scene>
  );
};

/** 7 · Konser, spor, kuş gözlemi — her kelimede kendi kartı (Telesin'in saydığı kullanım alanları). */
export const Alan: React.FC = () => {
  const f = useCurrentFrame();
  const L = useSafe();
  const t = [at('alan', 'konser'), at('alan', 'spor'), at('alan', 'kuş')];
  const h = 300;
  return (
    <Scene hue="turuncu" cam={[{f: 0, scale: 1.0}, {f: 146, scale: 1.05}]}>
      {f >= t[0] && (
        <LiquidGlass x={L.cx} y={-480} w={L.safeW} h={h} r={50} opacity={fadeIn(f, t[0])} scale={0.9 + 0.1 * enterP(f, t[0])} hue="turuncu">
          <div style={{position: 'absolute', inset: 10, borderRadius: 40, background: 'radial-gradient(40% 70% at 30% 0%, rgba(255,107,26,0.9), transparent 70%), radial-gradient(40% 70% at 70% 0%, rgba(124,58,237,0.9), transparent 70%), #0b0b12'}} />
          <div style={{position: 'absolute', bottom: 26, width: '100%', textAlign: 'center', fontFamily: INTER, fontWeight: 800, fontSize: 64, color: '#fff'}}>{c.alan[0]}</div>
        </LiquidGlass>
      )}
      {f >= t[1] && <PhotoCard src={g.spor} x={L.cx} y={-160} w={L.safeW} h={h} start={t[1]} label={c.alan[1]} kunye={K} pos="center 45%" />}
      {f >= t[2] && <PhotoCard src={g.kus} x={L.cx} y={160} w={L.safeW} h={h} start={t[2]} label={c.alan[2]} kunye={K} pos="58% 40%" hue="mor" />}
    </Scene>
  );
};

/** 8 · Fiyat (Telesin mağazası, kit + 3.5x lens). */
export const Fiyat: React.FC = () => {
  const f = useCurrentFrame();
  const L = useSafe();
  return (
    <Scene hue="mor" cam={[{f: 0, scale: 1.0}, {f: 273, scale: 1.05}]}>
      <PhotoCard src={g.hero} x={L.cx} y={-330} w={L.safeW} h={520} start={0} kunye={K} pos="center 60%" />
      <Big text={c.fiyat.fiyat} y={20} size={150} start={at('fiyat', '229')} />
      <div style={{position: 'absolute', left: L.safe.left, width: L.safeW, top: 200, textAlign: 'center', fontFamily: INTER, fontWeight: 500, fontSize: 36, color: 'rgba(255,255,255,0.8)', opacity: fadeIn(f, at('fiyat', '229') + 10)}}>{c.fiyat.alt}</div>
    </Scene>
  );
};
