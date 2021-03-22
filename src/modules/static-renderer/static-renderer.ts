import { Renderer } from '../../renderer/renderer';
import { World } from '../../world';
import { Paint } from '../../world-objects/paint';
import { Strand } from '@atlas-viewer/dna';
import { SpacialContent } from '../../spacial-content/spacial-content';
import { PositionPair } from '../../types';
import { SingleImage } from '../../spacial-content/single-image';
import { TiledImage } from '../../spacial-content/tiled-image';

export class StaticRenderer implements Renderer {
  container: HTMLElement;
  width: number;
  height: number;
  pending = true;

  constructor(container: HTMLElement) {
    this.container = container;
    const { width, height } = container.getBoundingClientRect();
    this.width = width;
    this.height = height;
  }

  isReady(): boolean {
    return true;
  }

  resize() {
    // no-op.
  }

  afterFrame(world: World, delta: number, target: Strand): void {
    for (const item of this.previouslyVisible) {
      item.style.display = 'none';
    }

    for (const item of this.currentlyVisible) {
      item.style.display = 'block';
    }

    this.previouslyVisible = this.currentlyVisible;
    this.currentlyVisible = [];
  }

  afterPaintLayer(paint: SpacialContent, transform?: Strand): void {}

  beforeFrame(world: World, delta: number, target: Strand): void {}

  getPointsAt(world: World, target: Strand, aggregate: Strand, scaleFactor: number): Paint[] {
    return world.getPointsAt(target, aggregate, scaleFactor);
  }

  getScale(width: number, height: number): number {
    const w = this.width / width;
    const h = this.height / height;
    return w < h ? h : w;
  }

  getViewportBounds(world: World, target: Strand, padding: number): PositionPair | null {
    return null;
  }

  currentlyVisible: HTMLElement[] = [];
  previouslyVisible: HTMLElement[] = [];

  paint(paint: SpacialContent, index: number, x: number, y: number, width: number, height: number): void {
    if (paint instanceof SingleImage) {
      if (!paint.__host) {
        this.pending = false;
        const image = document.createElement('img');
        image.src = paint.uri;
        image.style.position = 'absolute';
        paint.__host = image;
        this.container.appendChild(paint.__host);
      }

      const scale = width / paint.width;
      const element: HTMLDivElement = paint.__host;

      this.currentlyVisible.push(element);
      this.previouslyVisible.unshift(element);

      element.style.display = 'block';
      element.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) scale(${scale})`;
      element.style.transformOrigin = `0px 0px`;
    }
    if (paint instanceof TiledImage) {
      if (!paint.__host) {
        paint.__host = {
          images: [],
        };
      }

      if (!paint.__host.images[index]) {
        const url = paint.getImageUrl(index);
        const image = document.createElement('img');
        image.src = url;
        image.style.position = 'absolute';
        paint.__host.images[index] = image;
        this.container.appendChild(image);
      }

      const scale = width / paint.display.width;
      const element: HTMLDivElement = paint.__host.images[index];

      this.currentlyVisible.push(element);
      this.previouslyVisible.unshift(element);

      element.style.width = `${paint.display.width + 0.8}px`;
      element.style.height = `${paint.display.height + 0.8}px`;
      element.style.display = 'block';
      element.style.top = `${Math.floor(y)}px`;
      element.style.left = `${Math.floor(x)}px`;
      element.style.transform = `scale(${scale * 1.001})`;
      element.style.transformOrigin = `0px 0px`;
    }
  }

  pendingUpdate(): boolean {
    return this.pending;
  }

  prepareLayer(paint: SpacialContent): void {}
}
