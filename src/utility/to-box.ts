import { Projection, Strand } from '@atlas-viewer/dna';

export function toBox(strand: Strand): Projection {
  return {
    x: strand[1],
    y: strand[2],
    width: strand[3] - strand[1],
    height: strand[4] - strand[2],
  };
}
