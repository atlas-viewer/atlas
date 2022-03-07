import { Renderer } from '../../renderer/renderer';
import { World } from '../../world';
import { Paint } from '../../world-objects/paint';
import { Strand } from '@atlas-viewer/dna';
import { SpacialContent } from '../../spacial-content/spacial-content';
import { PositionPair } from '../../types';
import { SingleImage } from '../../spacial-content/single-image';
import { TiledImage } from '../../spacial-content/tiled-image';
import { Stylesheet } from '../../utility/stylesheet';

type StaticRendererOptions = {
  imageClass: string;
  addPart: boolean;
  setDraggableFalse: boolean;
  widthStylesheet: boolean;
  sheetPrefix: string;
};

export class StaticRenderer implements Renderer {
  container: HTMLElement;
  width: number;
  height: number;
  pending = true;
  options: StaticRendererOptions;
  stylesheet: Stylesheet;
  zIndex = 0;
  lastKnownScale = 1;
  rendererPosition: DOMRect;

  constructor(container: HTMLElement, options?: Partial<StaticRendererOptions>) {
    this.container = container;
    this.rendererPosition = container.getBoundingClientRect();
    const { width, height } = this.rendererPosition;
    this.width = width;
    this.height = height;
    this.options = {
      addPart: false,
      setDraggableFalse: false,
      imageClass: '',
      widthStylesheet: false,
      sheetPrefix: 'position-',
      ...(options || {}),
    };
    this.stylesheet = new Stylesheet({ sheetPrefix: this.options.sheetPrefix });
    if (this.options.widthStylesheet) {
      this.container.appendChild(this.stylesheet.getElement());
    }
  }

  isReady(): boolean {
    return true;
  }

  resize() {
    this.rendererPosition = this.container.getBoundingClientRect();
    this.width = this.rendererPosition.width;
    this.height = this.rendererPosition.height;
  }

  getRendererScreenPosition() {
    return this.rendererPosition;
  }

  afterFrame(world: World, delta: number, target: Strand): void {
    this.stylesheet.updateSheet();

    for (const item of this.previouslyVisible) {
      if (this.currentlyVisible.indexOf(item) === -1) {
        this.container.removeChild(item);
      }
    }

    for (const item of this.currentlyVisible) {
      if (this.previouslyVisible.indexOf(item) === -1) {
        this.container.appendChild(item);
      }
    }

    this.previouslyVisible = this.currentlyVisible;
    this.currentlyVisible = [];
  }

  afterPaintLayer(paint: SpacialContent, transform?: Strand): void {}

  beforeFrame(world: World, delta: number, target: Strand): void {
    this.stylesheet.clearClasses();
    this.zIndex = 0;
  }

  getPointsAt(world: World, target: Strand, aggregate: Strand, scaleFactor: number): Paint[] {
    return world.getPointsAt(target, aggregate, scaleFactor);
  }

  getScale(width: number, height: number): number {
    // It shouldn't happen, but it will. If the canvas is a different shape
    // to the viewport, then this will choose the largest scale to use.
    if (Number.isNaN(width) || Number.isNaN(height)) {
      return this.lastKnownScale;
    }

    const w = this.width / width;
    const h = this.height / height;
    const scale = w < h ? h : w;

    if (!Number.isNaN(scale)) {
      this.lastKnownScale = scale;
    }

    return this.lastKnownScale;
  }

  getViewportBounds(world: World, target: Strand, padding: number): PositionPair | null {
    return null;
  }

  currentlyVisible: HTMLElement[] = [];
  previouslyVisible: HTMLElement[] = [];

  createImage() {
    const image = document.createElement('img');

    if (this.options.imageClass) {
      image.className = this.options.imageClass;
      if (this.options.addPart) {
        image.setAttribute('part', this.options.imageClass);
      }
    } else {
      image.style.position = 'absolute';
      image.style.pointerEvents = 'none';
      image.style.userSelect = 'none';
    }
    if (this.options.setDraggableFalse) {
      image.setAttribute('draggable', 'false');
    }
    return image;
  }

  paint(paint: SpacialContent, index: number, x: number, y: number, width: number, height: number): void {
    // Unsure.
    this.pending = false;
    this.zIndex++;

    if (paint instanceof SingleImage) {
      if (!paint.__host) {
        const image = this.createImage();
        image.src = paint.uri;
        paint.__host = image;
        this.container.appendChild(paint.__host);
      }

      const element: HTMLImageElement = paint.__host;
      this.currentlyVisible.push(element);

      element.style.zIndex = `${this.zIndex}`;
      element.style.opacity = `${paint.style.opacity}`;

      if (this.options.widthStylesheet) {
        element.className =
          this.options.imageClass +
          ' ' +
          this.stylesheet.addStylesheet(
            `width:${(width + Number.MIN_VALUE).toFixed(2)}px;height:${(height + Number.MIN_VALUE).toFixed(2)}px;`
          );
      } else {
        element.style.width = `${width + Number.MIN_VALUE}px`;
        element.style.height = `${height + Number.MIN_VALUE}px`;
      }
      element.style.transform = `translate(${x}px, ${y}px)`;
    }
    if (paint instanceof TiledImage) {
      if (!paint.__host) {
        paint.__host = {
          images: [],
        };
      }

      if (!paint.__host.images[index]) {
        const url = paint.getImageUrl(index);
        const image = this.createImage();
        image.src = url;
        paint.__host.images[index] = image;
        this.container.appendChild(image);
      }
      const element: HTMLImageElement = paint.__host.images[index];
      element.style.zIndex = `${this.zIndex}`;
      element.style.opacity = `${paint.style.opacity}`;

      this.currentlyVisible.push(element);

      if (this.options.widthStylesheet) {
        element.className =
          this.options.imageClass +
          ' ' +
          this.stylesheet.addStylesheet(
            `width:${(width + Number.MIN_VALUE).toFixed(2)}px;height:${(height + Number.MIN_VALUE).toFixed(2)}px;`
          );
      } else {
        element.style.width = `${width + Number.MIN_VALUE}px`;
        element.style.height = `${height + Number.MIN_VALUE}px`;
      }
      element.style.transform = `translate(${x}px, ${y}px)`;
    }
  }

  pendingUpdate(): boolean {
    return this.pending;
  }

  prepareLayer(paint: SpacialContent): void {}
}
