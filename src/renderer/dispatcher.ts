import { World } from '../world';

export type ClickEvent = { x: number; y: number };
export type supportedEvents = {
  click: (e: ClickEvent) => void;
  another: (e: null) => void;
};

export type EventSubscription<T> = (arg: T) => () => void;

export enum Events {
  none = 0,
  click = 1 << 0,
  hover = 1 << 1,
  render = 1 << 2,
  zoom = 1 << 3,
  pan = 1 << 4,
  resize = 1 << 5,
  move = 1 << 6,
  change_visibility = 1 << 7,
  scale = 1 << 8,
  add_object = 1 << 9,
  remove_object = 1 << 10,
  add_layer = 1 << 11,
  remove_layer = 1 << 12,
}

class EventHandler<T> {
  queue: T[] = [];
  dispatcher: Dispatcher;
  constructor(dispatcher: Dispatcher) {
    this.dispatcher = dispatcher;
  }

  flush(): T[] {
    const items = this.queue;
    this.queue = [];
    return items;
  }

  register(event: Events) {
    // this.dispatcher.activeEvents |= event;
  }
}

export class Dispatcher {
  activeEvents: Events = Events.none;
  world: World;
  onClick = new EventHandler<ClickEvent>(this);

  constructor(world: World) {
    this.world = world;
  }

  // registerEventListener<T extends keyof supportedEvents>(
  //   eventName: T,
  //   subscription: (e: supportedEvents[T]) => () => void
  // ) {
  //   // @todo.
  // }
  //
  // addEventListener(type: string, handler: )
}
