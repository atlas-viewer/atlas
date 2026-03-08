import {
  __resetDevToolsRegistryForTests,
  getDevToolsRegistrySnapshot,
  registerAtlasRuntime,
  registerDevToolsCandidate,
  setSelectedRuntimeId,
} from '../../../modules/react-reconciler/devtools/registry';

describe('DevTools registry', () => {
  afterEach(() => {
    __resetDevToolsRegistryForTests();
  });

  test('keeps a single active candidate host', () => {
    const unregisterA = registerDevToolsCandidate({ id: 'candidate-a' });
    const unregisterB = registerDevToolsCandidate({ id: 'candidate-b' });

    expect(getDevToolsRegistrySnapshot().activeCandidateId).toBe('candidate-a');

    unregisterA();

    expect(getDevToolsRegistrySnapshot().activeCandidateId).toBe('candidate-b');

    unregisterB();
  });

  test('tracks and selects registered runtimes', () => {
    const unregisterRuntimeA = registerAtlasRuntime({
      runtime: { id: 'runtime-a' } as any,
    } as any);
    const unregisterRuntimeB = registerAtlasRuntime({
      runtime: { id: 'runtime-b' } as any,
    } as any);

    const snapshot = getDevToolsRegistrySnapshot();
    expect(snapshot.runtimes.map((runtime) => runtime.id)).toEqual(['runtime-a', 'runtime-b']);

    setSelectedRuntimeId('runtime-b');
    expect(getDevToolsRegistrySnapshot().selectedRuntimeId).toBe('runtime-b');

    unregisterRuntimeA();
    unregisterRuntimeB();
  });
});
