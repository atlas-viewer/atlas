import { Renderer } from '../../renderer/renderer';
import { Paint } from '../../world-objects/paint';
import { World } from '../../world';
import { Strand } from '@atlas-viewer/dna';
import { SpacialContent } from '../../spacial-content/spacial-content';
import { PositionPair } from '../../types';
import { Text } from '../../objects/text';
import { Box } from '../../objects/box';

export class OverlayRenderer implements Renderer {
  htmlContainer: HTMLDivElement;
  width: number;
  height: number;
  visible: Array<Text | Box | SpacialContent> = [];
  previousVisible: Array<Text | Box | SpacialContent> = [];
  htmlIds: string[] = [];
  firstMeaningfulPaint = false;

  constructor(htmlContainer: HTMLDivElement) {
    this.htmlContainer = htmlContainer;
    const { width, height } = this.htmlContainer.getBoundingClientRect();
    this.width = width;
    this.height = height;
  }

  createHtmlHost(paint: Text | Box) {
    if (this.htmlContainer) {
      const div = document.createElement('div');
      div.style.position = 'absolute';
      paint.__host = { element: div, revision: null, relative: false };
      this.updateHtmlHost(paint);
      if (paint.__onCreate) {
        paint.__onCreate();
      }
    }
  }

  updateHtmlHost(paint: Text | Box) {
    if (paint.__revision !== paint.__host.revision) {
      const div = paint.__host.element;

      // @todo drive this by props?
      // div.style.overflow = 'hidden';
      div.style.width = `${paint.width}px`;
      div.style.height = `${paint.height}px`;
      if (paint.props.interactive) {
        div.style.pointerEvents = 'all';
      }

      if (paint instanceof Text) {
        if (paint.text) {
          div.innerText = paint.text;
        }
        if (paint.backgroundColor) {
          div.style.backgroundColor = paint.backgroundColor;
        }
        if (paint.color) {
          div.style.color = paint.color;
        }
        if (paint.props.font) {
          div.style.font = paint.props.font;
        }
        if (paint.props.textAlign) {
          div.style.textAlign = paint.props.textAlign;
        }
        paint.__host.revision = paint.__revision;
      }
      if (paint instanceof Box) {
        if (paint.props.backgroundColor) {
          div.style.backgroundColor = paint.props.backgroundColor;
        }
        if (paint.props.border !== div.style.border) {
          div.style.border = paint.props.border;
        }
        if (paint.props.className) {
          div.className = paint.props.className;
        }
      }
    }
  }

  afterFrame(world: World, delta: number, target: Strand): void {
    for (const prev of this.previousVisible) {
      if (this.visible.indexOf(prev) === -1) {
        if (
          // HTML container
          this.htmlContainer &&
          // Previous ID
          prev.__id &&
          // Is it in the list.
          this.htmlIds.indexOf(prev.__id) !== -1
        ) {
          this.htmlContainer.removeChild(prev.__host.element);
        }
      }
    }
    // Set them.
    this.previousVisible = this.visible;
  }

  afterPaintLayer(paint: SpacialContent, transform?: Strand): void {
    // No-op
  }

  beforeFrame(world: World, delta: number, target: Strand): void {
    this.visible = [];
  }

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

  isReady(): boolean {
    return false;
  }

  paint(paint: SpacialContent, index: number, x: number, y: number, width: number, height: number): void {
    if (paint instanceof Text || paint instanceof Box) {
      this.visible.push(paint);

      if (this.htmlContainer) {
        this.updateHtmlHost(paint);

        const scale = width / paint.width;
        const element: HTMLDivElement = paint.__host.element;

        element.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) scale(${scale})`;
        element.style.transformOrigin = `0px 0px`;

        if (this.previousVisible.indexOf(paint) === -1) {
          this.htmlContainer.appendChild(element);
        }
        if (this.htmlIds.indexOf(paint.__id) === -1) {
          this.htmlIds.push(paint.__id);
        }
      }
    }
  }

  pendingUpdate(): boolean {
    return false;
  }

  prepareLayer(paint: SpacialContent): void {
    if (!paint.__host) {
      if (paint instanceof Text || paint instanceof Box) {
        this.createHtmlHost(paint);
      }
    }
  }

  resize(width: number, height: number): void {
    // Maybe?
    this.htmlContainer.style.width = `${width}px`;
    this.htmlContainer.style.height = `${height}px`;
    this.width = width;
    this.height = height;
  }
}
