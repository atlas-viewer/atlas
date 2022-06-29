import { DisplayData } from '../../types';
import { dna, DnaFactory, Strand } from '@atlas-viewer/dna';
import { nanoid } from 'nanoid';
import { PaintableObject } from './paintable';

export interface GenericObject<
  Node extends NodeDefinition | ContainerDefinition<any> = NodeDefinition | ContainerDefinition<any>
> {
  /**
   * An identifier, usually automatically generated.
   */
  readonly id: string;

  /**
   * A unique type per interface.
   */
  readonly type: string;

  /**
   * What is the display size of this object.
   */
  readonly display: DisplayData;

  /**
   * The display points.
   */
  points: Strand;

  /**
   * Any nodes under this item.
   */
  readonly node: Node;

  /**
   * Array buffers used for rendering.
   */
  readonly buffers: {
    filteredPoints: Strand;
    readonly intersectionPoints: Strand;
    readonly aggregateTransform: Strand;
    readonly invertedTransform: Strand;
  };
}

export type NodeDefinition = {
  readonly type: 'node';
  cropped: boolean;
  crop: Strand;
  hidden: boolean;
  parent?: ContainerDefinition;
};

export type ContainerDefinition<Contains extends GenericObject = GenericObject> = {
  readonly type: 'container';
  list: Array<Contains | null>;
  listPoints: Strand;
  lazy: boolean;
  zone: boolean;
  hidden: boolean;
  cropped: boolean;
  crop: Strand;
  ordered: boolean;
  composite: boolean;
  order: number[];
  parent?: ContainerDefinition;
};

export interface GenericObjectProps {
  id?: string;
  /**
   * This will be parsed into `display`
   */
  target?: {
    x?: number;
    y?: number;
    width: number;
    height: number;
  };

  /**
   * This will be parsed into `display.scale`
   */
  display?: {
    width: number;
    height?: number;
  };

