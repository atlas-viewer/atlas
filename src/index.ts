export * from './spacial-content/index';
export * from './world';
export * from './world-objects/index';
export * from './renderer/renderer';
export * from './renderer/runtime';
export * from './types';
export * from './modules/canvas-renderer/canvas-renderer';
export * from './modules/debug-renderer/debug-renderer';
export * from './modules/grid-builder/grid-builder';
export * from './modules/popmotion-controller/popmotion-controller';
export * from './modules/react-reconciler';
export * from './modules/iiif';
export * from './modules/browser-event-manager/browser-event-manager';

if (process.env.NODE_ENV !== 'production') {
  console.log('Atlas', process.env.VERSION);
}
