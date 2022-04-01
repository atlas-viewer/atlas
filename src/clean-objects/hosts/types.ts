import { GridStorage } from '../helpers/grid-storage';

export interface HasElement<T> {
  type: string;
  element: T | undefined;
  loading: boolean;
  error?: Error;
  abortController?: AbortController;
}

export interface HasElementMap<T> {
  type: string;
  elements: GridStorage<T>;
  columns: number;
  loadingMap: GridStorage<boolean>;
  abortMap: GridStorage<AbortController>;
  errorMap: GridStorage<Error>;
}
