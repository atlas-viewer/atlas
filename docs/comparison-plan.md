# Native viewport comparison — architecture proposal

Status: implemented initial aligned-content comparison. See [the public API guide](comparison.md) and `stories/comparison.stories.tsx`. The API sketches below record the design; the guide documents the shipped behavior.

## Agreed scope

- Compare resources already aligned in one Atlas world.
- Keep the split relative to the viewport during pan, zoom, camera rotation, and resize.
- Support any divider angle, including diagonal.
- Clip side-specific annotations and HTML overlays, including their hit testing.
- Supply rendering primitives, a public API, and optional interaction helpers. The application owns controls and visual design.
- Validate with a draggable divider demo. Zone-to-zone coordinate mapping comes later.

The reference [VDiff.js documentation](https://codh.rois.ac.jp/software/vdiffjs/) describes swipe comparison, transparency, side-by-side display, registration by correspondence points, and computed difference views. This proposal covers the requested swipe interaction. Registration, image analysis, and computed differences are separate capabilities, not prerequisites for a split renderer.

## Recommendation

Introduce a small **viewport half-plane clip** primitive and a headless **comparison model** attached to a runtime. A comparison resolves two sets of scene content and assigns complementary clips. An optional DOM divider helper presents and manipulates the same geometry.

Use zones as an optional way to select members, without changing what a zone means. Do not model comparison by repeatedly selecting two active zones, changing resource crops, or creating two synchronized Atlas viewers.

### Why this fits the current implementation

| Existing seam | Consequence for comparison |
| --- | --- |
| `renderer/runtime.ts`, render loop | Already resolves a paint list and brackets each layer with `prepareLayer` / `finishLayer`. Carry clipping context through this path. |
| `renderer/renderer.ts` | The renderer interface provides a place for optional per-layer context; existing custom renderers need an explicit support contract. |
| `world-objects/paint.ts` | A paint currently holds content, points, and transform. Add optional per-occurrence context rather than putting comparison state on shared resources. |
| `world.ts`, `getPointsAt` / `getObjectsAt` | Active zones affect selection and apply outside-zone opacity. Comparison selection must be independent of that policy. |
| `world-objects/zone.ts` | Zones contain world objects and optional authored bounds; `Zone.getPointsAt()` is empty. They are not render passes or cameras. |
| `modules/canvas-renderer/canvas-renderer.ts` | Layer clipping exists for composite bounds; camera rotation is installed earlier in `beforeFrame`. A viewport clip needs a separate coordinate space. |
| `modules/webgl-renderer/webgl-renderer.ts` | Existing clipping uses scissor rectangles or shader bounds. An arbitrary screen-space line requires a shader half-plane test. |
| `modules/overlay-renderer/overlay-renderer.ts` | HTML hosts receive their own camera/content transforms. Put a viewport clip outside those transforms. |
| `modules/composite-renderer/composite-renderer.ts` | The same resolved context must reach every participating renderer, including the Canvas parity layer used with WebGL. |
| `modules/browser-event-manager/browser-event-manager.ts`, `world.ts` | Browser coordinates are converted to world coordinates, then objects are hit tested. Side eligibility must be applied before dispatch and before hover/drag target bookkeeping. |
| `modules/react-reconciler/reconciler.ts`, `types.ts` | Zones already have a host wrapper. A comparison React component can bind the core model without introducing another scene tree or renderer. |
| `atlas.ts`, `index.ts`, `standalone.ts` | The core API and DOM helper must work without React, with corresponding exports. |

These are source observations; the design below is proposed behavior.

## 1. Geometry primitive

Public split state:

```ts
type ComparisonSplit = {
  angle: number;    // Clockwise degrees of the NORMAL, in viewer CSS coordinates.
  position: number; // 0..1 along the viewport's projected extent on that normal.
};
```

For viewport size `W × H`, let `n = (cos(angle), sin(angle))`. Project all four viewport corners onto `n`; call the minimum and maximum `lo` and `hi`. The divider is:

```text
d = lo + position * (hi - lo)
first side:  dot(n, viewerPoint) < d
second side: dot(n, viewerPoint) >= d
```

This gives a vertical divider at 0°, horizontal at 90°, and a centered line at position 0.5 for every angle and aspect ratio. Position 0 or 1 fully conceals one side; angle is normalized to [0, 360). Inputs must be finite; clamp interactive positions to [0, 1]. Recompute projected extents on resize.

Expose pure helpers for: resolving the line, clipping the viewport rectangle into its two polygons, obtaining line endpoints, classifying a viewer point, and projecting a dragged point back to a position. Use the same resolved geometry for rendering, interaction, and the divider. Do not rotate the divider with the camera.

Internally use a named `ViewportHalfPlaneClip` or equivalent, with CSS pixels and explicit side polarity. Only this shape is required initially; a general mask language is unnecessary.

## 2. Membership and scene composition

Proposed targets:

```ts
type ComparisonTarget =
  | { objects: readonly WorldObject[] }
  | { zoneId: string };
```

- Targets identify world-object subtrees, so their images, tiled composites, annotations, text, and HTML hosts inherit the side.
- Two zones may overlap spatially. Their world-space rectangles do not define the split.
- Zone targets mean current zone membership, not “activate this zone.” Bounds and margins remain navigation data.
- Content in neither target remains shared scene content, in its existing painter order. Content in both targets is shared and painted once because the first version has one common coordinate system.
- Comparison does not mutate geometry, source crops, zone membership, or the selected navigation zone.
- Resolve membership changes on scene commits. Removed objects stop participating; a missing zone resolves to an empty side. Surface unresolved targets through debug diagnostics.
- While comparison is enabled, selected members must remain available on both sides even if active-zone filtering would ordinarily omit or dim them. Apply the same exception to scheduling and event eligibility. Navigation bounds may still use the active zone.
- Side clips are complementary even for transparent or missing images: an unloaded side shows the viewer background/shared layers underneath, never the other comparison side.

Keep per-frame/per-layer context separate from `SpacialContent.__host`, `__owner`, and cached tile objects. This matters for a world shown by more than one runtime and for later zone mapping.

For a later zone-mapping feature, add a per-side source rectangle and transform into a common comparison coordinate system. That will also need inverse event transforms, source-space tile selection, and per-occurrence HTML host identity. Do not add those transforms to the initial API before their semantics are designed.

## 3. Rendering contract

Extend paint entries with optional context and pass it as an optional third argument to `prepareLayer`. Proposed context contains a resolved viewport clip; it need not mention comparison. Existing paint entries remain valid. Forward context through CompositeRenderer and the WebGL parity Canvas path.

The context must be established during scene traversal, where target membership is known, rather than inferred from mutable flags on a resource. Resolve one immutable split snapshot for the entire frame.

| Backend | Implementation |
| --- | --- |
| Canvas 2D | Save layer state, install the polygon in viewport coordinates, restore the previous drawing transform without removing the clip, then apply existing object transforms and composite crop clipping. Restore all layer state at finish. Respect the renderer's existing DPI convention. |
| WebGL | Add a screen-space half-plane uniform/test in the fragment shader, intersected with existing crop/scissor logic. Convert framebuffer coordinates, Y direction, and DPI explicitly. Scissor alone cannot represent diagonals. |
| HTML overlay / StaticRenderer | Add an untransformed viewport-sized clipping wrapper around a host's existing transformed element. Use `clip-path: polygon(...)` from shared geometry and retain painter order. Per-host wrappers avoid forcing all shared overlays above or below every side overlay. |
| Navigator | Keep the normal overview initially; it is a separate viewport and must not inherit the main viewer's CSS-pixel line. |
| Custom/debug renderers | Advertise clip support or fail clearly when comparison is enabled. Do not silently present an unclipped image as a comparison. |

Canvas and WebGL fragments must use the same line equation to avoid a diagonal gap or double edge. Test rasterization at fractional coordinates; decide boundary coverage once, rather than independently rounding each side.

Retain current full-viewport tile selection and loading initially, which keeps tiles warm when the divider moves. Both resources can therefore load their full visible viewport. Preserve request budgets, cancellation, readiness, idle behavior, fades, and error reporting. Clip-aware tile selection can be a later optimization after measurement; divider motion must not reset image readiness or flush caches.

## 4. Input and overlays

Apply the side predicate to all existing pointer/touch target queries, including BrowserEventManager's direct queries used for hover and drag. The predicate receives viewer CSS coordinates; camera inverse transforms continue to supply world coordinates for resource hit testing. A DOM-only mask is insufficient for canvas annotations.

- Classify the viewer point first, filter candidate subtrees by side, then preserve the existing event propagation order among eligible candidates.
- The second side owns exact divider-boundary hits; the optional divider helper gets priority within its wider hit region.
- Shared content keeps normal event behavior. Background input continues to reach the pan/zoom controller.
- Ordinary hover and click hit testing follows visible geometry. Reconcile enter/leave when the divider moves under a stationary pointer, even when the camera does not move.
- An established scene drag retains its original target until release/cancel, to preserve existing drag semantics. Divider drag captures its pointer and is isolated from scene dragging.
- DOM clipping must prevent mouse/touch activation outside the visible polygon. Reevaluate focusability for fully concealed hosts; clipping alone does not remove tab stops. If focus becomes fully hidden, move it to the divider or viewer rather than leaving it invisible.
- Keep the interaction helper as a sibling over the canvas, with no full-viewport input shield. Prevent its pointer and compatibility mouse/touch starts from initiating Atlas pan/zoom; retain normal wheel navigation outside its interaction region.

## 5. Public API sketch

Names below are proposals, not existing exports.

```ts
const comparison = createComparison(runtime, {
  first: { objects: [beforeObject] },
  second: { objects: [afterObject] },
  split: { angle: 0, position: 0.5 },
});

comparison.setSplit({ angle: 35, position: 0.6 });
comparison.setTargets({ first: { zoneId: 'before' }, second: { zoneId: 'after' } });
comparison.setEnabled(false);
comparison.getState(); // A snapshot; callers cannot mutate internal state.
comparison.addEventListener('change', onChange);
comparison.destroy();
```

One active comparison per runtime initially; attempting to attach another fails clearly. State changes invalidate the runtime without requiring a React render per pointer move. `destroy()` removes clipping, listeners, and the runtime attachment, and requests repaint. Runtime destruction also tears down attached helpers.

The model has no DOM requirement. Provide typed change subscriptions through a small EventTarget-compatible surface, with immutable event detail. A DOM helper can emit actual `CustomEvent`s on its element.

React gets a scene declaration, a DOM divider component, and subscription hooks, all using this same core model. The proposed contract is detailed below.

### React and reconciler API

Use the existing `<zone>` composition for declarative side membership. A nonvisual `<Comparison>` scene component selects those zones; its ref exposes the core controller. This avoids collecting object refs in user effects or introducing a second kind of grouping element just for comparison.

```tsx
function ComparisonExample() {
  const [comparison, setComparison] = React.useState<ComparisonController | null>(null);

  return (
    <AtlasAuto
      width="100%"
      height={600}
      htmlChildren={
        <ComparisonDivider
          comparison={comparison}
          aria-label="Compare before and after"
          className="my-divider"
        />
      }
    >
      <Comparison
        ref={setComparison}
        first={{ zoneId: 'before' }}
        second={{ zoneId: 'after' }}
        defaultSplit={{ angle: 35, position: 0.5 }}
        onSplitCommit={(split) => console.log('Save comparison position', split)}
      />

      <zone id="before" x={0} y={0} width={1000} height={1000}>
        <world-object id="before-image" width={1000} height={1000}>
          <world-image
            uri="/before.jpg"
            target={{ x: 0, y: 0, width: 1000, height: 1000 }}
            display={{ width: 1000, height: 1000 }}
          />
          {/* Side-specific boxes, annotations, and HTMLPortal content. */}
        </world-object>
      </zone>

      <zone id="after" x={0} y={0} width={1000} height={1000}>
        <world-object id="after-image" width={1000} height={1000}>
          <world-image
            uri="/after.jpg"
            target={{ x: 0, y: 0, width: 1000, height: 1000 }}
            display={{ width: 1000, height: 1000 }}
          />
        </world-object>
      </zone>
    </AtlasAuto>
  );
}
```

This is proposed example code, not runnable against today's exports. `ComparisonController` names the controller returned by `createComparison`; it is not a separate React implementation. The ref callback shares that controller with the DOM tree. It receives `null` on detach. `ComparisonDivider` accepts `null` and renders nothing until attached. It measures its viewport-sized DOM root within AtlasAuto's positioned container, delegates behavior to the package's divider helper, and forwards its ref to the real handle element. It must not add another full-viewport input target.

The split stays inside the controller during uncontrolled dragging, so this example does not rerender its scene for every pointer move. An application that wants React to own the state can use:

```tsx
const [split, setSplit] = React.useState({ angle: 0, position: 0.5 });

<Comparison
  first={{ zoneId: 'before' }}
  second={{ zoneId: 'after' }}
  split={split}
  onSplitChange={setSplit}
  onSplitCommit={saveSplit}
/>
```

Proposed scene props:

| Prop | Contract |
| --- | --- |
| `first`, `second` | Existing `ComparisonTarget` values: zone selectors or object lists. React examples prefer zone selectors because they survive child remounts without ref bookkeeping. |
| `enabled` | Defaults to true; disabling removes comparison clipping and divider interaction without unmounting the resources. |
| `defaultSplit` | Initial uncontrolled state, defaulting to `{ angle: 0, position: 0.5 }`. Subsequent changes do not reset a user's drag. |
| `split` | Controlled state; cannot be supplied with `defaultSplit`. Interaction emits requests, and accepted prop updates determine the rendered split. |
| `onSplitChange(split, detail)` | Interaction/change request, with source information. Called in uncontrolled mode too; application prop synchronization does not echo another request. |
| `onSplitCommit(split, detail)` | Successful pointer release or keyboard action. Cancellation emits no commit; controlled mode reports the last accepted split. |
| `ref` | The attached core controller, for imperative controls or a sibling DOM divider. |

Both the DOM helper and imperative `setSplit` go through the controller's same ownership policy. In controlled mode they request changes; they cannot silently override `split`. In uncontrolled mode the controller applies them directly. Pointer cancellation requests restoration of the starting split through that same path. Latest callbacks are used without destroying and recreating the controller. Changing between controlled and uncontrolled mode while mounted is unsupported and should produce a development diagnostic.

**Reconciler implementation:** expose a nonvisual `<comparison>` intrinsic with these props and have `<Comparison>` forward to it. A small `ComparisonHostInstance`, following the existing zone host pattern, attaches the core controller during commit and exposes it through `getPublicInstance`. It is a runtime attachment, not a WorldObject: it contributes no bounds, tiles, navigation zone, or painted layer. Initially allow it only directly under the scene root/world; targets remain sibling scene content and the declaration takes no children.

Handle append, insert, remove, hide/unhide, root clearing, runtime replacement, and prop updates explicitly. Allocation during `createInstance` must not attach listeners or mutate the runtime; discarded renders must have no visible effect. Publish target membership after the complete scene commit, so declaration order relative to zone siblings is irrelevant. Register/unregister/ref callbacks must be safe under Strict Mode and remounts, and cleanup must never destroy a newer replacement controller. Hiding a declaration disables its attachment and divider interaction; showing it restores the current configured state.

**Hooks:** provide `useComparison()` for scene components to find the current runtime's attached controller, and `useComparisonState(controller)` for controls that need reactive snapshots. The former must subscribe to attachment/replacement rather than reading a one-time runtime field. The latter accepts `null`, uses stable snapshots, and supports the React versions Atlas supports. Outside the Atlas scene context, pass the controller explicitly, as in the divider example: the DOM tree and Atlas reconciler tree do not implicitly share newly created context providers.

`ComparisonDivider` is a React DOM component and must be used in `htmlChildren` or the surrounding DOM tree. Its forwarded DOM ref supports ordinary browser listeners; React callback props such as `onSplitChange` and `onSplitCommit` adapt the helper's custom events explicitly. Do not rely on React automatically recognizing arbitrary custom event names. Implementors can omit it and build controls using the controller and pure geometry helpers.

Export the scene component, divider, hooks, controller types, and JSX intrinsic types through the React entry and existing root reexports. Keep the standalone/core entry free of React and ReactDOM imports. The React component must not introduce a new ReactDOM root; it uses the application's existing DOM tree.

## 6. Divider abstraction and styling

Prefer a headless model plus an optional **real DOM handle**, rather than a new world-space virtual object. Existing Atlas box/HTMLPortal geometry is world-relative; a screen-fixed divider would need its own special coordinate system and event treatment anyway. A scene-only virtual target also cannot provide browser focus, native pointer capture, or CSS by itself.

Proposed helper:

```ts
const divider = createComparisonDivider(comparison, {
  container: viewerElement, // A positioned wrapper around the viewer canvas.
  label: 'Compare before and after',
});

divider.element.classList.add('my-comparison-divider');
divider.element.addEventListener('comparisoninput', event => {
  // detail: { split, source: 'pointer' | 'keyboard' }
});
divider.element.addEventListener('comparisoncommit', persistSplit);
divider.destroy();
```

The helper supplies only positioning, pointer capture, keyboard behavior, lifecycle, and accessible state. Default decoration can be minimal and replaceable. Expose the element, stable classes/data attributes for line and grip, and CSS variables for line width, hit width, and color. Use a transparent, wider hit area around the thin visible line. Outside that band, input passes through to Atlas.

Also allow binding an implementor-supplied handle element to the same interaction behavior. Pure line/endpoints helpers support completely custom rendering without installing the DOM helper.

Pointer drag changes position along the normal and preserves angle. Angle controls belong to the implementor; the demo supplies one. Keep the grip at the midpoint of the visible line segment, including at steep angles. Use `role="slider"`, an application-provided accessible label, position 0–100, arrow/Shift+arrow increments, Home/End, and explicit `aria-valuetext` including angle. A diagonal line has no matching ARIA orientation value; do not invent one. Release or cancellation always ends capture; cancellation restores the drag-start split and does not emit commit.

## 7. Demo plan

Add a Storylite comparison story using two distinguishable local images or deterministic textures so it remains testable without external services. Each side includes a canvas annotation and a clickable HTMLPortal, with counters proving that concealed targets cannot receive clicks. Include a tiled IIIF variant using existing image-service components.

Application-owned controls:

- Position slider, angle slider, 0°/90°/45° presets, swap targets, enable/disable.
- Camera rotation, pan/zoom, and resizable viewer.
- Shared overlay plus side-specific text and annotations.
- Toggle Canvas / experimental WebGL, exercising the parity layer.
- A zone-target variant with overlapping authored zones and no active-zone switching.

Include a short standalone example alongside the React story: attach comparison to `viewer.runtime`, create the DOM divider, add ordinary browser listeners, style it with application CSS, and dispose it before `viewer.destroy()`. The React story uses the declarative zone/Comparison API and a sibling ComparisonDivider, with controlled and uncontrolled variants. Both examples must use exported package APIs. No toolbar, alignment editor, or registration workflow is added to Atlas.

## 8. Implementation sequence and acceptance

1. **Geometry and headless model.** Implement projection, polygons, target resolution, invalidation, snapshots, events, and cleanup. Test endpoints, negative normals, non-square viewports, finite-input handling, and resize.
2. **Canvas and layer context.** Thread context through paint collection, Runtime, Renderer, and CompositeRenderer; intersect with existing crop/rotation behavior. Verify default rendering remains unchanged when comparison is absent.
3. **Events and HTML.** Add side eligibility to every pointer/touch query, clipped host wrappers, hidden-focus handling, and stationary-pointer hover reconciliation. Keep shared content and scene drags working.
4. **WebGL and remaining renderers.** Implement shader clipping, Canvas parity forwarding, StaticRenderer behavior, renderer capability checks, and explicit navigator policy.
5. **Optional divider and public bindings.** Add custom-element binding, DOM helper, keyboard support, teardown, ComparisonHostInstance and JSX typing, Comparison/ComparisonDivider components, subscription hooks, root/standalone/React exports, and API documentation.
6. **Demo and verification.** Exercise the real story in a browser, then run focused regression tests, build/declaration generation, package lint, and React dependency-boundary checks. The browser exercise is future implementation work; this investigation has not run it.

Acceptance scenarios:

- At 0°, 90°, 35°, and 215°, only the correct resource and its overlays appear on each side. Position 0/1 fully reveals one resource.
- Camera rotation and object rotation never rotate the viewport divider. Existing resource crops remain effective.
- Resizing a non-square viewer and changing DPI preserve normalized position and align Canvas, WebGL, HTML, and pointer classification.
- Transparent/missing pixels and failed image loads do not expose the opposite comparison source.
- Concealed canvas/DOM targets do not click or hover; moving the divider updates hover without moving the pointer.
- Dragging the divider outside the viewer continues until release; cancel, unmount, disable, and destroy leave no capture, listeners, stale clipping, or broken pan/zoom.
- Keyboard-only users can focus and move the divider; fully concealed overlays do not retain invisible focus.
- Active-zone filtering does not hide the other comparison target; zone changes and member removal update rendering and hit testing together.
- Pointer motion requests repaint without recreating resources, resetting fades, or rebuilding React trees. Existing tile request limits remain respected.
- React controlled updates never echo change requests; uncontrolled scene rerenders preserve the user's split. Controlled cancellation follows prop ownership, and completion callbacks report accepted state.
- Conditional React children, reordered zones, Strict Mode remounts, hiding/showing the declaration, and runtime replacement keep membership and controller/DOM refs correct without duplicate attachments or leaked listeners.
- A React DOM divider receives the same controller as the scene declaration and exposes a real DOM ref. Core/standalone package exports retain their React dependency boundaries.
- No-comparison rendering and input remain compatible, including custom renderers that have not opted into clipping.

## Remaining decisions

Recommended defaults: one comparison per runtime, unselected objects shared, full-viewport loading on both sides, normal navigator, drag changes position only, and a DOM helper rather than a new scene intrinsic divider.

Confirm whether those composition defaults match intended usage. In particular, shared annotations preserve existing painter order; applications wanting an annotation on only one side must place it in that target's subtree.

Also confirm whether the optional divider helper should include a minimal visible line/grip by default, or require implementor styling from the outset. In either case, hit area, geometry, accessible behavior, and custom styling hooks ship in the package.
