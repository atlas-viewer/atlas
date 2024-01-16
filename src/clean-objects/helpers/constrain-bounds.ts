import { dna, Strand } from '@atlas-viewer/dna';

export function constrainBounds(maxBounds: Strand, target: Strand, ref = false) {
  let isConstrained = false;
  const minX = maxBounds[1];
  const minY = maxBounds[2];
  const maxX = maxBounds[3];
  const maxY = maxBounds[4];
  const constrained = ref ? target : dna(target);
  const width = target[3] - target[1];
  const height = target[4] - target[2];

  if (minX > target[1]) {
    isConstrained = true;
    constrained[1] = minX;
    constrained[3] = minX + width;
  }
  if (minY > target[2]) {
    isConstrained = true;
    constrained[2] = minY;
    constrained[4] = minY + height;
  }
  if (maxX < target[1]) {
    isConstrained = true;
    constrained[1] = maxX;
    constrained[3] = maxX + width;
  }
  if (maxY < target[2]) {
    isConstrained = true;
    constrained[2] = maxY;
    constrained[4] = maxY + height;
  }
  return [isConstrained, constrained] as const;
}
