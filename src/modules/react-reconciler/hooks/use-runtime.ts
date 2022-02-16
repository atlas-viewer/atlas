import { useAtlas } from './use-atlas';

export const useRuntime = () => {
  const atlas = useAtlas();
  return atlas ? atlas.runtime : undefined;
};
