import React from 'react';
import { Runtime } from '../../../renderer/runtime';
import { Renderer } from '../../../renderer/renderer';
import { RuntimeController } from '../../../types';
import { BrowserEventManager } from '../../browser-event-manager/browser-event-manager';

export type AtlasContextType = {
  // State
  ready: boolean;
  canvasPosition?: { width: number; height: number; top: number; left: number };
  runtime?: Runtime;
  renderer?: Renderer;
  em?: BrowserEventManager;
  controller?: RuntimeController;
  viewport: { width: number; height: number; x: number; y: number; scale: number };
  canvas?: React.MutableRefObject<HTMLCanvasElement | undefined>;
};

export const AtlasContext = React.createContext<AtlasContextType | undefined>(undefined);
