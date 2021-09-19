import { SpacialContent } from './spacial-content';
import { compose, dna, DnaFactory, Strand, translate } from '@atlas-viewer/dna';
import { DisplayData } from '../types';
import { Paint } from '../world-objects';
import { bestResourceAtRatio, bestResourceIndexAtRatio } from '../utils';
import { AbstractContent } from './abstract-content';
import { AtlasObjectModel } from '../aom';

type CompositeResourceProps = {};

export class CompositeResource extends AbstractContent
  implements SpacialContent, AtlasObjectModel<CompositeResourceProps, SpacialContent> {
  readonly id: string;
  readonly display: DisplayData;
  points: Strand;
  images: SpacialContent[] = [];
  scaleFactors: number[] = [];
  aggregateBuffer = dna(9);
  lazyLoader?: () => Promise<SpacialContent[]>;
  isFullyLoaded = false;
  maxScaleFactor = 0;

  constructor(data: {
    id: string;
    width: number;
    height: number;
    images: SpacialContent[];
    loadFullImages?: () => Promise<SpacialContent[]>;
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

    this.addImages(data.images);
  }

  applyProps(props: CompositeResourceProps) {
    // @todo.
  }

  appendChild(item: SpacialContent) {
    this.addImages([item]);
  }

  removeChild(item: SpacialContent) {
    if (this.images.indexOf(item) === -1) {
      return;
    }

    this.images = this.images.filter(image => image !== item);
    this.sortByScales();
  }

  insertBefore(item: SpacialContent, before: SpacialContent) {
    // @todo this is pre-sorted by size. We could change this, but this
    //    drives other behaviours.
    this.addImages([item]);
  }

  hideInstance() {
    // @todo not yet implemented. this.points[0] = 0 ???
    console.log('hideInstance: not yet implemented');
  }

  addImages(images: SpacialContent[]) {
    for (const image of images) {
      image.__parent = this;
    }
    this.images.push(...images.filter(Boolean));
    this.sortByScales();
  }

  sortByScales() {
    this.images.sort((a: SpacialContent, b: SpacialContent) => b.display.width - a.display.width);
    this.scaleFactors = this.images.map(singleImage => singleImage.display.scale);
    this.maxScaleFactor = Math.max(...this.scaleFactors);
  }

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

  getScheduledUpdates(target: Strand, scaleFactor: number): Array<() => Promise<void>> | null {
    if (this.isFullyLoaded) {
      return null;
    }
    if (scaleFactor > 1 / this.maxScaleFactor) {
      return this.fallback;
    }
    return null;
  }

  getAllPointsAt(target: Strand, aggregate?: Strand, scale?: number): Paint[] {
    if (this.images.length === 0) {
      return [];
    }

    const bestIndex = bestResourceIndexAtRatio(1 / (scale || 1), this.images);
    const len = this.images.length;
    const newAggregate = aggregate ? compose(aggregate, translate(this.x, this.y)) : translate(this.x, this.y);

    if (bestIndex !== this.images.length - 1 && this.images[bestIndex + 1]) {
      const toPaint = [];
      for (let i = len - 1; i >= bestIndex; i--) {
        toPaint.push(...this.images[i].getAllPointsAt(target, newAggregate, scale));
      }
      return toPaint;
    }

    return this.images[bestIndex].getAllPointsAt(target, newAggregate, scale);
  }
}
