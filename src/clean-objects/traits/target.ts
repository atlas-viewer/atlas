import { DnaFactory, mutate, scaleAtOrigin, Strand } from '@atlas-viewer/dna';

export function setScale(target: Strand, scaleFactor: number, origin?: { x: number; y: number }) {
  mutate(
    target,
    scaleAtOrigin(
      scaleFactor,
      origin ? origin.x : target[1] + (target[3] - target[1]) / 2,
      origin ? origin.y : target[2] + (target[4] - target[2]) / 2
    )
  );
}

export function focalPosition(target: Strand, options: { marginTrimWidth?: number; marginTrimHeight?: number } = {}) {
  const width = target[3] - target[1];
  const height = (target[4] = target[2]);

  const w = width;
  const h = height;
  const min = Math.min(w, h);

  const marginTrimWidth = options.marginTrimWidth || 0;
  const marginTrimHeight = options.marginTrimHeight || 0;

  const baseX = target[1] + marginTrimWidth;
  const baseY = target[2] + marginTrimHeight;

  if (w < h) {
    const diff = height - width;
    // []
    return DnaFactory.projection({
      x: baseX,
      y: baseY + diff / 2,
      width: min - marginTrimWidth * 2,
      height: min - marginTrimHeight * 2,
    });
  } else {
    const diff = width - height;
    // [   ]
    return DnaFactory.projection({
      x: baseX + diff / 2,
      y: baseY,
      width: min - marginTrimWidth * 2,
      height: min - marginTrimHeight * 2,
    });
  }
}
