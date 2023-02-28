import { Renderer } from '../../renderer/renderer';
import { Paint } from '../../world-objects/paint';
import { World } from '../../world';
import { Strand } from '@atlas-viewer/dna';
import { SpacialContent } from '../../spacial-content/spacial-content';
import { PositionPair } from '../../types';
import { Text } from '../../objects/text';
import { Box } from '../../objects/box';
import { Stylesheet } from '../../utility/stylesheet';

export type OverlayRendererOptions = {
  sheetPrefix: string;
  box: boolean;
  text: boolean;
  inlineStyles: boolean;
  triggerResize: () => void;
  background: string;
};

export class OverlayRenderer implements Renderer {
  htmlContainer: HTMLDivElement;
  visible: Array<Text | Box | SpacialContent> = [];
  previousVisible: Array<Text | Box | SpacialContent> = [];
  htmlIds: string[] = [];
  firstMeaningfulPaint = false;
  rendererPosition: DOMRect;
  stylesheet: Stylesheet;
  options: OverlayRendererOptions;
  paintTx = 1;
  zIndex = 0;
  classes: {
    hostClassName: string;
    interactive: string;
    nonInteractive: string;
  };

  constructor(htmlContainer: HTMLDivElement, options?: Partial<OverlayRendererOptions>) {
    this.htmlContainer = htmlContainer;
    this.htmlContainer.innerHTML = '';
    this.rendererPosition = this.htmlContainer.getBoundingClientRect();
    this.options = {
      triggerResize: () => {},
      box: false,
      text: false,
      sheetPrefix: '',
      inlineStyles: false,
      background: '',
      ...(options || {}),
    };
    this.stylesheet = new Stylesheet({ sheetPrefix: this.options.sheetPrefix });
    if (!this.options.inlineStyles) {
      this.htmlContainer.appendChild(this.stylesheet.getElement());
    }

    if (this.options.background) {
      this.htmlContainer.classList.add(
        this.stylesheet.addStylesheet(`
        background: ${this.options.background};
      `)
      );
    }

    // Default classes.
    this.classes = {
      hostClassName: this.stylesheet.addStylesheet(`
        position: absolute;
        transform-origin: 0px 0px;
      `),
      interactive: this.stylesheet.addStylesheet(`pointer-events: all`),
      nonInteractive: this.stylesheet.addStylesheet(`pointer-events: none`),
    };
    this.stylesheet.updateSheet();
  }

  createHtmlHost(paint: Text | Box) {
    if (this.htmlContainer && (this.options.box || paint.props.className || paint.props.html || paint.props.href)) {
      const div = document.createElement(paint.props.href ? 'a' : 'div');
      if (paint.props.href) {
        div.style.display = 'block';
        (div as HTMLAnchorElement).href = paint.props.href;
        const target = paint.props.hrefTarget || '_blank';
        (div as HTMLAnchorElement).target = target;
        if (target !== '_self') {
          (div as HTMLAnchorElement).rel = 'noopener noreferrer';
        }
      }
      div.title = paint.props.title || '';
      if (this.options.inlineStyles) {
        div.style.display = 'block';
        div.style.position = 'absolute';
        div.style.overflow = 'hidden';
        div.style.transformOrigin = '0px 0px';
      } else {
        div.classList.add(this.classes.hostClassName);
      }
      paint.__host = { element: div, revision: null, relative: false };
      this.updateHtmlHost(paint, paint.width, paint.height);
      if (paint.__onCreate) {
        paint.__onCreate();
      }
    }
  }

  triggerResize() {
    this.options.triggerResize();
  }

