import { ContainerDefinition, GenericObject } from './generic-object';
import { dna, dnaLength } from '@atlas-viewer/dna';

export function append(object: GenericObject<ContainerDefinition>, toAppend: GenericObject): void {
  if (object.node.type !== 'container') {
    throw new Error('Can only insert into container');
  }
  if (toAppend.node.parent && !object.node.zone) {
    throw new Error('Can only insert into one container');
  }

  if (dnaLength(object.node.listPoints) === object.node.list.length) {
    // resize, doubles each time
    const points = object.node.listPoints;
    const newPoints = dna(object.node.listPoints.length * 2);
    newPoints.set(points, 0);
    object.node.listPoints = newPoints;
    // And now we need to update the pointers to ALL child elements.
    const len = object.node.list.length;
    for (let index = 0; index < len; index++) {
      const layer = object.node.list[index];
      if (layer) {
        layer.points = object.node.listPoints.subarray(index * 5, index * 5 + 5);
      }
    }
  }

  const index = object.node.list.length * 5;
  const pointValues = toAppend.points;

  // We don't have ownership of the points in a zone.
  toAppend.points = object.node.listPoints.subarray(object.node.list.length * 5, object.node.list.length * 5 + 5);
  toAppend.points[0] = 1;
  toAppend.points[1] = pointValues[1];
  toAppend.points[2] = pointValues[2];
  toAppend.points[3] = pointValues[3];
  toAppend.points[4] = pointValues[4];

  if (!object.node.zone) {
    toAppend.node.parent = object as any;
  }

  // Update self.
  object.points[1] = Math.min(object.points[1], pointValues[1]);
  object.points[2] = Math.min(object.points[2], pointValues[2]);
  object.points[3] = Math.max(object.points[3], pointValues[3]);
  object.points[4] = Math.max(object.points[4], pointValues[4]);

  object.node.list.push(toAppend);
  object.buffers.filteredPoints = dna(object.node.list.length * 5);
  object.node.order.push(index / 5);
}

export function insertBefore(object: GenericObject<ContainerDefinition>, item: GenericObject, before: GenericObject) {
  if (object.node.type !== 'container') {
    throw new Error('Can only insert into container');
  }

  const beforeIndex = object.node.list.indexOf(before);
  if (beforeIndex === -1) {
    return;
  }

  append(object, item);
  const theIdx = object.node.order.pop() as number;
  object.node.order.splice(beforeIndex, 0, theIdx);

  // Schedule job to defrag?
}

export function hideInstance(object: GenericObject) {
  object.node.hidden = true;
}
export function unhideInstance(object: GenericObject) {
  object.node.hidden = false;
}

export function remove(object: GenericObject<ContainerDefinition>, item: GenericObject) {
  if (object.node.type !== 'container') {
    throw new Error('Can only remove from container');
  }
  const index = object.node.list.indexOf(item);

  if (index === -1) {
    for (const obj of object.node.list) {
      if (obj && obj.id === item.id) {
        remove(object, obj);
        return;
      }
    }
    return;
  }

  item.node.parent = undefined;
  object.node.list[index] = null;
  object.node.order = object.node.order.filter((t) => t !== index);
  object.node.listPoints[index * 5] = 0;
}
