import { Renderer } from '../../renderer/renderer';
import { Paint } from '../../world-objects/paint';
import { World } from '../../world';
import { Strand } from '@atlas-viewer/dna';
import { SpacialContent } from '../../spacial-content/spacial-content';
import { PositionPair } from '../../types';
import { HookOptions } from 'src/standalone';

export class CompositeRenderer implements Renderer {
  renderers: Renderer[] = [];
  length: number;

  constructor(renderers: Array<Renderer | undefined>) {
    for (const renderer of renderers) {
      if (renderer) {
        this.renderers.push(renderer);
      }
    }
    this.length = this.renderers.length;
  }

  afterFrame(world: World, delta: number, target: Strand, options: HookOptions): void {
    for (let i = 0; i < this.length; i++) {
      this.renderers[i].afterFrame(world, delta, target, options);
    }
  }

  afterPaintLayer(paint: SpacialContent, transform?: Strand): void {
    for (let i = 0; i < this.length; i++) {
      this.renderers[i].afterPaintLayer(paint, transform);
    }
  }

  beforeFrame(world: World, delta: number, target: Strand, options: HookOptions): void {
    for (let i = 0; i < this.length; i++) {
      this.renderers[i].beforeFrame(world, delta, target, options);
    }
  }

  triggerResize() {
    for (let i = 0; i < this.length; i++) {
      const renderer = this.renderers[i];
      if (renderer.triggerResize) {
        renderer.triggerResize();
      }
    }
  }

  getPointsAt(world: World, target: Strand, aggregate: Strand, scaleFactor: number): Paint[] {
    return this.renderers[0].getPointsAt(world, target, aggregate, scaleFactor);
  }

  getScale(width: number, height: number): number {
    return this.renderers[0].getScale(width, height);
  }

  getViewportBounds(world: World, target: Strand, padding: number): PositionPair | null {
    return this.renderers[0].getViewportBounds(world, target, padding);
  }

  getRendererScreenPosition() {
    return this.renderers[0].getRendererScreenPosition();
  }

  isReady(): boolean {
    for (let i = 0; i < this.length; i++) {
      if (!this.renderers[i].isReady()) {
        return false;
      }
    }
    return true;
  }

  paint(paint: SpacialContent, index: number, x: number, y: number, width: number, height: number): void {
    for (let i = 0; i < this.length; i++) {
      this.renderers[i].paint(paint, index, x, y, width, height);
    }
  }

  pendingUpdate(): boolean {
    for (let i = 0; i < this.length; i++) {
      if (this.renderers[i].pendingUpdate()) {
        return true;
      }
    }
    return false;
  }

  prepareLayer(paint: SpacialContent, point: Strand, cx?: number, cy?:number): void {
    for (let i = 0; i < this.length; i++) {
      this.renderers[i].prepareLayer(paint, point, cx, cy);
    }
  }

  finishLayer(paint: SpacialContent, point: Strand): void {
    for (let i = 0; i < this.length; i++) {
      this.renderers[i].finishLayer(paint, point);
    }
  }

  resize(width?: number, height?: number): void {
    for (let i = 0; i < this.length; i++) {
      this.renderers[i].resize(width, height);
    }
  }

  reset() {
    for (let i = 0; i < this.length; i++) {
      this.renderers[i].reset();
    }
  }
}
