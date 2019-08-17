import { Paint } from '.';
import { Strand } from '@atlas-viewer/dna';

export interface RenderPipeline {
  getAllPointsAt(target: Strand, aggregate: Strand, scale: number): Paint[];
  transform(op: Strand): void;
}
