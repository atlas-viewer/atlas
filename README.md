# Atlas

Atlas is a pan-and-zoom viewer for large images, IIIF image services, and scenes made up of several images. It handles tile selection, image loading, drawing, and pointer interaction. You decide what goes in the scene and how people navigate it.

Use it for a single scanned page, a spread of pages, an image with annotations, or an image inside a larger application. There are two ways to get started: `atlas.image()` / `atlas.iiif()` for JavaScript and `<Atlas>` for React. Both use the same world objects and runtime underneath.

[Getting started](#getting-started) · [IIIF images](#iiif-images) · [React](#react) · [API reference](#api-reference) · [Development](#development)

## Installation

```sh
npm install @atlas-viewer/atlas
```

Choose the entry point that fits your application:

| Import                           | Use it for                                                                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@atlas-viewer/atlas/standalone` | `atlas()` and the core rendering APIs. No React or reconciler runtime imports.                                                                                                              |
| `@atlas-viewer/atlas`            | The full browser package, including `<Atlas>`, `<AtlasAuto>`, HTML overlays, and devtools. Also exports `atlas()`.                                                                          |
| `@atlas-viewer/atlas/react`      | React scene rendering when your application owns the DOM shell. Includes `ReactAtlas`, scene components, hooks, and presets; excludes `<Atlas>`, `<AtlasAuto>`, `HTMLPortal`, and devtools. |

ES modules, CommonJS, and TypeScript declarations are included. The viewer runs in a browser: create it after its element is mounted. In an application with server rendering, initialise it in a client effect.

For the React examples, also install the React integration dependencies:

```sh
npm install react react-dom react-reconciler @iiif/helpers
```

Use a reconciler version compatible with your application's React version. This repository develops and tests with React 19 and `react-reconciler` 0.33. The package currently declares React, the reconciler, and IIIF helpers as peer dependencies, so some package managers also install them for standalone consumers. The `/standalone` entry does not import them at runtime.

## Getting started

Give the viewer a container with a definite height:

```html
<div id="viewer" style="width: 100%; height: 500px;"></div>
<button id="home" type="button">Reset view</button>
```

### Open a single image

Pass an image URL. Atlas reads its dimensions and fits it to the viewer:

```js
import { atlas } from '@atlas-viewer/atlas/standalone';

const viewer = await atlas.image(
  document.getElementById('viewer'),
  'https://iiif.wellcomecollection.org/image/b18035723_0001.JP2/full/800,/0/default.jpg',
  { label: 'Scanned page', homePaddingPx: 24 }
);

document.getElementById('home').onclick = () => viewer.runtime.goHome();

// When this part of your application unmounts:
// viewer.destroy();
```

Replace the URL with your own JPEG, PNG, WebP, or another image your browser can display. No dimensions or world objects are needed. Drag to pan, scroll to zoom, or pinch on a touch screen. The viewer follows the container's size.

This is browser module code for a bundler such as Vite. A bare package import will not resolve in an ordinary `<script>` without a bundler or import map.

A plain image downloads as one file. Zooming in cannot reveal more detail than that file contains. For a large source image, open its IIIF image service instead.

## IIIF images

Pass either an image service URL or its `info.json` URL:

```js
import { atlas } from '@atlas-viewer/atlas/standalone';

const viewer = await atlas.iiif(
  document.getElementById('viewer'),
  'https://iiif.wellcomecollection.org/image/b18035723_0001.JP2',
  { label: 'Scanned page', homePaddingPx: 24 }
);
```

Atlas loads the service description, reads the dimensions, and builds the image levels. Tiles load as you pan and zoom. Both shortcuts return the same viewer, with `runtime`, `world`, `resize()`, and `destroy()` available when you need them.

The IIIF helper accepts Image API 2 and 3 services. For services without tiles, it uses advertised fixed sizes, or the full-image request if no sizes are listed. Detail is limited to what the service provides. You can set `format` (default `'jpg'`) and `renderOptions` in the third argument.

An IIIF **Image API service** supplies pixels and an `info.json` document describing them. A **Presentation API manifest** describes an object: pages, metadata, annotations, and other resources. Pass the image service URL here, not a manifest. See [working with manifests](#working-with-manifests) for that path.

### Loading, errors, and cleanup

Both shortcuts return a promise. `atlas.image()` waits for the image dimensions; `atlas.iiif()` waits for the service description and scene setup, not for every tile to download. Handle initial loading failures with `try` / `catch`. Tile errors after setup go to `rendererOptions.onImageError`.

```js
try {
  const viewer = await atlas.image(element, '/painting.jpg');
  // Keep viewer and call viewer.destroy() when your view unmounts.
} catch (error) {
  element.textContent = 'The image could not be opened.';
  console.error(error);
}
```

Call `destroy()` when you remove a viewer: removing its HTML alone does not stop its animation loop or image requests. If your application can unmount while loading, pass an `AbortSignal` and handle cancellation as part of cleanup:

```js
const loading = new AbortController();
let viewer;

atlas
  .iiif(element, serviceUrl, { signal: loading.signal })
  .then((created) => {
    if (loading.signal.aborted) created.destroy();
    else viewer = created;
  })
  .catch((error) => {
    if (!loading.signal.aborted) console.error(error);
  });

function unmount() {
  loading.abort();
  viewer?.destroy();
}
```

Cancelled or failed loads do not leave a viewer behind. The signal applies to initial loading; after creation, use `destroy()` to release the viewer or `runtime.setIdle(true)` to pause it temporarily.

## Building a scene

A **World** is the scene. A **WorldObject** places content within it; think of it as a page, a layer group, or an image on a board. A **SingleImage** or **CompositeResource** supplies the pixels inside that object. The **Runtime** controls the camera and render loop.

Coordinates start at the top left, with `x` increasing to the right and `y` downwards. Scene sizes are in world units. For a single image, using one world unit per source pixel makes regions easy to work with. The viewer's width and height are separate, measured in CSS pixels.

For example, a 2569 × 3543 image can occupy a 2569 × 3543 world object while the viewer itself is only 600 × 500 CSS pixels. Atlas calculates the scale needed to show it.

You only need the lower-level objects when you want to arrange several images, add annotations, or control image levels yourself. Start with an empty viewer and add the first page:

```js
import { atlas, SingleImage, WorldObject } from '@atlas-viewer/atlas/standalone';

const viewer = atlas(document.getElementById('viewer'));
const page = WorldObject.createWithProps({ id: 'page-1', width: 800, height: 1103 });
page.appendChild(SingleImage.fromImage('/page-1.jpg', { width: 800, height: 1103 }));
viewer.world.appendChild(page);
```

To put a second page beside the first, give it an `x` position:

```js
const secondPage = WorldObject.createWithProps({
  id: 'page-2',
  x: 840,
  y: 0,
  width: 800,
  height: 1103,
});
secondPage.appendChild(SingleImage.fromImage('/page-2.jpg', { width: 800, height: 1103 }));
viewer.world.appendChild(secondPage);

// Remove an object later:
viewer.world.removeChild(secondPage);
```

The helper recalculates scene bounds when top-level objects are added or removed. By default, a change to those bounds refits the camera. For an application that owns the camera, provide an initial `viewport` as shown [below](#using-your-own-canvas-and-camera).

### Building a tiled image by hand

The following builds a tiled scene without React. The dimensions normally come from the image service's `info.json` or your application's IIIF data. Metadata loading is asynchronous; creating the viewer itself is synchronous.

```js
import {
  atlas,
  World,
  WorldObject,
  CompositeResource,
  TiledImage,
  getTileFromImageService,
} from '@atlas-viewer/atlas/standalone';

async function openImage(element) {
  const serviceUrl = 'https://iiif.wellcomecollection.org/image/b18035723_0001.JP2';
  const { imageService: service } = await getTileFromImageService(serviceUrl, 2569, 3543);
  const id = (service.id || service['@id']).replace(/\/info\.json$/, '');
  const size = { width: service.width, height: service.height };

  if (!service.tiles?.length) {
    throw new Error('This example needs a service that advertises tiles.');
  }

  const images = service.tiles.flatMap((tile) =>
    tile.scaleFactors.map((factor) => TiledImage.fromTile(id, size, tile, factor, service))
  );
  const page = WorldObject.createWithProps({ id: 'page-1', ...size });
  page.appendChild(new CompositeResource({ id, ...size, images }));

  const world = new World();
  world.appendChild(page);
  return atlas(element, {
    world,
    label: 'Scanned page',
    homePaddingPx: 24,
    rendererOptions: {
      onImageError(event) {
        console.warn('Could not load image', event.imageUrl, event.willRetry);
      },
    },
  });
}

try {
  const viewer = await openImage(document.getElementById('viewer'));
  // Keep viewer and call viewer.destroy() when your view unmounts.
} catch (error) {
  document.getElementById('viewer').textContent = 'The image could not be opened.';
  console.error(error);
}
```

`TiledImage` describes one resolution level; `CompositeResource` chooses which levels to draw as the camera moves. Passing the service to `fromTile()` lets it recognise the IIIF Image API version. The example uses JPEG tiles; pass a supported format to `fromTile()` for services that require another format.

Some services advertise only fixed image sizes, with no tiles. Use `SingleImage` for those sizes, optionally grouped in a `CompositeResource`, and follow the service's supported URL syntax. Atlas does not turn a non-tiled service into a tiled one.

If a component can unmount while `openImage()` is waiting for metadata, guard that result in your application and destroy any viewer that completes after unmount. Renderer idle state controls pixel requests, not the separate metadata request.

### Working with manifests

For a React viewer with manifest loading, page navigation, labels, thumbnails, and IIIF resource hooks, see [React IIIF Vault](https://github.com/digirati-co-uk/react-iiif-vault). Its `CanvasPanel` is built on Atlas. It is a useful starting point when your input is a manifest and you want a document viewer.

Atlas is also usable beneath your own manifest handling. Resolve a canvas's painting resources, place them in world coordinates, and let Atlas render them. The root package exports `getTiles(manifestId)`, `getTilesFromManifest(manifest)`, and `getTileFromCanvas(canvas)` for simple image-based manifests. These helpers use the IIIF Vault and make assumptions about painting bodies and image services; they are not a complete Presentation API renderer. `/standalone` exports only `getTileFromImageService()` from this group.

## React

The full `<Atlas>` component manages its canvas, overlays, input, and lifecycle. Its children describe the scene using Atlas elements, rather than ordinary HTML.

```tsx
import { Atlas, ImageService } from '@atlas-viewer/atlas';

export function PageViewer() {
  return (
    <Atlas
      width={800}
      height={600}
      homePaddingPx={24}
      containerProps={{ 'aria-label': 'Scanned page' }}
      onImageError={(event) => console.warn('Image load failed', event.imageUrl)}
    >
      <ImageService id="https://iiif.wellcomecollection.org/image/b18035723_0001.JP2" width={2569} height={3543} />
    </Atlas>
  );
}
```

`ImageService` loads the service description and builds the world objects and image levels. Its `width` and `height` describe the image in the scene, not the viewer's CSS size. For a responsive viewer, replace `Atlas` with `AtlasAuto` and pass `width="100%" height={600}`, or give its parent a height and use `height="100%"`.

For a plain image, replace `ImageService` with:

```tsx
<world-object id="page-1" width={800} height={1103}>
  <world-image uri="/page-1.jpg" target={{ width: 800, height: 1103 }} display={{ width: 800, height: 1103 }} />
</world-object>
```

`target` is the image's rectangle in its parent. `display` describes the source image dimensions. They can differ, for example when displaying a small thumbnail across a larger page.

### Buttons and other HTML

Put regular HTML outside the scene, or use `htmlChildren` for UI in the viewer's DOM shell. `onCreated` gives you the preset, including its runtime:

```tsx
import { useRef } from 'react';
import { Atlas, ImageService, type Runtime } from '@atlas-viewer/atlas';

export function ViewerWithControls() {
  const runtime = useRef<Runtime | undefined>(undefined);
  return (
    <>
      <button type="button" onClick={() => runtime.current?.goHome()}>
        Reset view
      </button>
      <button type="button" onClick={() => runtime.current?.transitionManager.zoomTo(0.5)}>
        Zoom in
      </button>
      <button type="button" onClick={() => runtime.current?.transitionManager.zoomTo(2)}>
        Zoom out
      </button>
      <Atlas
        width={800}
        height={600}
        onCreated={(preset) => {
          runtime.current = preset.runtime;
        }}
      >
        <ImageService id="https://iiif.wellcomecollection.org/image/b18035723_0001.JP2" width={2569} height={3543} />
      </Atlas>
    </>
  );
}
```

`onCreated` means the runtime exists. `onReady` reports readiness for the current rendering cycle; it does not mean that every tile at every zoom level has downloaded. Use normal labelled HTML controls and include an image description or transcription where appropriate: canvas pixels do not provide that information to assistive technology.

Components inside the Atlas scene can use `useRuntime()`, `useAtlas()`, and the frame hooks. Hooks return an undefined runtime until one is available. Application React contexts do not automatically cross into the separate Atlas reconciler root; pass values as props or provide the context inside the scene. Use `HTMLPortal` when HTML needs to be anchored to a region in world coordinates.

## Using your own canvas and camera

For editors, whiteboards, or an existing camera system, disable Atlas input and set the viewport yourself. This is the setup used by integrations such as the [tldraw IIIF adapter](https://github.com/tu-delft-heritage/tldraw-iiif/blob/main/src/atlas-adapter.ts).

```js
import { atlas } from '@atlas-viewer/atlas/standalone';

// canvas is an existing HTMLCanvasElement; world is your populated World.
const viewer = atlas(canvas, {
  world,
  interactive: false,
  autoResize: false,
  width: 800,
  height: 600,
  viewport: { x: 0, y: 0, width: 1000, height: 750 },
  background: 'transparent',
  rendererOptions: { dpi: 1 },
});

// Your application owns the canvas's CSS size and the visible source region.
canvas.style.width = '800px';
canvas.style.height = '600px';
viewer.resize(800, 600);
viewer.runtime.setViewport({ x: 200, y: 150, width: 1000, height: 750 });

// Keep loaded tiles while the image is offscreen.
viewer.runtime.setIdle(true);
viewer.runtime.setIdle(false);

// Release resources. A caller-supplied canvas stays in the DOM.
viewer.destroy();
```

A viewport is a rectangle in **world coordinates**. `resize()` takes the drawing size in **CSS pixels** and multiplies by the configured DPI. If your host already works in device pixels, use `dpi: 1` to avoid multiplying twice. Keep the camera and canvas aspect ratios aligned to avoid clipping.

Supplying `viewport` disables automatic home fitting when scene bounds change and preserves your camera across helper resizes. Later calls to `runtime.setViewport()` update the camera immediately. You can still call `runtime.goHome()` explicitly.

The helper uses Canvas 2D. Applications that need their own renderer, multiple rendering surfaces, or a specialised retained-image strategy can construct `Runtime` directly. The lower-level classes remain public.

## Regions, annotations, and pages

In React, place a box or shape alongside the image inside its `world-object`. Both then use the same local coordinates:

```tsx
<world-object id="page" width={800} height={1103}>
  <world-image uri="/page-1.jpg" target={{ width: 800, height: 1103 }} display={{ width: 800, height: 1103 }} />
  <box
    target={{ x: 120, y: 180, width: 240, height: 100 }}
    style={{ border: '2px solid #d84c26' }}
    onClick={(event) => console.log('Region clicked', event.atlas)}
  />
</world-object>
```

Atlas can draw and hit-test these regions. Your application owns annotation data, editing, and persistence. `BoxDraw` and `RegionHighlight` provide React helpers; `Box` and `Geometry` are the corresponding lower-level building blocks.

For page-by-page navigation, author a zone with explicit bounds:

```tsx
<Atlas width={800} height={600} interactionMode="pdf-scroll-zone">
  <zone id="page-1" x={0} y={0} width={800} height={1103}>
    <world-object id="page-1-image" width={800} height={1103}>
      <world-image uri="/page-1.jpg" target={{ width: 800, height: 1103 }} display={{ width: 800, height: 1103 }} />
    </world-object>
  </zone>
</Atlas>
```

Only direct `world-object` children become members of a wrapper zone. `runtime.goToZone('page-1')` selects and fits it, returning `false` if the ID is missing. Outside React, construct a `Zone({ id, x, y, width, height, objects })` and register it with `world.addZone(zone)`. Explicit zone dimensions are required for meaningful bounds.

## API reference

The tables below cover the main application-facing APIs. Types ship with the package; links point to their implementations for the complete signatures.

### Single-image shortcuts

| Method                                            | Input                                             | Result                                             |
| ------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------- |
| `await atlas.image(element, url, options?)`       | A browser-readable image URL.                     | A viewer fitted to the image's natural dimensions. |
| `await atlas.iiif(element, serviceUrl, options?)` | An IIIF Image API 2/3 service URL or `info.json`. | A viewer with tiled or fixed-size image levels.    |

Both return `Promise<AtlasViewer>` and accept the regular viewer options below, except `world`: each creates a world containing one image. `width` and `height` still mean the viewer's drawing size, not the source image's dimensions. Both also accept `signal?: AbortSignal` to cancel initial loading. They reject on loading or metadata errors and create the viewer only after setup succeeds.

`atlas.iiif()` additionally accepts `format?: string` (default `'jpg'`, must be supported by the service) and `renderOptions?: CompositeResourceProps`. Metadata requests need CORS permission from the service. For a plain image, `rendererOptions.crossOrigin` also applies to the initial dimension-loading request.

The exported option types are `AtlasImageOptions` and `AtlasIIIFOptions`. These shortcuts are available wherever `atlas` is exported, including the React-free `/standalone` entry.

### `atlas(element, options?)`

Creates and returns an `AtlasViewer` synchronously. `element` is a container or an existing canvas, not a selector string. It should have a CSS width and height independent of the canvas's intrinsic dimensions. Empty or hidden containers use a 1 × 1 drawing size until they can be measured.

| Option             | Default                     | Meaning                                                                                                               |
| ------------------ | --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `world`            | Empty `World`               | Scene to render. The helper updates dirty scene bounds before frames.                                                 |
| `viewport`         | Fit scene                   | Initial `{ x, y, width, height }` in world coordinates; also opts into host-controlled camera sizing.                 |
| `interactive`      | `true`                      | Attach the default pan/zoom controller and browser scene events. `false` attaches neither.                            |
| `autoResize`       | `true`                      | Follow CSS size using `ResizeObserver`, with window resize handling as a fallback.                                    |
| `width`, `height`  | Measured size               | Initial drawing size in CSS pixels. Automatic resizing subsequently follows the element. These do not set host CSS.   |
| `background`       | `'#000'`                    | Canvas background; accepts `'transparent'`. An existing canvas's `data-background` is retained unless overridden.     |
| `label`            | Unset                       | Canvas `aria-label`. Existing labels are retained unless overridden.                                                  |
| `homePaddingPx`    | No padding                  | Number or `{ top, right, bottom, left }`, in CSS pixels.                                                              |
| `rendererOptions`  | Canvas defaults, device DPI | `CanvasRendererOptions`, including image loading and error handling.                                                  |
| `controllerConfig` | React preset defaults       | `PopmotionControllerConfig`; `minZoomFactor: 0.5`, `maxZoomFactor: 3`. The helper sets `parentElement` to its canvas. |
| `runtimeOptions`   | Runtime defaults            | Zoom and visibility constraints described below.                                                                      |

The returned object exposes `canvas`, `world`, `runtime`, `renderer`, and `em` (the browser event manager, present only in interactive mode), plus:

| Method                  | What it does                                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resize()`              | Remeasure the host and refresh pointer coordinates. Call this after a layout change if automatic observation is unavailable.                                   |
| `resize(width, height)` | Set drawing dimensions in CSS pixels without changing the host's CSS. With `viewport`, preserve that camera. Otherwise resize around the current focal region. |
| `destroy()`             | Stop rendering and controllers, cancel image work, disconnect observers and event listeners, and release renderer caches. Safe to call more than once.         |

Destroying the viewer removes only the canvas it created, leaving other container children alone. A supplied canvas is retained and its original size, style, background, label, and tab index are restored; its old pixels are not restored. The scene objects remain yours, so an existing world can be mounted again. Do not keep using a disposed runtime; create a new viewer.

See [`AtlasOptions` and `AtlasViewer`](src/atlas.ts).

### World and content

| API                                                                                              | Purpose                                                                                                        |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `new World(width?, height?)`                                                                     | Create a scene. `atlas()` derives its bounds from top-level objects.                                           |
| `WorldObject.createWithProps({ id, width, height, x?, y?, scale?, rotation? })`                  | Create a positioned container. Append images, shapes, or nested world objects with `appendChild()`.            |
| `world.appendChild(object)`, `world.removeChild(object)`                                         | Attach or remove a top-level object.                                                                           |
| `world.getObjects()`                                                                             | Read the object list. Removed entries can be `null`.                                                           |
| `world.triggerRepaint()`                                                                         | Request drawing after changing content outside the reconciler.                                                 |
| `SingleImage.fromImage(uri, targetSize, displaySize?, id?)`                                      | Create a plain image. `displaySize` defaults to `targetSize`.                                                  |
| `image.applyProps({ uri, target, display?, crop?, style? })`                                     | Set placement, source dimensions, crop, or opacity. Use `target.x` / `target.y` for an offset inside a parent. |
| `TiledImage.fromTile(url, size, tile, scaleFactor, service?, format?, useFloorCalc?, version3?)` | Describe one tile resolution level. `tile` has `width` and optional `height`; `size` is the full image size.   |
| `new CompositeResource({ id, width, height, images, renderOptions?, loadFullImages? })`          | Select between image levels and optional lazily loaded resources.                                              |
| `new Zone({ id, x, y, width, height, objects? })`                                                | Define a navigable region with explicit bounds.                                                                |
| `world.addZone(zone)`, `world.removeZone(zone)`                                                  | Register or remove a zone.                                                                                     |

After changing the position or dimensions of an already attached object, set `world.needsRecalculate = true` and call `world.triggerRepaint()`. The helper updates bounds on the next frame. With a manually constructed `Runtime`, call `world.recalculateWorldSize()` yourself after scene changes, as the React reconciler does.

Source: [`World`](src/world.ts), [`WorldObject`](src/world-objects/world-object.ts), [image classes](src/spacial-content), [`Zone`](src/world-objects/zone.ts).

### Runtime and navigation

Access the same runtime through `viewer.runtime`, React's `onCreated`, or `useRuntime()` inside the scene.

| API                                                                 | Behaviour                                                                                                                                                                   |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getViewport()`                                                     | Current `{ x, y, width, height }`. Copy the result if you need a snapshot; the runtime reuses the object.                                                                   |
| `setViewport(rect)`                                                 | Set any of the camera rectangle's fields immediately and request a frame.                                                                                                   |
| `goHome({ cover?, paddingPx? }?)`                                   | Fit the home region. `cover: true` fills the viewer, potentially cropping the image.                                                                                        |
| `setHomePosition(rect?)`                                            | Set the home rectangle, or use the world's bounds. Set `manualHomePosition = true` to retain a custom home across scene changes.                                            |
| `setHomePaddingPx(padding)`                                         | Change home padding in CSS pixels.                                                                                                                                          |
| `transitionManager.goToRegion(rect, { transition: { duration } }?)` | Animate to a world rectangle. `duration` is in milliseconds.                                                                                                                |
| `transitionManager.zoomTo(factor, options?)`                        | Animate a relative change to the viewport size: `0.5` zooms in, `2` zooms out. `options.origin` is in world coordinates.                                                    |
| `viewRotation = degrees`, `rotateBy(degrees, origin?)`              | Rotate the camera clockwise, optionally around a world-space pivot. Objects keep their own geometry.                                                                        |
| `setTouchRotationEnabled(enabled)`                                  | Toggle gesture rotation; programmatic rotation remains available.                                                                                                           |
| `viewerToWorld(x, y)`                                               | Convert CSS coordinates relative to the viewer into world coordinates. Subtract the canvas's bounding rectangle from browser client coordinates first.                      |
| `worldToViewer(x, y, width, height)`                                | Project a world rectangle into viewer coordinates.                                                                                                                          |
| `goToZone(id, { immediate?, paddingPx? }?)`                         | Select and fit a zone; returns whether it exists.                                                                                                                           |
| `deselectZone()`                                                    | Clear the active zone.                                                                                                                                                      |
| `getZoneRuntimeState(id)`                                           | Return `{ zoneId, exists, active, visibleInViewport }`.                                                                                                                     |
| `updateNextFrame()`                                                 | Request a repaint.                                                                                                                                                          |
| `setIdle(boolean)`                                                  | Pause drawing and image requests while retaining loaded tiles and camera state.                                                                                             |
| `stop()`                                                            | Stop the animation loop and return a function that resumes it. Does not stop input controllers.                                                                             |
| `stopControllers()`, `startControllers()`                           | Stop or start input separately.                                                                                                                                             |
| `dispose()`                                                         | Permanently stop controllers and rendering, release renderer resources, and detach the runtime from its world. `viewer.destroy()` also cleans up the DOM and event manager. |

`runtimeOptions` accepts `maxOverZoom` (default `1`), `maxUnderZoom` (`1`), and `visibilityRatio` (`1`). `maxOverZoom` multiplies the native-resolution zoom limit of visible content. For example, `2` allows zooming to twice that limit. It does not add source detail. Use `runtime.setOptions(partialOptions)` to change constraints.

See [`Runtime`](src/renderer/runtime.ts) and [`TransitionManager`](src/modules/transition-manager/transition-manager.ts).

### Events and frame hooks

World objects support `addEventListener(name, callback)` and `removeEventListener(name, callback)` with names such as `'click'`, `'pointerdown'`, and `'mousemove'`. React scene elements accept the corresponding `onClick`, `onPointerDown`, and other props. Pointer events include `event.atlas = { x, y }` in world coordinates; copy those coordinates if you retain them beyond the callback.

For low-level listeners, register event names in `world.activatedEvents` where required by the browser event manager, for example `world.activatedEvents.push('onPointerDown')`. The React reconciler and `useWorldEvent()` do this for you. See [supported events](src/events.ts).

`runtime.registerHook(name, callback)` returns an unsubscribe function:

```js
const unsubscribe = viewer.runtime.registerHook('useAfterFrame', () => {
  const viewport = { ...viewer.runtime.getViewport() };
  // Update a position readout or synchronise another view.
});

// When the subscriber is no longer needed:
unsubscribe();
```

| Hook             | Called                                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| `useFrame`       | On each active animation tick, before deciding whether to paint. Receives elapsed milliseconds. |
| `useBeforeFrame` | Before a frame is painted. Receives elapsed milliseconds.                                       |
| `useAfterFrame`  | After a frame is painted. Receives elapsed milliseconds.                                        |
| `useAfterPaint`  | After an individual paint; receives its paint tuple.                                            |

`world.addLayoutSubscriber((type, data) => ...)` also returns an unsubscribe function. Layout notifications include `'ready'`, `'zone-changed'`, `'repaint'`, and `'recalculate-world-size'`. They are queued and normally flushed by the runtime.

Read `runtime.getReadyState()` for `{ ready, cycle, reason, timestamp }`. `resetReadyState()` starts another cycle. Subscribe before loading content if you need every notification; readiness may already have been reached when you attach a listener.

### Image loading and quality

For `atlas()`, pass these through `rendererOptions`. For `<Atlas>`, `imageLoading` and `onImageError` are direct props.

```js
const viewer = atlas(element, {
  rendererOptions: {
    crossOrigin: true,
    lruCache: true,
    imageLoading: { maxConcurrentRequests: 6, maxPrefetchPerFrame: 0 },
    onImageError: (event) => console.warn(event.imageUrl, event.willRetry),
  },
});
```

| Canvas option  | Purpose                                                                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dpi`          | Drawing pixels per CSS pixel. The helper defaults to the device pixel ratio; the raw renderer defaults to `1`.                                                                        |
| `crossOrigin`  | Use anonymous CORS requests. Needed for readable/exportable canvases with remote images; the server must permit the origin. Defaults to false.                                        |
| `lruCache`     | Bound the cache of decoded tile canvases. Defaults to false. Useful for long browsing sessions and multiple images.                                                                   |
| `readiness`    | `'first-meaningful-paint'` behaviour by default, or `'immediate'`. Readiness is a display milestone, not confirmation that every request succeeded.                                   |
| `onImageError` | Receive image/tile errors with `severity`, `renderer`, and, where available, `imageUrl`, `contentId`, `tileIndex`, `attempt`, `maxAttempts`, `willRetry`, `nextRetryAt`, and `error`. |
| `imageLoading` | Request concurrency, prefetch, timeout, retry, and reveal settings.                                                                                                                   |

`imageLoading` includes `maxConcurrentRequests`, `maxPrefetchPerFrame`, `timeoutMs`, `maxAttempts`, `baseDelayMs`, `maxDelayMs`, `jitterRatio`, `errorRetryIntervalMs`, `revealDelayFrames`, `revealBatchWindowFrames`, and `skipFadeIfLoadedWithinMs`. Concurrency and prefetch defaults adapt to the browser's reported connection and hardware. Lower prefetch to reduce speculative requests.

`CompositeResource` and React's `ImageService` / `TileSet` accept `renderOptions` for level selection and appearance:

| Option                                   | Default          | Purpose                                                    |
| ---------------------------------------- | ---------------- | ---------------------------------------------------------- |
| `quality`                                | `1.3`            | Bias resolution selection.                                 |
| `renderLayers`                           | `2`              | Number of image levels considered for rendering.           |
| `renderSmallestFallback`                 | `true`           | Keep a small image level available while detail loads.     |
| `layerPolicy`                            | `'always-blend'` | Also accepts `'fallback-only'` and `'active-only'`.        |
| `loadingBias`                            | `'balanced'`     | Also accepts `'speed'` and `'data'`.                       |
| `prefetchRadius`                         | `1`              | Tile prefetch radius around the view.                      |
| `fadeInMs`                               | `300`            | Fade duration; `0` disables fading.                        |
| `fadeFallbackTiles`, `fadeOnLayerChange` | `false`          | Extend fading to fallback tiles or changes of image level. |
| `useDevicePixelRatio`                    | `true`           | Account for screen density during level selection.         |
| `minSize`, `maxImageSize`                | `255`, `2048`    | Thresholds used when choosing image resources.             |
| `clipToBounds`                           | `false`          | Clip painting to the composite's bounds.                   |

`setIdle(true)` prevents new pixel requests and cancels pending ones without treating cancellation as a load error. On resume, Atlas requests what the current viewport needs. In React, `idle` does the same; `loadWhenVisible` opts into pausing offscreen viewers with `IntersectionObserver`.

See [loading configuration](src/modules/shared/image-loading-config.ts), [Canvas renderer options](src/modules/canvas-renderer/canvas-renderer.ts), and [composite options](src/spacial-content/composite-resource.ts).

### React components and hooks

| Component                                 | Purpose                                                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Atlas`                                   | Viewer with explicit numeric CSS `width` and `height`.                                                                                                  |
| `AtlasAuto`                               | Measured viewer with numeric or CSS string dimensions, optional `aspectRatio` and `resizeHash`.                                                         |
| `ImageService`                            | Load a service by `id`, with `width`, `height`, optional placement, `rotation`, `scale`, `crop`, `enableSizes`, `enableThumbnail`, and `renderOptions`. |
| `TileSet`                                 | Render an already loaded `GetTile` through its `tiles` prop. Also takes display dimensions, placement, crop, and render options.                        |
| `HTMLPortal`                              | Anchor HTML to a scene region using `target`. Requires the full root entry.                                                                             |
| `BoxDraw`, `RegionHighlight`              | Region drawing and highlighting helpers.                                                                                                                |
| `MapObject`, `MapTileLayer`, `MapGeoJSON` | Map projection context, tile layers, and GeoJSON content.                                                                                               |
| `DevTools`                                | Runtime diagnostics; use `<Atlas devTools />` for the built-in panel.                                                                                   |

Common `<Atlas>` props beyond dimensions:

| Props                                                                                         | Use                                                                                                                                                      |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `background`, `className`, `containerStyle`, `containerProps`, `overlayStyle`, `htmlChildren` | DOM appearance, attributes, and controls.                                                                                                                |
| `onCreated(preset)`, `onReady(event)`, `onImageError(event)`                                  | Runtime creation, rendering readiness, and pixel request errors.                                                                                         |
| `homePosition`, `homePaddingPx`, `homeCover`, `homeOnResize`                                  | Home fitting.                                                                                                                                            |
| `controllerConfig`, `interactionMode`                                                         | Input configuration; mode is `'popmotion'` by default or `'pdf-scroll-zone'`.                                                                            |
| `runtimeOptions`, `mode`                                                                      | Runtime constraints and viewer mode: `'explore'`, `'sketch'`, or `'static'`.                                                                             |
| `viewRotation`, `filters`                                                                     | Camera rotation and image appearance. Filter keys include `brightness`, `contrast`, `grayscale`, `hueRotate`, `invert`, `saturate`, `sepia`, and `blur`. |
| `idle`, `loadWhenVisible`, `imageLoading`                                                     | Rendering and image loading policy.                                                                                                                      |
| `enableNavigator`, `navigatorOptions`                                                         | Overview navigation, sizing, visibility, and styling.                                                                                                    |
| `readyResetKey`, `resourceTransitionKey`                                                      | Reset readiness or image transition state as your application changes resources.                                                                         |
| `resetWorldOnChange`                                                                          | Reset the world on scene changes; defaults to true.                                                                                                      |
| `renderPreset`                                                                                | Use a rendering preset, e.g. `['default-preset', { interactive: false }]` or `'static-preset'`.                                                          |
| `unstable_webglRenderer`, `onWebGLFallback`                                                   | Experimental WebGL path and fallback notification. Canvas 2D remains the default.                                                                        |

`onReady` receives `{ runtimeId, cycle, reason, renderer, timestamp }`. `onCreated` receives a preset containing `runtime`, `renderer`, and available DOM elements and controllers. The full prop definitions are in [`Atlas.tsx`](src/modules/react-reconciler/Atlas.tsx).

| Hook                                                                            | Returns / does                                                |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `useAtlas()`                                                                    | Current preset context.                                       |
| `useRuntime()`                                                                  | Current runtime, if available.                                |
| `useCanvas()`                                                                   | Current canvas element, if available.                         |
| `useMode()`                                                                     | Current scene mode.                                           |
| `useFrame(callback, deps?)`, `useBeforeFrame`, `useAfterFrame`, `useAfterPaint` | Subscribe to runtime hooks and clean up on unmount.           |
| `useWorldEvent(name, callback, deps?)`                                          | Subscribe to a world event.                                   |
| `useZoneRuntimeState(id)`                                                       | Zone existence, selection, and viewport visibility.           |
| `useMapProjection()`                                                            | Projection from the surrounding `MapObject`.                  |
| `useAtlasImage(scene, options)`                                                 | Render a scene to an image URI, with loading and error state. |

The `/react` entry is for applications integrating the reconciler themselves: create a preset, render with `ReactAtlas.render(scene, preset.runtime)`, and call `preset.unmount()` on cleanup. Wrap the scene in `AtlasContext.Provider` with that preset if it uses Atlas hooks. The simpler `atlas()` path does not invoke `ReactAtlas` at all.

### Renderers and other building blocks

`new Runtime(renderer, world, viewport, controllers?, options?)` connects a scene, a renderer, and optional input controllers. Its initial viewport also includes `scale: 1`; unlike the helper, it starts its animation loop immediately without managing DOM sizing or event-manager cleanup.

| Export                                                   | Role                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------- |
| `CanvasRenderer(canvas, options?)`                       | Canvas 2D rendering. Used by `atlas()`.                                     |
| `CompositeRenderer(renderers)`                           | Coordinate multiple renderers, such as canvas plus HTML overlays.           |
| `StaticRenderer(element, options?)`                      | DOM-based image rendering.                                                  |
| `OverlayRenderer(element, options?)`                     | HTML overlays for scene content.                                            |
| `WebGLRenderer(canvas, options?)`                        | Experimental GPU image rendering.                                           |
| `HomeNavigatorRenderer(canvas, options?)`                | Paint an overview of the scene.                                             |
| `BrowserEventManager(element, runtime)`                  | Translate browser input into scene events. Call `stop()` when disposing it. |
| `popmotionController(config?)`                           | Default pan, zoom, and touch controls.                                      |
| `pdfScrollZoneController(config?)`                       | Scrolling and navigation between authored zones.                            |
| `GridBuilder`                                            | Lay out content in rows or columns.                                         |
| `ImageTexture`                                           | Supply image content from a custom texture function.                        |
| `MapTiledImage`, `createMapProjection`, `resolveTileUrl` | Map tile content, geographic projection, and tile URL construction.         |

The standalone entry exports Canvas and Composite renderers, controllers, map utilities, image types, worlds, and runtime. Import the additional DOM, debug, and WebGL renderers from the root entry. For geographic layers, provide your own tile source and appropriate attribution; see the [map stories](stories/maps.stories.tsx) for usage.

## Troubleshooting

**The viewer is blank.** Check the container's computed height first. Then check the image or `info.json` request in the Network panel. An IIIF manifest URL is not an image service URL. A plain image also needs a non-zero target size and a parent world object.

**It looks blurry when zoomed in.** A `SingleImage` only has the pixels in that file. Use a tiled composite for a large image. Check source dimensions, composite quality settings, and DPI. If the host already supplies device-pixel sizes, avoid applying device pixel ratio a second time.

**Pointer positions are offset.** Coordinates passed to `viewerToWorld()` must be relative to the canvas, not the page. The helper refreshes event bounds on resize and scroll; call `viewer.resize()` after moving the viewer through another kind of layout change, such as a CSS transform.

**Exporting the canvas fails.** Remote images need CORS headers and `rendererOptions.crossOrigin: true` before loading. A server that permits viewing an image may still prevent JavaScript from reading its pixels.

**Requests continue after navigation.** Call `viewer.destroy()` in your framework's unmount cleanup. For temporary offscreen content, use `setIdle(true)` or React's `loadWhenVisible`. Metadata requests belong to the application or image-service component and are separate from renderer requests.

**React says an Atlas element is unknown.** Elements such as `<world-object>` must be rendered inside Atlas's scene reconciler. Put HTML buttons in the surrounding React DOM tree, `htmlChildren`, or `HTMLPortal`.

## Development

The interactive examples live in [`stories/`](stories). To run them locally:

```sh
pnpm install
pnpm storybook
```

The Vite server uses port 3010. Useful checks:

```sh
pnpm test --run       # Unit and integration tests
pnpm build           # ESM, CommonJS, and declarations
pnpm lint            # Package publishing checks (publint)
pnpm check:react      # Verify the React entry's dependency boundaries
```

For a focused run, pass a test file after `pnpm test --run`. When contributing a rendering or interaction change, add a small reproducible story and a regression test where possible. Please include the image service URL, browser, and steps to reproduce when [reporting a bug](https://github.com/atlas-viewer/atlas/issues); a minimal scene helps enormously.

## License

[MIT](LICENSE). Images and tiles shown in examples remain subject to their providers' terms.
