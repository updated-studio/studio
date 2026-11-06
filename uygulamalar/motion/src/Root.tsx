import React from 'react';
import {Composition, Folder} from 'remotion';
import {projects} from './projects';

/** Her proje 3 formatta: 16:9 (web/YouTube) + 9:16 (story/reels) + 4:5 (Instagram akış) — kit §5 (aynı sahneler, merkez-tabanlı yerleşim). */
export const FORMATS = [
  {id: '16x9', width: 1920, height: 1080},
  {id: '9x16', width: 1080, height: 1920},
  {id: '4x5', width: 1080, height: 1350},
] as const;

export const Root: React.FC = () => (
  <>
    {projects.map((p) => (
      <Folder key={p.id} name={p.id}>
        {FORMATS.map((fmt) => (
          <Composition key={fmt.id} id={`${p.id}-${fmt.id}`} component={p.Component} durationInFrames={p.frames} fps={p.fps} width={fmt.width} height={fmt.height} />
        ))}
      </Folder>
    ))}
  </>
);
