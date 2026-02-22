import { compose, DnaFactory, dna, type Strand, translate } from '@atlas-viewer/dna';
import type { AtlasObjectModel } from '../aom';
import type { DisplayData } from '../types';
import { bestResourceIndexAtRatio } from '../utils';
import type { Paint } from '../world-objects';
import { AbstractContent } from './abstract-content';
import { SingleImage } from './single-image';
import type { SpacialContent } from './spacial-content';

type RenderOptions = {
  renderSmallestFallback: boolean;
  renderLayers: number;
  minSize: number;
  maxImageSize: number;
  quality: number;
  useDevicePixelRatio: boolean;
  layerPolicy: 'fallback-only' | 'always-blend' | 'active-only';
  loadingBias: 'balanced' | 'speed' | 'data';
  prefetchRadius?: number;
  fadeInMs: number;
  fadeFallbackTiles: boolean;
};

export type CompositeResourceProps = Partial<RenderOptions>;

export class CompositeResource
  extends AbstractContent
  implements SpacialContent, AtlasObjectModel<CompositeResourceProps, SpacialContent>
{
  readonly id: string;
  readonly display: DisplayData;
  points: Strand;
  images: SpacialContent[] = [];
  allImages: SpacialContent[] = [];
  scaleFactors: number[] = [];
  aggregateBuffer = dna(9);
  lazyLoader?: () => Promise<SpacialContent[]>;
  isFullyLoaded = false;
  isLoadingFullResource = false;
  maxScaleFactor = 0;
  private layerSelection = new WeakMap<SpacialContent, { active: boolean; frame: number }>();
  private layerSelectionFrame = 0;

  renderOptions: RenderOptions;

  constructor(data: {
    id: string;
    width: number;
    height: number;
    images: SpacialContent[];
    loadFullImages?: () => Promise<SpacialContent[]>;
    renderOptions?: CompositeResourceProps;
  }) {
    super();
    this.id = data.id;
    this.points = DnaFactory.singleBox(data.width, data.height);
    this.lazyLoader = data.loadFullImages;
    if (!data.loadFullImages) {
      this.isFullyLoaded = true;
    }
    this.display = {
      x: 0,
      y: 0,
      points: DnaFactory.singleBox(data.width, data.height),
      height: data.height,
      width: data.width,
      scale: 1,
    };
    this.renderOptions = {
      renderSmallestFallback: true,
      renderLayers: 2,
      minSize: 255,
      maxImageSize: 2048,
      quality: 1.3,
      useDevicePixelRatio: true,
      layerPolicy: 'always-blend',
      loadingBias: 'balanced',
      prefetchRadius: 1,
      fadeInMs: 300,
      fadeFallbackTiles: false,
      ...(data.renderOptions || {}),
    };

    this.addImages(data.images);
  }

  applyProps(props: CompositeResourceProps) {
    let shouldResort = false;
    if (
      typeof props.renderSmallestFallback !== 'undefined' &&
      props.renderSmallestFallback !== this.renderOptions.renderSmallestFallback
    ) {
      this.renderOptions.renderSmallestFallback = props.renderSmallestFallback;
    }
    if (typeof props.renderLayers !== 'undefined' && props.renderLayers !== this.renderOptions.renderLayers) {
      this.renderOptions.renderLayers = props.renderLayers;
    }
    if (typeof props.minSize !== 'undefined' && props.minSize !== this.renderOptions.minSize) {
      this.renderOptions.minSize = props.minSize;
      shouldResort = true;
    }
    if (typeof props.maxImageSize !== 'undefined' && props.maxImageSize !== this.renderOptions.maxImageSize) {
      this.renderOptions.maxImageSize = props.maxImageSize;
      shouldResort = true;
    }
    if (typeof props.quality !== 'undefined' && props.quality !== this.renderOptions.quality) {
      this.renderOptions.quality = props.quality;
    }
    if (
      typeof props.useDevicePixelRatio !== 'undefined' &&
      props.useDevicePixelRatio !== this.renderOptions.useDevicePixelRatio
    ) {
      this.renderOptions.useDevicePixelRatio = props.useDevicePixelRatio;
    }
    if (typeof props.layerPolicy !== 'undefined' && props.layerPolicy !== this.renderOptions.layerPolicy) {
      this.renderOptions.layerPolicy = props.layerPolicy;
    }
    if (typeof props.loadingBias !== 'undefined' && props.loadingBias !== this.renderOptions.loadingBias) {
      this.renderOptions.loadingBias = props.loadingBias;
    }
    if (typeof props.prefetchRadius !== 'undefined' && props.prefetchRadius !== this.renderOptions.prefetchRadius) {
      this.renderOptions.prefetchRadius = props.prefetchRadius;
    }
    if (typeof props.fadeInMs !== 'undefined' && props.fadeInMs !== this.renderOptions.fadeInMs) {
      this.renderOptions.fadeInMs = props.fadeInMs;
    }
    if (
      typeof props.fadeFallbackTiles !== 'undefined' &&
      props.fadeFallbackTiles !== this.renderOptions.fadeFallbackTiles
    ) {
      this.renderOptions.fadeFallbackTiles = props.fadeFallbackTiles;
    }

    if (shouldResort) {
      this.sortByScales();
    }
  }

  appendChild(item: SpacialContent) {
    this.addImages([item]);
  }

  removeChild(item: SpacialContent) {
    if (this.images.indexOf(item) === -1 && this.allImages.indexOf(item) === -1) {
      return;
    }

    const key = this.getImageDedupeKey(item);
    this.images = this.images.filter((image) => image !== item && this.getImageDedupeKey(image) !== key);
    this.allImages = this.allImages.filter((image) => image !== item && this.getImageDedupeKey(image) !== key);
    this.sortByScales();
  }

  insertBefore(item: SpacialContent, before: SpacialContent) {
    // @todo this is pre-sorted by size. We could change this, but this
    //    drives other behaviours.
    this.addImages([item]);
  }

  hideInstance() {
    // @todo not yet implemented. this.points[0] = 0 ???
  }

  addImages(images: SpacialContent[]) {
    const existingObjects = new Set(this.allImages);
    const existingKeys = new Set(this.allImages.map((image) => this.getImageDedupeKey(image)));
    for (const image of images) {
      if (!image || existingObjects.has(image)) {
        continue;
      }
      const key = this.getImageDedupeKey(image);
      if (existingKeys.has(key)) {
        continue;
      }
      image.__parent = this;
      image.__owner = this.__owner;
      this.allImages.push(image);
      existingObjects.add(image);
      existingKeys.add(key);
    }
    this.sortByScales();
  }

  private getImageDedupeKey(image: SpacialContent) {
    return `${image.id}::${image.display.scale}`;
  }

  sortByScales() {
    this._scheduleSortByScales = true;
  }

  _scheduleSortByScales = false;
  _sortByScales = () => {
    this._scheduleSortByScales = false;
    this.allImages.sort((a: SpacialContent, b: SpacialContent) => b.display.width - a.display.width);
    this.images = [];
    let lastScale = 0.1;
    for (const image of this.allImages) {
      if (
        image.display.width < this.renderOptions.minSize &&
        image.display.height < this.renderOptions.minSize &&
        !image.priority
      ) {
        continue;
      }

      if (
        image instanceof SingleImage &&
        (image.display.width > this.renderOptions.maxImageSize ||
          image.display.height > this.renderOptions.maxImageSize) &&
        !image.priority
      ) {
        continue;
      }

      const diff = Math.abs(image.display.scale - lastScale);
      if (diff < 0.25 || image.priority) {
        const otherImage = this.images.pop();
        if (otherImage && (otherImage instanceof SingleImage || otherImage.priority)) {
          if (image.priority) {
            this.images.push(image);
          }
          this.images.push(otherImage);
        } else {
          if (image) {
            this.images.push(image);
          }
        }
      } else {
        if (image) {
          this.images.push(image);
        }
      }

      lastScale = image.display.scale;
    }

    if (this.images.length === 0) {
      // Workaround for bad filtering.
      this.images = [...this.allImages];
    }

    this.scaleFactors = this.images.map((singleImage) => singleImage.display.scale);
    this.maxScaleFactor = this.scaleFactors.length ? Math.max(...this.scaleFactors) : 0;
  };

  loadFullResource = async () => {
    if (this.isFullyLoaded || this.isLoadingFullResource) {
      return;
    }
    if (this.lazyLoader) {
      this.isLoadingFullResource = true;
      try {
        const newImages = await this.lazyLoader();
        this.addImages(newImages || []);
        this.isFullyLoaded = true;
      } finally {
        this.isLoadingFullResource = false;
      }
    }
  };

  fallback = [this.loadFullResource];

  getScheduledUpdates(target: Strand, scaleFactor: number): Array<() => Promise<void>> {
    if (this._scheduleSortByScales) {
      return [this._sortByScales] as any[];
    }
    if (this.isFullyLoaded) {
      return [];
    }
    if (scaleFactor > 1 / this.maxScaleFactor) {
      return this.fallback;
    }
    return [];
  }

  getAllPointsAt(target: Strand, aggregate?: Strand, scale?: number): Paint[] {
    if (this.images.length === 0) {
      return [];
    }

    const devicePixelRatio =
      this.renderOptions.useDevicePixelRatio && typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const bestIndex = bestResourceIndexAtRatio(
      1 / (scale || 1) / devicePixelRatio,
      this.images,
      this.renderOptions.quality
    );

    const len = this.images.length;
    const newAggregate = aggregate ? compose(aggregate, translate(this.x, this.y)) : translate(this.x, this.y);

    let toPaintIdx: number[] = [bestIndex];
    if (bestIndex !== this.images.length - 1 && this.images[bestIndex + 1]) {
      toPaintIdx = [];
      for (let i = len - 1; i >= bestIndex; i--) {
        toPaintIdx.push(i);
      }
      const smallestIdx = toPaintIdx[0];
      if (this.renderOptions.renderLayers) {
        toPaintIdx = toPaintIdx.slice(-Math.min(toPaintIdx.length, this.renderOptions.renderLayers));
      }

      if (this.renderOptions.renderSmallestFallback && toPaintIdx.indexOf(smallestIdx) === -1) {
        toPaintIdx.unshift(smallestIdx);
      }
    }

    const active = new Set<number>();
    switch (this.renderOptions.layerPolicy) {
      case 'always-blend':
        for (const idx of toPaintIdx) {
          active.add(idx);
        }
        break;
      case 'active-only':
        active.add(bestIndex);
        toPaintIdx = [bestIndex];
        break;
      case 'fallback-only':
      default:
        active.add(bestIndex);
        if (this.renderOptions.renderSmallestFallback && toPaintIdx.length) {
          active.add(toPaintIdx[0]);
        }
        break;
    }

    this.layerSelectionFrame += 1;
    for (const image of this.allImages) {
      this.layerSelection.set(image, {
        active: false,
        frame: this.layerSelectionFrame,
      });
    }

    const toPaint = [];
    for (let i = 0; i < toPaintIdx.length; i++) {
      const idx = toPaintIdx[i];
      const image = this.images[idx];
      this.layerSelection.set(image, {
        active: active.has(idx),
        frame: this.layerSelectionFrame,
      });
      toPaint.push(...image.getAllPointsAt(target, newAggregate, scale));
    }

    return toPaint;
  }

  isImageActive(image: SpacialContent): boolean {
    const selected = this.layerSelection.get(image);
    return !!selected && selected.frame === this.layerSelectionFrame && selected.active;
  }
}
