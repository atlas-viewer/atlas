import { popmotionController } from '../../src/modules/popmotion-controller/popmotion-controller';
import { CanvasRenderer } from '../../src/modules/canvas-renderer/canvas-renderer';
import { Runtime } from '../../src/renderer/runtime';
import { DebugRenderer } from '../../src/modules/debug-renderer/debug-renderer';
import { World } from '../../src/world';

export function renderWorld(world: World, viewport: any) {
  // Create a quick canvas for our viewer.
  const canvas = document.createElement('canvas');
  canvas.style.backgroundColor = '#000';
  canvas.style.border = '1px solid #ddd';
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  // canvas.width = window.innerWidth * (window.devicePixelRatio || 1);
  // canvas.height = window.innerHeight * (window.devicePixelRatio || 1);
  // canvas.style.transform = 'scale(0.5)';
  // canvas.style.transformOrigin = '0px 0px';
  const app = document.getElementById('root');
  if (app) {
    app.appendChild(canvas);
  }

  // Could be composed.
  const controller = popmotionController(canvas, {
    devicePixelRatio: /*window.devicePixelRatio ||*/ 1,
    zoomOut: document.getElementById('zoom-out'),
    zoomIn: document.getElementById('zoom-in'),
    reset: document.getElementById('reset'),
    // minZoomFactor: 1,
    maxZoomFactor: 1,
  });

  // Create a renderer for our work, add it to a runtime.
  const renderer = new CanvasRenderer(canvas, { debug: false });
  const runtime = new Runtime(renderer, world, viewport, [controller]);

  window.addEventListener('resize', () => {
    runtime.resize(canvas.width, window.innerWidth, canvas.height, window.innerHeight);
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });

  // Add a second renderer (debug the world)
  const debugEl = document.getElementById('debug') as HTMLCanvasElement;
  if (debugEl) {
    const debugRenderer = new DebugRenderer(debugEl);
    const secondRuntime = new Runtime(debugRenderer, world, viewport);

    // This will simply assign the same co-ordinates in memory.
    secondRuntime.syncTo(runtime);
  }

  return [renderer, runtime] as const;
}
