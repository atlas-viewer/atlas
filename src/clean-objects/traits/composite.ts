import { ContainerDefinition, GenericObject, NodeDefinition } from './generic-object';
import { append } from './container';

export interface Composite {
  composite: {
    renderSmallestFallback: boolean;
    renderLayers: number;
    minSize: number;
    maxImageSize: number;
    quality: number;
  };
}

export interface CompositeProps {
  renderSmallestFallback: boolean;
  renderLayers: number;
  minSize: number;
  maxImageSize: number;
  quality: number;
}

export function compositeDefaults(): Composite {
  return {
    composite: {
      renderSmallestFallback: true,
      renderLayers: 2,
      minSize: 256,
      maxImageSize: -1,
      quality: 1,
    },
  };
}

export function applyCompositeProps(object: Composite, props: CompositeProps) {
  let didChange = false;
  if (
    typeof props.renderSmallestFallback !== 'undefined' &&
    props.renderSmallestFallback !== object.composite.renderSmallestFallback
  ) {
    didChange = true;
    object.composite.renderSmallestFallback = props.renderSmallestFallback;
  }
  if (typeof props.renderLayers !== 'undefined' && props.renderLayers !== object.composite.renderLayers) {
    didChange = true;
    object.composite.renderLayers = props.renderLayers;
  }
  if (typeof props.minSize !== 'undefined' && props.minSize !== object.composite.minSize) {
    didChange = true;
    object.composite.minSize = props.minSize;
  }
  if (typeof props.maxImageSize !== 'undefined' && props.maxImageSize !== object.composite.maxImageSize) {
    didChange = true;
    object.composite.maxImageSize = props.maxImageSize;
  }
  if (typeof props.quality !== 'undefined' && props.quality !== object.composite.quality) {
    didChange = true;
    object.composite.quality = props.quality;
  }
  return didChange;
}

export function appendToComposite(object: GenericObject<ContainerDefinition>, toAppend: GenericObject) {
  append(object, toAppend);
  // Now we want to order the resources.

  // @todo optimisation: skip if larger than last.
  // @todo optimisation: smallest
  // @todo reorder based on size
  // @todo validate aspect ratio matches (possible config) and apply crop optionally
  // @todo recalculate order if item changes display
}

export function insertBeforeComposite(
  object: GenericObject<ContainerDefinition>,
  item: GenericObject,
  _: GenericObject
) {
  // Ignore before.
  appendToComposite(object, item);
}

export function isComposite(object: unknown): object is Composite & GenericObject<ContainerDefinition> {
  return object && (object as any).composite && (object as GenericObject).type === 'container';
}

export function bestResourceIndexAtRatio(
  ratio: number,
  resources: Array<GenericObject | null>,
  quality = 1
): number | never {
  const len = resources.length;
  if (len === 0) {
    throw new Error('No resources passed in.');
  }

  let best = 0;
  for (let i = 0; i < len; i++) {
    const resource = resources[i];
    if (!resource || !resource.display) {
      break;
    }
    best =
      Math.abs(resource.display.scale - ratio) * quality < Math.abs(resources[best]!.display.scale - ratio) ? i : best;
  }
  return best;
}

export function getResolvedObjects(
  object: (Composite & GenericObject<ContainerDefinition>) | GenericObject<ContainerDefinition | NodeDefinition>,
  scale?: number
): Array<GenericObject<ContainerDefinition | NodeDefinition>> {
  if (!isComposite(object)) {
    return [];
  }

  const resources = object.node.list;
  const len = object.node.ordered ? object.node.order.length : resources.length;

  if (len === 0) {
    return [];
  }

  // Todo - ensure order is correct

  // 1. Find best image at ratio, using quality option.
  const _bestIndex = bestResourceIndexAtRatio(1 / (scale || 1), resources, object.composite.quality || 1);
  const bestIndex = object.node.ordered ? object.node.order[_bestIndex] : _bestIndex;
  if (bestIndex !== resources.length - 1 && resources[bestIndex + 1]) {
    let toPaintIdx = [];
    for (let i = len - 1; i >= bestIndex; i--) {
      const object = resources[i];
      if (object && !object.node.hidden) {
        toPaintIdx.push(i);
      }
    }
    const smallestIdx = toPaintIdx[0];
    if (object.composite.renderLayers) {
      toPaintIdx = toPaintIdx.slice(-object.composite.renderLayers);
    }

    if (object.composite.renderSmallestFallback && toPaintIdx.indexOf(smallestIdx) === -1) {
      toPaintIdx.unshift(smallestIdx);
    }
  }

  // 2. Add that image, plus any smaller (based on renderLayers)
  // 3. Add smallest size available, if renderSmallestFallback
  // 4. These are now effectively a container.

  // Other places this might affect.
  // - Paintable (getAllPointsAt, getObjectsAt)
  // - Scheduled (getScheduledUpdates) as updates might be viewport related

  return [];
}
