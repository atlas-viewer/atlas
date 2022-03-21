import { createElement } from '../helpers/dom';
import { HasElement, HasElementMap } from './types';

export interface DOMContainerHost extends HasElement<HTMLDivElement> {
  type: 'dom-host';
}
export interface DOMImageHost extends HasElement<HTMLImageElement> {
  type: 'dom-image-host';
}

export interface DOMImageListHost extends HasElementMap<HTMLImageElement> {
  type: 'dom-composite-image-host';
  container: HTMLElement;
}

export type DOMHost = DOMContainerHost | DOMImageHost | DOMImageListHost;

export function createDOMHost(type: 'dom-host'): DOMContainerHost;
export function createDOMHost(type: 'dom-image-host'): DOMImageHost;
export function createDOMHost(type: 'dom-composite-image-host'): DOMImageListHost;
export function createDOMHost<T extends DOMHost>(type: T['type']): T {
  if (type === 'dom-host' || type === 'dom-image-host') {
    const base: Partial<DOMImageHost | DOMContainerHost> = {
      type,
      loading: false,
    };
    base.element = createElement(type === 'dom-host' ? 'div' : 'img') as any;
    return base as T;
  }

  return {
    type: 'dom-composite-image-host',
    container: createElement('div'),
    elements: {},
    loadingMap: {},
    abortMap: {},
    errorMap: {},
    columns: 0,
  } as DOMImageListHost as T;
}
