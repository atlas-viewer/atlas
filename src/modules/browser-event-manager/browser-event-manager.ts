import { Runtime } from '../../renderer/runtime';

/**
 * This could work with popmotion if it was a proxy for events.
 */
export class BrowserEventManager {
  element: Element;
  runtime: Runtime;
  unsubscribe: () => any;
  activatedEvents: string[] = [];
  eventHandlers: [string, any][] = [];
  constructor(element: Element, runtime: Runtime) {
    this.element = element;
    this.runtime = runtime;
    this.unsubscribe = runtime.world.addLayoutSubscriber(this.layoutSubscriber.bind(this));
  }

  layoutSubscriber(type: string) {
    if (type === 'event-activation') {
      this.activateEvents();
    }
  }

  activateEvents() {
    for (const activeEvent of this.runtime.world.activatedEvents) {
      if (this.activatedEvents.indexOf(activeEvent) === -1) {
        const handler = (e: any) => {
          console.log(e.type);
        };
        this.activatedEvents.push(activeEvent);
        this.eventHandlers.push([activeEvent, handler]);
        this.element.addEventListener(this.normalizeEventName(activeEvent), handler);
      }
    }
  }

  normalizeEventName(event: string) {
    if (event.startsWith('on')) {
      return event.slice(2).toLowerCase();
    }
    return event.toLowerCase();
  }

  stop() {
    // Unbind all events.
    this.unsubscribe();
    for (const [event, handler] of this.eventHandlers) {
      this.element.removeEventListener(this.normalizeEventName(event), handler);
    }
  }
}
