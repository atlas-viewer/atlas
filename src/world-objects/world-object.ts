import { Paint, Paintable } from './paint';
import { AbstractObject } from './abstract-object';
import {
  Strand,
  dna,
  compose,
  getIntersection,
  scale,
  transform,
  translate,
  hidePointsOutsideRegion,
} from '@atlas-viewer/dna';
import { BaseObject } from '../objects/base-object';
import { SpacialContent } from '../spacial-content';
import { Geometry } from '../objects/geometry';

function rotate(cx: number, cy: number, x: number, y: number, angle: number) {
  const radians = (Math.PI / 180) * angle,
    cos = Math.cos(radians),
    sin = Math.sin(radians),
    nx = cos * (x - cx) + sin * (y - cy) + cx,
    ny = cos * (y - cy) - sin * (x - cx) + cy;
  return [nx, ny];
}

/**
 * Borrowing logic for rotating a point around the center axis: https://danceswithcode.net/engineeringnotes/rotations_in_2d/rotations_in_2d.html
 * @param x 
 * @param y 
 * @param cx 
 * @param cy 
 * @param angleDegree 
 * @returns 
 */
export function rotatePoint(
  x: number,     //X coords to rotate - replaced on return
  y: number,     //Y coords to rotate - replaced on return
  cx: number,      //X coordinate of center of rotation
  cy:number,      //Y coordinate of center of rotation
  angleDegree: number)   //Angle of rotation (radians, counterclockwise)
{
  const radians = (Math.PI * angleDegree)/ 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const nX = ((x-cx)*cos - (y-cy)*sin) + cx;  
  const nY = ((x - cx) * sin + (y - cy) * cos) + cy;
  
  return [nX, nY];
}

/**
 * True for a region that can never select anything, in either of the two
 * shapes getIntersection produces for "these boxes don't overlap":
 *
 *  - flagged empty (strand[0] === 0) with its coordinates zeroed out, when
 *    the boxes miss each other entirely; and
 *  - flagged *present* but collapsed to zero (or negative) width/height,
 *    when they merely touch along an edge -- getIntersection's own overlap
 *    test is inclusive (`<=` / `>=`), so an edge-touch counts as an
 *    intersection and yields a degenerate box.
 *
 * Both mean the same thing to every consumer downstream --
 * hidePointsOutsideRegion's own comparisons are strict, so neither selects
 * a single point -- and both must be treated as terminal rather than fed
 * back into geometry that assumes a real rectangle.
 */
function isEmptyRegion(region: Strand) {
  return region[0] === 0 || region[3] <= region[1] || region[4] <= region[2];
}

type WorldObjectProps = {
  id: string;
  width: number;
  height: number;
  scale?: number;
  x?: number;
  y?: number;
  rotation?: number;
};

export type TileSelectionDebugEvent = {
  ownerId: string;
  rotation: number;
  /** The target actually used by getAllPointsAt to select content -- see its comment for why this is intentionally unrotated. */
  rawTarget: Strand;
  /**
   * applyRotation(rawTarget) -- the same rotation-aware bounding target
   * already used (and tested) for culling in getObjectsAt. NOT necessarily
   * the "correct" target for content/tile selection (that's an open
   * question -- see world-object-rotated-tile-selection.test.ts), just the
   * one candidate reference already trusted elsewhere in this file.
   */
  rotationAwareTarget: Strand;
  /** This object's own (unrotated) bounds in world space. */
  objectPoints: Strand;
};

export type HitTestCullingDebugEvent = {
  ownerId: string;
  rotation: number;
  hasExternalPivot: boolean;
  /** The raw click/touch point (or hit-test box) in un-rotated world space, before applyRotation. */
  rawTarget: Strand;
  /** applyRotation(rawTarget) -- rawTarget mapped into this object's own local space, which is what getObjectsAt actually intersects against selectionBounds(). */
  rotatedTarget: Strand;
  /** This object's own bounds, widened to cover a pivot-compensated descendant -- see WorldObject#selectionBounds. Equal to this.points when nothing below this node has been pivot-compensated. */
  objectPoints: Strand;
  /** Whether rotatedTarget missed selectionBounds() entirely, i.e. the click did not land on this object. */
  culled: boolean;
};

export class WorldObject extends BaseObject<WorldObjectProps, Paintable> {
  id: string;
  type = 'world-object';
  scale: number;
  layers: Paintable[];

