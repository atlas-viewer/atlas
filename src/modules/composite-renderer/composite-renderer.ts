import { Renderer } from '../../renderer/renderer';
import { Paint } from '../../world-objects/paint';
import { World } from '../../world';
import { Strand } from '@atlas-viewer/dna';
import { SpacialContent } from '../../spacial-content/spacial-content';
import { PositionPair } from '../../types';

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

  afterFrame(world: World, delta: number, target: Strand): void {
    for (let i = 0; i < this.length; i++) {
      this.renderers[i].afterFrame(world, delta, target);
    }
  }

  afterPaintLayer(paint: SpacialContent, transform?: Strand): void {
    for (let i = 0; i < this.length; i++) {
      this.renderers[i].afterPaintLayer(paint, transform);
    }
  }

  beforeFrame(world: World, delta: number, target: Strand): void {
    for (let i = 0; i < this.length; i++) {
      this.renderers[i].beforeFrame(world, delta, target);
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

  prepareLayer(paint: SpacialContent): void {
    for (let i = 0; i < this.length; i++) {
      this.renderers[i].prepareLayer(paint);
    }
  }

  resize(width: number, height: number): void {
    for (let i = 0; i < this.length; i++) {
      this.renderers[i].resize(width, height);
    }
  }
}
