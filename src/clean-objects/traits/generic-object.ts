import { DisplayData } from '../../types';
import { dna, DnaFactory, Strand } from '@atlas-viewer/dna';
import { nanoid } from 'nanoid';

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

export function genericObjectDefaults(type: 'node'): GenericObject<NodeDefinition>;
export function genericObjectDefaults(type: 'container'): GenericObject<ContainerDefinition>;
export function genericObjectDefaults(type: 'container' | 'node'): GenericObject<NodeDefinition | ContainerDefinition>;
export function genericObjectDefaults(type: 'container' | 'node'): GenericObject {
  const points = dna(5);
  points.set([1], 0);
  return {
    id: nanoid(9),
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
