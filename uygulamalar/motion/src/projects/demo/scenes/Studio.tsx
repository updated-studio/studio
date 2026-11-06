import React from 'react';
import {C, FONT_BODY, FONT_DISPLAY, FONT_MONO, R, brand} from '../../../lib/brand';
import {Mode} from '../../../lib/layout';
import {cfg} from '../config';

const c = cfg.copy.fix;
export type Status = 'taslak' | 'inceleme' | 'planlandi' | 'yayinda';

/** Durum etiketleri — kit §12: renk + ikon + metin, sabit beş durum (açık mod). */
const STATUS: Record<Status, {bg: string; fg: string; border?: string; icon: string}> = {
  taslak: {bg: C.gray, fg: C.black, icon: '○'},
  inceleme: {bg: C.orange, fg: C.black, icon: '◐'},
  planlandi: {bg: C.white, fg: C.blue, border: C.blue, icon: '◷'},
  yayinda: {bg: C.blue, fg: C.white, icon: '●'},
};
export const StatusChip: React.FC<{s: Status}> = ({s}) => {
  const st = STATUS[s];
  return (
    <span style={{display: 'inline-flex', alignItems: 'center', gap: 10, background: st.bg, color: st.fg, border: `1px solid ${st.border ?? st.bg}`, padding: '6px 14px', fontFamily: FONT_BODY, fontWeight: 600, fontSize: 30, borderRadius: R, whiteSpace: 'nowrap'}}>
      <span>{st.icon}</span>{c.status[s]}
    </span>
  );
};

/** Stüdyo paneli geometrisi — vektör, tek yerde. Video içi en küçük yazı 28 px (kit §10). */
export const studioGeom = (mode: Mode) => {
  if (mode === 'land') {
    const W = 1640, H = 880, side = 240, x0 = side + 48, mw = W - x0 - 48;
    const cw = (mw - 3 * 24) / 4;
    return {W, H, side, title: {x: x0, y: 28}, counter: {x: W - 48 - 400, y: 24, w: 400},
      field: {x: x0, y: 150, w: mw - 400 - 24, h: 92}, button: {x: x0 + mw - 400, y: 150, w: 400, h: 92},
      cards: [0, 1, 2, 3].map((i) => ({x: x0 + i * (cw + 24), y: 300, w: cw, h: 530}))};
  }
  // 9:16 ve 4:5: buton alanın altında — başlık tam görünsün
  const W = 1000, side = 0, x0 = 40, mw = W - 80, port = true;
  const H = mode === 'port' ? 1300 : 1140;
  const btnY = 252;
  const cy = btnY + 92 + 48, ch = (H - cy - 40 - 24) / 2, cw = (mw - 24) / 2;
  return {W, H, side, title: {x: x0, y: 28}, counter: {x: W - 40 - 380, y: 24, w: 380},
    field: {x: x0, y: 150, w: port ? mw : mw - 330 - 20, h: 92}, button: port ? {x: x0, y: btnY, w: mw, h: 92} : {x: x0 + mw - 330, y: 150, w: 330, h: 92},
    cards: [0, 1, 2, 3].map((i) => ({x: x0 + (i % 2) * (cw + 24), y: cy + Math.floor(i / 2) * (ch + 24), w: cw, h: ch}))};
};

export type CardState = {inP: number; inOp: number; status: Status; progress: number};

export const Studio: React.FC<{
  mode: Mode; text: string; textOp: number; chars: number; buttonPress: number; cards: CardState[]; counter: React.ReactNode; counterAlert?: boolean;
}> = ({mode, text, textOp, chars, buttonPress, cards, counter, counterAlert}) => {
  const g = studioGeom(mode);
  const box = (r: {x: number; y: number; w?: number; h?: number}): React.CSSProperties => ({position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, boxSizing: 'border-box'});
  return (
    <div lang="tr" style={{position: 'relative', width: g.W, height: g.H, background: C.gray, border: `1px solid ${C.line}`, borderRadius: R, overflow: 'hidden', fontFamily: FONT_BODY, color: C.text}}>
      {g.side > 0 && (
        <div style={{...box({x: 0, y: 0, w: g.side, h: g.H}), background: C.black, paddingTop: 110}}>
          {c.nav.map((n, i) => (
            <div key={n} style={{fontSize: 30, fontWeight: 500, color: C.white, padding: '16px 24px', background: i === 2 ? C.text : 'transparent', borderLeft: `3px solid ${i === 2 ? C.blue : 'transparent'}`}}>{n}</div>
          ))}
        </div>
      )}
      <div style={{...box(g.title), fontFamily: FONT_DISPLAY, fontWeight: 900, fontSize: 52, lineHeight: brand.type.headingLineHeight}}>{c.title.toLocaleUpperCase('tr-TR')}</div>
      <div style={{...box(g.counter), display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '12px 0', borderBottom: `3px solid ${counterAlert ? C.orange : C.black}`}}>
        <span style={{fontFamily: FONT_MONO, fontSize: 28, letterSpacing: '0.04em', color: C.text2}}>{cfg.copy.hook.counterLabel.toLocaleUpperCase('tr-TR')}</span>
        <span style={{fontFamily: FONT_MONO, fontWeight: 600, fontSize: 48}}>{counter}</span>
      </div>
      {/* Başlık alanı: etiket üstte, 1 px çerçeve, mono karakter sayacı (kit §12) */}
      <div style={{...box({x: g.field.x, y: g.field.y - 44}), fontFamily: FONT_MONO, fontSize: 28, color: C.text2, letterSpacing: '0.04em'}}>{c.fieldLabel.toLocaleUpperCase('tr-TR')}</div>
      <div style={{...box(g.field), background: C.white, border: `${text ? 2 : 1}px solid ${text ? C.blue : C.text3}`, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 16}}>
        <span style={{flex: 1, fontSize: 34, opacity: textOp, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{text}</span>
        <span style={{fontFamily: FONT_MONO, fontSize: 28, color: C.text2}}>{chars} / {c.maxChars}</span>
      </div>
      {/* Ana buton: mavi zemin beyaz yazı; basınca yalnızca zemin rengi değişir (kit §13) */}
      <div style={{...box(g.button), background: buttonPress > 0.5 ? C.black : C.blue, color: C.white, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, fontWeight: 600}}>{c.send}</div>
      {g.cards.map((r, i) => {
        const s = cards[i];
        const ch = cfg.copy.channels[i];
        return (
          <div key={i} style={{...box(r), background: C.white, borderTop: `3px solid ${s.status === 'yayinda' ? C.blue : C.black}`, padding: 28, opacity: s.inOp, transform: `translateY(${(1 - s.inP) * 40}px)`}}>
            <div style={{fontSize: 42, fontWeight: 600, lineHeight: 1.2}}>{ch.name}</div>
            <div style={{fontFamily: FONT_MONO, fontSize: 28, color: C.text2, marginTop: 8}}>{ch.format}</div>
            <div style={{marginTop: 28}}><StatusChip s={s.status} /></div>
            <div style={{position: 'absolute', left: 28, right: 28, bottom: 32, height: 8, background: C.gray}}>
              <div style={{width: `${s.progress * 100}%`, height: '100%', background: C.blue}} />
            </div>
          </div>
        );
      })}
    </div>
  );
};
