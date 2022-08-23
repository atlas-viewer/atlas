import { SpacialContent } from './spacial-content';
import { compose, dna, DnaFactory, Strand, translate } from '@atlas-viewer/dna';
import { DisplayData } from '../types';
import { Paint } from '../world-objects';
import { bestResourceIndexAtRatio } from '../utils';
import { AbstractContent } from './abstract-content';
import { AtlasObjectModel } from '../aom';
import { SingleImage } from './single-image';

type RenderOptions = {
  renderSmallestFallback: boolean;
  renderLayers: number;
  minSize: number;
  maxImageSize: number;
  quality: number;
};

type CompositeResourceProps = RenderOptions;

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
  maxScaleFactor = 0;

  renderOptions: RenderOptions;

  constructor(data: {
    id: string;
    width: number;
    height: number;
    images: SpacialContent[];
    loadFullImages?: () => Promise<SpacialContent[]>;
    renderOptions?: RenderOptions;
  }) {
    super();
    this.id = data.id;
    this.points = DnaFactory.singleBox(data.width, data.height);
    this.lazyLoader = data.loadFullImages;
    if (!data.loadFullImages) {
      this.isFullyLoaded = true;
    }
    this.display = {
      points: DnaFactory.singleBox(data.width, data.height),
      height: data.height,
      width: data.width,
      scale: 1,
    };
    this.renderOptions = {
      renderSmallestFallback: true,
      renderLayers: 3,
      minSize: 255,
      maxImageSize: 1024,
      quality: 1.1,
      ...(data.renderOptions || {}),
    };

    this.addImages(data.images);
  }

  applyProps(props: CompositeResourceProps) {
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
    }
    if (typeof props.maxImageSize !== 'undefined' && props.maxImageSize !== this.renderOptions.maxImageSize) {
      this.renderOptions.maxImageSize = props.maxImageSize;
    }
    if (typeof props.quality !== 'undefined' && props.quality !== this.renderOptions.quality) {
      this.renderOptions.quality = props.quality;
    }
  }

  appendChild(item: SpacialContent) {
    this.addImages([item]);
  }

  removeChild(item: SpacialContent) {
    if (this.images.indexOf(item) === -1) {
      return;
    }

    this.images = this.images.filter((image) => image !== item);
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
    for (const image of images) {
      image.__parent = this;
    }
    this.allImages.push(...images.filter(Boolean));
    this.sortByScales();
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
    this.maxScaleFactor = Math.max(...this.scaleFactors);
  };

  loadFullResource = async () => {
    if (this.isFullyLoaded) {
      return;
    }
    if (this.lazyLoader) {
      // Reads: resource has already been requested.
      this.isFullyLoaded = true;
      const newImages = await this.lazyLoader();
      this.addImages(newImages);
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

    const bestIndex = bestResourceIndexAtRatio(
      1 / (scale || 1) / (window.devicePixelRatio || 1),
      this.images,
      this.renderOptions.quality
    );
    const len = this.images.length;
    const newAggregate = aggregate ? compose(aggregate, translate(this.x, this.y)) : translate(this.x, this.y);

    if (bestIndex !== this.images.length - 1 && this.images[bestIndex + 1]) {
      let toPaintIdx = [];
      for (let i = len - 1; i >= bestIndex; i--) {
        toPaintIdx.push(i);
      }
      const smallestIdx = toPaintIdx[0];
      if (this.renderOptions.renderLayers) {
        toPaintIdx = toPaintIdx.slice(-this.renderOptions.renderLayers);
      }

      if (this.renderOptions.renderSmallestFallback && toPaintIdx.indexOf(smallestIdx) === -1) {
        toPaintIdx.unshift(smallestIdx);
      }

      const toPaint = [];
      for (let i = 0; i < toPaintIdx.length; i++) {
        toPaint.push(...this.images[toPaintIdx[i]].getAllPointsAt(target, newAggregate, scale));
      }

      return toPaint;
    }
    return this.images[bestIndex].getAllPointsAt(target, newAggregate, scale);
  }
}
