import { clipPolygonCss, type ViewportHalfPlaneClip } from './geometry';

/** Clip outside a host's transform, preserving the host used by HTMLPortal. */
export class ViewportClipHosts {
  private wrappers = new Map<HTMLElement, HTMLElement>();
  private concealed = new Map<HTMLElement, Map<HTMLElement, boolean>>();
  private restoreFocusability(element: HTMLElement) {
    for (const [node, inert] of this.concealed.get(element) || [])
      (node as HTMLElement & { inert: boolean }).inert = inert;
    this.concealed.delete(element);
  }
  constructor(private container: HTMLElement) {}
  root(element: HTMLElement) {
    return this.wrappers.get(element) || element;
  }
  update(element: HTMLElement, clip?: ViewportHalfPlaneClip) {
    let wrapper = this.wrappers.get(element);
    if (clip && !wrapper) {
      wrapper = element.ownerDocument.createElement('div');
      wrapper.dataset.atlasViewportClip = '';
      Object.assign(wrapper.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
      if (element.parentNode === this.container) this.container.replaceChild(wrapper, element);
      wrapper.appendChild(element);
      this.wrappers.set(element, wrapper);
    }
    if (!wrapper) return;
    wrapper.style.zIndex = element.style.zIndex;
    wrapper.style.clipPath = clip ? clipPolygonCss(clip) : '';
    if (wrapper.parentNode !== this.container) this.container.appendChild(wrapper);
    this.restoreFocusability(element);
    const viewport = this.container.getBoundingClientRect();
    const isConcealed = (node: HTMLElement) => {
      if (!clip) return false;
      const bounds = node.getBoundingClientRect();
      const values = [
        [bounds.left, bounds.top],
        [bounds.right, bounds.top],
        [bounds.left, bounds.bottom],
        [bounds.right, bounds.bottom],
      ].map(([x, y]) => (x - viewport.left) * clip.normal.x + (y - viewport.top) * clip.normal.y - clip.distance);
      return clip.polygon.length < 3 || (clip.side === 'first' ? Math.min(...values) >= 0 : Math.max(...values) < 0);
    };
    const hidden = isConcealed(element);
    (wrapper as HTMLElement & { inert: boolean }).inert = hidden;
    let focusHidden = hidden && element.contains(element.ownerDocument.activeElement);
    if (clip && !hidden) {
      const saved = new Map<HTMLElement, boolean>();
      for (const node of element.querySelectorAll<HTMLElement>(
        'a[href],button,input,select,textarea,[tabindex],[contenteditable]'
      )) {
        if (!isConcealed(node)) continue;
        const target = node as HTMLElement & { inert: boolean };
        saved.set(node, target.inert);
        focusHidden ||= node.contains(element.ownerDocument.activeElement);
        target.inert = true;
      }
      this.concealed.set(element, saved);
    }
    if (focusHidden) {
      (this.container.parentElement?.querySelector('canvas') as HTMLElement | null)?.focus();
      if (element.contains(element.ownerDocument.activeElement))
        (element.ownerDocument.activeElement as HTMLElement)?.blur();
    }
  }
  remove(element: HTMLElement) {
    this.restoreFocusability(element);
    this.root(element).remove();
    this.wrappers.delete(element);
  }
  reset() {
    for (const [element, wrapper] of this.wrappers) {
      this.restoreFocusability(element);
      wrapper.replaceWith(element);
    }
    this.wrappers.clear();
  }
}