  /**
   * Optional debug hook, set by tests/tooling, fired from getAllPointsAt()
   * whenever a rotated object selects content. Exists to make a real,
   * reported bug detectable: content/tile selection intentionally ignores
   * rotation entirely (see getAllPointsAt's own comment), which is correct
   * for *whether* the object is visible at all, but once zoomed in close to
   * an edge of a rotated object, the selected sub-region silently stops
   * matching what's actually on screen -- the renderer then falls back to a
   * lower-resolution layer for that patch, seen as blur. This hook doesn't
   * decide what's "correct" itself (that's the real fix, and depends on the
   * rotation pivot sweep); it just exposes the raw inputs so a test can
   * check them independently. No-op unless a test/tool sets it.
   */
  static debugTileSelection: ((event: TileSelectionDebugEvent) => void) | undefined;

  /**
   * Optional debug hook, set by tests/tooling, fired from getObjectsAt()
   * whenever a rotated object hit-tests content. Unlike getAllPointsAt,
   * getObjectsAt legitimately does rotate the target via applyRotation()
   * before intersecting it with this.points -- and needs to: its target is
   * a real click/touch point in raw, un-rotated world space (see its only
   * callers, world.ts's propagatePointerEvent/propagateTouchEvent), so
   * mapping it into the object's own local space is exactly how you tell
   * whether a click landed on this specific object's rotated, pivot-swept
   * on-screen appearance. (This looked at first like the same rotationPivot
   * bug that was fixed in getAllPointsAt -- it isn't; that target is a
   * viewport window, not a point, and needs the opposite treatment. See
   * world-object-hit-test-rotation-culling.test.ts for the full comparison
   * and verification against the real render transform.) This hook exposes
   * both targets and the outcome for tests/tooling to inspect without
   * duplicating the rotation math. No-op unless a test/tool sets it.
   */
  static debugHitTestCulling: ((event: HitTestCullingDebugEvent) => void) | undefined;

  /**
   * This position in the world local to the scale of the object.
   * So a 1000x1000 drawn at 0.1 scale at x=5, y=10 on the world would have world points 50,100,1000,1000
   *
   * To get it's world-relative position you need to multiple the scale out.
   */
  points: Strand;

  /**
   * These are relative to where to object is in the world at the scale of the world.
   * So a 1000x1000 drawn at 0.1 scale at x=5, y=10 on the world would have world points 0,0,100,100
   */
  worldPoints: Strand;

  intersectionBuffer = dna(5);
  selectionBoundsBuffer = dna(5);
  unionTargetBuffer = dna(5);
  aggregateBuffer = dna(9);
  invertedBuffer = dna(9);
  rotation = 0;
  filteredPointsBuffer: Strand;
  _updatedList: any[] = [];
  geometry?: any;

  /**
   * World-space coordinates of a fixed external rotation pivot (e.g. the
   * viewport center), set by Runtime while rotating around a fixed point
   * instead of this object's own center. undefined means own-center mode.
   */
  rotationPivot: { x: number; y: number } | undefined;
  private lastAppliedX: number | undefined;
  private lastAppliedY: number | undefined;

  constructor(props?: AbstractObject, position?: { x: number; y: number }) {
    super();
    const { x = 0, y = 0 } = position || {};

    if (!props) {
      this.id = '';
      this.scale = 1;
      this.layers = [];
      this.points = dna(5);
      this.worldPoints = dna(5);
      this.filteredPointsBuffer = dna(5);
    } else {
      // @deprecated.
      this.id = props.id || '';
      this.scale = 1;
      this.layers = props.layers;

      this.points = dna([1, x, y, x + props.width, y + props.height]);
      this.worldPoints = dna([1, x, y, x + props.width, y + props.height]);
      this.filteredPointsBuffer = dna(props.layers.length * 5);
    }
  }

  static createWithProps(props: WorldObjectProps) {
    const instance = new WorldObject();
    instance.applyProps(props);
    return instance;
  }

  /**
   * BaseObject#applyPivotCompensationOffset moves `points` directly and
   * bumps `pivotCompensationOffset`, bypassing applyProps() entirely. Left
   * alone, that desyncs lastAppliedX/Y from pivotCompensationOffset: the
   * *next* applyProps() call (e.g. from rotating or editing tx/ty) computes
   * `propsX = props.x + pivotCompensationOffset.x` against a now-stale
   * lastAppliedX, sees a spurious deltaX/Y equal to the compensation that
   * was just applied directly, and reapplies it a second time (rotated, per
   * the screen-aligned-edit logic below) -- an extra jump on the next
   * unrelated edit, one step removed from the compensation itself. Bumping
   * lastAppliedX/Y by the same amount keeps that delta at zero.
   */
  applyPivotCompensationOffset(x: number, y: number) {
    super.applyPivotCompensationOffset(x, y);
    if (this.lastAppliedX !== undefined) {
      this.lastAppliedX += x;
      this.lastAppliedY = (this.lastAppliedY as number) + y;
    }
  }

