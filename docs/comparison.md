# Viewport comparison

Atlas can reveal two aligned sets of world objects on opposite sides of a viewport-relative divider. The divider can have any angle and stays fixed in the viewer while the scene pans, zooms, rotates, or flips. Side-specific images, annotations, and HTML overlays use matching clipping and hit testing.

## React

Declare a comparison inside the Atlas scene and put its optional divider in the DOM tree. Zones identify member world objects; their rectangles do not determine the split or move content into alignment.

```tsx
import React from 'react';
import { AtlasAuto, Comparison, ComparisonDivider } from '@atlas-viewer/atlas/react';
import type { ComparisonController } from '@atlas-viewer/atlas/react';

function Viewer() {
  const [comparison, setComparison] = React.useState<ComparisonController | null>(null);
  return (
    <AtlasAuto width="100%" height={600}
      containerProps={{ style: { position: 'relative' } }}
      htmlChildren={<ComparisonDivider comparison={comparison}
        aria-label="Compare before and after" className="my-divider" />}>
      <Comparison ref={setComparison}
        first={{ zoneId: 'before' }} second={{ zoneId: 'after' }}
        defaultSplit={{ angle: 35, position: 0.5 }} />
      <zone id="before" x={0} y={0} width={1000} height={600}>
        <world-object width={1000} height={600}>
          <world-image uri="/before.jpg"
            target={{ x: 0, y: 0, width: 1000, height: 600 }}
            display={{ width: 1000, height: 600 }} />
        </world-object>
      </zone>
      <zone id="after" x={0} y={0} width={1000} height={600}>
        <world-object width={1000} height={600}>
          <world-image uri="/after.jpg"
            target={{ x: 0, y: 0, width: 1000, height: 600 }}
            display={{ width: 1000, height: 600 }} />
        </world-object>
      </zone>
    </AtlasAuto>
  );
}
```

Annotations and `HTMLPortal` elements inside each member's world object inherit its side. Give interactive HTMLPortal content the `interactive` prop as usual. Objects outside both targets remain shared content in their normal drawing order; objects in both targets are shared as well.

`Comparison` wraps a nonvisual `<comparison>` reconciler intrinsic. Put it directly under the scene root or `<world>`, without children. One comparison can attach to each runtime. The ref exposes the core controller; it becomes null on unmount. Declaration order relative to the zones does not matter.

`defaultSplit` initializes uncontrolled state. Dragging then updates the controller without a React render per move. For controlled state, supply `split` and accept requests through `onSplitChange`:

```tsx
const [split, setSplit] = React.useState({ angle: 0, position: 0.5 });

<Comparison first={{ zoneId: 'before' }} second={{ zoneId: 'after' }}
  split={split} onSplitChange={setSplit} onSplitCommit={saveSplit} />;
```

`onSplitChange(split, { source })` reports a request from `pointer`, `keyboard`, or `api`. In controlled mode, only accepted prop updates change the rendered split, including requests from imperative `setSplit`. `onSplitCommit` reports successful release/keyboard actions and the accepted split. Prop updates do not echo another change request. Use either `split` or `defaultSplit`; ownership cannot change while mounted. `enabled={false}` temporarily removes the comparison mask and hides the divider.

`useComparison()` finds the attached controller within the Atlas scene context. `useComparisonState(controller)` subscribes to snapshots for a readout or custom controls and accepts null. A DOM sibling receives the controller explicitly because it belongs to a different React tree from the Atlas scene.

`ComparisonDivider` is a React DOM component. Its ref is the actual handle element. It adapts helper events to optional `onSplitChange` / `onSplitCommit` props. Its `className` and `style` apply to its viewport-sized, noninteractive wrapper. The descendant handle receives focus and pointer input.

## Standalone / core

The core entry has no React dependency. With two world objects already placed in the same world:

