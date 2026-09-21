# View rotation

View rotation changes the camera, leaving world-object positions, sizes, and
object rotations unchanged. Canvas, WebGL, HTML overlays, pointer coordinates,
and tile selection use the same view rotation.

```tsx
const controllerConfig = { enableTouchRotation: true, touchRotationSnap: 90 };

<AtlasAuto controllerConfig={controllerConfig}>{/* scene */}</AtlasAuto>;
```

`enableTouchRotation` defaults to `false`. With it enabled, two fingers pan,
zoom, and rotate together around their midpoint. Lifting a finger or cancelling
ends the gesture and applies zoom/pan constraints. `touchRotationSnap` snaps the
angle on release to the nearest interval in degrees: `90` for right angles,
`15` for finer steps, or `0` (default) for free rotation. It accepts finite values
from 0 to 360. Cancellation does not snap. Snapping animates over 250 ms through the transition manager, keeping the
last touch midpoint anchored before settling bounds constraints. A new gesture
interrupts the animation at its current angle. `ignoreSingleFingerTouch`
continues to control whether single-finger movement scrolls the surrounding page.

```ts
runtime.viewRotation = 45; // absolute clockwise degrees, around the view center
runtime.rotateBy(15); // relative clockwise degrees
runtime.rotateBy(-30, runtime.viewerToWorld(viewerX, viewerY));
```

The optional pivot is a world-space point. `viewerX` and `viewerY` are CSS pixels
relative to the viewer. An optional `viewRotation` prop on `Atlas` / `AtlasAuto`
also sets the angle when that prop changes. Unrelated scene renders leave the
camera angle alone. Object `rotation` remains an independent scene property;
`rotateFromWorldCenter` is the older object-pivot behavior, not needed here.

Bounds constrain the viewport against the rotated world or active zone's extent
in view coordinates. This allows every image corner to remain reachable while
zoomed in. Empty background around diagonal edges is expected. Home fitting
includes the rotated content's full extent.

Try **View rotation → Pivot And Touch** (`pnpm storybook`). It includes arbitrary
pivot controls, a non-square image, clickable markers, a green HTML overlay,
constraint/home buttons, and a scene re-render check.

Additional stories: **Snap Right Angles** and **Snap Every 15 Degrees**.

Use the world control alongside `world.zoomIn()` and `world.zoomOut()`:

```ts
runtime.world.rotateBy(); // animate +90°
runtime.world.rotateBy(-90); // animate -90°
runtime.setTouchRotationEnabled(true);
runtime.setTouchRotationEnabled(false);
```

`world.rotateBy(degrees, point?, immediate?)` accepts an optional world-space
pivot. Repeated calls advance the pending rotation destination. Read
`runtime.touchRotationEnabled` for the current touch setting. Disabling interrupts
a running rotation transition and prevents further gesture rotation while retaining
pan/zoom and the current angle. Programmatic rotation remains available.
Enabling takes effect when the next two-finger gesture starts.
