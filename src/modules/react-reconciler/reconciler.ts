import Reconciler, { type OpaqueHandle, type HostConfig } from 'react-reconciler';
import { ContinuousEventPriority, DiscreteEventPriority, DefaultEventPriority } from 'react-reconciler/constants'
import { now } from './utility/now';
import { Runtime } from '../../renderer/runtime';
import { SingleImage } from '../../spacial-content/single-image';
import { World } from '../../world';
import { WorldObject } from '../../world-objects/world-object';
import { AtlasObjectModel } from '../../aom';
import { BaseObject } from '../../objects/base-object';
import { TiledImage } from '../../spacial-content/tiled-image';
import { CompositeResource } from '../../spacial-content/composite-resource';
import { Text } from '../../objects/text';
import { Box } from '../../objects/box';
import { supportedEventAttributes, supportedEventMap } from '../../events';
import { ImageTexture } from '../../spacial-content/image-texture';
import React, { version } from 'react';
import { Geometry } from '../../objects/geometry';

function appendChild(parent: AtlasObjectModel<any, any>, child: any) {
  if (parent && parent.appendChild && child) {
    parent.appendChild(child);
  }
}

function removeChild(parent: AtlasObjectModel<any, any>, child: any) {
  if (parent && parent.removeChild && child) {
    parent.removeChild(child);
  }
}

function removeChildFromContainer(parent: Runtime, child: any) {
  return removeChild(parent.world, child);
}
function insertInContainerBefore(
  container: Runtime,
  child: AtlasObjectModel<any, any>,
  beforeChild: AtlasObjectModel<any, any>
) {
  return insertBefore(container.world, child, beforeChild);
}

function insertBefore(parent: Runtime | AtlasObjectModel<any, any>, child: any, before: any) {
  if (parent && parent instanceof Runtime) {
    parent = parent.world;
  }
  if (parent && parent.insertBefore) {
    parent.insertBefore(child, before);
  }
}

export function applyProps(instance: any, oldProps: any, newProps: any) {
  if (!newProps) {
    return;
  }
  if (instance.applyProps) {
    instance.applyProps(newProps);
  }
  if (instance instanceof BaseObject) {
    for (const ev of supportedEventAttributes) {
      const event = ev.slice(2).toLowerCase();
      if (newProps[ev] !== oldProps[ev]) {
        if (oldProps[ev]) {
          instance.removeEventListener(event as any, oldProps[ev]);
        }
        instance.addEventListener(event as any, newProps[ev]);
      }
    }
  }
}

export function activateEvents(world: World, props: any) {
  const keys = Object.keys(props);
  let didActivate = false;
  for (const key of keys) {
    if (supportedEventAttributes.indexOf(key as any) !== -1) {
      const ev = (supportedEventMap as any)[key];
      if (ev) {
        if (world.activatedEvents.indexOf(ev) !== -1) continue;
        didActivate = true;
        world.activatedEvents.push(ev);
      }
    }
  }
  if (didActivate) {
    world.triggerEventActivation();
  }
}

const roots = new Map<any, any>();
const emptyObject = {};

