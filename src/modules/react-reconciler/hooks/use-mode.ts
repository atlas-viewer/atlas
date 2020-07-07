import React, { useContext } from 'react';
import { ViewerMode } from '../../../renderer/runtime';

export const ModeContext = React.createContext<ViewerMode>('explore');

export const useMode: () => ViewerMode = () => {
  return useContext(ModeContext);
};
