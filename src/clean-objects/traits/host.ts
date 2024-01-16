import { HasElement, HasElementMap } from '../hosts/types';

export interface HasHosts {
  hosts: Record<string, HasElement<any> | HasElementMap<any>>;
}

export function hostDefaults(hosts: Record<string, HasElement<any> | HasElementMap<any>> = {}): HasHosts {
  return {
    hosts,
  };
}