function createInstance(
  type: string,
  { args = [], ...props }: any,
  runtime: Runtime,
  hostContext?: any,
  internalInstanceHandle?: Reconciler.Fiber
) {
  if (!(runtime instanceof Runtime) && internalInstanceHandle) {
    const fn = (node: Reconciler.Fiber): Runtime => {
      if (!node.return) return node.stateNode && node.stateNode.containerInfo;
      else return fn(node.return);
    };
    runtime = fn(internalInstanceHandle);
  }

  let instance: BaseObject<any, any>;
  let world: World = runtime.world;
  switch (type) {
    case 'world':
      instance = World.withProps({ width: props.width, height: props.height, viewingDirection: 'left-to-right' });
      (instance as World).activatedEvents = world.activatedEvents;
      (instance as World).eventHandlers = world.eventHandlers;
      (instance as World).subscriptions = world.subscriptions;
      (instance as World).triggerEventActivation();
      world = instance as World;
      break;
    case 'box':
      instance = new Box();
      break;
    case 'shape':
      instance = new Geometry();
      break;
    case 'worldObject':
    case 'world-object':
      instance = new WorldObject();
      break;
    case 'worldImage':
    case 'world-image':
      instance = new SingleImage();
      break;
    case 'texture':
      instance = new ImageTexture();
      break;
    case 'compositeImage':
    case 'composite-image':
      // @todo switch to applyProps
      instance = new CompositeResource({
        id: props.id,
        width: props.width,
        height: props.height,
        images: [],
        renderOptions: props.renderOptions,
      });
      break;
    case 'tiledImage':
    case 'tiled-image':
      instance = TiledImage.fromTile(props.uri, props.display, props.tile, props.scaleFactor, undefined, props.format, props.useFloorCalc, props.version3);
      break;
    case 'paragraph':
      instance = new Text();
      (instance as Text).text = props.children;
      break;
    default:
      // throw new Error(`Element <${type} /> not found`);
      return;
  }

  activateEvents(world, props);
  applyProps(instance as any, {}, props);

  return instance;
}

function appendChildToContainer(runtime: Runtime, world: any) {
  if (world instanceof World) {
    runtime.world = world;
  } else if (world instanceof WorldObject) {
    runtime.world.appendChild(world);
  } else if (world) {
    throw new Error('Invalid root');
  }
}

const NoEventPriority = 0;

let currentUpdatePriority = NoEventPriority;

const reconciler = Reconciler<
  any,
  any,
  Runtime,
  unknown, // Instance,
  unknown, // TextInstance,
  unknown, // SuspenseInstance,
  unknown, // HydratableInstance,
  unknown, // PublicInstance,
  unknown, // HostContext,
  unknown, // UpdatePayload,
  unknown, // _ChildSet,
  unknown, // TimeoutHandle,
  unknown // NoTimeout
