import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Atlas DPI wiring', () => {
  test('uses renderer dpi instead of always using devicePixelRatio', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/modules/react-reconciler/Atlas.tsx'), 'utf8');

    expect(source).toContain('const getRendererDpi = useCallback(() => {');
    expect(source).toContain('const dpi = primaryRenderer?.dpi;');
    expect(source).toContain('const ratio = getRendererDpi();');
    expect(source).toContain('preset.canvas.width = canvasWidth * ratio;');
    expect(source).toContain('preset.navigator.width = canvasWidth * ratio;');
  });
});
