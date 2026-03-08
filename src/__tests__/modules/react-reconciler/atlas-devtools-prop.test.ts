import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Atlas devTools prop integration', () => {
  test('Atlas exposes and wires devTools prop', () => {
    const atlasSource = readFileSync(
      resolve(process.cwd(), 'src/modules/react-reconciler/Atlas.tsx'),
      'utf8'
    );

    expect(atlasSource).toContain('devTools?: boolean | DevToolsProps');
    expect(atlasSource).toContain('{devTools ? <DevTools');
    expect(atlasSource).toContain('runtimeId={autoDevToolsProps?.runtimeId || preset?.runtime.id}');
  });
});
