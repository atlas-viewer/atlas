import { WorldTime } from '../types';
import { AbstractObject } from './abstract-object';
import { RenderPipeline } from './render-pipeline';
import { Strand } from '@atlas-viewer/dna';

/**
 * @deprecated
 */
export interface AbstractWorldObject extends AbstractObject, RenderPipeline {
  x: number;
  y: number;
  scale: number;
  time: WorldTime[];
  points: Strand;
  worldPoints: Strand;
  atScale(factor: number): void;
  translate(x: number, y: number): void;
  getScheduledUpdates(target: Strand, scaleFactor: number): Array<() => Promise<void>>;
}
