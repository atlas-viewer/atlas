import { dna, Strand } from '@atlas-viewer/dna';

export function rotateStrand(strand: Strand, degrees: number, [cx, cy]: [number, number]): Strand {
  const newStrand = dna(strand.length);
  const len = strand.length / 5;
  const angle = (degrees * Math.PI) / 180;
  console.log(len);

  for (let i = 0; i < len; i++) {
    let [, x1, y1, x2, y2] = strand.slice(i * 5, i * 5 + 5);
    console.log(x1, y1, x2, y2);

    const s = Math.sin(angle);
    const c = Math.cos(angle);

    // translate point back to origin:
    x1 -= cx;
    x1 -= cy;

    // rotate point
    const xnew = x1 * c - y1 * s;
    const ynew = x1 * s + y1 * c;

    // translate point back:
    console.log(xnew + cx);
    console.log(ynew + cy);
  }

  return newStrand;
}
