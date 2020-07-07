import React, { useContext } from 'react';

export type ViewerMode = 'static' | 'explore' | 'sketch' | 'sketch-explore';

export const ModeContext = React.createContext<ViewerMode>('explore');

export const useMode: () => ViewerMode = () => {
  return useContext(ModeContext);
};