  /**
   * Crop
   */
  crop?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export function isGeneric(t: unknown): t is GenericObject {
  return !!(t && (t as any).id);
}

export function genericObjectDefaults(type: 'node', id?: string): GenericObject<NodeDefinition>;
export function genericObjectDefaults(type: 'container', id?: string): GenericObject<ContainerDefinition>;
export function genericObjectDefaults(
  type: 'container' | 'node',
  id?: string
): GenericObject<NodeDefinition | ContainerDefinition>;
export function genericObjectDefaults(type: 'container' | 'node', id?: string): GenericObject {
  const points = dna(5);
  points.set([1], 0);
  return {
    id: id || nanoid(9),
    type: '',
    display: {
      width: 0,
      height: 0,
      points,
      scale: 1,
    },
    points,
    buffers: {
      filteredPoints: dna(5),
      intersectionPoints: dna(5),
      aggregateTransform: dna(9),
      invertedTransform: dna(9),
    },
    node:
      type === 'container'
        ? {
            type: 'container',
            list: [],
            crop: dna(5),
            listPoints: dna(20), // Seems like a good default.
            cropped: false,
            order: [],
            ordered: false,
            lazy: false,
            hidden: false,
            composite: false,
            zone: false,
          }
        : {
            type: 'node',
            cropped: false,
            hidden: false,
            crop: dna(5),
          },
  };
}

export function applyGenericObjectProps(toObject: GenericObject, props: GenericObjectProps) {
  let didUpdate = false;

  if (props.crop && !toObject.node.cropped) {
    toObject.node.cropped = true;
    didUpdate = true;
  }

  if (!props.crop && toObject.node.cropped) {
    toObject.node.cropped = false;
    didUpdate = true;
  }

  if (
    props.crop &&
    props.crop.x !== toObject.node.crop[1] &&
    props.crop.y !== toObject.node.crop[2] &&
    props.crop.width !== toObject.node.crop[3] - toObject.node.crop[1] &&
    props.crop.height !== toObject.node.crop[4] - toObject.node.crop[2]
  ) {
    toObject.node.crop.set(DnaFactory.projection(props.crop));
  }

  if (props.target) {
    const width = props.display ? props.display.width : props.target.width;
    const scale = props.target.width / width;

    if (
      props.target.width !== toObject.display.width ||
      props.target.height !== toObject.display.height ||
      props.target.x !== toObject.points[1] ||
      props.target.y !== toObject.points[2] ||
      scale !== toObject.display.scale
    ) {
      didUpdate = true;

      toObject.points.set(
        DnaFactory.singleBox(props.target.width, props.target.height, props.target.x, props.target.y)
      );
      toObject.display.scale = scale;
      toObject.display.width = props.target.width / scale;
      toObject.display.height = props.target.height / scale;
      toObject.display.points =
        scale !== 1
          ? DnaFactory.singleBox(
              props.target.width / scale,
              props.target.height / scale,
              props.target.x,
              props.target.y
            )
          : toObject.points;
    }
  }

  return didUpdate;
}

export function objectForEach<Contains extends GenericObject<any> = GenericObject<any>>(
  object: GenericObject,
  cb: (obj: Contains, index: number) => void
) {
  if (object.node.type === 'container') {
    const len = object.node.ordered ? object.node.order.length : object.node.list.length;
    for (let _index = 0; _index < len; _index++) {
      const index = object.node.ordered ? object.node.order[_index] : _index;
      const layer = object.node.list[index];
      cb(layer as any, index);
    }
  }
}

export function getTopParent(object: GenericObject): GenericObject {
  return object.node.parent ? getTopParent(object.node.parent as any) : object;
}

interface BoundsOptions {
  ref?: boolean;
  padding?: number;
  visibilityRatio?: number;
  zone?: PaintableObject<ContainerDefinition<any>>;
}

export function constrainBounds(object: GenericObject, target: Strand, options: BoundsOptions = {}) {
  const { minX, maxX, minY, maxY } = getBounds(object, target, options);

  let isConstrained = false;
  const constrained = options.ref ? target : dna(target);
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

export function getBounds(object: GenericObject, target: Strand, options: BoundsOptions = {}) {
  const world = getTopParent(object);
  const padding = options.padding || 0;
  const visRatio = options.visibilityRatio || 1;
  const hiddenRatio = Math.abs(1 - visRatio);

  if (options.zone) {
    const zone = options.zone;

    if (zone) {
      const xCon = target[3] - target[1] < zone.points[3] - zone.points[1];
      const yCon = target[4] - target[2] < zone.points[4] - zone.points[2];
      return {
        minX: xCon
          ? zone.points[1] - padding
          : zone.points[1] + (zone.points[3] - zone.points[1]) / 2 - (target[3] - target[1]) / 2,
        maxX: yCon
          ? zone.points[2] - padding
          : zone.points[2] + (zone.points[4] - zone.points[2]) / 2 - (target[4] - target[2]) / 2,
        minY: xCon
          ? zone.points[3] + padding
          : zone.points[1] + (zone.points[3] - zone.points[1]) / 2 - (target[3] - target[1]) / 2,
        maxY: yCon
          ? zone.points[4] + padding
          : zone.points[2] + (zone.points[4] - zone.points[2]) / 2 - (target[4] - target[2]) / 2,
      };
    }
  }

  const wt = target[3] - target[1];
  const ww = world.points[3] - world.points[1];

  // const addConstraintPaddingX = ww / visRatio < wt;

  // Add constrain padding = false (zoomed in)
  const xB = -wt * hiddenRatio;
  const xD = ww - wt - xB;

  // ADd constrain padding = true (zoomed out)
  // const xA = ww * visRatio - wt;
  // const xC = ww * visRatio;
  // const xA = -500 / this.getScaleFactor(true);
  // const xC = -200 / this.getScaleFactor(true);
  // const xC = Math.min(-((wt - ww) / 2), ww * hiddenRatio);
  // const xA = Math.max(xC, ww - wt);

  // const minX = addConstraintPaddingX ? xA : xB;
  // const maxX = addConstraintPaddingX ? xC : xD;

  const ht = target[4] - target[2];
  const hw = world.points[4] - world.points[2];

  // Add constrain padding = false (zoomed in)
  const yB = -ht * hiddenRatio;
  const yD = hw - ht - yB;

  // Add constrain padding = true (zoomed out)
  // const yA = hw * visRatio - ht;
  // const yC = hw * visRatio;
  // const yC = Math.min(-((ht - hw) / 2), hw * hiddenRatio);
  // const yA = Math.max(yC, hw * hiddenRatio - ht);
  //
  // const addConstraintPaddingY = hw / visRatio < ht;

  // const minY = addConstraintPaddingY ? yA : yB;
  // const maxY = addConstraintPaddingY ? yC : yD;

  const maxX = Math.max(xB, xD) || 0;
  const minX = Math.min(xB, xD) || 0;
  const maxY = Math.max(yB, yD) || 0;
  const minY = Math.min(yB, yD) || 0;

  return { minX, maxX, minY, maxY } as const;
}

export function clampBounds(
  object: GenericObject,
  {
    x,
    y,
    width,
    height,
    padding = 0,
  }: {
    x: number;
    y: number;
    width: number;
    height: number;
    padding?: number;
  }
) {
  const w = object.points[3] - object.points[1];
  const h = object.points[4] - object.points[2];
  const matchesHeight = width / w < height / h;

  const rx = x - padding;
  const ry = y - padding;
  const rWidth = width + padding * 2;
  const rHeight = height + padding * 2;

  if (matchesHeight) {
    // pad on the left and right.
    const actualWidth = (rHeight / h) * w;
    return {
      x: rx - (actualWidth - rWidth) / 2,
      y: ry,
      width: actualWidth,
      height: rHeight,
    };
  }
  // pad on the top and bottom.
  const actualHeight = (rWidth / w) * h;
  return {
    x: rx,
    y: ry - (actualHeight - rHeight) / 2,
    width: rWidth,
    height: actualHeight,
  };
}

export function homePosition(
  _object: GenericObject,
  aspectRatio_WidthByHeight: number,
  options: BoundsOptions & {
    homePosition?: Strand;
    buffer?: Strand;
    cover?: boolean;
    scaleFactor?: number;
  } = {}
) {
  const object = getTopParent(_object);
  const target = options.buffer ? options.buffer : dna([1, 0, 0, 0, 0]);

  const homePosition = {
    x: object.points[1],
    y: object.points[2],
    width: object.points[3] - object.points[1],
    height: object.points[4] - object.points[2],
  };

  const aspectRatio = 1 / aspectRatio_WidthByHeight;

  if (options.cover ? aspectRatio > 1 : aspectRatio <= 1) {
    const fullWidth = homePosition.height / aspectRatio;
    const space = (fullWidth - homePosition.width) / 2;

    target[1] = -space + homePosition.x;
    target[2] = homePosition.y;
    target[3] = fullWidth - space + homePosition.x;
    target[4] = homePosition.height + homePosition.y;
  } else {
    const fullHeight = homePosition.width * aspectRatio;
    const space = (fullHeight - homePosition.height) / 2;

    target[1] = homePosition.x;
    target[2] = homePosition.y - space;
    target[3] = homePosition.x + homePosition.width;
    target[4] = homePosition.y + fullHeight - space;
  }

  constrainBounds(object, target, { ...options, ref: true });

  return target;
}
