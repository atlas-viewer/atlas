import { deferToMicrotask } from '../../utility/defer-to-microtask';

// This is the double-invoke guard usePreset relies on to survive React
// StrictMode's synchronous mount -> cleanup -> mount, tested here in
// isolation from React entirely -- StrictMode's own double-invoke is
// synchronous (finishes well before any microtask runs), so the two
// behaviours that matter are exactly what these tests cover directly:
// deferral past a microtask, and cancellation before it fires.
describe('deferToMicrotask', () => {
  test('runs fn on a later microtask, not synchronously', () => {
    const fn = vi.fn();
    deferToMicrotask(fn);
    expect(fn).not.toHaveBeenCalled();
  });

  test('runs fn once the microtask queue drains', async () => {
    const fn = vi.fn();
    deferToMicrotask(fn);
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('cancelling before the microtask fires prevents fn from ever running', async () => {
    const fn = vi.fn();
    const cancel = deferToMicrotask(fn);
    cancel();
    await Promise.resolve();
    await Promise.resolve();
    expect(fn).not.toHaveBeenCalled();
  });

  test('cancelling after the microtask already fired is a harmless no-op', async () => {
    const fn = vi.fn();
    const cancel = deferToMicrotask(fn);
    await Promise.resolve();
    expect(fn).toHaveBeenCalledTimes(1);

    cancel();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('mirrors StrictMode double-invoke: first deferred call cancelled before it fires, second one runs', async () => {
    const first = vi.fn();
    const second = vi.fn();

    const cancelFirst = deferToMicrotask(first);
    // Synchronous cleanup + remount, exactly like StrictMode -- both
    // happen before the first deferred call's microtask ever runs.
    cancelFirst();
    deferToMicrotask(second);

    await Promise.resolve();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
