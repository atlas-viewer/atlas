import { QTProjection as Projection } from './types';

export const intersects = (a: Projection, b: Projection) => {
  return (
    a.x <= b.width + b.x &&
    // right vs left
    a.x + a.width >= b.x &&
    // top vs bottom
    a.y <= b.y + b.height &&
    // bottom vs top
    a.y + a.height >= b.y
  );
};
