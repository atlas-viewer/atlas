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
