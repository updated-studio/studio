import React from 'react';
import {Stage, At} from '../../../components/Stage';
import {Background} from '../../../components/Background';
import {Camera} from '../../../components/Camera';
import {Logo} from '../../../components/Logo';
import {C} from '../../../lib/brand';
import {useLayout} from '../../../lib/layout';

/** Sahne 4 · Logo — mavi zemin, beyaz logo soldan sağa 0,8 sn; geniş alanda yatay, dikey alanda dikey (kit §2, §13). */
export const LogoEnd: React.FC = () => {
  const L = useLayout();
  const v = L.pick({port: {form: 'dikey' as const, h: 440}, feed: {form: 'dikey' as const, h: 380}, land: {form: 'yatay' as const, h: 170}});
  return (
    <Stage bg={C.blue}>
      <Background color={C.blue} />
      <Camera keys={[{f: 0, scale: 1}, {f: 120, scale: 1.04}]} microPush={0}>
        <At><Logo form={v.form} color="white" height={v.h} start={8} /></At>
      </Camera>
    </Stage>
  );
};
