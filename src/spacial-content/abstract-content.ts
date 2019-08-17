import { SpacialContent } from './spacial-content';
import { DisplayData } from '../types';
import { Paint } from '../world-objects';
import { mutate, Strand } from '@atlas-viewer/dna';

export abstract class AbstractContent implements SpacialContent {
  abstract readonly id: string;
  readonly type: 'spacial-content' = 'spacial-content';
  abstract points: Strand;
  abstract readonly display: DisplayData;

  get x(): number {
    return this.points[1];
  }
  get y(): number {
    return this.points[2];
  }
  get width(): number {
    return this.points[3] - this.points[1];
  }
  get height(): number {
    return this.points[4] - this.points[2];
  }

  getPointsAt(target: Strand, aggregate?: Strand, scale?: number): Paint {
    return [this, this.points, aggregate];
  }

  transform(op: Strand): void {
    mutate(this.points, op);
  }

  getScheduledUpdates(target: Strand, scaleFactor: number): Array<() => Promise<void>> | null {
    return null;
  }
}
