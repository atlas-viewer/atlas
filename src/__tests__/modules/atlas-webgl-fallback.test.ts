import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Atlas WebGL fallback wiring', () => {
  test('tracks active WebGL mode and wires fallback callback into usePreset', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/modules/react-reconciler/Atlas.tsx'), 'utf8');

    expect(source).toContain('const [activeWebGL, setActiveWebGL] = useState(unstable_webglRenderer);');
    expect(source).toContain('const fallbackLockedRef = useRef(false);');
    expect(source).toContain('onWebGLFallback: handleWebGLFallback');
    expect(source).toContain('onImageError,');
    expect(source).toContain('webglFallbackOnImageLoadError,');
    expect(source).toContain('imageLoading,');
    expect(source).toContain('setActiveWebGL(false);');
    expect(source).toContain('pendingRestoreViewportRef.current = currentRuntimeRef.current.getViewport();');
  });
});
