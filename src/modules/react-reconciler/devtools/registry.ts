import { Runtime } from '../../../renderer/runtime';
import { Preset } from '../presets/_types';

type AtlasRuntimeEntry = {
  runtime: Runtime;
  preset: Preset;
};

type DevToolsCandidate = {
  id: string;
  runtimeId?: string;
};

export type DevToolsRegistryRuntime = {
  id: string;
  runtime: Runtime;
  preset: Preset;
  label: string;
};

export type DevToolsRegistrySnapshot = {
  activeCandidateId?: string;
  selectedRuntimeId?: string;
  candidates: string[];
  runtimes: DevToolsRegistryRuntime[];
};

const listeners = new Set<() => void>();
const atlasRuntimes = new Map<string, AtlasRuntimeEntry>();
const candidates = new Map<string, DevToolsCandidate>();
const candidateOrder: string[] = [];

let activeCandidateId: string | undefined;
let selectedRuntimeId: string | undefined;
let snapshotCache: DevToolsRegistrySnapshot = {
  activeCandidateId: undefined,
  selectedRuntimeId: undefined,
  candidates: [],
  runtimes: [],
};

function rebuildSnapshot() {
  const runtimes = Array.from(atlasRuntimes.entries()).map(([id, entry], index) => ({
    id,
    runtime: entry.runtime,
    preset: entry.preset,
    label: `Atlas ${index + 1} (${id.slice(0, 6)})`,
  }));

  snapshotCache = {
    activeCandidateId,
    selectedRuntimeId,
    candidates: [...candidateOrder],
    runtimes,
  };
}

function emit() {
  rebuildSnapshot();
  for (const listener of listeners) {
    listener();
  }
}

function ensureSelectedRuntime() {
  if (selectedRuntimeId && atlasRuntimes.has(selectedRuntimeId)) {
    return;
  }
  const first = atlasRuntimes.keys().next();
  selectedRuntimeId = first.done ? undefined : first.value;
}

function ensureActiveCandidate() {
  if (activeCandidateId && candidates.has(activeCandidateId)) {
    return;
  }
  activeCandidateId = candidateOrder[0];
}

export function subscribeDevToolsRegistry(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDevToolsRegistrySnapshot(): DevToolsRegistrySnapshot {
  return snapshotCache;
}

export function registerAtlasRuntime(preset: Preset) {
  const runtimeId = preset.runtime.id;
  atlasRuntimes.set(runtimeId, {
    runtime: preset.runtime,
    preset,
  });
  ensureSelectedRuntime();
  emit();

  return () => {
    unregisterAtlasRuntime(runtimeId);
  };
}

export function unregisterAtlasRuntime(runtimeId: string) {
  atlasRuntimes.delete(runtimeId);
  ensureSelectedRuntime();
  emit();
}

export function registerDevToolsCandidate(candidate: DevToolsCandidate) {
  const existing = candidates.get(candidate.id);

  if (!existing) {
    candidateOrder.push(candidate.id);
  }

  candidates.set(candidate.id, candidate);
  ensureActiveCandidate();

  if (!selectedRuntimeId && candidate.runtimeId && atlasRuntimes.has(candidate.runtimeId)) {
    selectedRuntimeId = candidate.runtimeId;
  }

  ensureSelectedRuntime();
  emit();

  return () => {
    unregisterDevToolsCandidate(candidate.id);
  };
}

export function updateDevToolsCandidateRuntime(candidateId: string, runtimeId?: string) {
  const existing = candidates.get(candidateId);
  if (!existing) {
    return;
  }

  existing.runtimeId = runtimeId;

  if (!selectedRuntimeId && runtimeId && atlasRuntimes.has(runtimeId)) {
    selectedRuntimeId = runtimeId;
  }

  ensureSelectedRuntime();
  emit();
}

export function unregisterDevToolsCandidate(candidateId: string) {
  candidates.delete(candidateId);
  const idx = candidateOrder.indexOf(candidateId);
  if (idx !== -1) {
    candidateOrder.splice(idx, 1);
  }
  ensureActiveCandidate();
  emit();
}

export function setSelectedRuntimeId(runtimeId?: string) {
  if (!runtimeId) {
    selectedRuntimeId = undefined;
    ensureSelectedRuntime();
    emit();
    return;
  }

  if (atlasRuntimes.has(runtimeId)) {
    selectedRuntimeId = runtimeId;
    emit();
  }
}

export function getRuntimeEntry(runtimeId?: string) {
  if (!runtimeId) {
    return undefined;
  }
  return atlasRuntimes.get(runtimeId);
}

export function getPreferredRuntimeIdForCandidate(candidateId: string): string | undefined {
  const candidate = candidates.get(candidateId);
  if (!candidate) {
    return undefined;
  }

  if (candidate.runtimeId && atlasRuntimes.has(candidate.runtimeId)) {
    return candidate.runtimeId;
  }

  return selectedRuntimeId;
}

export function __resetDevToolsRegistryForTests() {
  atlasRuntimes.clear();
  candidates.clear();
  candidateOrder.length = 0;
  activeCandidateId = undefined;
  selectedRuntimeId = undefined;
  rebuildSnapshot();
}

rebuildSnapshot();
