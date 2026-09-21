import { OverlayRenderer } from '../../modules/overlay-renderer/overlay-renderer';
import { Text } from '../../objects/text';
import { Box } from '../../objects/box';

// Regression test for a real crash: "TypeError: undefined is not an object
// (evaluating 'paint.__host.tx')". paint()'s condition for "this paint has
// (or should have) an HTML host" and createHtmlHost's condition for
// actually *creating* that host used to be two separately written
// booleans that had quietly drifted apart -- createHtmlHost never checked
// options.text, so a plain <paragraph>/Text with none of
// className/html/href never got __host set, and paint() then read .tx off
// undefined. Both now share OverlayRenderer#shouldHostPaint, so they can't
// diverge again.

function makePlainText(): Text {
  const text = new Text();
  text.applyProps({
    id: 'label',
    text: '#8@1x',
    target: { x: 0, y: 0, width: 90, height: 22 },
    fontSize: 14,
    color: '#fff',
  });
  return text;
}

function makePlainBox(): Box {
  const box = new Box();
  box.applyProps({
    id: 'box',
    target: { x: 0, y: 0, width: 90, height: 22 },
  } as any);
  return box;
}

function makeHrefBox(): Box {
  const box = new Box();
  box.applyProps({
    id: 'link',
    target: { x: 0, y: 0, width: 90, height: 22 },
    href: 'https://example.com',
  } as any);
  return box;
}

describe('OverlayRenderer text/box host creation', () => {
  test('a plain Text (no className/html/href) gets a host when options.text is on, and paint() does not throw', () => {
    const renderer = new OverlayRenderer(document.createElement('div'), { text: true });
    const text = makePlainText();

    expect((text as any).__host).toBeUndefined();

    renderer.prepareLayer(text as any);
    expect((text as any).__host).toBeDefined();

    expect(() => renderer.paint(text as any, 0, 0, 0, 90, 22)).not.toThrow();
  });

  test('a plain Text does not get a host when options.text is off, matching pre-fix opt-out behaviour', () => {
    const renderer = new OverlayRenderer(document.createElement('div'), { text: false });
    const text = makePlainText();

    renderer.prepareLayer(text as any);
    expect((text as any).__host).toBeUndefined();

    // paint() must not attempt to read .tx off a host that was correctly
    // never created here -- shouldHostPaint's own check for options.text
    // short-circuits before that read.
    expect(() => renderer.paint(text as any, 0, 0, 0, 90, 22)).not.toThrow();
  });

  test('a plain Box (no className/html) still requires options.box, unaffected by the fix', () => {
    const renderer = new OverlayRenderer(document.createElement('div'), { box: false, text: true });
    const box = makePlainBox();

    renderer.prepareLayer(box as any);
    expect((box as any).__host).toBeUndefined();
    expect(() => renderer.paint(box as any, 0, 0, 0, 90, 22)).not.toThrow();
  });

  test('a Box gets a host when options.box is on, matching pre-fix behaviour', () => {
    const renderer = new OverlayRenderer(document.createElement('div'), { box: true, text: true });
    const box = makePlainBox();

    renderer.prepareLayer(box as any);
    expect((box as any).__host).toBeDefined();
    expect(() => renderer.paint(box as any, 0, 0, 0, 90, 22)).not.toThrow();
  });

  // Regression test for a real, narrower regression introduced while fixing
  // the crash above: the new shared shouldHostPaint() dropped
  // paint.props.href from the Box branch, even though createHtmlHost (only
  // a few lines below it) still special-cases href to build an <a> host --
  // and HTMLPortal.tsx's box.__onCreate hook only ever fires once that host
  // exists. A link-only box (no className/html, options.box off) used to
  // get that host anyway; the dropped href check meant it silently stopped.
  test('an href-only Box (no className/html/options.box) still gets an anchor host', () => {
    const renderer = new OverlayRenderer(document.createElement('div'), { box: false, text: true });
    const box = makeHrefBox();

    renderer.prepareLayer(box as any);
    const host = (box as any).__host;
    expect(host).toBeDefined();
    expect(host.element.tagName).toBe('A');
    // .href, not getAttribute('href') -- happy-dom's HTMLAnchorElement
    // doesn't reflect the IDL property back to the attribute, but the
    // property is what createHtmlHost actually sets and what matters for
    // the element to function as a link.
    expect((host.element as HTMLAnchorElement).href).toBe('https://example.com');
    expect(() => renderer.paint(box as any, 0, 0, 0, 90, 22)).not.toThrow();
  });
});
