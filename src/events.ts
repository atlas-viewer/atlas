export const supportedEvents = [
  'onMouseDown',
  'onMouseEnter',
  'onMouseLeave',
  'onMouseMove',
  'onMouseOut',
  'onMouseOver',
  'onMouseUp',
  'onTouchCancel',
  'onTouchEnd',
  'onTouchMove',
  'onTouchStart',
  'onPointerDown',
  'onPointerMove',
  'onPointerUp',
  'onPointerCancel',
  'onPointerEnter',
  'onPointerLeave',
  'onPointerOver',
  'onPointerOut',
  'onScroll',
  'onWheel',
  'onClick',
  // Drag.
  'onDragStart',
  'onDragEnd',
  'onDragEnter',
  'onDragExit',
  'onDrag',
  'onDragOver',
];

export function createDefaultEventMap(): SupportedEventMap {
  return supportedEvents.reduce((acc, next) => {
    acc[next] = [];
    return acc;
  }, {} as SupportedEventMap);
}

export const supportedEventMap = supportedEvents.reduce((acc, ev) => {
  acc[ev.slice(2).toLowerCase()] = ev;
  return acc;
}, {} as { [ev: string]: string });

export type SupportedEvents = {
  onMouseDown(e: any): void;
  onMouseEnter(e: any): void;
  onMouseLeave(e: any): void;
  onMouseMove(e: any): void;
  onMouseOut(e: any): void;
  onMouseOver(e: any): void;
  onMouseUp(e: any): void;
  onTouchCancel(e: any): void;
  onTouchEnd(e: any): void;
  onTouchMove(e: any): void;
  onTouchStart(e: any): void;
  onPointerDown(e: any): void;
  onPointerMove(e: any): void;
  onPointerUp(e: any): void;
  onPointerCancel(e: any): void;
  onPointerEnter(e: any): void;
  onPointerLeave(e: any): void;
  onPointerOver(e: any): void;
  onPointerOut(e: any): void;
  onScroll(e: any): void;
  onWheel(e: any): void;
  onClick(e: any): void;
  onDragStart(e: any): void;
  onDragEnd(e: any): void;
  onDragEnter(e: any): void;
  onDragExit(e: any): void;
  onDrag(e: any): void;
  onDragOver(e: any): void;
};

export type SupportedEventMap = {
  [Name in keyof SupportedEvents]: Array<SupportedEvents[Name]>;
};
