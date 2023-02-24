import { DisplayData } from '../types';
import { Paint, WorldObject } from '../world-objects';
import { Strand } from '@atlas-viewer/dna';
import { CompositeResource } from './composite-resource';
import { UpdateTextureFunction } from './image-texture';

export interface SpacialContent {
  readonly id: string;
  readonly type: 'spacial-content';
  readonly display: DisplayData;
  __id?: string;
  __parent?: CompositeResource;
  __owner: { value: WorldObject | undefined };
  __host?: any;
  priority?: boolean;

  points: Strand;
  crop?: Strand;
  style?: { opacity: number };

  getScheduledUpdates(target: Strand, scaleFactor: number): Array<() => void | Promise<void>>;
  getAllPointsAt(target: Strand, aggregate?: Strand, scale?: number): Paint[];
  transform(op: Strand): void;
  loadFullResource?(): Promise<void>;
  dispatchEvent(event: string, e: any): void;
  getImageUrl?: (index: number) => string;
  getTexture?: UpdateTextureFunction;
}
