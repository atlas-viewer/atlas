/** @vitest-environment happy-dom */

import { describe, expect, test } from 'vitest';
import { getRetryDelayMs, resolveImageLoadingConfig } from '../../modules/shared/image-loading-config';

function setHardwareConcurrency(value: number) {
  Object.defineProperty(navigator, 'hardwareConcurrency', {
    configurable: true,
    value,
  });
}

function setConnection(value: any) {
  Object.defineProperty(navigator, 'connection', {
    configurable: true,
    value,
  });
}

describe('image loading config', () => {
  test('resolves adaptive defaults from hardware and network', () => {
    setHardwareConcurrency(8);
    setConnection({ effectiveType: '4g', saveData: false });

    const config = resolveImageLoadingConfig();
    expect(config.maxConcurrentRequests).toBe(6);
    expect(config.maxPrefetchPerFrame).toBe(8);
    expect(config.timeoutMs).toBe(8000);
    expect(config.maxAttempts).toBe(3);
    expect(config.errorRetryIntervalMs).toBe(30000);
    expect(config.revealDelayFrames).toBe(1);
    expect(config.revealBatchWindowFrames).toBe(1);
    expect(config.skipFadeIfLoadedWithinMs).toBe(120);
  });

  test('applies slow-network constraints', () => {
    setHardwareConcurrency(16);
    setConnection({ effectiveType: '2g', saveData: false });

    const config = resolveImageLoadingConfig();
    expect(config.maxConcurrentRequests).toBe(2);
    expect(config.maxPrefetchPerFrame).toBe(0);
  });

  test('allows explicit overrides', () => {
    const config = resolveImageLoadingConfig({
      maxConcurrentRequests: 9,
      maxPrefetchPerFrame: 4,
      timeoutMs: 1234,
      maxAttempts: 5,
      baseDelayMs: 100,
      maxDelayMs: 500,
      jitterRatio: 0.4,
      errorRetryIntervalMs: 2222,
      revealDelayFrames: 2,
      revealBatchWindowFrames: 3,
      skipFadeIfLoadedWithinMs: 42,
    });

    expect(config).toMatchObject({
      maxConcurrentRequests: 9,
      maxPrefetchPerFrame: 4,
      timeoutMs: 1234,
      maxAttempts: 5,
      baseDelayMs: 100,
      maxDelayMs: 500,
      jitterRatio: 0.4,
      errorRetryIntervalMs: 2222,
      revealDelayFrames: 2,
      revealBatchWindowFrames: 3,
      skipFadeIfLoadedWithinMs: 42,
    });
  });

  test('computes retry backoff with bounded jitter', () => {
    const config = resolveImageLoadingConfig({ baseDelayMs: 100, maxDelayMs: 400, jitterRatio: 0.2 });
    const delay = getRetryDelayMs(config, 3, () => 0.5);
    expect(delay).toBe(400);
  });
});
