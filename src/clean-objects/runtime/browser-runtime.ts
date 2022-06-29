import { Renderer } from '../../renderer/renderer';
import {
  BrowserEventManager,
  BrowserEventManagerOptions,
} from '../../modules/browser-event-manager/browser-event-manager';
import { World } from "../../world";
import { TransitionManager } from "../../modules/transition-manager/transition-manager";

type Interaction = (runtime: BrowserRuntime) => void | (() => void);

interface RuntimeConfig {
  interactions: Interaction[];
  renderer: Renderer;
  events: Partial<BrowserEventManagerOptions>;
}

class BrowserRuntime {
  // world: World;
  // events: BrowserEventManager;
  // transitionManager: TransitionManager;
  // interactions: Interaction[];
  // state: {
  //   active: boolean;
  // };
  //
  // constructor(config: Partial<RuntimeConfig>) {
  //   //
  // }
  //
  // createRoot(wrapper: HTMLElement) {
  //   //
  // }
}
