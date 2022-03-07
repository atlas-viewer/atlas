import {
  compose,
  getIntersection,
  hidePointsOutsideRegion,
  scale,
  Strand,
  transform,
  translate,
} from '@atlas-viewer/dna';
import { ContainerDefinition, GenericObject, isGeneric, NodeDefinition, objectForEach } from './generic-object';
import { Evented, isEvented } from './evented';

export interface PaintableObject<
  Node extends NodeDefinition | ContainerDefinition<PaintableObject> = NodeDefinition | ContainerDefinition<any>
> extends GenericObject<Node>,
    Evented {
  prepareArea?(target: Strand): void;
}

export function isPaintable(obj: unknown): obj is PaintableObject {
  return isGeneric(obj) && isEvented(obj);
}

export function prepareArea(object: PaintableObject, target: Strand) {
  if (object.prepareArea) {
    object.prepareArea(target);
  }
}

export function getObjectsAt(
  object: PaintableObject,
  target: Strand,
  options: {
    loadLazy?: boolean;
    zone?: PaintableObject<ContainerDefinition<any>>;
  } = {}
): PaintableObject[] {
  const { loadLazy, zone } = options;
  const filteredSelf = hidePointsOutsideRegion(object.points, target, object.buffers.filteredPoints);

  if (filteredSelf[0] === 0) {
    // The items in the container are hidden, but the container itself isn't
    return [];
  }

  if (object.node.type === 'node') {
    return [object];
  }

  const filteredPoints = hidePointsOutsideRegion(object.node.listPoints, target, object.buffers.filteredPoints);
  const lazy = !loadLazy && object.node.type === 'container' && object.node.lazy;
  let visible = 0;
  const objects: PaintableObject[] = [];

  objectForEach<PaintableObject>(object, (layer, index) => {
    if (
      !layer ||
      (filteredPoints[index * 5] === 0 && layer.node.type !== 'container') ||
      layer.node.hidden ||
      (zone && zone.node.list.indexOf(layer) === -1 && layer.node.type !== 'container')
    ) {
      return;
    }

    visible++;
    if (!lazy) {
      objects.push(...getObjectsAt(layer, target, options));
    }
  });

  if (lazy && visible) {
    return [object];
  }

  return objects;
}

export type Paint = [PaintableObject, Strand, Strand | undefined];

export function getAllPointsAt(
  object: PaintableObject<any>,
  target: Strand,
  scaleFactor: number,
  options: {
    loadLazy?: boolean;
    zone?: PaintableObject<ContainerDefinition<PaintableObject>>;
    aggregate?: Strand;
  } = {}
): Paint[] {
  const { loadLazy, aggregate, zone } = options;

  if (object.node.type === 'container') {
    const transformer = compose(
      translate(object.points[1], object.points[2]),
      scale(object.display.scale),
      object.buffers.aggregateTransform
    );

    const t = transform(
      getIntersection(target, object.points, object.buffers.intersectionPoints),
      compose(
        scale(1 / object.display.scale),
        translate(-object.points[1], -object.points[2]),
        object.buffers.invertedTransform
      )
    );
    const agg = aggregate ? compose(aggregate, transformer, object.buffers.aggregateTransform) : transformer;
    const s = scaleFactor * object.display.scale;
    const arr: Paint[] = [];

    objectForEach<PaintableObject>(object, (layer) => {
      arr.push(
        ...getAllPointsAt(layer, t, s, {
          aggregate: agg,
          zone,
          loadLazy,
        })
      );
    });

    return arr;
  }

  const optionallyCroppedPoints = object.node.cropped ? object.node.crop : object.points;

  if (object.points.length > 5) {
    const points = hidePointsOutsideRegion(optionallyCroppedPoints, target);
    return [[object, points, aggregate]];
  }

  // Default simple case.
  return [[object, optionallyCroppedPoints, aggregate]];
}