  applyProps(props: WorldObjectProps) {
    const propsX = (props.x || 0) + this.pivotCompensationOffset.x;
    const propsY = (props.y || 0) + this.pivotCompensationOffset.y;

    let x: number;
    let y: number;

    // The angle this update is actually moving to, not this.rotation (the
    // angle from before this call) -- see the delta un-rotation below.
    const nextRotation = props.rotation || 0;

    if (this.rotationPivot && this.lastAppliedX !== undefined) {
      // Rotating around a fixed external pivot means the object's own local
      // axes are rotated in screen space by the current angle (see
      // CanvasRenderer#applyTransform) -- moving x/y by a raw amount would
      // otherwise appear to move the object along the wrong screen axis once
      // rotated (e.g. a horizontal x edit appearing vertical at 90deg).
      // Interpreting the *change* in x/y as a screen-space delta and
      // un-rotating just that delta by the current angle keeps edits
      // screen-aligned without touching how `rotation` itself sweeps the
      // object around the fixed pivot (that sweep is a render-time-only
      // effect and must stay driven by the raw position, not cancelled out
      // here). Un-rotated by nextRotation, not this.rotation: a call that
      // changes rotation and position together (e.g. a controller that
      // rotates and pans in the same update) is about to render at the new
      // angle, so a position delta arriving in that same call is already a
      // screen-space delta measured against the angle it's moving *to* --
      // un-rotating it by the angle it's moving *from* would land it off by
      // the difference between the two.
      const deltaX = propsX - this.lastAppliedX;
      const deltaY = propsY - (this.lastAppliedY as number);
      // rotatePoint(deltaX, deltaY, 0, 0, -nextRotation) un-rotates the
      // delta around the origin -- same formula as the two call sites in
      // Runtime#syncRotationPivotPosition, reused here instead of a third
      // hand-written copy (see that method's own comment on why).
      const [rotatedDeltaX, rotatedDeltaY] = rotatePoint(deltaX, deltaY, 0, 0, -nextRotation);
      x = this.x + rotatedDeltaX;
      y = this.y + rotatedDeltaY;
    } else {
      x = propsX;
      y = propsY;
    }

    this.lastAppliedX = propsX;
    this.lastAppliedY = propsY;

    if (typeof props.id !== 'undefined') {
      this.id = props.id;
    }
    const s = typeof props.scale !== 'undefined' ? props.scale : this.scale;

    this.points[0] = 1;
    this.points[1] = x;
    this.points[2] = y;
    this.points[3] = x + props.width;
    this.points[4] = y + props.height;
    this.rotation = nextRotation;

    this.worldPoints[3] = this.worldPoints[1] + props.width;
    this.worldPoints[4] = this.worldPoints[2] + props.height;

    if (props.scale && props.scale !== 1) {
      this.atScale(s);
    }

    this.scale = s;

    // @todo this will be a bit tricky as we have to use the translate
    //   function to update the props. It will be a case of checking
    //   the props, and applying the difference. x = 2 => 3 = (x + 1)
    //   For the reconciler, we could also give access to the bare transforms
    //   Although that might be painful as the props would be out of sync.
  }

  appendChild(item: Paintable) {
    // Not set manually.
    if (item.points[0] === 0) {
      item.points.set(this.points);
    }
    item.__owner.value = this;

    this.addLayers([item]);
  }

  removeChild(item: Paintable) {
    this.layers = this.layers.filter((layer) => layer !== item);
    this.filteredPointsBuffer = dna(this.layers.length * 5);
  }

  insertBefore(item: Paintable, before: Paintable) {
    const index = this.layers.indexOf(before);
    if (index === -1) {
      return;
    }
    if (this.layers.indexOf(item) !== -1) {
      return;
    }

    // const beforeLayers = this.layers.slice(0, index - 1);
    const beforeLayers = this.layers.slice(0, index);
    const afterLayers = this.layers.slice(index);

    this.layers = [...beforeLayers, item, ...afterLayers];
  }

  hideInstance() {
    console.warn('hideInstance: not yet implemented');
  }

