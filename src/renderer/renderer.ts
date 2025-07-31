import { SpacialContent } from '../spacial-content';
import { World } from '../world';
import { Paint } from '../world-objects';
import { PositionPair } from '../types';
import { Strand } from '@atlas-viewer/dna';
import { HookOptions } from './runtime';

export interface Renderer {
  beforeFrame(world: World, delta: number, target: Strand, options: HookOptions): void;
  paint(paint: SpacialContent, index: number, x: number, y: number, width: number, height: number): void;
  afterFrame(world: World, delta: number, target: Strand, options: HookOptions): void;
  getScale(width: number, height: number, dpi?: boolean): number;
  prepareLayer(paint: SpacialContent, point: Strand, cx?: number, cy?:number): void;
  finishLayer(paint: SpacialContent, point: Strand): void;
  afterPaintLayer(paint: SpacialContent, transform?: Strand): void;
  pendingUpdate(): boolean;
  getPointsAt(world: World, target: Strand, aggregate: Strand, scaleFactor: number): Paint[];
  getViewportBounds(world: World, target: Strand, padding: number): PositionPair | null;
  isReady(): boolean;
  resize(): void;
  resize(width?: number, height?: number): void;
  triggerResize?: () => void;

  reset(): void;
  getRendererScreenPosition():
    | { x: number; y: number; width: number; height: number; top: number; left: number }
    | undefined;
}
