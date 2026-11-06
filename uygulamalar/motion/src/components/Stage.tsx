import React from 'react';
import {AbsoluteFill, useVideoConfig} from 'remotion';
import {C, FONT_BODY} from '../lib/brand';

/** Merkez-tabanlı sahne: çocuklar (0,0) = kanvas merkezi olacak şekilde konumlanır. */
export const Stage: React.FC<{children: React.ReactNode; bg?: string}> = ({children, bg = C.bg}) => (
  <AbsoluteFill style={{background: bg, fontFamily: FONT_BODY, color: C.text, overflow: 'hidden'}}>
    <div style={{position: 'absolute', left: '50%', top: '50%', width: 0, height: 0}}>{children}</div>
  </AbsoluteFill>
);

/** Merkeze göre (x, y) noktasına, kendi merkezi hizalı yerleştirir. */
export const At: React.FC<{
  x?: number;
  y?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
  transform?: string;
}> = ({x = 0, y = 0, children, style, transform = ''}) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: y,
      transform: `translate(-50%, -50%) ${transform}`,
      ...style,
    }}
  >
    {children}
  </div>
);

/**
 * Stage İÇİNDE tam ekran katman (arka plan, karartma, opaklık sarmalayıcı).
 * Stage'in merkez noktası 0×0 olduğu için AbsoluteFill orada sıfır boyutlu kalır — onun yerine bunu kullanın.
 */
export const Fill: React.FC<{children?: React.ReactNode; style?: React.CSSProperties}> = ({children, style}) => {
  const {width, height} = useVideoConfig();
  return <div style={{position: 'absolute', left: -width / 2, top: -height / 2, width, height, overflow: 'hidden', ...style}}>{children}</div>;
};