>({
  // @ts-ignore
  unstable_now: now,
  // @ts-ignore
  now,
  createInstance,
  removeChild,
  appendChild,
  appendInitialChild: appendChild,
  insertBefore: insertBefore,
  warnsIfNotActing: true,
  supportsMutation: true,
  isPrimaryRenderer: false,
  // @ts-ignore
  scheduleTimeout: typeof setTimeout !== 'undefined' ? setTimeout : undefined,
  // @ts-ignore
  cancelTimeout: typeof clearTimeout !== 'undefined' ? clearTimeout : undefined,
  setTimeout: typeof setTimeout !== 'undefined' ? setTimeout : undefined,
  clearTimeout: typeof clearTimeout !== 'undefined' ? clearTimeout : undefined,
  noTimeout: -1,
  appendChildToContainer,
  removeChildFromContainer: removeChildFromContainer,
  createTextInstance() {
    // no-op
  },
  insertInContainerBefore: insertInContainerBefore,
  prepareUpdate(instance: any, type: any, oldProps: any, newProps: any, runtime: Runtime) {
    activateEvents(runtime.world, newProps);
    return newProps;
  },
  commitUpdate(
    instance: any,
    type: any,
    updatePayload: any,
    prevProps: any,
    nextProps: any,
    internalHandle: OpaqueHandle
  ) {
    if (instance.applyProps && updatePayload) {
      applyProps(instance, prevProps, updatePayload);
    }
  },

  finalizeInitialChildren(instance: any) {
    // https://github.com/facebook/react/issues/20271
    // Returning true will trigger commitMount
    return instance?.__handlers;
  },
  getChildHostContext() {
    return emptyObject;
  },
  getRootHostContext() {
    return emptyObject;
  },
  prepareForCommit(runtime) {
    runtime.isCommitting = true;
    return null;
  },
  preparePortalMount() {
    // no-op
  },
  hideInstance(instance: BaseObject) {
    if (instance && instance.points) {
      instance.points[0] = 0;
    }
    // @todo these are called when a component is suspended
  },
  unhideInstance(instance: BaseObject, props: any) {
    if (instance && instance.points) {
      instance.points[0] = 1;
    }
    // @todo these are called when a component is suspended
  },
  getPublicInstance(instance: BaseObject) {
    return instance;
  },
  hideTextInstance() {
    throw new Error(
      'Text is not allowed in the react-three-fibre tree. You may have extraneous whitespace between components.'
    );
  },
  resetAfterCommit(runtime) {
    runtime.isCommitting = false;
    runtime.pendingUpdate = true;
    if (runtime.world) {
      if (runtime.world.needsRecalculate) {
        runtime.world.recalculateWorldSize();
        runtime.world.triggerRepaint();
      }
    }
  },
  shouldSetTextContent() {
    return false;
  },
  clearContainer() {
    return false;
  },

  // 0.29.0 and later
  supportsHydration: false,
  supportsPersistence: false,

  detachDeletedInstance(node) {
    // no-op?
    // console.log('detachDeletedInstance', node);
  },

  afterActiveInstanceBlur() {
    // no-op
  },

  beforeActiveInstanceBlur() {
    // no-op
  },

  getCurrentEventPriority() {
    // If in the browser, check `window.event` and maybe do something different.
    return DefaultEventPriority;
  },

  getInstanceFromNode(node) {
    throw new Error('Not implemented');
  },

  getInstanceFromScope(scopeInstance) {
    throw new Error('Not implemented');
    // return nodeToInstanceMap.get(scopeInstance) || null;
  },

  prepareScopeUpdate(scopeInstance, instance) {
    throw new Error('Not implemented');
    // nodeToInstanceMap.set(scopeInstance, instance);
  },

  logRecoverableError() {
    // noop
  },

  requestPostPaintCallback() {
    // noop
  },

  rendererPackageName: '@atlas-viewer/atlas',
  rendererVersion: version,


  // React 19.
  shouldAttemptEagerTransition: () => false,
  trackSchedulerEvent: () => { },
  resolveEventType: () => null,
  resolveEventTimeStamp: () => -1.1,
  maySuspendCommit: () => false,
  preloadInstance: () => true, // true indicates already loaded
  startSuspendingCommit() { },
  suspendInstance() { },
  waitForCommitToBeReady: () => null,
  NotPendingTransition: null,
  setCurrentUpdatePriority(newPriority: number) {
    currentUpdatePriority = newPriority
  },
  getCurrentUpdatePriority() {
    return currentUpdatePriority
  },
  resolveUpdatePriority() {
    if (currentUpdatePriority !== NoEventPriority) return currentUpdatePriority

    switch (typeof window !== 'undefined' && window.event?.type) {
      case 'click':
      case 'contextmenu':
      case 'dblclick':
      case 'pointercancel':
      case 'pointerdown':
      case 'pointerup':
        return DiscreteEventPriority
      case 'pointermove':
      case 'pointerout':
      case 'pointerover':
      case 'pointerenter':
      case 'pointerleave':
      case 'wheel':
        return ContinuousEventPriority
      default:
        return DefaultEventPriority
    }
  },
  resetFormInstance() { },
});


// @ts-ignore DefinitelyTyped is not up to date
reconciler.injectIntoDevTools()


export function unmountComponentAtNode(runtime: Runtime, callback?: (runtime: any) => void) {
  const root = roots.get(runtime);
  if (root) {
    reconciler.updateContainer(null, root, null, () => {
      roots.delete(runtime);
      if (callback) callback(runtime);
    });
  }
}

export const ReactAtlas = {
  render(whatToRender: any, runtime: any) {
    const root = roots.get(runtime);

    if (root) {
      reconciler.updateContainer(whatToRender, root, null);
    } else {
      const newRoot = reconciler.createContainer(
        runtime,
        0,
        null,
        false,
        null,
        '',
        () => {
          // on recoverable error.
        },
        null
      );

      reconciler.updateContainer(whatToRender, newRoot, null);
      roots.set(runtime, newRoot);
    }
  },
  unmountComponentAtNode(runtime: Runtime, callback?: (runtime: any) => void) {
    unmountComponentAtNode(runtime, callback);
  },
};
