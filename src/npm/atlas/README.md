# Core

This will be published as 2.0 of `@atlas-viewer/atlas`

- Browser event manager
- Renderers
  - Canvas renderer
  - WebGL Renderer
  - Composite renderer
  - Static renderer
  - Overlay renderer
- Default controller
- Internal
  - World
  - Runtime
  - Transition manager
- Objects
  - WorldObject (div of atlas)
  - Zone
  - Box
  - Text
  - Image
  - CompositeResource
  - ImageTexture
  - TiledImage

## Wrapper Zones

You can declare zones as wrappers and Atlas will automatically register direct `world-object` children to that zone.
Zone bounds are explicitly authored through `x`, `y`, `width`, and `height`:

```tsx
<Atlas width={1000} height={700} interactionMode="pdf-scroll-zone">
  <zone id="page-1" x={0} y={0} width={1200} height={1600} margin={0}>
    <world-object id="page-1-object" width={1200} height={1600} x={0} y={0}>
      <box target={{ x: 0, y: 0, width: 1200, height: 1600 }} style={{ background: '#fff' }} />
    </world-object>
  </zone>
</Atlas>
```

Only direct `world-object` children are zone members.

## Programmatic Zone Navigation

Use `runtime.goToZone(id)` to select and fit a zone:

```tsx
runtime.goToZone('page-1');
runtime.goToZone('page-2', {
  paddingPx: { top: 24, right: 24, bottom: 24, left: 24 },
  immediate: false,
});
```

The method returns `true` when the zone exists, otherwise `false`.

Zoom limits account for the source resolution of visible images and the scale of their world objects.
A 1000px image displayed across 100 world units allows a scale of 10. `runtimeOptions.maxOverZoom`
multiplies that native-resolution limit; it defaults to 1. Tiled composites use their full resolution,
including while only a thumbnail is available.

## Pausing image loading

`Atlas` and `AtlasAuto` accept two optional props:

```tsx
<Atlas width={700} height={420} loadWhenVisible idle={paused}>
  <ImageService id={imageServiceId} width={4093} height={2743} />
</Atlas>
```

`loadWhenVisible` uses `IntersectionObserver` to keep offscreen viewers idle, including before their first image
request. It defaults to `false`; browsers without `IntersectionObserver` retain normal loading behavior.
`idle={true}` pauses the viewer regardless of visibility. Changing either prop does not remount the viewer.
Outside React, use `runtime.setIdle(true)` and `runtime.setIdle(false)`.

Idle pauses rendering, prevents new image requests, and cancels pending image loads without treating cancellation
as an error or consuming retries. Resuming requests the tiles needed for the current viewport. Already loaded
tiles remain available; unmount viewers to release those canvases. IIIF metadata requests such as `info.json`,
and requests managed by application components, are not controlled by renderer idle state.

The **Image loading / Idle viewers** stories include 60 viewers, visibility and manual pause controls,
unmount/remount controls, and live request and tile counts. Use network throttling to inspect cancellation.
