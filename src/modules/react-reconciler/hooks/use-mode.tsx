import React, { useContext } from 'react';
import { ViewerMode } from '../../../renderer/runtime';

export const ModeContext = React.createContext<ViewerMode>('explore');
ModeContext.displayName = 'Mode';

export const useMode: () => ViewerMode = () => {
  return useContext(ModeContext);
};

export function ModeProvider(props: { mode: ViewerMode; children: React.ReactNode }) {
  return <ModeContext.Provider value={props.mode}>{props.children}</ModeContext.Provider>;
}
