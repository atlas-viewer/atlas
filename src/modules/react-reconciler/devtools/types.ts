export type RuntimeDebugEvent = RuntimeFrameStartEvent | RuntimePaintEvent | RuntimeFrameEndEvent;

export type RuntimeFrameStartEvent = {
  type: 'frame-start';
  at: number;
  runtimeId: string;
  frame: number;
  delta: number;
  mode: string;
  pendingUpdate: boolean;
  rendererPendingUpdate: boolean;
  target: [number, number, number, number];
};

export type RuntimePaintEvent = {
  type: 'paint';
  at: number;
  runtimeId: string;
  frame: number;
  layerIndex: number;
  tileIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  paintId: string;
  paintType: string;
  ownerId?: string;
  compositeId?: string;
  imageUrl?: string;
};

export type RuntimeFrameEndEvent = {
  type: 'frame-end';
  at: number;
  runtimeId: string;
  frame: number;
  delta: number;
  scaleFactor: number;
  paintCount: number;
  ready: boolean;
  pendingUpdate: boolean;
  worldWidth: number;
  worldHeight: number;
  target: [number, number, number, number];
};

export type WorldDebugEvent = WorldTriggerDebugEvent | WorldPointerDebugEvent | WorldTouchDebugEvent;

export type WorldTriggerDebugEvent = {
  type: 'trigger';
  at: number;
  event: string;
  data?: unknown;
};

export type WorldPointerDebugEvent = {
  type: 'pointer';
  at: number;
  event: string;
  x: number;
  y: number;
  targets: number;
};

export type WorldTouchDebugEvent = {
  type: 'touch';
  at: number;
  event: string;
  touches: number;
};

export type DevToolsTab = 'Overview' | 'World' | 'Inspector' | 'Events' | 'Images' | 'Actions';
