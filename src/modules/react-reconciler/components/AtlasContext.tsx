import React from 'react';
import { Preset } from '../presets/_types';
import { RectReadOnly } from 'react-use-measure';

export const AtlasContext = React.createContext<Preset | null>(null);
AtlasContext.displayName = 'Atlas';

export const BoundsContext = React.createContext<RectReadOnly | null>(null);
BoundsContext.displayName = 'Bounds';
