import { GenericObject } from '../traits/generic-object';

export interface ObjectDefinition<T extends GenericObject, P, UpdateState = true> {
  tagName: string;
  create(): T;
  applyProps(object: T, props: P, state?: UpdateState): boolean;
  append(object: T, toAppend: GenericObject): void;
  insertBefore(object: T, item: GenericObject, before: T): void;
  remove(object: T, item: GenericObject): void;
  prepareUpdate(object: T, newProps: P, oldProps: P, rootContainer?: GenericObject): UpdateState | null;
}
