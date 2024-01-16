import { SpacialContent } from './spacial-content/spacial-content';

export function bestResourceAtRatio<T extends SpacialContent>(ratio: number, resources: T[]): T | never {
  const len = resources.length;
  if (len === 0) {
    throw new Error('No resources passed in.');
  }

  let best = resources[0];
  for (let i = 0; i < len; i++) {
    if (!resources[i] || !resources[i].display) {
      break;
    }
    best = Math.abs(resources[i].display.scale - ratio) < Math.abs(best.display.scale - ratio) ? resources[i] : best;
  }
  return best;
}

export function bestResourceIndexAtRatio<T extends SpacialContent>(
  ratio: number,
  resources: T[],
  quality = 1
): number | never {
  const len = resources.length;
  if (len === 0) {
    throw new Error('No resources passed in.');
  }

  let best = 0;
  for (let i = 0; i < len; i++) {
    if (!resources[i] || !resources[i].display) {
      break;
    }
    best =
      Math.abs(resources[i].display.scale - ratio) * quality < Math.abs(resources[best].display.scale - ratio)
        ? i
        : best;
  }
  return best;
}

export function distance1D(a: number, b: number) {
  return Math.abs(a - b);
}

export function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  const xDelta = distance1D(a.x, b.x);
  const yDelta = distance1D(a.y, b.y);
  return Math.sqrt(Math.pow(xDelta, 2) + Math.pow(yDelta, 2));
}

export function stripInfoJson(id: string): string {
  const len = id.length;
  if (id.indexOf('/info.json') === len - 10) {
    return id.slice(0, -10);
  }
  return id;
}
