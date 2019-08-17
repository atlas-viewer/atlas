import { SpacialContent } from '../spacial-content';
import { World } from '../world';
import {ZoneInterface} from "../world-objects/zone";
import {Paint} from "../world-objects";
import {PositionPair} from "../types";
import { Strand } from '@atlas-viewer/dna';

export interface Renderer {
  beforeFrame(world: World, delta: number, target: Strand): void;
  paint(paint: SpacialContent, index: number, x: number, y: number, width: number, height: number): void;
  afterFrame(world: World, delta: number, target: Strand): void;
  getScale(width: number, height: number): number;
  prepareLayer(paint: SpacialContent): void;
  afterPaintLayer(paint: SpacialContent, transform?: Strand): void;
  pendingUpdate(): boolean;
  getActiveZone(world: World): ZoneInterface | null;
  getPointsAt(world: World, target: Strand, aggregate: Strand, scaleFactor: number): Paint[];
  hasActiveZone(): boolean;
  getViewportBounds(world: World, target: Strand, padding: number): PositionPair | null;
}
