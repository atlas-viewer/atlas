import { afterEach, describe, expect, test, vi } from 'vitest';
import type { ViewerMode } from '../../../renderer/runtime';
import { installSpacePanShortcut } from '../../../modules/react-reconciler/utility/space-pan-shortcut';

const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.reverse().forEach((cleanup) => cleanup());
  cleanups.length = 0;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

function viewer() {
  const root = document.createElement('div');
  const canvas = document.createElement('canvas');
  canvas.tabIndex = 0;
  root.append(canvas);
  document.body.append(root);
  const runtime = { mode: 'sketch' as ViewerMode };
  const setMode = vi.fn((mode: ViewerMode) => {
    runtime.mode = mode;
  });
  const cleanup = installSpacePanShortcut(root, runtime, setMode);
  cleanups.push(cleanup);
  return { root, canvas, runtime, setMode, cleanup };
}

function key(target: EventTarget, type = 'keydown', options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent(type, { key: ' ', code: 'Space', bubbles: true, cancelable: true, ...options });
  target.dispatchEvent(event);
  return event;
}

function control(html: string, parent: HTMLElement = document.body) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  parent.append(wrapper);
  const element = wrapper.firstElementChild as HTMLElement;
  element.tabIndex = 0;
  return element;
}

describe('Space-to-pan ownership', () => {
  test('only the focused viewer pans; another key release does not end the hold', () => {
    const first = viewer();
    const second = viewer();
    first.canvas.focus();
    expect(key(first.canvas).defaultPrevented).toBe(true);
    expect(first.runtime.mode).toBe('explore');
    expect(second.setMode).not.toHaveBeenCalled();
    expect(key(first.canvas, 'keydown', { repeat: true }).defaultPrevented).toBe(true);
    key(first.canvas, 'keyup', { key: 'Shift', code: 'ShiftLeft' });
    expect(first.runtime.mode).toBe('explore');
    key(first.canvas, 'keyup');
    expect(first.runtime.mode).toBe('sketch');
    expect(first.setMode.mock.calls).toEqual([['explore'], ['sketch']]);
  });

  test.each([
    '<input>',
    '<textarea></textarea>',
    '<select><option>One</option></select>',
    '<button><span>Button</span></button>',
    '<a href="#"><span>Link</span></a>',
    '<div contenteditable="true"><p><strong>Rich text</strong></p></div>',
    '<div contenteditable=""><p>Rich text</p></div>',
    '<div contenteditable="plaintext-only"><span>Text</span></div>',
    '<div role="textbox"><span>Textbox</span></div>',
    '<div role="combobox"></div>',
    '<div role="button"><svg><path /></svg></div>',
    '<div role="slider"></div>',
    '<div role="spinbutton"></div>',
  ])('leaves Space available in %s inside the viewer', (html) => {
    const { root, runtime, setMode } = viewer();
    const element = control(html, root);
    element.focus();
    // Dispatch from nested formatting/icon nodes too, as happens in rich editors and controls.
    const target = element.querySelector('strong, span, p, path') || element;
    expect(key(target).defaultPrevented).toBe(false);
    expect(runtime.mode).toBe('sketch');
    expect(setMode).not.toHaveBeenCalled();
  });

  test('ignores keys outside the viewer, even if focus still belongs to its canvas', () => {
    const { canvas, setMode } = viewer();
    canvas.focus();
    expect(key(document.body).defaultPrevented).toBe(false);
    const editor = control('<div contenteditable="true"><p>Sidebar text</p></div>');
    editor.focus();
    expect(key(editor.firstElementChild!).defaultPrevented).toBe(false);
    expect(key(canvas).defaultPrevented).toBe(false);
    expect(setMode).not.toHaveBeenCalled();
  });

  test.each([{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { isComposing: true }, { repeat: true }])(
    'ignores modified, composing, or orphaned repeat events: %j',
    (options) => {
      const { canvas, setMode } = viewer();
      canvas.focus();
      expect(key(canvas, 'keydown', options).defaultPrevented).toBe(false);
      expect(setMode).not.toHaveBeenCalled();
    }
  );

  test('respects prevented events and modes other than sketch', () => {
    const { canvas, runtime, setMode } = viewer();
    canvas.focus();
    const prevent = (event: Event) => event.preventDefault();
    canvas.addEventListener('keydown', prevent);
    key(canvas);
    canvas.removeEventListener('keydown', prevent);
    runtime.mode = 'explore';
    expect(key(canvas).defaultPrevented).toBe(false);
    expect(setMode).not.toHaveBeenCalled();
  });
});

describe('focus and lifecycle', () => {
  test('clicking the viewer makes it focusable without adding a tab stop', () => {
    const { root, canvas } = viewer();
    // happy-dom 6 incorrectly reports node.contains(node) as false.
    const contains = root.contains.bind(root);
    vi.spyOn(root, 'contains').mockImplementation((node) => node === root || contains(node));
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
    expect(document.activeElement).toBe(root);
    expect(root.tabIndex).toBe(-1);
    expect(key(root).defaultPrevented).toBe(true);
  });

  test('pointer interaction with a control does not steal focus', () => {
    const { root } = viewer();
    const editor = control('<div contenteditable="true"><p>Text</p></div>', root);
    editor.focus();
    editor.firstElementChild!.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
    expect(document.activeElement).toBe(editor);
    expect(root.hasAttribute('tabindex')).toBe(false);
  });

  test.each(['blur', 'outside', 'control', 'cleanup'])('releases the hold on %s', (reason) => {
    const { root, canvas, runtime, cleanup } = viewer();
    canvas.focus();
    key(canvas);
    expect(runtime.mode).toBe('explore');
    if (reason === 'blur') window.dispatchEvent(new Event('blur'));
    if (reason === 'outside') control('<input>').focus();
    if (reason === 'control') control('<input>', root).focus();
    if (reason === 'cleanup') cleanup();
    expect(runtime.mode).toBe('sketch');
  });

  test('release preserves an application mode change', () => {
    const { canvas, runtime, setMode } = viewer();
    canvas.focus();
    key(canvas);
    runtime.mode = 'static';
    key(canvas, 'keyup');
    expect(runtime.mode).toBe('static');
    expect(setMode).toHaveBeenCalledTimes(1);
  });

  test('cleanup removes handlers and restores only a tabindex that it added', () => {
    const { root, canvas, cleanup, setMode } = viewer();
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
    cleanup();
    expect(root.hasAttribute('tabindex')).toBe(false);
    canvas.focus();
    expect(key(canvas).defaultPrevented).toBe(false);
    expect(setMode).not.toHaveBeenCalled();
    const second = viewer();
    second.root.tabIndex = 0;
    second.canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
    second.cleanup();
    expect(second.root.tabIndex).toBe(0);
  });
});
