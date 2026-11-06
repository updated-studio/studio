import React from 'react';
import {C, FONT_BODY, FONT_MONO, R} from '../../../lib/brand';

/** Kanal kartı: beyaz zemin, köşe 0, gölge yok; ad Metin rolü, format Veri rolü (mono). */
export const ChannelTile: React.FC<{name: string; format: string; w?: number}> = ({name, format, w = 380}) => (
  <div style={{width: w, background: C.white, borderRadius: R, padding: '24px 28px', boxSizing: 'border-box', borderTop: `3px solid ${C.blue}`}}>
    <div style={{fontFamily: FONT_BODY, fontWeight: 600, fontSize: 44, color: C.text, lineHeight: 1.2}}>{name}</div>
    <div style={{fontFamily: FONT_MONO, fontSize: 30, color: C.text2, marginTop: 8}}>{format}</div>
  </div>
);
