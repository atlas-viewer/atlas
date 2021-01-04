import { useAtlas } from './use-atlas';

export const useCanvas = () => {
  const { canvas } = useAtlas();
  return canvas ? canvas.current : undefined;
};