  updateHtmlHost(paint: Text | Box, width?: number, height?: number) {
    if (paint.__revision !== paint.__host.revision) {
      const div = paint.__host.element;
      const classes = [this.classes.hostClassName];

      if (paint.props.interactive) {
        if (this.options.inlineStyles) {
          div.style.pointerEvents = 'all';
        } else {
          classes.push(this.classes.interactive);
        }
      } else {
        if (this.options.inlineStyles) {
          div.style.pointerEvents = 'none';
        } else {
          classes.push(this.classes.nonInteractive);
        }
      }

      if (paint.props.href) {
        div.style.display = 'block';
        (div as HTMLAnchorElement).href = paint.props.href;
        const target = paint.props.hrefTarget || '_blank';
        (div as HTMLAnchorElement).target = target;
        if (target !== '_self') {
          (div as HTMLAnchorElement).rel = 'noopener noreferrer';
        } else {
          (div as HTMLAnchorElement).rel = '';
        }
      } else if ((div as HTMLAnchorElement).href) {
        (div as HTMLAnchorElement).removeAttribute('href');
      }

      if (paint.props.title) {
        div.title = paint.props.title || '';
      }

      if (paint.props.className) {
        classes.push(paint.props.className);
        if (paint.hovering) {
          classes.push(`${paint.props.className}--hover`);
        }
        if (paint.pressing) {
          classes.push(`${paint.props.className}--active`);
        }
      }

      if (paint.props.relativeStyle) {
        div.style.width = `${width || paint.width}px`;
        div.style.height = `${height || paint.height}px`;
      } else {
        div.style.width = `${paint.width}px`;
        div.style.height = `${paint.height}px`;
      }

      const style = (paint.props as any).style;
      if (style) {
        Object.assign(
          div.style,
          (paint.props as any).style || {},
          (paint as any).hovering ? (paint.props as any).hoverStyles || {} : {},
          (paint as any).pressing ? (paint.props as any).pressStyles || {} : {}
        );
        return;
      }

      if (this.options.text && paint instanceof Text) {
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
        const classNames = classes.join(' ');
        div.className = classNames;
        div.part = classNames;
      }
      if (paint instanceof Box && (this.options.box || paint.props.className || paint.props.html)) {
        if (paint.props.backgroundColor) {
          div.style.backgroundColor = paint.props.backgroundColor;
        }
        if (paint.props.border !== div.style.border) {
          div.style.border = paint.props.border;
        }
      }

      const classNames = classes.join(' ');
      div.className = classNames;
      div.part = classNames;
    }
  }

  afterFrame(world: World, delta: number, target: Strand): void {
    this.stylesheet.updateSheet();

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
    this.stylesheet.clearClasses();
    this.paintTx++;
    this.zIndex = 0;
    this.visible = [];
  }

  getPointsAt(world: World, target: Strand, aggregate: Strand, scaleFactor: number): Paint[] {
    return world.getPointsAt(target, aggregate, scaleFactor);
  }

  getScale(width: number, height: number): number {
    const w = this.rendererPosition.width / width;
    const h = this.rendererPosition.height / height;
    return w < h ? h : w;
  }

  getViewportBounds(world: World, target: Strand, padding: number): PositionPair | null {
    return null;
  }

  isReady(): boolean {
    return false;
  }

  paint(paint: SpacialContent, index: number, x: number, y: number, width: number, height: number): void {
    this.zIndex++;

    if (
      ((this.options.text && paint instanceof Text) ||
        (paint instanceof Box && (this.options.box || paint.props.className || paint.props.html))) &&
      paint.__host.tx !== this.paintTx
    ) {
      this.visible.push(paint);
      paint.__host.tx = this.paintTx;

      if (this.htmlContainer) {
        this.updateHtmlHost(paint, width, height);

        const scale = width / paint.width;
        const element: HTMLDivElement = paint.__host.element;
        element.style.zIndex = `${this.zIndex}`;

        if (paint.props.relativeStyle) {
          element.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
          // element.style.transformOrigin = '0px 0px';
        } else {
          // How to rotate overlays.. but don't do it.
          // element.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(${width/2}px, ${height/2}px) rotate(${paint.__owner.value?.rotation || 0}deg) translate(-${width/2}px, -${height/2}px) scale(${scale})`;
          element.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) scale(${scale})`;
          // element.style.transformOrigin = '0px 0px';
        }

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

  resize(width?: number, height?: number): void {
    if (typeof width !== 'undefined' && typeof height !== 'undefined') {
      this.htmlContainer.style.width = `${width}px`;
      this.htmlContainer.style.height = `${height}px`;
    }
    this.rendererPosition = this.htmlContainer.getBoundingClientRect();
  }

  getRendererScreenPosition() {
    return this.rendererPosition;
  }

  finishLayer() {}

  reset() {}
}
