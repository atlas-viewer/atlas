export type QTProjection = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type QuadTreeNode<T> = {
  x: number;
  y: number;
  width: number;
  height: number;
  data: T;
};
