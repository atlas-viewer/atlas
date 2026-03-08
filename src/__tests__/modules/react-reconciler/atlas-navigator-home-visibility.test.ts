import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Atlas navigator home visibility', () => {
  test('hides navigator at home target while keeping navigator mounted', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/modules/react-reconciler/Atlas.tsx'), 'utf8');

    expect(source).toContain('const NAVIGATOR_HOME_TOLERANCE = 1;');
    expect(source).toContain('const [isNavigatorHiddenAtHome, setIsNavigatorHiddenAtHome] = useState(false);');
    expect(source).toContain('runtime.isViewportAtHome({ cover: !!homeCover, tolerance: NAVIGATOR_HOME_TOLERANCE })');
    expect(source).toContain("isNavigatorHiddenAtHome ? 'atlas-navigator--hidden-at-home' : ''");
    expect(source).toContain('.atlas-navigator--hidden-at-home { opacity: 0; pointer-events: none; }');
    expect(source).toContain('return runtime.world.addLayoutSubscriber(() => {');
  });
});
