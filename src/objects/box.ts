import { BaseObject } from './base-object';
import { dna, DnaFactory, Strand } from '@atlas-viewer/dna';
import { SpacialContent } from '../spacial-content/spacial-content';
import { Paint } from '../world-objects/paint';
import { nanoid } from 'nanoid';

// Use non-global regex to avoid stateful lastIndex issues with the /g flag.
const borderRegex = /([0-9]+(px|em)\s+)+(solid)\s+(.*)/;
const borderRegexCache: Record<string, RegExpExecArray> = {};

export type BoxProps = {
  id: string;
  target: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  className?: string;
  href?: string;
  title?: string;
  hrefTarget?: string;
  interactive?: boolean;
  relativeSize?: boolean;
  relativeStyle?: boolean;
  html?: boolean;
  // New style.
  style?: BoxStyle;

  // Deprecated
  backgroundColor?: string;
  border?: string;
};

export type BoxStyle = _BoxStyle & {
  ':hover'?: _BoxStyle;
  ':active'?: _BoxStyle;
};

type _BoxStyle = Partial<{
  // In order
  backgroundColor: string; // colour or gradient function
  opacity: number;
  boxShadow: string; // to parse, splitting /,(?![^\(]*\))/
  borderColor: string;
  borderWidth: string;
  borderStyle: string; // 'solid' only
  outlineColor: string;
  outlineWidth: string;
  outlineOffset: string;
  outlineStyle: string; // 'solid' only

  /**
   * Controls how the border width is accounted for relative to the target
   * dimensions.
   *
   * - `'border-box'` (default): the target width/height include the border.
   *   The border is drawn inset, the fill covers the interior.
   * - `'content-box'`: the target width/height define the content area.
   *   The border is drawn outside the content rect, expanding the painted area.
   */
  boxSizing: 'border-box' | 'content-box';

  // Parsed.
  border: string;
  outline: string;
  background: string;

  // transform: string; // scale() rotate() transform() transformX() transformY() - pixels
  // transformOrigin: string; // using translate(x, y); rotate(); translate(-x, -y);
  // backgroundImage: string; // possibly.
  // backgroundRepeat: string; // repeat | repeat-x | repeat-y | no-repeat
  //borderRadius: string; // maybe? Future?
}>;

const styleProps: Array<keyof _BoxStyle> = [
  'backgroundColor',
  'opacity',
  'boxShadow',
  'borderColor',
  'borderWidth',
  'borderStyle',
  'outlineColor',
  'outlineWidth',
  'outlineOffset',
  'outlineStyle',
  'boxSizing',
];

function parseBorderString(value: string): RegExpExecArray | null {
  if (borderRegexCache[value]) return borderRegexCache[value];
  const match = borderRegex.exec(value);
  if (match) {
    borderRegexCache[value] = match;
    return match;
  }
  return null;
}

export class Box extends BaseObject<BoxProps> implements SpacialContent {
  id: string;
  type: 'spacial-content' = 'spacial-content';
  points: Strand;
  hoverEvents = false;
  activeEvents = false;

  display = {
    x: 0,
    y: 0,
    scale: 1,
    width: -1,
    height: -1,
    points: dna(5),
  };

  // Imperative translation/size offsets applied outside of React's render pipeline.
  _imperativeTranslateX = 0;
  _imperativeTranslateY = 0;
  _imperativeDeltaWidth = 0;
  _imperativeDeltaHeight = 0;

  _parsed: { border: { id: string | null; match: string[] }; outline: { id: string | null; match: string[] } } = {
    border: { id: null, match: [] },
    outline: { id: null, match: [] },
  };

  hovering?: boolean;
  pressing?: boolean;
  props: {
    href?: string;
    hrefTarget?: string;
    title?: string;
    backgroundColor?: string;
    border?: string;
    interactive?: boolean;
    className?: string;
    relativeSize?: boolean;
    relativeStyle?: boolean;
    html?: boolean;
    style?: BoxStyle;
    hoverStyles?: BoxStyle;
    pressStyles?: BoxStyle;
  } = {};

  constructor() {
    super();
    this.id = nanoid(12);
    this.points = dna(5);
  }

