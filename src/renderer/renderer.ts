import { SpacialContent } from '../spacial-content';
import { World } from '../world';
import { Paint } from '../world-objects';
import { PositionPair } from '../types';
import { Strand } from '@atlas-viewer/dna';

export interface Renderer {
  beforeFrame(world: World, delta: number, target: Strand): void;
  paint(paint: SpacialContent, index: number, x: number, y: number, width: number, height: number): void;
  afterFrame(world: World, delta: number, target: Strand): void;
  getScale(width: number, height: number): number;
  prepareLayer(paint: SpacialContent): void;
  afterPaintLayer(paint: SpacialContent, transform?: Strand): void;
  pendingUpdate(): boolean;
  getPointsAt(world: World, target: Strand, aggregate: Strand, scaleFactor: number): Paint[];
  getViewportBounds(world: World, target: Strand, padding: number): PositionPair | null;
  isReady(): boolean;
}