```ts
import { createComparison, createComparisonDivider } from '@atlas-viewer/atlas/standalone';

const comparison = createComparison(viewer.runtime, {
  first: { objects: [beforeObject] }, second: { objects: [afterObject] },
  defaultSplit: { angle: 0, position: 0.5 },
});
const divider = createComparisonDivider(comparison, {
  container: viewerContainer, // positioned wrapper matching the canvas's CSS bounds
  label: 'Compare before and after',
});
divider.element.addEventListener('comparisoncommit', event => {
  // CustomEvent.detail contains { split, source }.
});
comparison.setSplit({ angle: 45, position: 0.6 });
comparison.setTargets({ first: { zoneId: 'before' }, second: { zoneId: 'after' } });
comparison.setEnabled(false);

// Remove masks, helper nodes, and listeners. viewer.destroy() also cleans up.
divider.destroy();
comparison.destroy();
```

For imperative applications, `defaultSplit` is normally the right initial option. Supplying `split` opts into controlled ownership and requires `onSplitChange` plus `updateOptions` to accept requests.

`getState()` returns an immutable snapshot. `subscribe(callback)` returns an unsubscribe function. The controller also offers `addEventListener` / `removeEventListener` for `change`, `commit`, and `destroy`; these are lightweight model notifications, not DOM events. `change` means the configuration or accepted state changed. `commit` is an interaction completion. `destroy` is emitted after detaching. The DOM helper emits bubbling `comparisoninput` and `comparisoncommit` CustomEvents on its real element.

## Divider behavior and styling

Drag moves position along the divider normal and preserves angle. Pointer capture continues the drag outside the viewer; cancellation requests the starting split and does not commit. Keyboard arrows move by 1%, Shift+arrow by 10%, and Home/End reveal one whole side. The handle has slider semantics and announces position and angle.

The helper includes a minimal line/grip and a wider transparent hit area. Style them with:

```css
.my-divider {
  --atlas-divider-color: #333;
  --atlas-divider-line-width: 2px;
  --atlas-divider-hit-width: 28px;
}
.my-divider .atlas-comparison-divider:focus-visible {
  outline: 2px solid darkorange;
}
.my-divider .atlas-comparison-divider-grip {
  border-radius: 0;
}
```

Standalone users can set these variables on the container or `divider.element`. To bind existing markup, pass `element` to `createComparisonDivider`; the helper restores the attributes it owns on cleanup. For completely custom visuals, use the exported pure geometry helpers instead of the DOM helper.

## Geometry and renderers

`angle` is the clockwise angle of the divider's **normal**, in CSS viewer coordinates: 0° means a vertical divider, 90° means horizontal. `position` runs from 0 to 1 along the viewport's projection on that normal. Position 0.5 passes through the viewport center at every angle and aspect ratio. The first side is below the line's projection; the second side owns exact-boundary hits. Finite angles are normalized; positions are clamped.

`resolveComparisonLine`, `resolveComparisonClip`, `comparisonLineEndpoints`, `comparisonPositionAtPoint`, and `comparisonSideAtPoint` share the geometry used by the renderers and input filter. `clipPolygonCss` converts a clip polygon for DOM use.

The renderer interface accepts an optional `LayerContext` in `prepareLayer` and `PaintSelectionOptions` in `getPointsAt`. Supporting custom renderers must forward the selection options, consume `Paint`'s optional fourth context entry, and advertise `supportsViewportClip = true`. Atlas rejects attachment to unsupported renderers. Canvas, WebGL (including the parity Canvas), HTML overlays, and StaticRenderer support clipping. The navigator remains an independent normal overview. DebugRenderer does not opt in.

Both sides retain full-viewport tile loading so divider motion reuses warm caches. Unloaded or transparent pixels never reveal the opposite comparison resource. Existing active-zone navigation bounds remain available; comparison members are exempt from its exclusion/dimming policy. Camera/object transforms and existing source crop clips remain independent of the split. Established scene drags retain their targets until release, while normal hover/click eligibility follows the visible side.

Content must already be aligned. Zone rectangle mapping, registration, computed difference images, multiple simultaneous comparisons, and clip-aware request reduction are outside this first version.

## Examples

Run `pnpm storybook` and open **Comparison → Uncontrolled**, **Controlled**, **Tiled Zones**, or **Standalone**. The first two use deterministic local SVG resources, clickable canvas markers, interactive HTMLPortal buttons, a shared overlay, camera rotation, side swapping, resize, and a Canvas/WebGL toggle. The tiled example uses a remote IIIF service.