  getAllPointsAt(target: Strand, aggregate: Strand): Paint[] {
    // this.points[0] = 1;
    return [[this as any, this.points, aggregate]];
  }

  addHover = () => {
    this.hovering = true;
    this.__revision++;
  };

  removeHover = () => {
    this.hovering = false;
    this.pressing = false;
    this.__revision++;
  };

  addPress = () => {
    this.pressing = true;
    this.__revision++;
  };

  removePress = () => {
    this.pressing = false;
    this.__revision++;
  };

  /**
   * Imperatively translate the box by (dx, dy) relative to its current
   * React-managed position. Additive — each call accumulates. Triggers a
   * repaint without going through React's render pipeline.
   */
  translate(dx: number, dy: number): void {
    this._imperativeTranslateX += dx;
    this._imperativeTranslateY += dy;
    if (this.points) {
      this.points[1] += dx;
      this.points[2] += dy;
      this.points[3] += dx;
      this.points[4] += dy;
    }
    this.__revision++;
  }

  /**
   * Imperatively add (dw, dh) to the box's React-managed size. Additive —
   * each call accumulates on top of prior imperative resizes. Triggers a
   * repaint without going through React's render pipeline.
   */
  resize(dw: number, dh: number): void {
    this._imperativeDeltaWidth += dw;
    this._imperativeDeltaHeight += dh;
    if (this.points) {
      this.points[3] += dw;
      this.points[4] += dh;
    }
    this.__revision++;
  }

  /**
   * Clear any imperative size offsets accumulated via `resize()`, restoring
   * the box to its React-managed dimensions. Does NOT affect translation.
   */
  clearSize(): void {
    if (this.points && (this._imperativeDeltaWidth !== 0 || this._imperativeDeltaHeight !== 0)) {
      this.points[3] -= this._imperativeDeltaWidth;
      this.points[4] -= this._imperativeDeltaHeight;
    }
    this._imperativeDeltaWidth = 0;
    this._imperativeDeltaHeight = 0;
    this.__revision++;
  }

