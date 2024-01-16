import { useContext } from 'react';
import { AtlasContext } from '../components/AtlasContext';

export const useAtlas = () => {
  return useContext(AtlasContext);
};
