import { SpacialContent } from './spacial-content';
import { DisplayData } from '../types';
import { Paint } from '../world-objects';
import { Strand } from '@atlas-viewer/dna';
import { BaseObject } from '../objects/base-object';

/**
 * @deprecated
 */
export abstract class AbstractContent<Props = any, SupportedLayers = never> extends BaseObject<Props, SupportedLayers>
  implements SpacialContent {
  abstract readonly id: string;
  readonly type: 'spacial-content' = 'spacial-content';
  abstract points: Strand;
  abstract readonly display: DisplayData;

  getAllPointsAt(target: Strand, aggregate?: Strand, scale?: number): Paint[] {
    return [[this as any, this.points, aggregate]];
  }
}
