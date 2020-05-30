import { DisplayData } from '../types';
import { Paint } from '../world-objects';
import { Strand } from '@atlas-viewer/dna';

export interface SpacialContent {
  readonly id: string;
  readonly type: 'spacial-content';
  readonly display: DisplayData;

  points: Strand;

  getScheduledUpdates(target: Strand, scaleFactor: number): Array<() => void | Promise<void>> | null;
  getAllPointsAt(target: Strand, aggregate?: Strand, scale?: number): Paint[];
  transform(op: Strand): void;
  loadFullResource?(): Promise<void>;
}
