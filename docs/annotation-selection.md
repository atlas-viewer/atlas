# Selecting large annotation overlays

`WorldObject` caches a `BoxSelectionIndex` for its child layers. Scenes with at least 256 ordinary canvas boxes use a bounding-volume tree to select nearby boxes before collecting paint tuples. Results retain layer order, so overlapping translucent annotations keep their existing compositing behavior. Hit testing uses the same candidate index followed by the existing exact tests; transparent boxes remain interactive.

The tree indexes native `Box` instances with finite rectangular bounds. CSS/HTML/link boxes, shadows, subclasses and custom selection or scheduled-update implementations use the existing traversal path. Border and outline margins include base, hover and press styles, world/pixel scaling, and conservative padding for camera rotation. A node-local or descendant rotation uses the existing conservative paint selection instead of indexed box culling. Geometry remains on its existing path.

Layer insertion/removal, `Box.applyProps`, geometry transforms and the resize hook invalidate the cache. Public point strands remain mutable: queries compare indexed coordinate snapshots and rebuild after direct point edits. This compatibility check still reads every indexed box's four coordinates; the whole pipeline is **not** logarithmic. It avoids the much more expensive per-box transformations, paint allocations and rendering for offscreen boxes. Call `invalidateLayerSelection()` after manually replacing child layers in place or changing custom paint-footprint behavior. Use `applyProps` for style updates.

Native boxes also bypass recursive rotation/bounds and scheduled-update walks, where they have no work to contribute. Other objects and box subclasses retain those calls.

`World.getPointsAt` accepts an optional fifth argument, `{ includeAnnotations: false }`, forwarded through nested `WorldObject`s. It omits boxes and geometries. The home navigator uses this when `showAnnotations` is false, avoiding collecting annotation paints only to discard them later. Calls without this argument retain annotation rendering.

The canvas renderer also avoids repeat image-lookahead bookkeeping for the same owner and skips allocating merged style objects for boxes without active hover/press styles.

Tests in `src/__tests__/modules/box-selection-index.test.ts` cover ordering, translated/scaled parents, paint dispatch, exact transparent hits, paint margins, geometry changes, mutable points, removal/insertion, custom-object fallback and image-only nested traversal. Existing rotation/culling suites exercise the conservative fallback. A Theseus browser fixture additionally compares indexed/reference pixels at 0°, 45° and 90° and verifies an actual annotation click.

This optimizes selection and avoids offscreen drawing. It cannot make drawing thousands of simultaneously visible annotations free; zoomed-out scenes can still exceed a 16.7 ms frame budget.
