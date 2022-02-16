import { GenericObject } from './generic-object';

export interface Hosts {
  hosts: {
    html?: HTMLContainerHost;
    image?: DOMImageHost;
    images?: DOMImageListHost;
    canvas?: CanvasHost;
    webgl?: WebGLImageHost;
  };
  readonly hostCreators?: {
    readonly html?: (obj: GenericObject) => HTMLContainerHost;
    readonly image?: (obj: GenericObject) => DOMImageHost;
    readonly images?: (obj: GenericObject) => DOMImageListHost;
    readonly canvas?: (obj: GenericObject) => CanvasHost;
    readonly webgl?: (obj: GenericObject) => WebGLImageHost;
  };
}

export interface HTMLContainerHost {
  element: HTMLElement;
  revision: number;
  relative: boolean;
}

export interface DOMImageHost {
  element: HTMLImageElement;
}

export interface DOMImageListHost {
  elements: Array<{ image: HTMLImageElement }>;
}

export interface CanvasHost {
  canvas: HTMLCanvasElement;
  indices: number[];
  loaded: number[];
  loading: boolean;
}

export interface WebGLImageHost {
  height: number;
  width: number;
  textures: WebGLTexture[];
  loading: number[];
  loaded: number[];
  lastLevelRendered: number;
  onLoad: (index: number, image: TexImageSource) => void;
  lastImage?: string;
  error?: Error;
}

export type CreateHosts<Obj extends GenericObject> = {
  [Host in keyof Hosts['hosts']]?: (object: Obj) => Required<Hosts['hosts'][Host]>;
};

export type SupportedHost<Host extends keyof Hosts['hosts']> = {
  hostCreators: { [key in Host]-?: Hosts['hosts'] };
  hosts: { [key in Host]-?: Hosts['hosts'] };
};

export function supportsHost<Host extends keyof Hosts['hosts']>(
  object: unknown,
  host: Host
): object is SupportedHost<Host> {
  return object && (object as any).hostCreators && (object as any).hostCreators[host];
}
