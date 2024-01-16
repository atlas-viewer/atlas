import type { RuntimeHooks, RenderState } from './render';

type HookState = {
  [T in keyof RuntimeHooks]: Array<RuntimeHooks[T]>;
};

type UnwrapHook<T> = T extends Array<infer R> ? R : never;

interface HookRunner {
  hooks: HookState;
  runtime: RuntimeHooks;
  register<Name extends keyof RuntimeHooks, Hook = UnwrapHook<Name>>(name: Name, hook: Hook): () => void;
  run(name: keyof RuntimeHooks, delta: number, state: RenderState): void;
}

export function getDefaultHookState(): HookState {
  return {
    afterFrame: [],
    useAfterPaint: [],
    useBeforeFrame: [],
    useFrame: [],
  };
}

export function registerHook<Name extends keyof RuntimeHooks, Hook = UnwrapHook<Name>>(
  hookState: HookState,
  name: Name,
  hook: Hook
) {
  hookState[name].push(hook as any);
  return () => {
    hookState[name] = (hookState[name] as any[]).filter((e) => e !== (hook as any));
  };
}

export function runHook(hookState: HookState, name: keyof RuntimeHooks, delta: number, state: RenderState) {
  const len = hookState[name].length;
  if (len !== 0) {
    for (let x = 0; x < len; x++) {
      hookState[name][x](delta, state);
    }
  }
}

export function createHookRunner(): HookRunner {
  const state = getDefaultHookState();
  return {
    hooks: state,
    runtime: {
      useFrame: (delta, renderState) => runHook(state, 'useFrame', delta, renderState),
      useBeforeFrame: (delta, renderState) => runHook(state, 'useBeforeFrame', delta, renderState),
      useAfterPaint: (delta, renderState) => runHook(state, 'useAfterPaint', delta, renderState),
      afterFrame: (delta, renderState) => runHook(state, 'afterFrame', delta, renderState),
    },
    register(name, hook) {
      return registerHook(state, name, hook);
    },
  } as HookRunner;
}
