import { BaseObject } from './base-object';
import { dna, DnaFactory, Strand } from '@atlas-viewer/dna';
import { SpacialContent } from '../spacial-content/spacial-content';
import { Paint } from '../world-objects/paint';
import { nanoid } from 'nanoid';

const borderRegex = /([0-9]+(px|em)\s+)+(solid)\s+(.*)/g;
const borderRegexCache: any = {};

export type GeometryProps = {
  id: string;
  target: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  points: [number, number][];

  className?: string;
  href?: string;
  title?: string;
  hrefTarget?: string;
  interactive?: boolean;
  relativeSize?: boolean;
  relativeStyle?: boolean;
  html?: boolean;
  // New style.
  style?: GeometryStyle;
  // Deprecated
  backgroundColor?: string;
  border?: string;
};

export type GeometryStyle = _GeometryStyle & {
  ':hover'?: _GeometryStyle;
  ':active'?: _GeometryStyle;
};

type _GeometryStyle = Partial<{
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

const styleProps: Array<keyof GeometryStyle> = [
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
];

// const mapping = [
//     // Common
//     ['opacity', 'globalAlpha'],
//     ['transform', ['translate', 'scale', 'rotate']],
//
//     // Fill rect
//     [
//       'backgroundColor',
//       ['fillStyle', 'createLinearGradient', 'createRadialGradient', 'createConicGradient', 'createPattern'],
//     ],
//     ['boxShadow', ['shadowOffsetX', 'shadowOffsetY', 'shadowBlur', 'shadowColor']],
//
//     // Stroke rect
//     ['outline', 'same-as-below'],
//     [
//       'borderColor',
//       ['strokeStyle', 'createLinearGradient', 'createRadialGradient', 'createConicGradient', 'createPattern'],
//     ],
//     ['borderWidth', 'strokeWidth'],
//     ['borderStyle', ['setLineDash', 'lineDashOffset']],
//   ];

export class Geometry extends BaseObject<GeometryProps> implements SpacialContent {
  id: string;
  type: 'spacial-content' = 'spacial-content';
  isShape = true;
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

  boundingBox: { x: number; y: number; width: number; height: number } | null = null;

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
    style?: GeometryStyle;
    hoverStyles?: GeometryStyle;
    pressStyles?: GeometryStyle;
  } = {};

  shape: { type: 'none' } | { type: 'polygon'; points: [number, number][] } = { type: 'none' };

  constructor() {
    super();
    this.id = nanoid(12);
    this.points = dna(5);
    this.shape = { type: 'none' };
  }

  updateBoundingBox() {
    if (this.shape.type === 'none') return;
    const points = this.shape.points;
    if (this.shape.points.length > 2) {
      const x1 = Math.min(...points.map((p) => p[0]));
      const y1 = Math.min(...points.map((p) => p[1]));
      const x2 = Math.max(0, ...points.map((p) => p[0]));
      const y2 = Math.max(0, ...points.map((p) => p[1]));
      this.boundingBox = {
        x: x1,
        y: y1,
        width: x2 - x1,
        height: y2 - y1,
      };

      return;
    }
    this.boundingBox = null;
  }

  intersects(pointer?: [number, number] | null): boolean {
    if (!pointer || this.shape.type === 'none') {
      return false;
    }
    // Does the point intersect with the shape?
    const [x, y] = pointer;
    const points = this.shape.points;
    let box = this.boundingBox;

    // @todo only enable when all points are NOT selected.

    if (!box) {
      this.updateBoundingBox();
      box = this.boundingBox;
    }
    if (!box) {
      return false;
    }

    // Outside the bounding box.
    if (x < box.x || x > box.x + box.width || y < box.y || y > box.height + box.y) {
      return false;
    }

    // Outside the polygon.
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      if (
        points[i][1] > y != points[j][1] > y &&
        x < ((points[j][0] - points[i][0]) * (y - points[i][1])) / (points[j][1] - points[i][1]) + points[i][0]
      ) {
        inside = !inside;
      }
    }

    return inside;
  }

  getAllPointsAt(target: Strand, aggregate: Strand): Paint[] {
    if (target[3] - target[1] === 1 && target[4] - target[2] === 1) {
      // Clicked on a single point.
      if (this.intersects([target[1], target[2]])) {
        return [[this as any, this.points, aggregate]];
      }
      return [];
    }

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

  applyProps(props: Partial<GeometryProps> = {}) {
    let didUpdate = false;

    if (props.points) {
      if (this.shape.type !== 'polygon' || this.shape.points.length !== props.points.length) {
        this.shape = {
          type: 'polygon',
          points: props.points,
        };
        this.updateBoundingBox();
      } else {
        let newPoints = false;
        const len = props.points.length;
        for (let i = 0; i < len; i++) {
          if (props.points[i][0] !== this.shape.points[i][0] || props.points[i][1] !== this.shape.points[i][1]) {
            newPoints = true;
            break;
          }
        }
        if (newPoints) {
          this.shape = {
            type: 'polygon',
            points: props.points,
          };
          this.updateBoundingBox();
        }
      }
    }

    if (props.interactive !== this.props.interactive) {
      didUpdate = true;
      this.props.interactive = props.interactive;
    }

    if (props.style) {
      // pre-process props.
      const borderStyle = props.border || props.style.border;
      if (borderStyle !== this._parsed.border.id) {
        if (!borderStyle) {
          this._parsed.border.id = null;
          this._parsed.border.match = [];
        } else {
          const match = borderRegexCache[borderStyle] || borderRegex.exec(borderStyle) || borderRegex.exec(borderStyle);
          if (match) {
            this._parsed.border.id = borderStyle;
            this._parsed.border.match = borderRegexCache[borderStyle] = match;
          }
        }
      }
      if (this._parsed.border.id) {
        props.style.borderWidth = this._parsed.border.match[1];
        props.style.borderStyle = 'solid'; // only support this.
        props.style.borderColor = this._parsed.border.match[4];
      }

      if (props.style.outline !== this._parsed.outline.id) {
        if (!props.style.outline) {
          this._parsed.outline.id = null;
          this._parsed.outline.match = [];
        } else {
          const match =
            borderRegexCache[props.style.outline] ||
            borderRegex.exec(props.style.outline) ||
            borderRegex.exec(props.style.outline);

          if (match) {
            this._parsed.outline.id = props.style.outline;
            this._parsed.outline.match = borderRegexCache[props.style.outline] = match;
          }
        }
      }
      if (this._parsed.outline.id) {
        props.style.outlineWidth = this._parsed.outline.match[1];
        props.style.outlineStyle = 'solid'; // only support this.
        props.style.outlineColor = this._parsed.outline.match[4];
      }

      this.props.style = props.style;
      // BC fix.
      if (props.backgroundColor && !this.props.style.backgroundColor) {
        this.props.style.backgroundColor = props.backgroundColor;
        didUpdate = true;
      }
      if (props.style.background && !this.props.style.backgroundColor) {
        this.props.style.backgroundColor = props.style.background;
        didUpdate = true;
      }

      for (const prop of styleProps) {
        if (this.props.style[prop] !== props.style[prop]) {
          didUpdate = true;
          break;
        }
      }

      if (props.style[':hover'] !== this.props.hoverStyles) {
        this.props.hoverStyles = props.style[':hover'];
        if (!this.hoverEvents) {
          this.hoverEvents = true;
          this.addEventListener('pointerenter', this.addHover);
          this.addEventListener('pointerleave', this.removeHover);
        }
        didUpdate = true;
      }
      if (props.style[':active'] !== this.props.pressStyles) {
        this.props.pressStyles = props.style[':active'];
        if (!this.activeEvents) {
          this.activeEvents = true;
          this.addEventListener('mousedown', this.addPress);
          this.addEventListener('mouseup', this.removePress);
        }
        didUpdate = true;
      }
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
      if (
        props.target.width !== this.display.width ||
        props.target.height !== this.display.height ||
        props.target.x !== this.points[1] ||
        props.target.y !== this.points[2]
      ) {
        didUpdate = true;
        this.points = DnaFactory.singleBox(props.target.width, props.target.height, props.target.x, props.target.y);
        this.display.points = DnaFactory.singleBox(
          props.target.width,
          props.target.height,
          props.target.x,
          props.target.y
        );
        this.display.width = props.target.width;
        this.display.height = props.target.height;
      }
    }

    if (didUpdate) {
      // Bump revision.
      this.__revision++;
    }
  }
}