  getObjectsAt(target: Strand, all?: boolean): Paintable[] {
    const rawTarget = target;
    // Rotating `target` itself here is unrelated to the widening below --
    // this maps a real click point into *this* node's own local space,
    // which only makes sense when this node is itself the rotated one (see
    // this method's own file-level comment in
    // world-object-hit-test-rotation-culling.test.ts for the full
    // rawTarget-vs-viewport-window distinction from getAllPointsAt). An
    // unrotated ancestor's own local space isn't rotated at all, so its
    // click target is left as-is; selectionBounds() below is what lets it
    // still recognize a click on a rotated, pivot-compensated descendant.
    if (this.rotation) {
      target = this.applyRotation(target);
    }

    // Culled against selectionBounds(), not this.points -- see its own
    // comment. this.points goes stale the moment a descendant is
    // pivot-compensated (Runtime#syncRotationPivotPosition moves only the
    // actually-rotated node), the same staleness getAllPointsAt was fixed
    // to account for. Left as this.points here, a click on content that is
    // genuinely on screen -- painted correctly by the already-fixed
    // getAllPointsAt -- would still be silently culled before ever
    // reaching the descendant whose own hit-test would have found it.
    const bounds = this.selectionBounds();
    const filteredPoints = hidePointsOutsideRegion(bounds, target, this.filteredPointsBuffer);

    const widened =
      bounds[1] !== this.points[1] ||
      bounds[2] !== this.points[2] ||
      bounds[3] !== this.points[3] ||
      bounds[4] !== this.points[4];

    if ((this.rotation || widened) && WorldObject.debugHitTestCulling) {
      WorldObject.debugHitTestCulling({
        ownerId: this.id,
        rotation: this.rotation,
        hasExternalPivot: !!this.rotationPivot,
        rawTarget: rawTarget.slice() as Strand,
        rotatedTarget: target.slice() as Strand,
        objectPoints: bounds.slice() as Strand,
        culled: filteredPoints[0] === 0,
      });
    }

    if (filteredPoints[0] === 0) {
      return [];
    }

    const len = this.layers.length;
    const objects: Paintable[] = [];
    for (let index = 0; index < len; index++) {
      const layer = this.layers[index] as SpacialContent | WorldObject;

      if (all && (layer as Geometry).isShape) {
        const t = transform(layer.points, translate(this.x, this.y));
        const int = (layer as Geometry).intersects([target[1] - t[1], target[2] - t[2]]);
        if (!int) continue;
      }

      const filter = hidePointsOutsideRegion(
        transform(layer.points, translate(this.x, this.y)),
        target,
        this.filteredPointsBuffer
      );

      if (filter[0] !== 0) {
        objects.push(layer as SpacialContent);
      }

      if (all) {
        const object = layer as WorldObject;
        objects.push(...object.getObjectsAt(target, all));
      }
    }
    return objects;
  }

  /**
   * The rotation angle getAllPointsAt's selection widening should use --
   * ordinarily this.rotation, but falls back to a descendant's rotation
   * when this node itself isn't rotated.
   *
   * Render-time rotation is applied by whichever WorldObject is the
   * *nearest* owner of the paint (see CanvasRenderer#applyTransform), which
   * is not necessarily this node -- e.g. ImageService renders its rotation
   * onto its own nested wrapper (see TileSet.tsx), which can itself sit
   * *two* plain, unrotated <world-object> levels below where a story
   * places it (confirmed live: a bare wrapper around an ImageService, whose
   * own wrapper is what actually carries the rotation). Each unrotated
   * level's own this.rotation is 0, so without this fallback its
   * getAllPointsAt skips rotation-aware widening entirely (applyRotation is
   * a no-op when rotation is falsy) and hands its child an
   * already-narrowed, zero-rotation-aware target -- no amount of a
   * *descendant's* own correct widening can recover content already
   * clipped away higher up by an ancestor's getIntersection. Recursing into
   * this same method on each child (rather than reading child.rotation
   * directly) is what lets this see through any number of intermediate
   * unrotated wrappers to the rotation that's actually being rendered,
   * however many levels down it lives -- confirmed as the real depth
   * needed here, not merely one level, against the actual failing case
   * (see world-object-nested-rotation-selection.test.ts).
   *
   * Deliberately not folded into applyRotation() itself: that method also
   * backs getObjectsAt's hit-testing, which already has its own carefully
   * verified (and differently-shaped) rotation handling -- see
   * world-object-hit-test-rotation-culling.test.ts. This only widens
   * *selection*, leaving hit-testing untouched.
   *
   * Not private: World#getObjectsAt calls this too, on every top-level
   * object, for the exact same reason one level up -- see its own comment.
   */
  selectionRotation(): number {
    if (this.rotation) {
      return this.rotation;
    }
    for (const layer of this.layers) {
      if (!layer) {
        continue;
      }
      const rotation =
        typeof (layer as any).selectionRotation === 'function'
          ? ((layer as unknown) as WorldObject).selectionRotation()
          : (layer as any).rotation;
      if (rotation) {
        return rotation;
      }
    }
    return 0;
  }

