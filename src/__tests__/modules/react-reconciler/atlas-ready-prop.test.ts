import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Atlas ready lifecycle wiring', () => {
  test('exposes and wires ready callback + reset key', () => {
    const atlasSource = readFileSync(resolve(process.cwd(), 'src/modules/react-reconciler/Atlas.tsx'), 'utf8');

    expect(atlasSource).toContain('onReady?: (event: AtlasReadyEvent) => void');
    expect(atlasSource).toContain('readyResetKey?: string | number');
    expect(atlasSource).toContain("preset.runtime.resetReadyState('ready-reset-key-change');");
    expect(atlasSource).toContain("if (type !== 'ready')");
    expect(atlasSource).toContain('runtime.getReadyState()');
    expect(atlasSource).toContain('lastReadyNotifiedCycleRef.current === readyState.cycle');
  });

  test('forwards webglReadiness to usePreset', () => {
    const atlasSource = readFileSync(resolve(process.cwd(), 'src/modules/react-reconciler/Atlas.tsx'), 'utf8');
    expect(atlasSource).toContain("webglReadiness?: 'first-meaningful-paint' | 'immediate'");
    expect(atlasSource).toContain('webglReadiness,');
  });
});
