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
  background: string;
};

// @todo make this configurable.
const MIN = 1 + Number.MIN_VALUE;

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
  private idle = false;
  private loadingImages = new Set<HTMLImageElement>();
  private pausedImages = new Map<HTMLImageElement, string>();

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
      background: '#000',
      ...(options || {}),
    };
    this.stylesheet = new Stylesheet({ sheetPrefix: this.options.sheetPrefix });
    this.container.classList.add(
      this.stylesheet.addStylesheet(`
        background: ${this.options.background};
      `)
    );
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
    this.pending = true;
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
    this.pending = false;
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

  private loadImage(image: HTMLImageElement, src: string) {
    this.loadingImages.add(image);
    image.onload = image.onerror = () => {
      this.loadingImages.delete(image);
      image.onload = image.onerror = null;
    };
    image.src = src;
  }

  paint(paint: SpacialContent, index: number, x: number, y: number, width: number, height: number): void {
    if (this.idle) return;
    this.zIndex++;

    if (paint instanceof SingleImage) {
      if (!paint.__host) {
        const image = this.createImage();
        paint.__host = image;
        this.container.appendChild(paint.__host);
      }

      const element: HTMLImageElement = paint.__host;
      if (!element.hasAttribute('src')) this.loadImage(element, paint.uri);
      this.currentlyVisible.push(element);

      element.style.zIndex = `${this.zIndex}`;
      element.style.opacity = `${paint.style.opacity}`;

      if (this.options.widthStylesheet) {
        element.className =
          this.options.imageClass +
          ' ' +
          this.stylesheet.addStylesheet(`width:${(width + MIN).toFixed(2)}px;height:${(height + MIN).toFixed(2)}px;`);
      } else {
        element.style.width = `${width + MIN}px`;
        element.style.height = `${height + MIN}px`;
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
        const image = this.createImage();
        paint.__host.images[index] = image;
        this.container.appendChild(image);
      }
      const element: HTMLImageElement = paint.__host.images[index];
      if (!element.hasAttribute('src')) this.loadImage(element, paint.getImageUrl(index));
      element.style.zIndex = `${this.zIndex}`;
      element.style.opacity = `${paint.style.opacity}`;

      this.currentlyVisible.push(element);

      if (this.options.widthStylesheet) {
        element.className =
          this.options.imageClass +
          ' ' +
          this.stylesheet.addStylesheet(`width:${(width + MIN).toFixed(2)}px;height:${(height + MIN).toFixed(2)}px;`);
      } else {
        element.style.width = `${width + MIN}px`;
        element.style.height = `${height + MIN}px`;
      }
      element.style.transform = `translate(${x}px, ${y}px)`;
    }
  }

  pendingUpdate(): boolean {
    return !this.idle && this.pending;
  }

  setIdle(idle: boolean) {
    if (this.idle === idle) return;
    this.idle = idle;
    if (idle) {
      for (const image of this.loadingImages) {
        const src = image.getAttribute('src');
        if (src && !image.complete) {
          this.pausedImages.set(image, src);
          image.onload = image.onerror = null;
          this.loadingImages.delete(image);
          image.removeAttribute('src');
        }
      }
    } else {
      for (const [image, src] of this.pausedImages) this.loadImage(image, src);
      this.pausedImages.clear();
      this.pending = true;
    }
  }

  prepareLayer(paint: SpacialContent): void {}
  finishLayer(paint: SpacialContent): void {}
  reset() {
    this.setIdle(true);
    for (const image of this.loadingImages) image.onload = image.onerror = null;
    this.loadingImages.clear();
    this.pausedImages.clear();
    this.idle = false;
    this.pending = true;
  }
}
