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

export const supportedEvents = ['onClick', 'onMouseEnter', 'onMouseLeave', 'onMouse'];

function appendChild(parent: AtlasObjectModel<any, any>, child: any) {
  if (child) {
    parent.appendChild(child);
  }
}

function removeChild(parent: AtlasObjectModel<any, any>, child: any) {
  parent.removeChild(child);
}

function insertBefore(parent: AtlasObjectModel<any, any>, child: any, before: any) {
  parent.insertBefore(child, before);
}

function applyProps(instance: BaseObject<any, any>, oldProps: any, newProps: any) {
  if (instance.applyProps) {
    instance.applyProps(newProps);
  }
  if (instance instanceof BaseObject) {
    if (newProps.onClick !== oldProps.onClick) {
      if (oldProps.onClick) {
        instance.removeEventListener('onClick', oldProps.onClick);
      }
      instance.addEventListener('onClick', newProps.onClick);
    }
  }
}

const reconciler = createReconciler({
  supportsMutation: true,

  createInstance(type: string, props: any) {
    // Our types
    // - World
    // - WorldObject

    let instance: BaseObject<any, any>;

    switch (type) {
      case 'world':
        instance = new World(props.width, props.height);
        break;
      case 'worldObject':
        instance = new WorldObject();
        break;
      case 'worldImage':
        instance = new SingleImage();
        break;
      case 'compositeImage':
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
        throw new Error(`Element <${type} /> not found`);
    }

    applyProps(instance, {}, props);

    return instance;
  },
  createTextInstance() {
    // console.log('createTextInstance');
  },
  appendChildToContainer(runtime: Runtime, world: any) {
    if (world instanceof World) {
      runtime.world = world;
    } else if (world instanceof WorldObject) {
      runtime.world.appendChild(world);
    } else {
      throw new Error('Invalid root');
    }
  },
  appendChild,
  appendInitialChild: appendChild,
  removeChildFromContainer: removeChild,
  removeChild,
  insertInContainerBefore: insertBefore,
  insertBefore: insertBefore,
  prepareUpdate(
    instance: any,
    type: any,
    oldProps: any,
    newProps: any,
    rootContainerInstance: Runtime,
    currentHostContext: any
  ) {
    if (instance instanceof Text) {
      return { ...newProps, text: newProps.children };
    }
    // switch (type) {
    //   case 'worldImage': {
    //     const { id, uri, display, target } = newProps;
    //     const width = display ? display.width : target.width;
    //     const scale = target.width / width;
    //
    //     return {
    //       id,
    //       uri,
    //       width: target.width,
    //       height: target.height,
    //       scale,
    //     };
    //   }
    // }

    return newProps;
  },
  commitUpdate(instance: any, updatePayload: any, type: any, oldProps: any, newProps: any, finishedWork: any) {
    if (instance.applyProps) {
      instance.applyProps(updatePayload);
    }
    if (instance instanceof BaseObject) {
      if (newProps.onClick !== oldProps.onClick) {
        if (oldProps.onClick) {
          instance.removeEventListener('onClick', oldProps.onClick);
        }
        instance.addEventListener('onClick', newProps.onClick);
      }
    }
  },

  finalizeInitialChildren() {
    // console.log('finalizeInitialChildren');
  },
  getChildHostContext(...args: any[]) {
    // console.log('getChildHostContext', args);
  },
  getPublicInstance(...args: any[]) {
    // console.log('getPublicInstance', args);
  },
  getRootHostContext() {
    // console.log('getPublicInstance');
  },
  prepareForCommit() {
    // console.log('prepareForCommit');
  },
  resetAfterCommit(runtime: Runtime) {
    runtime.pendingUpdate = true;
    if (runtime.world) {
      console.log(runtime.world);
      runtime.world.recalculateWorldSize();
    }
  },
  shouldSetTextContent() {
    return false;
  },
});

export const ReactAtlas = {
  render(whatToRender: any, runtime: any) {
    const container = reconciler.createContainer(runtime, false, false);
    reconciler.updateContainer(whatToRender, container, null, null);
  },
};
