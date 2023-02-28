import { Strand } from '@atlas-viewer/dna';
import { Runtime } from './renderer/runtime';

export type RuntimeController = {
  start(runtime: Runtime): () => void;
  updatePosition(x: number, y: number, width: number, height: number): void;
};
export interface Position {
  x: number;
  y: number;
}
export interface PositionPair {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
export interface SpacialSize {
  width: number;
  height: number;
}
export interface Scaled {
  scale: number;
}
export interface Projection extends Position, SpacialSize {}
export interface Viewer extends Projection, Scaled {}
export interface DisplayData extends SpacialSize, Position, Scaled {
  points: Strand;
  rotation?: number;
}
export interface WorldTime {
  start: number;
  end: number;
}
export type ViewingDirection = 'left-to-right' | 'right-to-left' | 'top-to-bottom' | 'bottom-to-top';

/** @internal */
export type PointerEvents = {
  onClick(e: any): void;
  onWheel(e: any): void;
  onPointerDown(e: any): void;
  onPointerUp(e: any): void;
  onMouseLeave(e: any): void;
  onMouseMove(e: any): void;

  // @todo move out of pointer events.
  onTouchCancel(e: any): void;
  onTouchEnd(e: any): void;
  onTouchMove(e: any): void;
  onTouchStart(e: any): void;
};

export interface TextWrapperOptions {
  /**
   *  Text style that includes font size (in px), font weight, font family, etc.
   */
  font?: string;
  /**
   * Number - 'n' times font size where 1 is equivalent to '100%'. Also the property can be set in '%' or 'px'.
   */
  lineHeight?: string | number;
  /**
   * Horizontal alignment of each line.
   */
  textAlign?: 'left' | 'center' | 'right';
  /**
   * Vertical alignment of the whole text block.
   */
  verticalAlign?: 'top' | 'middle' | 'bottom';
  /**
   * Horizontal padding (in px) that is equally set on left and right sides.
   */
  paddingX?: number;
  /**
   * Vertical padding (in px) that is equally set on top and bottoms.
   */
  paddingY?: number;
  /**
   * Fit canvas' container size instead of its own size.
   */
  fitParent?: boolean;
  /**
   * "auto" - text goes to the next line on a whole word when there's no room
   * "word" - each next word is placed on a new line
   */
  lineBreak?: 'auto' | 'word';
  /**
   * Ignore given font size and line height and resize text to fill its padded container.
   */
  sizeToFill?: boolean;
  /**
   * If above option is true text won't be bigger than set.
   */
  maxFontSizeToFill?: number;
  /**
   * Allow text outline based on canvas context configuration.
   */
  strokeText?: boolean;
  /**
   * All lines will try to match the same width with flexed spaces between the words.
   */
  justifyLines?: boolean;
  /**
   * Text breaks on a new line character "\n". Supports multiple consecutive new lines.
   */
  allowNewLine?: boolean;
  /**
   * Text is rendered based on device pixel ratio.
   */
  renderHDPI?: boolean;
  /**
   * Text is underlined according to context.strokeStyle and context.lineWidth
   */
  textDecoration?: 'none' | 'underline';
}
