import { HasElement, HasElementMap } from './types';

export interface WebGLHost extends HasElement<WebGLTexture> {
  type: 'webgl-host';
  height: number;
  width: number;
  onLoad: (image: TexImageSource) => void;
  lastImage?: string;
  error?: Error;
}

export interface CompositeWebGLHost extends HasElementMap<WebGLTexture> {
  type: 'composite-webgl-host';
  height: number;
  width: number;
  onLoad: (image: TexImageSource, index: number) => void;
  lastImage?: string;
  error?: Error;
}
