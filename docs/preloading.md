# Canvas handoffs and intent preloading

Canvas2D resource changes keep the previous presentation on screen while the replacement is prepared offscreen. Call `runtime.resetReadyState()` before replacing a scene, or use the React `<Atlas readyResetKey={resourceId}>` property. The key must change when the displayed resource changes. Panning and zooming continue to draw directly.

The renderer now drains each queued draw batch completely and reuses decoded tile bitmaps by image URL and dimensions across scene objects. Its default bitmap cache retains up to 64 MiB of estimated RGBA memory; `lruCache: false` explicitly disables that retention. Cached bitmaps survive scene and map-window disposal within that budget; renderer reset releases them. With `lruCache: false`, bitmaps are released after their last scene consumer is disposed. One oversized bitmap may occupy the budget alone. A resource handoff does not use the initial-load progressive-reveal timeout. Failed image requests retain the existing error handling; this does not promise complete imagery when the provider fails.

## Preload an adjacent canvas

```ts
import { getImageServicePreloadUrls } from '@atlas-viewer/atlas';

const controller = new AbortController();
// Use a fully loaded ImageService (including width, height and tiles).
const urls = getImageServicePreloadUrls(service, { width: 1000, height: 800 });
await runtime.preloadImages(urls, { signal: controller.signal });
// Cancel superseded intent or when the owning viewer unmounts:
controller.abort();
```

The helper selects the fitted tile level and a coarsest fallback using the renderer's own URL generation. It skips levels exceeding the 16-URL budget. Services without tile metadata yield no URLs; direct images can be passed directly to `preloadImages`.

Preloading waits for image decoding, shares in-flight requests with visible consumers, and uses two workers per call. It keeps at most 16 decoded images and 8 MiPixels of source images per request pool, independently of normal tile caching. Aborting speculation releases its consumers without cancelling a request still needed by the visible scene. Resetting the pool clears speculative images and prevents late completions from repopulating it.

Theseus calls this API on pointer hover and keyboard focus of next/previous controls. It resolves the adjacent spread without navigating, cancels superseded intent and resource changes, and skips data-saver/2G connections. Applications should apply equivalent intent and network policies.

The API is forwarded by composite and WebGL renderers. The offscreen presentation handoff described above applies to Canvas2D; it is not a WebGL presentation guarantee.
