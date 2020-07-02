import React from 'react';

type BaseElement = {
  id?: string;
  ref?: any;
  key?: string | number;
};

type AllEvents = {
  // Mouse Events
  onMouseDown?: React.MouseEventHandler;
  onMouseEnter?: React.MouseEventHandler;
  onMouseLeave?: React.MouseEventHandler;
  onMouseMove?: React.MouseEventHandler;
  onMouseOut?: React.MouseEventHandler;
  onMouseOver?: React.MouseEventHandler;
  onMouseUp?: React.MouseEventHandler;

  // Touch Events
  onTouchCancel?: React.TouchEventHandler;
  onTouchEnd?: React.TouchEventHandler;
  onTouchMove?: React.TouchEventHandler;
  onTouchStart?: React.TouchEventHandler;

  // Pointer Events
  onPointerDown?: React.PointerEventHandler;
  onPointerMove?: React.PointerEventHandler;
  onPointerUp?: React.PointerEventHandler;
  onPointerCancel?: React.PointerEventHandler;
  onPointerEnter?: React.PointerEventHandler;
  onPointerLeave?: React.PointerEventHandler;
  onPointerOver?: React.PointerEventHandler;
  onPointerOut?: React.PointerEventHandler;

  // Drag events
  onDragStart?: React.DragEventHandler;
  onDragEnd?: React.DragEventHandler;
  onDragEnter?: React.DragEventHandler;
  onDragExit?: React.DragEventHandler;
  onDrag?: React.DragEventHandler;
  onDragOver?: React.DragEventHandler;

  // UI Events
  onScroll?: React.UIEventHandler;

  // Wheel Events
  onWheel?: React.WheelEventHandler;

  // Other
  onClick?: React.MouseEventHandler;
};

// eslint-disable-next-line @typescript-eslint/no-namespace
declare global {
  declare namespace JSX {
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
      };
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