  applyProps(props: Partial<BoxProps> = {}) {
    let didUpdate = false;

    if (props.interactive !== this.props.interactive) {
      didUpdate = true;
      this.props.interactive = props.interactive;
    }

    // Build a resolved style object from scratch each render so removed props
    // are never silently carried over from the previous render. When props.style
    // is absent (or undefined) we treat it as an empty object so that any
    // previously-stored style is fully replaced.
    const incomingStyle: BoxStyle = props.style ? { ...props.style } : {};

    // --- Border shorthand parsing ---
    const borderShorthand = props.border || incomingStyle.border;
    if (borderShorthand !== this._parsed.border.id) {
      if (!borderShorthand) {
        this._parsed.border.id = null;
        this._parsed.border.match = [];
      } else {
        const match = parseBorderString(borderShorthand);
        if (match) {
          this._parsed.border.id = borderShorthand;
          this._parsed.border.match = match as unknown as string[];
        }
      }
    }

    if (this._parsed.border.id) {
      // Expand parsed shorthand into the resolved style.
      incomingStyle.borderWidth = this._parsed.border.match[1];
      incomingStyle.borderStyle = 'solid';
      incomingStyle.borderColor = this._parsed.border.match[4];
    } else {
      // Border was removed — ensure the expanded sub-properties are absent.
      delete incomingStyle.borderWidth;
      delete incomingStyle.borderStyle;
      delete incomingStyle.borderColor;
    }

    // --- Outline shorthand parsing ---
    if (incomingStyle.outline !== this._parsed.outline.id) {
      if (!incomingStyle.outline) {
        this._parsed.outline.id = null;
        this._parsed.outline.match = [];
      } else {
        const match = parseBorderString(incomingStyle.outline);
        if (match) {
          this._parsed.outline.id = incomingStyle.outline;
          this._parsed.outline.match = match as unknown as string[];
        }
      }
    }

    if (this._parsed.outline.id) {
      incomingStyle.outlineWidth = this._parsed.outline.match[1];
      incomingStyle.outlineStyle = 'solid';
      incomingStyle.outlineColor = this._parsed.outline.match[4];
    } else {
      // Outline was removed — ensure the expanded sub-properties are absent.
      delete incomingStyle.outlineWidth;
      delete incomingStyle.outlineStyle;
      delete incomingStyle.outlineColor;
    }

    // BC fix: legacy top-level backgroundColor / background props.
    if (props.backgroundColor && !incomingStyle.backgroundColor) {
      incomingStyle.backgroundColor = props.backgroundColor;
    }
    if (incomingStyle.background && !incomingStyle.backgroundColor) {
      incomingStyle.backgroundColor = incomingStyle.background;
    }

    // Detect style changes by comparing against the previously stored style.
    const prevStyle: BoxStyle = this.props.style || {};
    for (const prop of styleProps) {
      if ((prevStyle as any)[prop] !== (incomingStyle as any)[prop]) {
        didUpdate = true;
        break;
      }
    }
    // Also check for style being added or removed entirely.
    if (!!this.props.style !== !!props.style) {
      didUpdate = true;
    }

    // Replace the style wholesale so removed props are not silently kept.
    this.props.style = incomingStyle as BoxStyle;

    // Hover / active pseudo-styles.
    if (incomingStyle[':hover'] !== this.props.hoverStyles) {
      this.props.hoverStyles = incomingStyle[':hover'];
      if (!this.hoverEvents) {
        this.hoverEvents = true;
        this.addEventListener('pointerenter', this.addHover);
        this.addEventListener('pointerleave', this.removeHover);
      }
      didUpdate = true;
    }
    if (incomingStyle[':active'] !== this.props.pressStyles) {
      this.props.pressStyles = incomingStyle[':active'];
      if (!this.activeEvents) {
        this.activeEvents = true;
        this.addEventListener('mousedown', this.addPress);
        this.addEventListener('mouseup', this.removePress);
      }
      didUpdate = true;
    }

    if (props.href !== this.props.href) {
      this.props.href = props.href;
      didUpdate = true;
    }

    if (props.hrefTarget !== this.props.hrefTarget) {
      this.props.hrefTarget = props.hrefTarget;
      didUpdate = true;
    }

    if (props.title !== this.props.title) {
      this.props.title = props.title;
      didUpdate = true;
    }

    if (props.className !== this.props.className) {
      this.props.className = props.className;
      if (props.className && !this.hoverEvents) {
        // Only if class name.
        this.hoverEvents = true;
        this.addEventListener('pointerenter', this.addHover);
        this.addEventListener('pointerleave', this.removeHover);
      }
      if (props.className && !this.activeEvents) {
        this.activeEvents = true;
        this.addEventListener('mousedown', this.addPress);
        this.addEventListener('mouseup', this.removePress);
      }
      didUpdate = true;
    }

    if (props.relativeSize !== this.props.relativeSize) {
      this.props.relativeSize = props.relativeSize;
      didUpdate = true;
    }
    if (props.relativeStyle !== this.props.relativeStyle) {
      this.props.relativeStyle = props.relativeStyle;
      didUpdate = true;
    }
    if (props.html !== this.props.html) {
      this.props.html = props.html;
      didUpdate = true;
    }

    if (props.target) {
      // Resolve the React-managed position, then re-apply any imperative offsets
      // so they are preserved across React re-renders.
      const targetX = (props.target.x ?? 0) + this._imperativeTranslateX;
      const targetY = (props.target.y ?? 0) + this._imperativeTranslateY;
      const targetW = props.target.width + this._imperativeDeltaWidth;
      const targetH = props.target.height + this._imperativeDeltaHeight;

      if (
        targetW !== this.display.width ||
        targetH !== this.display.height ||
        targetX !== this.points[1] ||
        targetY !== this.points[2]
      ) {
        didUpdate = true;
        this.points = DnaFactory.singleBox(targetW, targetH, targetX, targetY);
        this.display.points = DnaFactory.singleBox(targetW, targetH, targetX, targetY);
        this.display.width = targetW;
        this.display.height = targetH;
      }
    }

    if (didUpdate) {
      // Bump revision.
      this.__revision++;
    }
  }
}
