/** @vitest-environment happy-dom */

import { describe, expect, test } from 'vitest';
import { OverlayRenderer } from '../../modules/overlay-renderer/overlay-renderer';

describe('OverlayRenderer readiness', () => {
  test('is non-blocking for composite ready state', () => {
    const container = document.createElement('div');
    const renderer = new OverlayRenderer(container);

    expect(renderer.isReady()).toBe(true);
  });
});
