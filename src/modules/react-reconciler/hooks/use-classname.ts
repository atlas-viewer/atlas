import { hash } from '../../../utility/hash';
import { useMemo } from 'react';

export function useClassname(deps: any[]) {
  return useMemo(() => hash(deps), deps);
}
