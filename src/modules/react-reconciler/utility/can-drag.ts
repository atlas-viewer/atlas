import { ViewerMode } from '../../../renderer/runtime';

export function canDrag(ref: { current: ViewerMode }) {
  return ref.current === 'sketch';
}
