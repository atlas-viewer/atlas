import { HostConfig } from 'react-reconciler';
import { ObjectDefinition } from '../objects/_types';
import { World } from '../objects/world';
import { Box } from '../objects/box';
import { Container } from '../objects/container';
import { AnimatedBox } from '../objects/animated-box';
import { AnimationGroup } from '../objects/animation-group';
import { ContainerDefinition, GenericObject } from '../traits/generic-object';
import { hideInstance, remove, unhideInstance } from '../traits/container';
import { now } from '../../modules/react-reconciler/utility/now';
import { StyledContainer } from '../objects/styled-container';

// This is the list of DOM types available.

export const objectTypes: any = {
  world: World,
  box: Box,
  container: Container,
  'animated-box': AnimatedBox,
  'animation-group': AnimationGroup,
  'styled-container': StyledContainer,
};

export type ElementTypes = typeof objectTypes;
export type ElementTags = keyof ElementTypes;

export function getDefinitionByTag(type: string) {
  return objectTypes[type as ElementTags] as ObjectDefinition<any, any>;
}

function noop() {
  // no-op
}

export const reconcilerConfig: HostConfig<
  ElementTags,
  any, // Props,
  GenericObject<ContainerDefinition>, // Container,
  GenericObject, // Instance,
  never, // TextInstance,
  any, // SuspenseInstance,
  any, // HydratableInstance,
  any, // PublicInstance,
  any, // HostContext,
  any, // UpdatePayload,
  any, // _ChildSet, // TODO Placeholder for undocumented API
  any, // TimeoutHandle,
  any // NoTimeout,
> = {
  // @ts-ignore
  now,
  // supports appendChild and removeChild
  supportsMutation: true,
  supportsHydration: false,
  // Immutable trees (we mutate)
  supportsPersistence: false,
  // Creating the containers.
  createInstance(type, props) {
    const objectCreator = objectTypes[type] as ObjectDefinition<any, any>;
    const instance = objectCreator.create();

    objectCreator.applyProps(instance, props);
    return instance;
  },
  createTextInstance() {
    throw new Error('Text nodes not supported');
  },
  appendInitialChild(parentInstance, child) {
    getDefinitionByTag(parentInstance.tagName).append(parentInstance, child);
  },
  finalizeInitialChildren() {
    // https://github.com/facebook/react/issues/20271
    // Returning true will trigger commitMount
    return false;
  },
  prepareUpdate(
    instance: GenericObject,
    type: ElementTags,
    oldProps: any,
    newProps: any,
    rootContainer: GenericObject
  ): any {
    return getDefinitionByTag(instance.tagName).prepareUpdate(instance, newProps, oldProps, rootContainer);
  },
  shouldSetTextContent() {
    return false;
  },
  getRootHostContext() {
    return null;
  },
  getChildHostContext(parentHostContext) {
    // Example: Checking if we are inside an HTML or SVG tree.
    return parentHostContext;
  },
  getPublicInstance(instance) {
    return { instance, definition: getDefinitionByTag(instance.tagName) };
  },

  // These work together to save things like text selection
  // before an update, and then re-apply after an update.
  prepareForCommit() {
    return null;
  },
  resetAfterCommit: noop,

  preparePortalMount: noop,
  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  noTimeout: -1,
  isPrimaryRenderer: false,

  // Mutations.
  appendChild(parentInstance, child) {
    return getDefinitionByTag(parentInstance.tagName).append(parentInstance, child);
  },
  appendChildToContainer(parentInstance, child) {
    return getDefinitionByTag(parentInstance.tagName).append(parentInstance, child);
  },
  insertBefore(parentInstance, child, beforeChild) {
    return getDefinitionByTag(parentInstance.tagName).insertBefore(parentInstance, child, beforeChild);
  },
  insertInContainerBefore(parentInstance, child, beforeChild) {
    return getDefinitionByTag(parentInstance.tagName).insertBefore(parentInstance, child, beforeChild);
  },
  removeChild(parentInstance, child) {
    return getDefinitionByTag(parentInstance.tagName).remove(parentInstance, child);
  },
  removeChildFromContainer(parentInstance, child) {
    return getDefinitionByTag(parentInstance.tagName).remove(parentInstance, child);
  },
  resetTextContent: noop,
  commitTextUpdate: noop,
  commitMount: noop,
  commitUpdate(instance, updatePayload, type, prevProps, nextProps) {
    getDefinitionByTag(instance.tagName).applyProps(instance, nextProps, updatePayload);
  },
  hideInstance(instance) {
    hideInstance(instance);
  },
  unhideInstance(instance) {
    unhideInstance(instance);
  },
  clearContainer(container) {
    for (const item of container.node.list) {
      if (item) {
        remove(container, item);
      }
    }
  },
};
