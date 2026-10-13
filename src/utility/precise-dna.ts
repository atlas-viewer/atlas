import * as base from '@atlas-viewer/dna';
import type { Strand } from '@atlas-viewer/dna';

export * from '@atlas-viewer/dna';

// CPU viewport maths needs doubles: at 2^27, float32 loses movements smaller than 8 px.
// DNA's operations accept either typed array at runtime, but its public Strand type is float32-only.
export function dna(values: number | ArrayLike<number>): Strand {
  return (typeof values === 'number' ? new Float64Array(values) : new Float64Array(values)) as unknown as Strand;
}

export class DnaFactory extends base.DnaFactory {
  static singleBox(width: number, height: number, x = 0, y = 0): Strand {
    return dna([1, x, y, x + width, y + height]);
  }
  static projection(box: { width: number; height: number; x?: number; y?: number }): Strand {
    return this.singleBox(box.width, box.height, box.x, box.y);
  }
  static positionPair(box: { x1: number; y1: number; x2: number; y2: number }): Strand {
    return dna([1, box.x1, box.y1, box.x2, box.y2]);
  }
  static point(x: number, y: number): Strand {
    return dna([1, x, y, x, y]);
  }
}

function preciseBuffer(buffer: Strand | undefined, length: number): Strand {
  return buffer && buffer.BYTES_PER_ELEMENT === 8 && buffer.length >= length ? buffer : dna(length);
}

export const translate = (x: number, y: number): Strand => dna([1, 0, x, 0, 1, y, 0, 0, 1]);
export const scale = (factor: number): Strand => dna([factor, 0, 0, 0, factor, 0, 0, 0, 1]);
export const compose = (a: Strand, b: Strand, buffer?: Strand): Strand => base.compose(a, b, preciseBuffer(buffer, 9));
export const scaleAtOrigin = (factor: number, x: number, y: number): Strand =>
  compose(translate((1 - factor) * x, (1 - factor) * y), scale(factor));
export const transform = (points: Strand, operation: Strand, buffer?: Strand): Strand =>
  base.transform(points, operation, preciseBuffer(buffer, points.length));
export const getIntersection = (a: Strand, b: Strand, buffer?: Strand): Strand =>
  base.getIntersection(a, b, preciseBuffer(buffer, 5));
