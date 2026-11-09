import type { Runtime, ViewerMode } from '../../../renderer/runtime';

/** Hold Space to pan only in the focused viewer, without taking keys from controls. */
export function installSpacePanShortcut(
  root: HTMLElement,
  runtime: Pick<Runtime, 'mode'>,
  setMode: (mode: ViewerMode) => void
): () => void {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  if (!win) return () => {};

  const isInteractive = (node: EventTarget | null) =>
    node instanceof win.Element &&
    ((node instanceof win.HTMLElement && node.isContentEditable) ||
      !!node.closest(
        'input, textarea, select, button, a[href], [contenteditable]:not([contenteditable="false"]), ' +
          '[role="textbox"], [role="combobox"], [role="button"], [role="slider"], [role="spinbutton"]'
      ));

  let holding = false;
  let addedTabIndex = false;
  const focusViewer = (event: PointerEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.composedPath().some(isInteractive)) return;
    if (!root.hasAttribute('tabindex')) {
      root.setAttribute('tabindex', '-1');
      addedTabIndex = true;
    }
    if (!root.contains(doc.activeElement)) root.focus({ preventScroll: true });
  };
  const release = () => {
    if (!holding) return;
    holding = false;
    // Do not undo a mode change made by the application while Space was held.
    if (runtime.mode === 'explore') setMode('sketch');
  };
  const keydown = (event: KeyboardEvent) => {
    if (
      event.code !== 'Space' ||
      event.defaultPrevented ||
      event.isComposing ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      !event.composedPath().includes(root) ||
      !root.contains(doc.activeElement) ||
      event.composedPath().some(isInteractive) ||
      isInteractive(doc.activeElement)
    )
      return;
    if (holding) {
      event.preventDefault();
      return;
    }
    if (event.repeat || runtime.mode !== 'sketch') return;
    event.preventDefault();
    holding = true;
    setMode('explore');
  };
  const keyup = (event: KeyboardEvent) => {
    if (event.code === 'Space') release();
  };
  const focusout = (event: FocusEvent) => {
    const next = event.relatedTarget;
    if (!(next instanceof win.Node) || !root.contains(next) || isInteractive(next)) release();
  };

  root.addEventListener('pointerdown', focusViewer);
  root.addEventListener('focusout', focusout);
  win.addEventListener('keydown', keydown);
  win.addEventListener('keyup', keyup);
  win.addEventListener('blur', release);
  return () => {
    root.removeEventListener('pointerdown', focusViewer);
    root.removeEventListener('focusout', focusout);
    win.removeEventListener('keydown', keydown);
    win.removeEventListener('keyup', keyup);
    win.removeEventListener('blur', release);
    release();
    if (addedTabIndex) root.removeAttribute('tabindex');
  };
}