  /**
   * This node's own bounds, widened to wherever its subtree is actually
   * rendered -- the region getAllPointsAt must intersect `target` against,
   * in place of `this.points`.
   *
   * `this.points` stops describing a node's own content the moment the
   * rotation pivot changes: Runtime#syncRotationPivotPosition compensates
   * for that change by moving the *rotated* node (the only one whose
   * on-screen position the pivot actually affects -- see its
   * `if (owner.rotation)`), and rotation lives on a nested wrapper, not on
   * the top-level object (ImageService renders its rotation onto TileSet's
   * own inner wrapper -- the same nesting selectionRotation exists for).
   * Every ancestor of that wrapper keeps the bounds it had before, now
   * describing where its content *used* to be. Measured live against
   * stories/sequence-panel.stories.tsx's "setup test2": a canvas whose
   * top-level object still claimed x 2451..4862 while the tiles it owns
   * were being painted from x 1850 -- a 601px lie, easily enough for
   * getIntersection to miss a target that genuinely overlaps the content,
   * and cull a whole visibly on-screen canvas at the very first level.
   * (World#forceIncludeRotatedObjects is the same staleness one level
   * further up, handled the same way: keep the candidate, let real
   * geometry decide.)
   *
   * Only ever widens, and only to cover content that genuinely exists, so
   * the "genuinely far away is still culled" guarantee is untouched -- an
   * object whose *content* is off screen still has every one of these
   * bounds off screen (see world-object-culling.test.ts). Recurses through
   * child world-objects the same way (and for the same reason)
   * selectionRotation does, since the compensated node can be any number of
   * levels down; child bounds are mapped back into this node's own frame
   * with the inverse of the transform getAllPointsAt applies on the way
   * down (`child = (parent - x) / scale`). Layers that aren't
   * world-objects are skipped: pivot compensation never touches them, and
   * a tiled leaf's `points` is a whole grid rather than one box.
   */
  selectionBounds(): Strand {
    const bounds = this.selectionBoundsBuffer;
    bounds[0] = this.points[0];
    bounds[1] = this.points[1];
    bounds[2] = this.points[2];
    bounds[3] = this.points[3];
    bounds[4] = this.points[4];

    const len = this.layers.length;
    for (let i = 0; i < len; i++) {
      const layer = this.layers[i] as any;
      if (!layer || typeof layer.selectionBounds !== 'function') {
        continue;
      }
      const child = layer.selectionBounds() as Strand;
      const x1 = child[1] * this.scale + this.x;
      const y1 = child[2] * this.scale + this.y;
      const x2 = child[3] * this.scale + this.x;
      const y2 = child[4] * this.scale + this.y;
      if (x1 < bounds[1]) bounds[1] = x1;
      if (y1 < bounds[2]) bounds[2] = y1;
      if (x2 > bounds[3]) bounds[3] = x2;
      if (y2 > bounds[4]) bounds[4] = y2;
    }

    return bounds;
  }

