import { ContainerDefinition, GenericObject, NodeDefinition } from './generic-object';
import { bestResourceIndexAtRatio } from '../../utils';

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
  if (
    typeof props.renderSmallestFallback !== 'undefined' &&
    props.renderSmallestFallback !== object.composite.renderSmallestFallback
  ) {
    object.composite.renderSmallestFallback = props.renderSmallestFallback;
  }
  if (typeof props.renderLayers !== 'undefined' && props.renderLayers !== object.composite.renderLayers) {
    object.composite.renderLayers = props.renderLayers;
  }
  if (typeof props.minSize !== 'undefined' && props.minSize !== object.composite.minSize) {
    object.composite.minSize = props.minSize;
  }
  if (typeof props.maxImageSize !== 'undefined' && props.maxImageSize !== object.composite.maxImageSize) {
    object.composite.maxImageSize = props.maxImageSize;
  }
  if (typeof props.quality !== 'undefined' && props.quality !== object.composite.quality) {
    object.composite.quality = props.quality;
  }
}

export function isComposite(object: unknown): object is Composite & GenericObject<ContainerDefinition> {
  return object && (object as any).composite && (object as GenericObject).type === 'container';
}

export function getResolvedObjects(
  object: (Composite & GenericObject<ContainerDefinition>) | GenericObject<ContainerDefinition | NodeDefinition>
): Array<GenericObject<ContainerDefinition | NodeDefinition>> {
  if (!isComposite(object)) {
    return [];
  }

  // 1. Find best image at ratio, using quality option.
  // const bestIndex = bestResourceIndexAtRatio(
  //   1 / (scale || 1) / (window.devicePixelRatio || 1),
  //   this.images,
  //   this.renderOptions.quality
  // );

  // 2. Add that image, plus any smaller (based on renderLayers)
  // 3. Add smallest size available, if renderSmallestFallback
  // 4. These are now effectively a container.

  // Other places this might affect.
  // - Paintable (getAllPointsAt, getObjectsAt)
  // - Scheduled (getScheduledUpdates) as updates might be viewport related

  return [];
}
