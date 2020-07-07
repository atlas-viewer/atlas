import React, { EventHandler, MouseEvent, TouchEvent, PointerEvent, DragEvent, UIEvent, WheelEvent } from 'react';

type BaseElement = {
  id?: string;
  ref?: any;
  key?: string | number;
};

export type AllEvents = {
  // Mouse Events
  onMouseDown?: EventHandler<MouseEvent & { atlas: { x: number; y: number } }>;
  onMouseEnter?: EventHandler<MouseEvent & { atlas: { x: number; y: number } }>;
  onMouseLeave?: EventHandler<MouseEvent & { atlas: { x: number; y: number } }>;
  onMouseMove?: EventHandler<MouseEvent & { atlas: { x: number; y: number } }>;
  onMouseOut?: EventHandler<MouseEvent & { atlas: { x: number; y: number } }>;
  onMouseOver?: EventHandler<MouseEvent & { atlas: { x: number; y: number } }>;
  onMouseUp?: EventHandler<MouseEvent & { atlas: { x: number; y: number } }>;

  // Touch Events
  onTouchCancel?: EventHandler<TouchEvent & { atlas: { x: number; y: number } }>;
  onTouchEnd?: EventHandler<TouchEvent & { atlas: { x: number; y: number } }>;
  onTouchMove?: EventHandler<TouchEvent & { atlas: { x: number; y: number } }>;
  onTouchStart?: EventHandler<TouchEvent & { atlas: { x: number; y: number } }>;

  // Pointer Events
  onPointerDown?: EventHandler<PointerEvent & { atlas: { x: number; y: number } }>;
  onPointerMove?: EventHandler<PointerEvent & { atlas: { x: number; y: number } }>;
  onPointerUp?: EventHandler<PointerEvent & { atlas: { x: number; y: number } }>;
  onPointerCancel?: EventHandler<PointerEvent & { atlas: { x: number; y: number } }>;
  onPointerEnter?: EventHandler<PointerEvent & { atlas: { x: number; y: number } }>;
  onPointerLeave?: EventHandler<PointerEvent & { atlas: { x: number; y: number } }>;
  onPointerOver?: EventHandler<PointerEvent & { atlas: { x: number; y: number } }>;
  onPointerOut?: EventHandler<PointerEvent & { atlas: { x: number; y: number } }>;

  // Drag events
  onDragStart?: EventHandler<DragEvent & { atlas: { x: number; y: number } }>;
  onDragEnd?: EventHandler<DragEvent & { atlas: { x: number; y: number } }>;
  onDragEnter?: EventHandler<DragEvent & { atlas: { x: number; y: number } }>;
  onDragExit?: EventHandler<DragEvent & { atlas: { x: number; y: number } }>;
  onDrag?: EventHandler<DragEvent & { atlas: { x: number; y: number } }>;
  onDragOver?: EventHandler<DragEvent & { atlas: { x: number; y: number } }>;

  // UI Events
  onScroll?: EventHandler<UIEvent & { atlas: { x: number; y: number } }>;

  // Wheel Events
  onWheel?: EventHandler<WheelEvent & { atlas: { x: number; y: number } }>;

  // Other
  onClick?: EventHandler<MouseEvent & { atlas: { x: number; y: number } }>;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      world: BaseElement & {
        width?: number;
        height?: number;
        children?: React.ReactNode;
      } & AllEvents;
      worldObject: BaseElement & {
        children?: React.ReactNode;
        height: number;
        scale?: number;
        width: number;
        x?: number;
        y?: number;
      } & AllEvents;
      worldImage: BaseElement & {
        uri: string;
        target: any;
        display: any;
      } & AllEvents;
      compositeImage: BaseElement & {
        id?: string;
        width: number;
        height: number;
        children?: React.ReactNode;
      } & AllEvents;
      tiledImage: BaseElement & {
        uri: string;
        display: { width: number; height: number };
        tile: { width: number; height?: number };
        scaleFactor: number;
      } & AllEvents;
      box: BaseElement & {
        interactive?: boolean;
        backgroundColor?: string;
        border?: string;
        target?: { x: number; y: number; width: number; height: number };
      } & AllEvents;
      paragraph: BaseElement & {
        interactive?: boolean;
        id?: string;
        color?: string;
        textAlign?: string;
        lineHeight?: number;
        backgroundColor?: string;
        target?: { x: number; y: number; width: number; height: number };
        children?: string;
        paddingX?: number;
        paddingY?: number;
        fontSize?: number;
        fontFamily?: string;
      } & AllEvents;
    }
  }
}