  /**
   * getAllPointsAt needs both selectionRotation() and selectionBounds()
   * every call, and each independently walks this node's *entire* child
   * subtree -- calling both back-to-back (as getAllPointsAt used to) means
   * two full traversals per node per frame, on top of each child's own
   * getAllPointsAt call independently redoing the same two traversals one
   * level down. This computes both in a single walk instead, halving that
   * specific redundancy.
   *
   * Purely an internal optimization: selectionRotation() and
   * selectionBounds() above keep their own existing behavior and signature
   * unchanged (so a caller that only wants one of the two, like
   * World#forceIncludeRotatedObjects wanting only rotation, isn't made to
   * pay for the other), and this method's own per-layer conditions
   * (typeof layer.selectionRotationAndBounds/rotation, typeof
   * layer.selectionBounds) mirror theirs exactly, so results match call
   * for call. Not exposed beyond getAllPointsAt: two independent recursive
   * implementations of the same walk is exactly the kind of thing that
   * silently drifts (see this file's own rotate()/rotatePoint() history),
   * so there is deliberately only one -- selectionRotation() and
   * selectionBounds() stay as the source of truth for anything outside
   * this hot path.
   */
  private selectionRotationAndBounds(): { rotation: number; bounds: Strand } {
    const bounds = this.selectionBoundsBuffer;
    bounds[0] = this.points[0];
    bounds[1] = this.points[1];
    bounds[2] = this.points[2];
    bounds[3] = this.points[3];
    bounds[4] = this.points[4];

    let rotation = this.rotation;

    const len = this.layers.length;
    for (let i = 0; i < len; i++) {
      const layer = this.layers[i] as any;
      if (!layer) {
        continue;
      }

      if (typeof layer.selectionRotationAndBounds === 'function') {
        const child = layer.selectionRotationAndBounds() as { rotation: number; bounds: Strand };
        if (!rotation && child.rotation) {
          rotation = child.rotation;
        }
        const x1 = child.bounds[1] * this.scale + this.x;
        const y1 = child.bounds[2] * this.scale + this.y;
        const x2 = child.bounds[3] * this.scale + this.x;
        const y2 = child.bounds[4] * this.scale + this.y;
        if (x1 < bounds[1]) bounds[1] = x1;
        if (y1 < bounds[2]) bounds[2] = y1;
        if (x2 > bounds[3]) bounds[3] = x2;
        if (y2 > bounds[4]) bounds[4] = y2;
      } else if (!rotation && layer.rotation) {
        // Matches selectionRotation()'s own fallback for a layer that
        // isn't a WorldObject (e.g. a leaf with its own .rotation): it can
        // still contribute a rotation to widen selection with, but -- like
        // selectionBounds() -- never contributes to bounds, since pivot
        // compensation only ever moves a WorldObject wrapper's own x/y.
        rotation = layer.rotation;
      }
    }

    return { rotation, bounds };
  }

  applyRotation(target: Strand, rotationOverride?: number) {
    const rotation = typeof rotationOverride === 'number' ? rotationOverride : this.rotation;
    if (rotation) {
      const a = { x: target[1], y: target[2] };
      const b = { x: target[1], y: target[4] };
      const c = { x: target[3], y: target[2] };
      const d = { x: target[3], y: target[4] };

      // Visibility/culling must rotate the viewport window around whatever
      // point this object is actually *rendered* rotated around. Normally
      // that's the object's own center, but while rotating around a fixed
      // external pivot (rotationPivot, set by Runtime -- see
      // CanvasRenderer#applyTransform), using the own-center here instead
      // would compute a completely different (and often non-overlapping)
      // effective target, silently culling an object that's actually on
      // screen.
      const x = this.rotationPivot ? this.rotationPivot.x : this.points[1] + (this.points[3] - this.points[1]) / 2;
      const y = this.rotationPivot ? this.rotationPivot.y : this.points[2] + (this.points[4] - this.points[2]) / 2;

      const [x1, y1] = rotate(x, y, a.x, a.y, rotation);
      const [x2, y2] = rotate(x, y, b.x, b.y, rotation);
      const [x3, y3] = rotate(x, y, c.x, c.y, rotation);
      const [x4, y4] = rotate(x, y, d.x, d.y, rotation);

      const rx1 = Math.min(x1, x2, x3, x4);
      const rx2 = Math.max(x1, x2, x3, x4);
      const ry1 = Math.min(y1, y2, y3, y4);
      const ry2 = Math.max(y1, y2, y3, y4);

      return dna([target[0], rx1, ry1, rx2, ry2]);
    }
    return target;
  }

