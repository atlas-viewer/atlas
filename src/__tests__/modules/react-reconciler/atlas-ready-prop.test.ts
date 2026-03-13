import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Atlas ready lifecycle wiring', () => {
  test('exposes and wires ready callback + reset key', () => {
    const atlasSource = readFileSync(resolve(process.cwd(), 'src/modules/react-reconciler/Atlas.tsx'), 'utf8');
    const surfaceSource = readFileSync(
      resolve(process.cwd(), 'src/modules/react-reconciler/components/AtlasSurface.tsx'),
      'utf8'
    );

    expect(atlasSource).toContain('onReady?: (event: AtlasReadyEvent) => void');
    expect(atlasSource).toContain('readyResetKey?: string | number');
    expect(atlasSource).toContain('worldKey?: string | number');
    expect(surfaceSource).toContain("preset.runtime.resetReadyState('ready-reset-key-change');");
    expect(surfaceSource).toContain("if (type === 'ready')");
    expect(surfaceSource).toContain('runtime.getReadyState()');
    expect(surfaceSource).toContain('lastReadyNotifiedCycleRef.current === readyState.cycle');
  });

  test('forwards webglReadiness to usePreset', () => {
    const atlasSource = readFileSync(resolve(process.cwd(), 'src/modules/react-reconciler/Atlas.tsx'), 'utf8');
    const surfaceSource = readFileSync(
      resolve(process.cwd(), 'src/modules/react-reconciler/components/AtlasSurface.tsx'),
      'utf8'
    );
    expect(atlasSource).toContain("worldKey?: string | number");
    expect(surfaceSource).toContain("webglReadiness?: 'first-meaningful-paint' | 'immediate'");
    expect(surfaceSource).toContain('webglReadiness,');
  });
});
