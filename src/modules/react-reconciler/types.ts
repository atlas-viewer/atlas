import React from 'react';
import { UpdateTextureFunction } from '../../spacial-content/image-texture';
import { BoxStyle } from '../../objects/box';
import { EventListenerProps } from '../../clean-objects/traits/evented';

type BaseElement = {
  id?: string;
  ref?: any;
  key?: string | number;
  priority?: boolean;
};

export type AllEvents = EventListenerProps;

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
      ['world-object']: BaseElement & {
        children?: React.ReactNode;
        height: number;
        scale?: number;
        width: number;
        x?: number;
        y?: number;
        rotation?: number;
      } & AllEvents;
      worldImage: BaseElement & {
        uri: string;
        target: any;
        display: any;
      } & AllEvents;
      ['world-image']: BaseElement & {
        uri: string;
        target: any;
        display: any;
      } & AllEvents;
      texture: BaseElement & {
        getTexture: UpdateTextureFunction;
        target: any;
        display: any;
      } & AllEvents;
      compositeImage: BaseElement & {
        id?: string;
        width: number;
        height: number;
        children?: React.ReactNode;
      };
      ['composite-image']: BaseElement & {
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
      ['tiled-image']: BaseElement & {
        uri: string;
        display: { width: number; height: number };
        tile: { width: number; height?: number };
        scaleFactor: number;
      } & AllEvents;
      box: BaseElement & {
        interactive?: boolean;
        backgroundColor?: string;
        className?: string;
        border?: string;
        target?: { x?: number; y?: number; width: number; height: number };
        style?: BoxStyle;
        relativeSize?: boolean;
        relativeStyle?: boolean;
        html?: boolean;
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