  getAllPointsAt(target: Strand, aggregate: Strand, scaleFactor: number): Paint[] {
    const transformer = compose(translate(this.x, this.y), scale(this.scale), this.aggregateBuffer);

    // Rotation is intentionally NOT applied to `target` for this primary
    // selection. Render-time position (CanvasRenderer's
    // `position`/`transform(point, transformation)`) is always a
    // translate+scale-only composition through the whole ancestor chain --
    // rotation is applied separately, once, as a post-hoc screen-space
    // canvas transform (see CanvasRenderer#applyTransform). Rotating target
    // here to match `this.rotation` duplicates that transform one stage too
    // early, and -- because a fixed external pivot can be far from this
    // node's own bounds -- can shift the computed region completely outside
    // `this.points`, incorrectly culling content that is actually on screen
    // once the real (post-hoc) rotation is applied. This unrotated pass is
    // therefore a deliberately conservative baseline: it always selects
    // *something* for a genuinely visible rotated object, at the cost of
    // sometimes selecting the wrong sub-region once zoomed in close to an
    // edge (the renderer then falls back to a lower-resolution layer there,
    // seen as blur -- see world-object-rotated-tile-selection.test.ts).
    // Rotation-aware region: the sub-region actually visible once the
    // post-hoc rotation is applied (target mapped into this object's own
    // local space the same way getObjectsAt already does for hit-testing --
    // see world-object-hit-test-rotation-culling.test.ts). applyRotation
    // returns `target` itself, unchanged, when the effective rotation is
    // falsy -- selectionRotation() falls back to a direct child's rotation
    // when this node isn't rotated itself; see its own comment for why an
    // unrotated node containing a rotated child still needs to widen here.
    //
    // Widening is skipped outright for a target that already selects
    // nothing -- see isEmptyRegion: rotating an empty region is not a
    // no-op, it *moves* it (to somewhere else entirely, when the pivot is
    // far away), and the union of "nothing here" with "nothing over there"
    // is a real, non-empty rectangle. That resurrects an already-made
    // decision as a bogus one: this node's getIntersection then clips that
    // rectangle against its own bounds into a thin sliver at one edge and
    // selects (paints, and network-loads tiles for) the handful of leaves
    // nearest it. Observed live against
    // stories/sequence-panel.stories.tsx's "setup test2": a canvas the
    // widened target genuinely missed still selected five tiles, two levels
    // below the empty intersection that should have ended it -- and from
    // the wrong end of its grid, since nothing about that sliver's position
    // has anything to do with what's on screen. That path only opened up
    // once World#forceIncludeRotatedObjects started
    // deliberately keeping rotated top-level objects as candidates
    // regardless of their raw bounds, specifically so this method could
    // make the real decision -- "nothing" has to be one of the decisions
    // it's allowed to make and have stick.
    // A combined computation of selectionRotation() + selectionBounds() --
    // see selectionRotationAndBounds's own comment for why this hot path
    // uses it instead of the two public methods separately.
    const { rotation, bounds: ownBounds } = this.selectionRotationAndBounds();
    const emptyTarget = isEmptyRegion(target);
    const rotationAwareTarget = emptyTarget ? target : this.applyRotation(target, rotation);

    if (rotation && !emptyTarget && WorldObject.debugTileSelection) {
      WorldObject.debugTileSelection({
        ownerId: this.id,
        rotation,
        rawTarget: target.slice() as Strand,
        rotationAwareTarget: rotationAwareTarget.slice() as Strand,
        objectPoints: this.points.slice() as Strand,
      });
    }

    // Selects against target ∪ rotationAwareTarget in a single pass, rather
    // than running getAllPointsAt against each independently and
    // concatenating the results (an earlier version of this fix did that,
    // to additionally catch the rotation-aware sub-region without narrowing
    // what the conservative unrotated pass already found). That turned out
    // to be a real correctness bug, not just "a little redundant work" as
    // originally assumed here: it doubles up selection of the same content
    // (confirmed live: ~2.5x as many drawImage calls per render for the
    // same on-screen content), and each pass does its own independent
    // coarse-to-fine layer selection with no ordering guarantee *between*
    // the two passes -- so a later pass's coarse fallback tile can paint
    // over an earlier pass's already-fine tile at the same screen position.
    // Confirmed live via drawImage instrumentation watching the actual
    // story across several render ticks after rotating: dozens of cases of
    // a native-resolution tile immediately followed by an overlapping,
    // smoothed lower-resolution one -- exactly the intermittent per-tile
    // blur this was meant to fix, reintroduced by the fix itself. A single
    // selection pass selects (and thus paints) each layer once, with one
    // coherent coarse-to-fine ordering, so this can't happen; the tradeoff
    // is that the union's bounding box can select a little more area than
    // the two rects strictly cover when they're far apart (e.g. a distant
    // rotation pivot), which is extra harmless work, not a correctness
    // issue.
    let unionTarget = target;
    if (rotationAwareTarget !== target) {
      // Written into a reusable buffer rather than dna([...]) -- this runs
      // for every rotated (or rotation-descendant-carrying) node, every
      // frame, and a fresh Float32Array allocation here on that path is
      // exactly the per-frame GC pressure this class otherwise avoids (see
      // e.g. Runtime#updateWorldObjectRotationPivots's own comment on
      // reusing rotationPivot objects for the same reason).
      unionTarget = this.unionTargetBuffer;
      unionTarget[0] = target[0];
      unionTarget[1] = Math.min(target[1], rotationAwareTarget[1]);
      unionTarget[2] = Math.min(target[2], rotationAwareTarget[2]);
      unionTarget[3] = Math.max(target[3], rotationAwareTarget[3]);
      unionTarget[4] = Math.max(target[4], rotationAwareTarget[4]);
    }

    // Intersected against where this node's content actually is, not
    // against `this.points` -- see selectionBounds for why those two stop
    // agreeing (and by how much) as soon as anything below this node has
    // been pivot-compensated. Identical to this.points for every node that
    // hasn't been. Reuses ownBounds (already computed above alongside
    // rotation) rather than calling selectionBounds() again, which would
    // redo the same subtree walk a second time in this same call.
    const inter = getIntersection(unionTarget, ownBounds, this.intersectionBuffer);

    // Nothing of this object lies inside the (already widened) selection
    // region, so nothing below it can be visible either -- stop here rather
    // than recursing with an empty region. Descending with one is not
    // harmless: the inverse transform below *moves* an empty region (its
    // coordinates are zeroed, so a translate lands it on the parent's own
    // offset rather than leaving it nowhere), getIntersection's overlap
    // test is inclusive, so re-intersecting that point against a child's
    // bounds hands back a zero-area box flagged as a real intersection, and
    // hidePointsOutsideRegion's strict comparisons *do* match any tile that
    // straddles it -- so a handful of leaves around an arbitrary interior
    // point get selected, painted, and their tiles fetched, several levels
    // below the miss that should have ended it. Nothing further down the
    // selection path can undo that, because by then it no longer looks like
    // a mistake: it's a real region, inside real bounds.
    //
    // Returning no paints at all (rather than every layer's paints marked
    // culled) is the same thing this object's ancestors already do when
    // *they* find no overlap -- World#getObjectsAt/#getAllPointsAt simply
    // never descend into an object hidePointsOutsideRegion excluded -- so
    // it's a shape the renderer already handles for every off-screen
    // object; see world-object-culling.test.ts.
    if (isEmptyRegion(inter)) {
      return [];
    }

    const len = this.layers.length;
    const arr: Paint[] = [];
    const t = transform(inter, compose(scale(1 / this.scale), translate(-this.x, -this.y), this.invertedBuffer));
    const agg = aggregate ? compose(aggregate, transformer, this.aggregateBuffer) : transformer;
    const s = scaleFactor * this.scale;

    for (let i = 0; i < len; i++) {
      arr.push(...this.layers[i].getAllPointsAt(t, agg, s));
    }

    return arr;
  }

