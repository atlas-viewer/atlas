export type HostCompositeStorage<T> = Record<number, Record<number, T>>;

export interface HasElement<T> {
  type: string;
  element: T | undefined;
  loading: boolean;
  error?: Error;
  abortController?: AbortController;
}

export interface HasElementMap<T> {
  type: string;
  elements: HostCompositeStorage<T>;
  columns: number;
  loadingMap: HostCompositeStorage<boolean>;
  abortMap: HostCompositeStorage<AbortController>;
  errorMap: HostCompositeStorage<Error>;
}
