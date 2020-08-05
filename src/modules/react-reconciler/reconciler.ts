// @ts-ignore
import createReconciler from 'react-reconciler';
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
import { supportedEvents } from '../../events';

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

function insertBefore(parent: AtlasObjectModel<any, any>, child: any, before: any) {
  if (parent && parent.insertBefore) {
    parent.insertBefore(child, before);
  }
}

function applyProps(instance: any, oldProps: any, newProps: any) {
  if (instance.applyProps) {
    instance.applyProps(newProps);
  }
  if (instance instanceof BaseObject) {
    for (const event of supportedEvents) {
      if (newProps[event] !== oldProps[event]) {
        if (oldProps[event]) {
          instance.removeEventListener(event as any, oldProps[event]);
        }
        instance.addEventListener(event as any, newProps[event]);
      }
    }
  }
}

function activateEvents(world: World, props: any) {
  const keys = Object.keys(props);
  for (const key of keys) {
    if (supportedEvents.indexOf(key) !== -1) {
      if (world.activatedEvents.indexOf(key) !== -1) continue;
      world.activatedEvents.push(key);
    }
  }
}

const roots = new Map<any, any>();

const reconciler = createReconciler({
  supportsMutation: true,

  createInstance(type: string, props: any, runtime: Runtime) {
    let instance: BaseObject<any, any>;
    let world: World = runtime.world;
    switch (type) {
      case 'world':
        instance = new World(props.width, props.height);
        (instance as World).activatedEvents = world.activatedEvents;
        (instance as World).eventHandlers = world.eventHandlers;
        (instance as World).subscriptions = world.subscriptions;
        world = instance as World;
        break;
      case 'box':
        instance = new Box();
        break;
      case 'worldObject':
        instance = new WorldObject();
        break;
      case 'worldImage':
        instance = new SingleImage();
        break;
      case 'compositeImage':
        // @todo switch to applyProps
        instance = new CompositeResource({
          id: props.id,
          width: props.width,
          height: props.height,
          images: [],
        });
        break;
      case 'tiledImage':
        instance = TiledImage.fromTile(props.uri, props.display, props.tile, props.scaleFactor);
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
  },
  createTextInstance() {
    // no-op
  },
  appendChildToContainer(runtime: Runtime, world: any) {
    if (world instanceof World) {
      runtime.world = world;
      runtime._updateScaleFactor();
    } else if (world instanceof WorldObject) {
      runtime.world.appendChild(world);
    } else if (world) {
      throw new Error('Invalid root');
    }
  },
  appendChild,
  appendInitialChild: appendChild,
  removeChildFromContainer: removeChild,
  removeChild,
  insertInContainerBefore: insertBefore,
  insertBefore: insertBefore,
  prepareUpdate(instance: any, type: any, oldProps: any, newProps: any, runtime: Runtime) {
    activateEvents(runtime.world, newProps);
    if (instance instanceof Text) {
      return { ...newProps, text: newProps.children };
    }
    return newProps;
  },
  commitUpdate(instance: any, updatePayload: any, type: any, oldProps: any, newProps: any, finishedWork: any) {
    if (instance.applyProps) {
      applyProps(instance, oldProps, updatePayload);
    }
  },

  finalizeInitialChildren() {
    // no-op
  },
  getChildHostContext(...args: any[]) {
    // no-op
  },
  getPublicInstance(obj: any) {
    return obj;
  },
  getRootHostContext() {
    // no-op
  },
  prepareForCommit() {
    // no-op
  },
  hideInstance(instance: any) {
    // no-op
    // @todo these are called when a component is suspended
  },
  unhideInstance(instance: any, props: any) {
    // no-op
    // @todo these are called when a component is suspended
  },
  hideTextInstance() {
    throw new Error(
      'Text is not allowed in the react-three-fibre tree. You may have extraneous whitespace between components.'
    );
  },
  resetAfterCommit(runtime: Runtime) {
    runtime.pendingUpdate = true;
    if (runtime.world) {
      if (runtime.world.needsRecalculate) {
        const didChange = runtime.world.recalculateWorldSize();
        if (didChange) {
          runtime.goHome();
        }
      }
    }
  },
  shouldSetTextContent() {
    return false;
  },
});

reconciler.injectIntoDevTools({
  bundleType: process.env.NODE_ENV === 'production' ? 0 : 1,
  version: process.env.VERSION || '0.0.0',
  rendererPackageName: '@atlas-viewer/atlas',
});

export const ReactAtlas = {
  render(whatToRender: any, runtime: any) {
    const root = roots.get(runtime);
    if (root) {
      reconciler.updateContainer(whatToRender, root, null, null);
    } else {
      const newRoot = reconciler.createContainer(runtime, false, false);
      reconciler.updateContainer(whatToRender, newRoot, null, null);
      roots.set(runtime, newRoot);
    }
  },
};
