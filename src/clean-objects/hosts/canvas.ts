import { HasElement, HasElementMap } from './types';
import { createElement } from '../helpers/dom';

export interface CompositeCanvasHost extends HasElementMap<ImageData> {
  type: 'composite-canvas-host';
  canvas: HTMLCanvasElement;
}

export interface SingleCanvasHost extends HasElement<HTMLCanvasElement> {
  type: 'canvas-host';
}

export type CanvasHost = SingleCanvasHost | CompositeCanvasHost;

export function createCanvasHost<T extends CanvasHost>(type: T['type'], columns = 0): T {
  if (type === 'canvas-host') {
    return {
      type,
      loading: false,
      element: createElement('canvas'),
    } as SingleCanvasHost as T;
  }

  return {
    type,
    canvas: createElement('canvas'),
    abortMap: {},
    loadingMap: {},
    elements: {},
    columns,
  } as CompositeCanvasHost as T;
}
