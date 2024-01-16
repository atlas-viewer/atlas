import { ElementTags, ElementTypes, objectTypes } from './reconciler-config';
import { GetObjectDefinitionProps } from '../objects/_types';

export function h<K extends ElementTags, El = ElementTypes[K]>(
  component: K,
  props: GetObjectDefinitionProps<El>,
  ...children: any[]
) {
  const Creator = objectTypes[component];
  const object = Creator.create();
  Creator.applyProps(object as any, props as any);
  for (const child of children) {
    Creator.append(object as any, child);
  }
  return object as any;
}
