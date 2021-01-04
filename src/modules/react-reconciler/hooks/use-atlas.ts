import { useContext } from 'react';
import { AtlasContext } from '../components/AtlasContext';

export const useAtlas = () => {
  const ctx = useContext(AtlasContext);

  if (typeof ctx === 'undefined') {
    throw new Error('Cannot useAtlas outside of Atlas component');
  }

  return ctx;
};
