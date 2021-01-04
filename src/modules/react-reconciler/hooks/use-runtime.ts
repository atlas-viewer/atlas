import { useAtlas } from './use-atlas';

export const useRuntime = () => {
  const { runtime } = useAtlas();
  return runtime;
};
