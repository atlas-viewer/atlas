declare module 'react-reconciler';

// eslint-disable-next-line @typescript-eslint/no-namespace
declare namespace JSX {
  interface IntrinsicElements {
    world: {
      key?: string | number;
      children?: React.ReactNode;
      width?: number;
      height?: number;
      onClick?: (e: any) => void;
    };
    worldObject: {
      ref?: any;
      key?: string | number;
      children?: React.ReactNode;
      height: number;
      scale?: number;
      width: number;
      id: string;
      x?: number;
      y?: number;
      onClick?: (e: any) => void;
      onMouseMove?: (e: any) => void;
      onMouseLeave?: (e: any) => void;
    };
    worldImage: { key?: string | number; uri: string; target: any; display: any; onClick?: (e: any) => void };
    compositeImage: { key?: string | number; id: string; width: number; height: number; children?: React.ReactNode };
    tiledImage: {
      key?: string | number;
      uri: string;
      display: { width: number; height: number };
      tile: { width: number; height?: number };
      scaleFactor: number;
      onClick?: (e: any) => void;
    };
    paragraph: {
      key?: string | number;
      id: string;
      color?: string;
      backgroundColor?: string;
      target?: { x: number; y: number; width: number; height: number };
      children?: string;
      paddingX?: number;
      paddingY?: number;
      fontSize?: number;
      fontFamily?: string;
      onClick?: (e: any) => void;
    };
  }
}
