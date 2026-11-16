import type { Runtime } from '../../renderer/runtime';
import { ComparisonController, type ComparisonOptions } from '../comparison/comparison';

/** Allocating a host is harmless; attachment happens only during a scene commit. */
export class ComparisonHostInstance {
  readonly controller: ComparisonController;
  constructor(private runtime: Runtime, props: ComparisonOptions) {
    this.controller = new ComparisonController(props);
  }
  applyProps(props: ComparisonOptions) {
    this.controller.updateOptions(props);
  }
  attach() {
    this.controller.attach(this.runtime);
  }
  unmount() {
    this.controller.destroy();
  }
  hide(hidden: boolean) {
    this.controller.setHidden(hidden);
  }
}
