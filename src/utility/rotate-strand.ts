import { dna, Strand } from '@atlas-viewer/dna';

export function rotateStrand(strand: Strand, degrees: number, [cx, cy]: [number, number]): Strand {
  const newStrand = dna(strand.length);
  const len = strand.length / 5;
  const angle = (degrees * Math.PI) / 180;

  for (let i = 0; i < len; i++) {
    let [, x1, _y1, _x2, _y2] = strand.slice(i * 5, i * 5 + 5);

    const s = Math.sin(angle);
    const c = Math.cos(angle);

    // translate point back to origin:
    x1 -= cx;
    x1 -= cy;
  }

  return newStrand;
}
