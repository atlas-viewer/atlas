import { GenericObject } from '../traits/generic-object';

export type AllHostTypes = 'dom';

export interface ObjectDefinition<
  T extends GenericObject,
  P,
  UpdateState = true,
  SupportedHostTypes extends AllHostTypes = 'dom'
> {
  tagName: string;
  create(): T;
  applyProps(object: T, props: P, state?: UpdateState): boolean;
  append(object: T, toAppend: GenericObject): void;
  insertBefore(object: T, item: GenericObject, before: T): void;
  remove(object: T, item: GenericObject): void;
  prepareUpdate(object: T, newProps: P, oldProps: P, rootContainer?: GenericObject): UpdateState | null;

  // Host stuff.
  createHost(object: T, type: SupportedHostTypes): void;
  mountHost(object: T, item: GenericObject, type: SupportedHostTypes): void;
}

export type GetObjectDefinitionProps<T> = T extends ObjectDefinition<any, infer Props> ? Props : never;
