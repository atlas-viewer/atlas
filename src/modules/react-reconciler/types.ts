import type React from 'react';
import type { EventListenerProps } from '../../clean-objects/traits/evented';
import type { BoxStyle } from '../../objects/box';
import type { GeometryProps } from '../../objects/geometry';
import type { CompositeResourceProps } from '../../spacial-content/composite-resource';
import type { UpdateTextureFunction } from '../../spacial-content/image-texture';
import type { MapBounds, MapTileSource } from '../maps/types';

type BaseElement = {
  id?: string;
  ref?: any;
  key?: string | number;
  priority?: boolean;
};

export type AllEvents = EventListenerProps;
type ZoneVisibilityProps = {
  onZoneVisible?: () => void;
  onZoneHidden?: () => void;
  onZoneVisibilityChange?: (visible: boolean) => void;
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
      ['world-object']: BaseElement & {
        children?: React.ReactNode;
        height: number;
        scale?: number;
        width: number;
        x?: number;
        y?: number;
        rotation?: number;
      } & AllEvents;
      zone: BaseElement & {
        id: string;
        x: number;
        y: number;
        width: number;
        height: number;
        margin?: number;
        children?: React.ReactNode;
      } & ZoneVisibilityProps;
      worldImage: BaseElement & {
        uri: string;
        target: any;
        display: any;
      } & AllEvents;
      ['world-image']: BaseElement & {
        uri: string;
        target: any;
        display: any;
        crop?: any;
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
      shape: BaseElement & GeometryProps;
      ['composite-image']: BaseElement & {
        id?: string;
        width: number;
        height: number;
        children?: React.ReactNode;
        crop?: any;
        renderOptions?: CompositeResourceProps;
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
        crop: any;
        version3?: boolean;
      } & AllEvents;
      mapTiledImage: BaseElement & {
        bounds: MapBounds;
        worldWidth: number;
        worldHeight: number;
        zoom: number;
        tileSize?: number;
        scaleFactor?: number;
        tileSource?: MapTileSource;
        tileUrlTemplate?: string;
        subdomains?: string[];
      } & AllEvents;
      ['map-tiled-image']: BaseElement & {
        bounds: MapBounds;
        worldWidth: number;
        worldHeight: number;
        zoom: number;
        tileSize?: number;
        scaleFactor?: number;
        tileSource?: MapTileSource;
        tileUrlTemplate?: string;
        subdomains?: string[];
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
