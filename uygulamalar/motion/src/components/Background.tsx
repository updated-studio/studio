import React from 'react';
import {C} from '../lib/brand';
import {Fill} from './Stage';

/** Düz renk zemin — kit §3: grafiklerde gradyan, saydamlık, paralaks yok. */
export const Background: React.FC<{color?: string}> = ({color = C.bg}) => <Fill style={{background: color}} />;
