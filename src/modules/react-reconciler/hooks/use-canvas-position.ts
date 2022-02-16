import { useContext } from 'react';
import { BoundsContext } from '../components/AtlasContext';

export function useCanvasPosition() {
  return useContext(BoundsContext);
}
