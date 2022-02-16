import { Evented, addEventListener, removeEventListener } from './evented';
import { Revision } from './revision';

export interface HasStylesProps<T extends BoxStyle = BoxStyle> {
  className?: string;
  relativeStyle?: boolean;
  style?: T;
}

export interface HasStyles<S extends _BoxStyle = _BoxStyle> {
  style: {
    className: string | null;
    rules: S | null;
    hoverRules: S | null;
    activeRules: S | null;
    parsed: {
      border: { id: string | null; match: string[] };
      outline: { id: string | null; match: string[] };
    };
    relative: boolean;
    activeEvents: boolean;
    hoverEvents: boolean;
    isHovering: boolean;
    isActive?: boolean;
    handlers: {
      addHover?: () => void;
      removeHover?: () => void;
      addActive?: () => void;
      removeActive?: () => void;
    };
  };
}

export type BoxStyle<T extends _BoxStyle = _BoxStyle> = T & {
  ':hover'?: T;
  ':active'?: T;
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
];

export function hasStyles(obj: unknown): obj is HasStyles {
  return !!(obj && (obj as any).style);
}

export function hasStylesDefaults(): HasStyles {
  return {
    style: {
      className: null,
      rules: null,
      hoverRules: null,
      activeRules: null,
      parsed: {
        border: { id: null, match: [] },
        outline: { id: null, match: [] },
      },
      relative: false,
      activeEvents: false,
      hoverEvents: false,
      isHovering: false,
      isActive: false,
      handlers: {},
    },
  };
}

const borderRegexCache: any = {};

export function stylesDidUpdate(a: _BoxStyle | null, b: _BoxStyle | null) {
  if (!a !== b) {
    if ((!a && b) || (a && !b)) {
      return true;
    } else {
      for (const rule of styleProps) {
        const v1 = a && a[rule];
        const v2 = b && b[rule];
        if (v1 !== v2) {
          return true;
        }
      }
    }
  }
  return false;
}

export function applyHasStylesProps(object: HasStyles & Evented & Revision, props: HasStylesProps): boolean {
  let didUpdate = false;
  let addHoverEvents = false;
  let addActiveEvents = false;

  if (object.style.relative || props.relativeStyle) {
    didUpdate = true;
    object.style.relative = !!props.relativeStyle;
  }
  if (props.style) {
    // pre-process props.
    const borderStyle = props.style.border;
    if (borderStyle !== object.style.parsed.border.id) {
      if (!borderStyle) {
        object.style.parsed.border.id = null;
        object.style.parsed.border.match = [];
      } else {
        const match = borderRegexCache[borderStyle] || /([0-9]+(px|em))+\s+(solid)\s+(.*)/.exec(borderStyle);
        if (match) {
          object.style.parsed.border.id = borderStyle;
          object.style.parsed.border.match = borderRegexCache[borderStyle] = match;
        }
      }
    }
    if (props.style.background && !props.style.backgroundColor) {
      props.style.backgroundColor = props.style.background;
    }
    if (props.style) {
      if (props.style[':hover'] && props.style[':hover'].background && !props.style[':hover'].backgroundColor) {
        props.style[':hover'].backgroundColor = props.style[':hover'].background;
      }
      if (props.style[':active'] && props.style[':active'].background && !props.style[':active'].backgroundColor) {
        props.style[':active'].backgroundColor = props.style[':active'].background;
      }
    }
    if (object.style.parsed.border.id) {
      props.style.borderWidth = object.style.parsed.border.match[1];
      props.style.borderStyle = 'solid'; // only support object.
      props.style.borderColor = object.style.parsed.border.match[4];
    }

    if (props.style.outline !== object.style.parsed.outline.id) {
      if (!props.style.outline) {
        object.style.parsed.outline.id = null;
        object.style.parsed.outline.match = [];
      } else {
        const match =
          borderRegexCache[props.style.outline] || /([0-9]+(px|em))+\s+(solid)\s+(.*)/.exec(props.style.outline);

        if (match) {
          object.style.parsed.outline.id = props.style.outline;
          object.style.parsed.outline.match = borderRegexCache[props.style.outline] = match;
        }
      }
    }

    if (object.style.parsed.outline.id) {
      props.style.outlineWidth = object.style.parsed.outline.match[1];
      props.style.outlineStyle = 'solid'; // only support object.
      props.style.outlineColor = object.style.parsed.outline.match[4];
    }

    // Then we apply the styles.
    const { ':hover': hoverStyles = null, ':active': activeStyles = null, ...otherStyle } = props.style;
    const newRules = Object.keys(otherStyle).length === 0 ? null : otherStyle;

    if (!didUpdate && object.style.rules !== newRules) {
      didUpdate = stylesDidUpdate(object.style.rules, newRules);
    }
    if (!didUpdate && object.style.hoverRules !== hoverStyles) {
      didUpdate = stylesDidUpdate(object.style.hoverRules, hoverStyles);
    }
    if (!didUpdate && object.style.activeRules !== activeStyles) {
      didUpdate = stylesDidUpdate(object.style.activeRules, activeStyles);
    }
    object.style.rules = newRules;

    if ((hoverStyles || object.style.hoverRules) && hoverStyles !== object.style.hoverRules) {
      object.style.hoverRules = hoverStyles || null;
      addHoverEvents = true;
    }
    if ((activeStyles || object.style.activeRules) && activeStyles !== object.style.activeRules) {
      object.style.activeRules = activeStyles || null;
      addActiveEvents = true;
    }
  }

  if ((props.className || object.style.className) && props.className !== object.style.className) {
    object.style.className = props.className || null;
    if (props.className && !object.style.hoverEvents) {
      // Only if class name.
      addHoverEvents = true;
    }
    if (props.className && !object.style.activeEvents) {
      addActiveEvents = true;
    }
    didUpdate = true;
  }

  if (addHoverEvents) {
    if (!object.style.hoverEvents) {
      object.style.handlers.addHover =
        object.style.handlers.addHover ||
        function addHover() {
          object.style.isHovering = true;
          object.revision.id++;
        };
      object.style.handlers.removeHover =
        object.style.handlers.removeHover ||
        function removeHover() {
          object.style.isHovering = false;
          object.style.isActive = false;
          object.revision.id++;
        };

      object.style.hoverEvents = true;
      addEventListener(object, 'pointerenter', object.style.handlers.addHover);
      addEventListener(object, 'pointerleave', object.style.handlers.removeHover);
      didUpdate = true;
    }
  }

  if (addActiveEvents) {
    if (!object.style.activeEvents) {
      object.style.handlers.addActive =
        object.style.handlers.addActive ||
        function addActive() {
          object.style.isActive = true;
          object.revision.id++;
        };
      object.style.handlers.removeActive =
        object.style.handlers.removeActive ||
        function removeActive() {
          object.style.isActive = false;
          object.revision.id++;
        };

      object.style.activeEvents = true;
      addEventListener(object, 'mousedown', object.style.handlers.addActive);
      addEventListener(object, 'mouseup', object.style.handlers.removeActive);
      didUpdate = true;
    }
  }

  return didUpdate;
}
