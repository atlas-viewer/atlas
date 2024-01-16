import { GenericObject } from '../traits/generic-object';
import { DOMHost } from './dom';
import { CompositeWebGLHost, WebGLHost } from './webgl';
import { SingleCanvasHost, CompositeCanvasHost } from './canvas';

export interface Hosts {
  hosts: {
    dom: DOMHost;
    canvas: SingleCanvasHost | CompositeCanvasHost;
    webgl: WebGLHost | CompositeWebGLHost;
  };
  hostCreators: {
    dom: (obj: GenericObject) => DOMHost;
    canvas: (obj: GenericObject) => SingleCanvasHost | CompositeCanvasHost;
    webgl: (obj: GenericObject) => WebGLHost | CompositeWebGLHost;
  };
}

export type CreateHosts<Obj extends GenericObject> = {
  [Host in keyof Hosts['hosts']]?: (object: Obj) => Required<Hosts['hosts'][Host]>;
};

export type SupportedHost<Host extends keyof Hosts['hosts']> = {
  hostCreators: { [key in Host]-?: Hosts['hostCreators'][key] };
  hosts: Partial<{ [key in Host]-?: Hosts['hosts'][key] }>;
};

export function supportsHost<Host extends keyof Hosts['hosts']>(
  object: unknown,
  host: Host
): object is SupportedHost<Host> {
  return object && (object as any).hostCreators && (object as any).hostCreators[host];
}
