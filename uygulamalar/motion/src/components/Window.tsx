import React from 'react';
import {C, FONT_BODY, R, brand} from '../lib/brand';

/** Vektör uygulama penceresi — köşe 0, gölge yok, 1 px çizgi (kit §5). */
export const Window: React.FC<{title: string; w: number; h: number; children?: React.ReactNode; style?: React.CSSProperties}> = ({title, w, h, children, style}) => (
  <div style={{width: w, height: h, background: C.surface, border: `${brand.shape.line}px solid ${C.line}`, borderRadius: R, overflow: 'hidden', fontFamily: FONT_BODY, ...style}}>
    <div style={{height: 64, display: 'flex', alignItems: 'center', padding: '0 24px', borderBottom: `${brand.shape.lineStrong}px solid ${C.black}`, fontSize: 30, fontWeight: 600, color: C.text}}>{title}</div>
    <div style={{padding: '8px 24px'}}>{children}</div>
  </div>
);
