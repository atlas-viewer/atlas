export interface Revision {
  revision: {
    id: number;
  };
}

export function revisionDefaults(): Revision {
  return {
    revision: { id: 0 },
  };
}

export function hasRevision(obj: unknown): obj is Revision {
  return !!(obj && (obj as any).revision);
}
