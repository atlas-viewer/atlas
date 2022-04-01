import { hidePointsOutsideRegion, Strand } from '@atlas-viewer/dna';
import { BaseObject } from '../base.object';
import { objectForEach } from './generic-object';

export interface ScheduledUpdatesObject {
  scheduledUpdates: {
    list: Array<() => void | Promise<void>>;
  };
}

export function hasScheduledUpdates(t: unknown): t is ScheduledUpdatesObject {
  return (
    t && (t as any).scheduledUpdates && (t as any).scheduledUpdates.list && (t as any).scheduledUpdates.list.length
  );
}

export function getScheduledUpdates(
  object: BaseObject,
  target: Strand,
  scaleFactor: number
): Array<() => void | Promise<void>> {
  const filteredPoints = hidePointsOutsideRegion(object.points, target, object.buffers.filteredPoints);
  const updatedList = [];

  if (hasScheduledUpdates(object)) {
    updatedList.push(...object.scheduledUpdates.list);
  }

  if (object.node.type === 'container') {
    objectForEach<BaseObject>(object, (obj, index) => {
      if ((filteredPoints[index * 5] !== 0 && obj.node.type === 'container') || hasScheduledUpdates(obj)) {
        updatedList.push(...getScheduledUpdates(obj, target, scaleFactor));
      }
    });
  }

  return updatedList;
}
