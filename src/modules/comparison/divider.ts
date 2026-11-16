import type { ComparisonController, ComparisonDetail } from './comparison';
import { comparisonLineEndpoints, resolveComparisonLine, type ComparisonSplit } from './geometry';

export type ComparisonDividerOptions = {
  container: HTMLElement;
  label: string;
  /** Supply your own handle; its original attributes/styles are restored on cleanup. */
  element?: HTMLElement;
};

export function createComparisonDivider(comparison: ComparisonController, options: ComparisonDividerOptions) {
  const { container } = options;
  const element = options.element || container.ownerDocument.createElement('div');
  const ownedAttributes = [
    'style',
    'class',
    'role',
    'tabindex',
    'hidden',
    'aria-label',
    'aria-valuemin',
    'aria-valuemax',
    'aria-valuenow',
    'aria-valuetext',
  ];
  const original = new Map(ownedAttributes.map((name) => [name, element.getAttribute(name)]));
  element.classList.add('atlas-comparison-divider');
  element.setAttribute('role', 'slider');
  element.setAttribute('aria-label', options.label);
  element.setAttribute('aria-valuemin', '0');
  element.setAttribute('aria-valuemax', '100');
  element.tabIndex = 0;
  Object.assign(element.style, {
    position: 'absolute',
    transformOrigin: '0 50%',
    height: 'var(--atlas-divider-hit-width, 24px)',
    touchAction: 'none',
    pointerEvents: 'auto',
    cursor: 'move',
    zIndex: '1000',
  });
  const line = container.ownerDocument.createElement('span');
  line.className = 'atlas-comparison-divider-line';
  Object.assign(line.style, {
    position: 'absolute',
    top: '50%',
    left: '0',
    width: '100%',
    height: 'var(--atlas-divider-line-width, 2px)',
    background: 'var(--atlas-divider-color, white)',
    pointerEvents: 'none',
  });
  const grip = container.ownerDocument.createElement('span');
  grip.className = 'atlas-comparison-divider-grip';
  Object.assign(grip.style, {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: '16px',
    height: '16px',
    transform: 'translate(-50%,-50%)',
    background: 'var(--atlas-divider-color, white)',
    border: '1px solid #555',
    borderRadius: '50%',
    pointerEvents: 'none',
  });
  element.append(line, grip);
  if (!options.element) container.appendChild(element);
  let drag: { pointerId: number; split: ComparisonSplit; offset: number } | undefined;
  let destroyed = false;
  const bounds = () => container.getBoundingClientRect();
  const emit = (name: string, detail: unknown) =>
    element.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
  const positionAt = (event: PointerEvent) => {
    const rect = bounds();
    const { normal, lo, hi } = resolveComparisonLine(
      comparison.getState().split,
      Math.max(1, rect.width),
      Math.max(1, rect.height)
    );
    // Keep the projection unbounded until the grab offset is applied, so edge grabs can reach 0 and 1.
    return ((event.clientX - rect.left) * normal.x + (event.clientY - rect.top) * normal.y - lo) / (hi - lo);
  };
  const input = (split: ComparisonSplit, detail: ComparisonDetail) => {
    comparison.setSplit(split, detail);
    emit('comparisoninput', { split, ...detail });
  };
  const finish = (cancel: boolean) => {
    if (!drag) return;
    const current = drag;
    drag = undefined;
    if (element.hasPointerCapture?.(current.pointerId)) element.releasePointerCapture(current.pointerId);
    if (cancel) input(current.split, { source: 'pointer' });
    else {
      comparison.commit({ source: 'pointer' });
      emit('comparisoncommit', { split: comparison.getState().split, source: 'pointer' });
    }
  };
  const update = () => {
    const state = comparison.getState(),
      rect = bounds();
    if (!state.enabled) finish(true);
    element.hidden = !state.enabled || !comparison.getRuntime() || rect.width <= 0 || rect.height <= 0;
    if (element.hidden) return;
    const points = comparisonLineEndpoints(state.split, rect.width, rect.height);
    if (points.length < 2) return;
    const [a, b] = points;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    element.style.left = `${a.x}px`;
    element.style.top = `${a.y}px`;
    element.style.width = `${Math.max(length, 1)}px`;
    element.style.transform = `translateY(-50%) rotate(${Math.atan2(b.y - a.y, b.x - a.x)}rad)`;
    element.setAttribute('aria-valuenow', `${Math.round(state.split.position * 100)}`);
    element.setAttribute('aria-valuetext', `${Math.round(state.split.position * 100)}%, ${state.split.angle} degrees`);
  };
  const down = (event: PointerEvent) => {
    if (event.button !== 0 || drag || !comparison.getState().enabled) return;
    event.preventDefault();
    event.stopPropagation();
    element.focus();
    const split = comparison.getState().split;
    drag = { pointerId: event.pointerId, split, offset: split.position - positionAt(event) };
    element.setPointerCapture?.(event.pointerId);
  };
  const move = (event: PointerEvent) => {
    if (event.pointerId !== drag?.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    input(
      { ...comparison.getState().split, position: Math.max(0, Math.min(1, positionAt(event) + drag!.offset)) },
      { source: 'pointer' }
    );
  };
  const up = (event: PointerEvent) => {
    if (event.pointerId === drag?.pointerId) {
      // A quick release can arrive without a final pointermove at these coordinates.
      move(event);
      finish(false);
    }
  };
  const cancel = (event: PointerEvent) => {
    if (event.pointerId === drag?.pointerId) finish(true);
  };
  const blur = () => finish(true);
  const keydown = (event: KeyboardEvent) => {
    if (!comparison.getState().enabled) return;
    const split = comparison.getState().split;
    let position = split.position;
    if (event.key === 'Home') position = 0;
    else if (event.key === 'End') position = 1;
    else if (['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp'].includes(event.key))
      position += (event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : -1) * (event.shiftKey ? 0.1 : 0.01);
    else return;
    event.preventDefault();
    event.stopPropagation();
    input({ ...split, position: Math.max(0, Math.min(1, position)) }, { source: 'keyboard' });
    comparison.commit({ source: 'keyboard' });
    emit('comparisoncommit', { split: comparison.getState().split, source: 'keyboard' });
  };
  const stop = (event: Event) => event.stopPropagation();
  element.addEventListener('pointerdown', down);
  element.addEventListener('pointermove', move);
  element.addEventListener('pointerup', up);
  element.addEventListener('pointercancel', cancel);
  element.addEventListener('lostpointercapture', cancel);
  element.addEventListener('keydown', keydown);
  element.addEventListener('mousedown', stop);
  element.addEventListener('touchstart', stop);
  const unsubscribe = comparison.subscribe(update);
  const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : undefined;
  resize?.observe(container);
  container.ownerDocument.defaultView?.addEventListener('resize', update);
  container.ownerDocument.defaultView?.addEventListener('blur', blur);
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    finish(true);
    unsubscribe();
    resize?.disconnect();
    unregister();
    container.ownerDocument.defaultView?.removeEventListener('resize', update);
    container.ownerDocument.defaultView?.removeEventListener('blur', blur);
    element.removeEventListener('pointerdown', down);
    element.removeEventListener('pointermove', move);
    element.removeEventListener('pointerup', up);
    element.removeEventListener('pointercancel', cancel);
    element.removeEventListener('lostpointercapture', cancel);
    element.removeEventListener('keydown', keydown);
    element.removeEventListener('mousedown', stop);
    element.removeEventListener('touchstart', stop);
    line.remove();
    grip.remove();
    if (!options.element) element.remove();
    else {
      for (const [name, value] of original) {
        if (value === null) element.removeAttribute(name);
        else element.setAttribute(name, value);
      }
    }
  };
  const unregister = comparison.addCleanup(destroy);
  update();
  return { element, update, destroy };
}
