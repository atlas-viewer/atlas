import { DisplayData } from '../types';
import { Paint } from '../world-objects';
import { Strand } from '@atlas-viewer/dna';

export interface SpacialContent {
  readonly id: string;
  readonly type: 'spacial-content';
  readonly display: DisplayData;

  x: number;
  y: number;
  width: number;
  height: number;
  points: Strand;

  getScheduledUpdates(target: Strand, scaleFactor: number): Array<() => Promise<void>> | null;
  getPointsAt(target: Strand, aggregate?: Strand, scale?: number): Paint;
  transform(op: Strand): void;
  loadFullResource?(): Promise<void>;
}