  addLayers(paintables: Paintable[]) {
    const paintablesToAdd = [];
    for (const paintable of paintables) {
      if (this.layers.indexOf(paintable) !== -1) {
        continue;
      }
      paintablesToAdd.push(paintable);
      // Check for crop.
      if (
        paintable.points.length === 5 &&
        // Paint.x < 0
        (paintable.points[1] < this.worldPoints[1] / this.scale ||
          // Paint.y < 0
          paintable.points[2] < this.worldPoints[2] / this.scale ||
          // Paint.width > this.width
          paintable.points[3] > this.worldPoints[3] / this.scale ||
          // Paint.height > this.height
          paintable.points[4] > this.worldPoints[4] / this.scale)
      ) {
        // @todo support for tiled crops.
        paintable.crop =
          paintable.crop ||
          dna([
            1,
            Math.max(this.worldPoints[1] / this.scale, paintable.points[1]),
            Math.max(this.worldPoints[2] / this.scale, paintable.points[2]),
            Math.min(this.worldPoints[3] / this.scale, paintable.points[3]),
            Math.min(this.worldPoints[4] / this.scale, paintable.points[4]),
          ]);
      }
    }

    this.layers = this.layers.concat(paintablesToAdd);

    this.filteredPointsBuffer = dna(this.layers.length * 5);
  }

  getScheduledUpdates(target: Strand, scaleFactor: number): Array<() => void | Promise<void>> {
    const len = this.layers.length;
    this._updatedList = [];
    const s = scaleFactor * this.scale;
    for (let i = 0; i < len; i++) {
      const updates = this.layers[i].getScheduledUpdates(target, s);
      if (updates) {
        this._updatedList.push(...updates);
      }
    }
    return this._updatedList;
  }
}
