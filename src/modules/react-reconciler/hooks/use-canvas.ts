import { useAtlas } from './use-atlas';

export const useCanvas = () => {
  const atlas = useAtlas();
  return atlas && atlas.canvas ? atlas.canvas : undefined;
};
