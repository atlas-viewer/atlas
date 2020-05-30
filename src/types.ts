import { Strand } from '@atlas-viewer/dna';
import { Runtime } from './renderer/runtime';

export type RuntimeController = { start(runtime: Runtime): void; stop(runtime: Runtime): void };
export type Position = { x: number; y: number };
export type PositionPair = { x1: number; y1: number; x2: number; y2: number };
export type SpacialSize = { width: number; height: number };
export type Scaled = { scale: number };
export type Projection = Position & SpacialSize;
export type Viewer = Projection & Scaled;
export type DisplayData = SpacialSize & Scaled & { points: Strand };
export type WorldTime = { start: number; end: number };
export type ViewingDirection = 'left-to-right' | 'right-to-left' | 'top-to-bottom' | 'bottom-to-top';
export type PointerEvents = {
  onClick(e: any): void;
  onWheel(e: any): void;
  onPointerDown(e: any): void;
  onPointerUp(e: any): void;
  onMouseLeave(e: any): void;
  onMouseMove(e: any): void;
};
