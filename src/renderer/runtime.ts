import {
  compose,
  DnaFactory,
  dna,
  mutate,
  type Strand,
  scale,
  scaleAtOrigin,
  transform,
  translate,
} from '@atlas-viewer/dna';
import { nanoid } from 'nanoid';
import type { RuntimeDebugEvent } from '../modules/react-reconciler/devtools/types';
import type { AtlasReadyResetReason } from '../modules/shared/ready-events';
import { TransitionManager } from '../modules/transition-manager/transition-manager';
import type { Projection, RuntimeController, Viewer } from '../types';
import { easingFunctions } from '../utility/easing-functions';
import { getZoneConstrainedBounds } from '../utility/get-zone-constrained-bounds';
import type { World } from '../world';
import type { Paint } from '../world-objects/paint';
import type { Renderer } from './renderer';
import { rotatePoint } from '../world-objects/world-object';

export type RuntimeHooks = {
  useFrame: Array<(time: number) => void>;
  useBeforeFrame: Array<(time: number) => void>;
  useAfterFrame: Array<(time: number) => void>;
  useAfterPaint: Array<(paint: Paint) => void>;
};

type UnwrapHook<T> = T extends Array<infer R> ? R : never;
type UnwrapHookArg<T> = T extends Array<(arg: infer R) => any> ? R : never;

export type ViewerMode = 'static' | 'explore' | 'sketch';
const MIN = Number.MIN_VALUE + 1;

export type ViewerFilters = {
  grayscale: number;
  contrast: number;
  brightness: number;
  saturate: number;
  hueRotate: number;
  sepia: number;
  invert: number;
  blur: number;
};

export type HookOptions = {
  enableFilters?: boolean;
  filters: ViewerFilters;
};

export type RuntimeOptions = {
  visibilityRatio: number;
  maxOverZoom: number;
  maxUnderZoom: number;
};

export type RuntimeZoneState = {
  zoneId: string;
  exists: boolean;
  active: boolean;
  visibleInViewport: boolean;
};

export class Runtime {
  id = nanoid();
  ready = false;
  readyCycle = 0;
  readyReason: AtlasReadyResetReason = 'initial';
  readyTimestamp: number | undefined;
  resourceTransitionKey: string | number | undefined;
  private hasResourceTransitionKey = false;

  _rotateFromWorldCenter: boolean = false;
  private hasSyncedRotateFromWorldCenter = false;
  viewportCenterPoint: { x: number; y: number; } = { x: 0, y: 0 };
  viewport: { x: number; y: number; width: number; height: number; top: number; left: number; } | undefined;
  // Helper getters.
  get x(): number {
    return this.target[1];
  }

  set x(x: number) {
    this.target[1] = x;
  }

  get y(): number {
    return this.target[2];
  }

  set y(y: number) {
    this.target[2] = y;
  }

  get x2(): number {
    return this.target[3];
  }

  set x2(x2: number) {
    this.target[3] = x2;
  }

  get y2(): number {
    return this.target[4];
  }

  set y2(y2: number) {
    this.target[4] = y2;
  }

  get width(): number {
    return this.target[3] - this.target[1];
  }

  set width(width: number) {
    this.target[3] = this.target[1] + width;
  }

  get height(): number {
    return this.target[4] - this.target[2];
  }

  set height(height: number) {
    this.target[4] = this.target[2] = height;
  }


  get rotateFromWorldCenter(): boolean {
    return this._rotateFromWorldCenter;
  }

  set rotateFromWorldCenter(rotateFromWorldCenter: boolean) {
    if (rotateFromWorldCenter === this._rotateFromWorldCenter) {
      // Still mark as synced even on a no-op assignment: AtlasAuto's effect
      // that syncs this prop always fires on mount (see Atlas.tsx), and if
      // the story's starting value happens to match this class's own false
      // default, this early-return branch is the *only* place that first
      // sync is ever observed. Without this, a story starting at false
      // would never flip hasSyncedRotateFromWorldCenter here, making its
      // user's first *real* toggle (false->true) get misidentified as the
      // initial sync below and incorrectly skip compensation.
      this.hasSyncedRotateFromWorldCenter = true;
      return;
    }
    // AtlasAuto syncs this prop via a useEffect that always fires on mount
    // (see Atlas.tsx), so the very first sync of e.g.
    // <AtlasAuto rotateFromWorldCenter /> (starting true) looks like a
    // false->true transition here purely because of this class's own
    // false default -- not because anything was actually switched. There's
    // no previously-rendered appearance under the old pivot mode to
    // preserve in that case, so compensating would corrupt the initial
    // position instead of protecting it. Only compensate for genuine,
    // later toggles, once the mode has been synced at least once.
    if (this.hasSyncedRotateFromWorldCenter) {
      this.compensateRotationPivotChange(rotateFromWorldCenter);
    }
    this.hasSyncedRotateFromWorldCenter = true;
    this._rotateFromWorldCenter = rotateFromWorldCenter;
    if (!rotateFromWorldCenter) {
      this.fixedWorldPivot = undefined;
      this.pivotSwitchPending = false;
    }
    this.updateWorldObjectRotationPivots(this.currentWorldPivot());
  }

  /**
   * The rotation-pivot gesture lifecycle: 'idle' the rest of the time,
   * 'interacting' for the duration of a raw pointer gesture
   * (mousedown/touchstart through mouseup/touchend), then 'switching' from
   * the moment that gesture ends until the pivot has actually finished
   * switching back from frozen to live (see endInteraction and
   * finalizePivotSwitch -- that switch sometimes can't happen the instant
   * the gesture ends, hence a distinct third state rather than treating
   * "just ended" and "fully idle" as the same thing).
   *
   * isInteracting and pivotSwitchPending below are thin accessors over this
   * single field, kept only because they're each read/written from several
   * places (including tests) as independent booleans. They used to *be*
   * two independent boolean fields -- every one of their own read sites
   * needed both together (`isInteracting || pivotSwitchPending`, twice, see
   * currentWorldPivot and compensateRotationPivotChange) precisely because
   * they were never meant to vary independently: exactly one of the three
   * states is ever true at a time. Modeling that directly here means a
   * future edit to either accessor can't leave the pair in a combination
   * that was never supposed to exist.
   */
  private pivotPhase: 'idle' | 'interacting' | 'switching' = 'idle';

  /**
   * True while a raw pointer gesture (mousedown/touchstart through
   * mouseup/touchend) is actively in progress. Set only via
   * beginInteraction()/endInteraction() -- see those for why.
   */
  get isInteracting(): boolean {
    return this.pivotPhase === 'interacting';
  }
  set isInteracting(value: boolean) {
    this.pivotPhase = value ? 'interacting' : 'idle';
  }

  /**
   * The world-space point every rotated object's rotationPivot is derived
   * from while rotateFromWorldCenter is on and a gesture (see
   * isInteracting) -- or the post-gesture snap-back covered by
   * pivotSwitchPending -- is in progress. Frozen for the duration of both
   * -- see currentWorldPivot's doc comment for why.
   */
  private fixedWorldPivot: { x: number; y: number } | undefined;

  /**
   * Set by whichever pan controller is attached (see
   * PopmotionController's momentum handling) while an inertial/elastic
   * pan-back-into-bounds animation is actively driving `target` frame by
   * frame, and cleared once it settles. Momentum drives `target` via
   * per-frame zero-duration transitions (TransitionManager#customTransition
   * with total_time = 0) rather than one tracked transition, so it
   * completes -- and transitionManager.hasPending() goes back to false --
   * within the same frame it's applied. Left unchecked, the pivotSwitchPending
   * finalize condition in render() (which exists specifically to wait out an
   * out-of-bounds snap-back before switching the frozen pivot back to live --
   * see finalizePivotSwitch) would see hasPending() as false on the very
   * first frame after release and switch mid-flight, while momentum is still
   * actively carrying a rotated object back into view -- producing a visible
   * jump/drift instead of a clean return along the drag's own vector. This
   * flag gives render() the same visibility into momentum's real lifetime
   * that it already has into transitionManager's.
   */
  panMomentumActive = false;

  /**
   * True from the moment a gesture ends until the pivot has actually
   * finished switching from frozen back to live -- see endInteraction and
   * finalizePivotSwitch. Kept separate from isInteracting (which tracks
   * only the raw pointer gesture) because that switch sometimes can't
   * happen the instant the gesture ends: see finalizePivotSwitch's own
   * comment for why.
   */
  private get pivotSwitchPending(): boolean {
    return this.pivotPhase === 'switching';
  }
  private set pivotSwitchPending(value: boolean) {
    if (value) {
      this.pivotPhase = 'switching';
    } else if (this.pivotPhase === 'switching') {
      // Every false-write site (beginInteraction, finalizePivotSwitch, the
      // rotateFromWorldCenter setter) is clearing this defensively rather
      // than asserting the gesture itself just ended -- a call arriving
      // while the phase is 'interacting' (e.g. rotateFromWorldCenter
      // toggled off mid-drag) must leave that phase alone, not force it
      // back to 'idle' out from under an active gesture.
      this.pivotPhase = 'idle';
    }
  }

  /**
   * Called by whichever pan/zoom controller is attached (see
   * PopmotionController's onMouseDown/onTouchStart) at the exact moment a
   * raw pointer gesture starts, *before* that controller queues any
   * movement.
   *
   * This must run synchronously here, rather than being inferred lazily
   * from the next render() frame (which is how this was first implemented):
   * PopmotionController issues each drag step as a zero-duration transition
   * (total_time = 0), which render() applies to `target` *before* it gets a
   * chance to notice isInteracting just turned true (both happen inside the
   * same render() call, target-apply first). Deferring the pivot capture to
   * that render() call would therefore capture it one step too late --
   * *after* the first movement of the gesture has already shifted `target`
   * -- corrupting exactly that first step (and only that step; every step
   * after tracks correctly since the pivot is by then genuinely frozen).
   * Capturing here, before the controller has touched `target` at all,
   * avoids the race entirely.
   *
   * A no-op when a gesture is already in progress: PopmotionController
   * calls this once per raw pointer/touch *start* event, and a second
   * finger touching down mid-drag fires its own touchstart (with both
   * touches now present) while the first finger's gesture is still active
   * -- without this guard, that re-entrant call would re-capture
   * fixedWorldPivot at whatever the live pivot has drifted to by that
   * moment (instead of the position it was frozen at when the gesture
   * actually began), producing a visible jump right as a one-finger pan
   * transitions into a two-finger pinch/rotate.
   */
  beginInteraction() {
    if (this.isInteracting) {
      return;
    }
    // A previous gesture's pivot switch may still be waiting on its own
    // out-of-bounds snap-back -- or inertial pan momentum, see
    // panMomentumActive -- to settle (see finalizePivotSwitch). Captured
    // *before* isInteracting flips below: isInteracting's own setter drives
    // pivotPhase, and pivotSwitchPending is a read of that same pivotPhase,
    // so reading it after would always see 'interacting' and silently miss
    // a real pending switch.
    const hadPendingSwitch = this.pivotSwitchPending;
    this.isInteracting = true;
    // This new gesture (e.g. a quick click that interrupts an in-flight
    // momentum glide) must not simply discard a still-pending switch --
    // unlike a genuinely idle pivot, the object is still actually being
    // rendered around the OLD frozen pivot right up until this call
    // (pivotPhase stays 'switching', not 'idle', until finalizePivotSwitch
    // runs), so dropping pivotSwitchPending without running that
    // compensation would leave every rotated object rendered one frame
    // around the old pivot and the next around whatever's live right now,
    // with no compensating position change in between -- a real, visible
    // jump (sideways relative to whatever was panning, not toward/away from
    // it, since it's a pivot change, not a position correction). Finalizing
    // it here settles that first, so the object's on-screen position is
    // continuous across the switch.
    if (hadPendingSwitch) {
      this.finalizePivotSwitch();
    }
    this.pivotSwitchPending = false;
    if (this._rotateFromWorldCenter) {
      // No compensation needed here: the pivot is now genuinely live
      // (either it already was, or finalizePivotSwitch just settled it
      // above), so freezing it at the live pivot *right now* coincides with
      // its current screen projection by construction -- nothing left to
      // drift.
      this.fixedWorldPivot = this.liveWorldPivot();
    }
  }

  /**
   * Pairs with beginInteraction() -- called when the gesture ends.
   *
   * Doesn't finalize the pivot switch itself; just marks it pending, for
   * render() to finish (see finalizePivotSwitch) once it's actually safe
   * to. onWindowMouseUp calls world.constraintBounds() immediately before
   * this method, when the gesture ends out of bounds -- if that's about to
   * animate `target` back into bounds, switching the pivot straight to live
   * right now (even with a one-time compensating offset) can't stay
   * consistent with several more frames of `target` still moving after this
   * call returns. Keeping the pivot frozen for that entire snap-back, the
   * same way it's already frozen for the gesture itself, sidesteps the
   * inconsistency completely -- see finalizePivotSwitch.
   */
  endInteraction() {
    this.isInteracting = false;
    if (this._rotateFromWorldCenter && this.fixedWorldPivot) {
      this.pivotSwitchPending = true;
    } else {
      this.fixedWorldPivot = undefined;
    }
  }

  /**
   * Finishes the frozen-to-live pivot switch that endInteraction() defers:
   * compensates every rotated object so the switch itself doesn't move
   * anything on screen (see syncRotationPivotPosition), then releases the
   * frozen pivot.
   *
   * Called from render(), *before* getPointsAt() captures this frame's
   * object positions for painting -- not from endInteraction() itself,
   * and not from the rotateFromWorldCenter block further down in render()
   * that reads the now-live pivot. Both would be too late: this method
   * mutates each rotated object's own position (via
   * syncRotationPivotPosition -> applyPivotCompensationOffset), and
   * getAllPointsAt bakes each object's *current* x/y into that frame's
   * transform up front -- a mutation applied after getPointsAt has already
   * run for this frame wouldn't be reflected until the *next* one, so the
   * frame in between would render the pre-compensation position under the
   * already-switched (live) pivot: exactly the jump this exists to avoid,
   * just delayed a frame instead of prevented.
   *
   * Only ever runs once pivotSwitchPending's own snap-back (if any) has
   * actually finished animating `target` -- render() only calls this once
   * transitionManager.hasPending() has gone false again, so `target` here
   * is always genuinely settled, not a value this method has to guess or
   * borrow from anywhere else.
   *
   * A previous version of this compensation skipped it entirely, reasoning
   * that image content (TiledImage/SingleImage) renders its own rotation
   * around its own center only and never reads the external cx/cy pivot --
   * unlike Box/Text, painted through CanvasRenderer#applyTransform, which
   * does. That's not what CanvasRenderer#prepareLayer/#applyTransform
   * actually do: applyTransform is invoked for every paint (any
   * SpacialContent, not just Box/Text) and branches purely on
   * `owner.rotation` -- the *world-object's* rotation, not the paint's own
   * -- so a TiledImage/SingleImage inside a rotated world-object is
   * rotated around the external pivot exactly like Box/Text is. Skipping
   * compensation left that case with no correction at all, reintroducing
   * the jump this method exists to avoid (confirmed against
   * runtime-interaction-pivot.test.ts's own compensation math).
   */
  private finalizePivotSwitch() {
    if (this.fixedWorldPivot) {
      const oldPivotScreen = this.projectToScreen(this.fixedWorldPivot);
      this.viewport = this.getRendererScreenPosition();
      this.updateViewportCenterPoint();
      this.syncRotationPivotPosition(oldPivotScreen, this.viewportCenterPoint);
    }
    this.fixedWorldPivot = undefined;
    this.pivotSwitchPending = false;
  }

  /** The live world point currently at the viewport's screen center. */
  private liveWorldPivot(): { x: number; y: number } {
    return this.viewerToWorld(this.viewportCenterPoint.x, this.viewportCenterPoint.y);
  }

  /** Screen-space projection of a world-space pivot, for the *current* target/scale. */
  private projectToScreen(worldPivot: { x: number; y: number }): { x: number; y: number } {
    const p = this.worldToViewer(worldPivot.x, worldPivot.y, 0, 0);
    return { x: p.x, y: p.y };
  }

  /**
   * Nudges every rotated world-object's position so that switching the
   * render pivot it's drawn around from `oldPivot` to `newPivot` doesn't
   * move anything on screen: whatever is visible right now stays exactly
   * where it is, and only a *future* rotation change (or another pivot
   * switch) will actually sweep around the new pivot.
   *
   * Either side may be a fixed screen coordinate, or the literal string
   * 'own-center' -- meaning "this object's own current screen position",
   * i.e. own-center rotation mode, where the pivot moves *with* the object
   * rather than being fixed. That's not just a convenience: an own-center
   * pivot isn't expressible as a plain {x,y}, since it's whatever the
   * object's post-compensation position turns out to be -- solving for a
   * fixed pivot's inverse rotation doesn't apply.
   *
   * Walks the whole tree, not just this.world.getObjects()'s top-level
   * nodes -- e.g. ImageService renders its rotation onto TileSet's own
   * *nested* world-object wrapper (see TileSet.tsx), not the top-level one
   * ImageService itself creates. updateWorldObjectRotationPivots already
   * has to recurse into .layers for exactly this reason (its own doc
   * comment covers it); this didn't, so a rotated node at any depth below
   * the top level never got its position compensated at all, reintroducing
   * the on-release jump this method exists to avoid for any story that
   * rotates through a nested wrapper instead of a top-level one.
   */
  private syncRotationPivotPosition(
    oldPivot: { x: number; y: number } | 'own-center',
    newPivot: { x: number; y: number } | 'own-center'
  ) {
    const scaleFactor = this.getScaleFactor();

    // oldParentX/Y and newParentX/Y both track the same ancestor chain's
    // absolute position -- identical unless some ancestor between here and
    // the root was itself rotated and so had its own compensation applied
    // a level up. They diverge exactly when a rotated node sits inside
    // another rotated node (e.g. ImageService applying its own rotation on
    // a nested wrapper, itself inside a rotated <world-object> -- see
    // TileSet.tsx): the outer node's compensation moves its own x/y, which
    // ordinary translation composition then carries down to everything
    // below it, rotated or not. A rotated *descendant*'s own compensation
    // must be solved relative to where its ancestor chain will *actually*
    // be once rendered (newParentX/Y) -- not where that chain was before
    // this whole pass started (oldParentX/Y) -- or the descendant ends up
    // silently absorbing its ancestor's own shift a second time on top of
    // its own, correctly-computed one. A sibling with no rotation of its
    // own (e.g. a <box> next to the rotated image) never runs this branch
    // at all, so it only ever inherits the ancestor's shift once, via
    // ordinary composition -- confirmed live against
    // stories/rotation.stories.tsx's CropImageBroken (rotation set on both
    // the <world-object> and the <ImageService> it contains): the image
    // content, alone among that object's children, drifted away from the
    // rest during every rotate-from-center drag. See
    // runtime-interaction-pivot.test.ts for the regression coverage and
    // the worked-through math.
    const visit = (
      nodes: any[],
      oldParentX: number,
      oldParentY: number,
      newParentX: number,
      newParentY: number,
      parentScale: number
    ) => {
      for (const owner of nodes) {
        if (!owner) {
          continue;
        }

        const nodeScale = parentScale * (typeof owner.scale === 'number' ? owner.scale : 1);
        // owner's own local x/y are untouched by any ancestor's shift --
        // only owner's own compensation (below) can change them -- so this
        // is valid both before and after that runs.
        const oldAbsX = oldParentX + owner.x * parentScale;
        const oldAbsY = oldParentY + owner.y * parentScale;

        if (owner.rotation) {
          const screen = this.worldToViewer(oldAbsX, oldAbsY, owner.width * parentScale, owner.height * parentScale);
          const px = screen.x + screen.width / 2;
          const py = screen.y + screen.height / 2;

          // Where this object is actually rendered right now, under the old
          // pivot. Own-center has no positional effect (the pivot moves with
          // the object), so the rendered position is just its raw position.
          // Uses the same rotatePoint() helper WorldObject#applyRotation
          // does, rather than a second hand-written copy of the same
          // formula -- this file and world-object.ts already once
          // diverged this way (see rotate() vs rotatePoint() in
          // world-object.ts), which is exactly the kind of drift reusing
          // one shared implementation avoids.
          let renderedX = px;
          let renderedY = py;
          if (oldPivot !== 'own-center') {
            [renderedX, renderedY] = rotatePoint(px, py, oldPivot.x, oldPivot.y, owner.rotation);
          }

          // Solve for the raw (pre-rotation) position that would render at
          // that same spot under the new pivot. Own-center is again
          // trivial: it's whatever the rendered position already is, since
          // own-center makes raw and rendered position identical by
          // construction.
          let newPx = renderedX;
          let newPy = renderedY;
          if (newPivot !== 'own-center') {
            [newPx, newPy] = rotatePoint(renderedX, renderedY, newPivot.x, newPivot.y, -owner.rotation);
          }

          // (newPx - px)/scaleFactor is the raw world-space delta that
          // would keep owner's own rendered appearance fixed *if its
          // ancestor chain's absolute position stayed exactly where it was
          // (oldParentX/Y)*. It generally won't have: subtracting the
          // ancestor chain's own world-space shift (newParent - oldParent)
          // before dividing down into owner's local frame accounts for
          // whatever part of the needed correction owner's ancestors are
          // already contributing via their own compensation, so owner only
          // solves for what's left over that's genuinely its own -- see
          // this method's own top-level comment for why that split
          // matters. Reduces to the original (single-rotation-per-branch)
          // formula whenever no ancestor had anything of its own to
          // contribute, since newParentX/Y == oldParentX/Y in that case.
          const worldDx = ((newPx - px) / scaleFactor - (newParentX - oldParentX)) / parentScale;
          const worldDy = ((newPy - py) / scaleFactor - (newParentY - oldParentY)) / parentScale;

          if (worldDx || worldDy) {
            owner.applyPivotCompensationOffset(worldDx, worldDy);
          }
        }

        if (Array.isArray(owner.layers) && owner.layers.length) {
          // owner.x/y read fresh here -- reflects owner's own compensation
          // above, if any ran, so newAbsX/Y is where owner will actually
          // render, not where it started.
          const newAbsX = newParentX + owner.x * parentScale;
          const newAbsY = newParentY + owner.y * parentScale;
          visit(owner.layers, oldAbsX, oldAbsY, newAbsX, newAbsY, nodeScale);
        }
      }
    };

    visit(this.world.getObjects(), 0, 0, 0, 0, 1);
    this.pendingUpdate = true;
  }

  /**
   * The world-space rotation pivot to use for this frame, or undefined if
   * rotateFromWorldCenter is off.
   *
   * "Rotate from viewport center" is ambiguous during a pan: the render-time
   * pivot (CanvasRenderer#applyTransform's cx/cy) is a screen coordinate,
   * and panning shifts every object's raw screen position by a uniform
   * delta *before* rotation is applied. If the pivot were pinned to the
   * canvas's literal center pixel throughout, that delta gets rotated too --
   * `R(rotation) * panDelta` instead of `panDelta` -- so a rotated object
   * sweeps off in a rotated direction relative to the mouse instead of
   * tracking the pan 1:1. But re-deriving the pivot from
   * viewerToWorld(viewportCenterPoint) fresh every frame (so it's *always*
   * the literal current center, with no sweep-avoidance) means the object
   * genuinely does rotate around a moving target while you drag -- also not
   * what "rotate from center" should feel like while dragging.
   *
   * The compromise: while idle (no gesture in progress), the pivot always
   * tracks the live, true viewport center -- matching what a user expects
   * "center of the viewport" to mean at rest, and self-correcting through
   * any transient view changes (e.g. settling into its home position after
   * mount) the same way it always did. The instant a gesture starts
   * (beginInteraction), the world point is captured once and held fixed for
   * its duration, so panning/zooming while it's running reads as a plain,
   * uniform shift instead of sweeping rotated content around. Once it ends
   * (endInteraction) tracking eventually resumes and the pivot snaps back
   * to whatever the true center now is -- but not necessarily the instant
   * it ends: see pivotSwitchPending/finalizePivotSwitch for why that switch
   * can't always happen right away, and why by the time this method is
   * called by render() (see finalizePivotSwitch's own comment on
   * ordering), that switch -- if one was due -- has already happened.
   */
  private currentWorldPivot(): { x: number; y: number } | undefined {
    if (!this._rotateFromWorldCenter) {
      return undefined;
    }
    if (this.pivotPhase !== 'idle') {
      // Normally captured by beginInteraction() already; this only covers
      // the edge case of rotateFromWorldCenter being switched on mid-gesture,
      // where there was nothing to capture yet when the gesture started.
      this.fixedWorldPivot = this.fixedWorldPivot ?? this.liveWorldPivot();
      return this.fixedWorldPivot;
    }
    return this.liveWorldPivot();
  }

  /**
   * Keeps every world-object's `rotationPivot` in sync with the current
   * world pivot (see currentWorldPivot), expressed in *each node's own*
   * local coordinate frame (i.e. relative to its parent, at its parent's
   * accumulated scale) rather than the top-level world frame.
   *
   * This must cover every rotated node at any nesting depth, not just
   * top-level ones: CanvasRenderer passes the viewport-center pivot to
   * *every* paint uniformly whenever rotateFromWorldCenter is on (see the
   * unconditional `this.rotateFromWorldCenter ? this.viewportCenterPoint...`
   * in render() below), regardless of which ancestor owns it -- e.g. an
   * ImageService/TileSet's own nested rotated wrapper. WorldObject#applyProps
   * (screen-aligned x/y) and WorldObject#applyRotation (visibility culling)
   * both need a rotationPivot that matches whatever pivot the node is
   * actually rendered with, or they'll disagree with the renderer -- at
   * extreme scale/position this can make applyRotation cull a node that's
   * actually on screen, hiding it entirely.
   */
  private updateWorldObjectRotationPivots(worldPivot: { x: number; y: number } | undefined) {
    const setPivot = (nodes: any[], parentX: number, parentY: number, parentScale: number) => {
      for (const node of nodes) {
        if (!node) {
          continue;
        }
        if (worldPivot) {
          // Reuse the existing rotationPivot object (if this node already
          // has one from a previous frame) instead of allocating a new one
          // every frame for every node -- this runs on every render() call
          // while rotateFromWorldCenter is on, including every frame of an
          // active drag, so a fresh object per node here means real GC
          // pressure exactly when frame time matters most. The three read
          // sites (WorldObject#applyRotation/#applyProps,
          // Runtime#compensateRotationPivotChange) all read .x/.y
          // synchronously and never hold onto a rotationPivot reference
          // across frames, so mutating in place is safe.
          const px = (worldPivot.x - parentX) / parentScale;
          const py = (worldPivot.y - parentY) / parentScale;
          if (node.rotationPivot) {
            node.rotationPivot.x = px;
            node.rotationPivot.y = py;
          } else {
            node.rotationPivot = { x: px, y: py };
          }
        } else {
          node.rotationPivot = undefined;
        }

        const absX = parentX + node.x * parentScale;
        const absY = parentY + node.y * parentScale;
        const nodeScale = parentScale * (typeof node.scale === 'number' ? node.scale : 1);
        if (Array.isArray(node.layers) && node.layers.length) {
          setPivot(node.layers, absX, absY, nodeScale);
        }
      }
    };
    setPivot(this.world.getObjects(), 0, 0, 1);
  }

  /**
   * Switching the rotation pivot (own-center vs. viewport-center) for an object
   * that already has a non-zero rotation would otherwise cause it to jump, since
   * the same angle drawn around a different point lands the shape somewhere else.
   * This nudges each rotated world-object's position so the pivot switch is seamless:
   * whatever is on screen right now stays there, and only future rotation changes
   * pivot around the newly selected anchor.
   */
  private compensateRotationPivotChange(switchingToViewportCenter: boolean) {
    if (!this.viewport) {
      return;
    }

    this.viewport = this.getRendererScreenPosition();
    this.updateViewportCenterPoint();

    // The viewport-center pivot actually in effect right now, in screen
    // space. Switching TO viewport-center always lands on the live
    // viewportCenterPoint (that's what currentWorldPivot() returns while
    // idle, and toggling this mode isn't itself a gesture). Switching AWAY
    // FROM viewport-center: if a gesture -- or the out-of-bounds snap-back
    // that can still be finishing after one ends, see pivotSwitchPending --
    // is actively in progress right now, the pivot that's been in effect is
    // the frozen fixedWorldPivot's *current* screen projection (see
    // currentWorldPivot's doc comment) -- using viewportCenterPoint directly
    // here would compute the wrong compensation and jump the object.
    // Otherwise (idle), it's just viewportCenterPoint, same as the
    // switching-TO case.
    const vc =
      !switchingToViewportCenter && this.pivotPhase !== 'idle' && this.fixedWorldPivot
        ? this.projectToScreen(this.fixedWorldPivot)
        : this.viewportCenterPoint;

    this.syncRotationPivotPosition(switchingToViewportCenter ? 'own-center' : vc, switchingToViewportCenter ? vc : 'own-center');
  }


  renderer: Renderer;
  world: World;
  target: Strand;
  homePosition: Strand;
  manualHomePosition: boolean;
  manualFocalPosition: boolean;
  focalPosition: Strand;
  homePaddingPx: number | { left?: number; right?: number; top?: number; bottom?: number } | undefined;
  transitionManager: TransitionManager;
  aggregate: Strand;
  transformBuffer = dna(500);
  lastTarget = dna(5);
  zoomBuffer = dna(5);
  logNextRender = false;
  pendingUpdate = true;
  isCommitting = false;
  firstRender = true;
  lastTime: number;
  stopId?: number;
  mode: ViewerMode = 'explore';
  controllers: RuntimeController[] = [];
  controllersRunning = false;
  controllerStopFunctions: Array<() => void> = [];
  maxScaleFactor = 1;
  _viewerToWorld = { x: 0, y: 0 };
  _lastGoodScale = 1;
  debugFrame = 0;
  debugSubscribers = new Set<(event: RuntimeDebugEvent) => void>();
  hooks: RuntimeHooks = {
    useFrame: [],
    useBeforeFrame: [],
    useAfterPaint: [],
    useAfterFrame: [],
  };
  fpsLimit: number | undefined;
  options: RuntimeOptions;
  hookOptions: HookOptions = {
    filters: {
      grayscale: 0,
      contrast: 0,
      brightness: 0,
      saturate: 0,
      sepia: 0,
      invert: 0,
      hueRotate: 0,
      blur: 0,
    },
  };


  constructor(
    renderer: Renderer,
    world: World,
    target: Viewer,
    controllers: RuntimeController[] = [],
    options?: Partial<RuntimeOptions>
  ) {
    this.renderer = renderer;
    this.world = world;
    this.options = {
      maxOverZoom: 1,
      maxUnderZoom: 1,
      visibilityRatio: 1,
      ...(options || {}),
    };
    this.target = DnaFactory.projection(target);
    this.manualHomePosition = false;
    this.pendingUpdate = true;
    this.homePosition = DnaFactory.projection(this.world);
    this.manualFocalPosition = false;
    this.focalPosition = this.target; // Follow target by default.
    this.updateFocalPosition();
    this.transitionManager = new TransitionManager(this);
    this.aggregate = scale(1);
    this.world.addLayoutSubscriber((type: string) => {
      if (type === 'repaint' || type === 'zone-changed') {
        this.pendingUpdate = true;
      }
      if (type === 'recalculate-world-size') {
        if (!this.manualHomePosition) {
          this.setHomePosition();
          this.goHome();
        } else {
          // recalculate world size?
        }
        this.updateFocalPosition();
      }
    });
    this.lastTime = performance.now();
    this.controllers = controllers;
    this.render(this.lastTime);
    this.startControllers();
    this.homePaddingPx = undefined;
    this.viewport = this.getRendererScreenPosition();
    this.updateViewportCenterPoint();
  }

  updateViewportCenterPoint() {
    // The rotation pivot is applied directly against viewer/screen-space
    // coordinates in the renderer (see applyTransform), so this must stay
    // in that same space rather than being converted to world coordinates.
    this.viewportCenterPoint = {
      x: (this.viewport?.width || 0) / 2,
      y: (this.viewport?.height || 0) / 2,
    };
  }


  setHomePosition(position?: Projection) {
    this.homePosition.set(DnaFactory.projection(position ? position : this.world));
    this.pendingUpdate = true;
  }

  setHomePaddingPx(px?: number | { left?: number; right?: number; top?: number; bottom?: number }) {
    this.homePaddingPx = px;
    this.pendingUpdate = true;
  }

  getHomePaddingPx(): number | { left?: number; right?: number; top?: number; bottom?: number } | undefined {
    return this.homePaddingPx;
  }

  startControllers() {
    if (this.controllersRunning) {
      return;
    }
    for (const controller of this.controllers) {
      this.controllerStopFunctions.push(controller.start(this));
    }
    this.controllersRunning = true;
  }

  stopControllers() {
    if (!this.controllersRunning) {
      return;
    }
    for (const controller of this.controllerStopFunctions) {
      controller();
    }
    this.controllersRunning = false;
    this.controllerStopFunctions = [];
  }

  updateControllerPosition() {
    for (const controller of this.controllers) {
      controller.updatePosition(this.x, this.y, this.width, this.height);
    }
  }

  triggerResize() {
    if (this.renderer.triggerResize) {
      this.renderer.triggerResize();
    }
    this.pendingUpdate = true;
  }

  addController(controller: RuntimeController) {
    this.controllers.push(controller);
    if (this.controllersRunning) {
      controller.start(this);
    }
    this.pendingUpdate = true;
  }

  cover() {
    return this.goHome({ cover: true });
  }

  getRendererScreenPosition() {
    return this.renderer.getRendererScreenPosition();
  }

  updateRendererScreenPosition() {
    this.pendingUpdate = true;
    this.renderer.resize();
  }

  setOptions(options: Partial<RuntimeOptions>) {
    this.options = { ...this.options, ...options };
  }

  setResourceTransitionKey(key: string | number | undefined) {
    if (!this.hasResourceTransitionKey) {
      this.hasResourceTransitionKey = true;
      this.resourceTransitionKey = key;
      return;
    }
    if (this.resourceTransitionKey === key) {
      return;
    }
    this.resourceTransitionKey = key;
    if (typeof key === 'undefined') {
      return;
    }
    if (this.renderer.resetImageFadeState) {
      this.renderer.resetImageFadeState();
    }
    this.resetReadyState('resource-transition-key-change');
  }

  /**
   * Normalize padding input to a consistent per-side format.
   */
  private normalizePadding(paddingPx?: number | { left?: number; right?: number; top?: number; bottom?: number }): {
    left: number;
    right: number;
    top: number;
    bottom: number;
  } {
    if (typeof paddingPx === 'number') {
      return {
        left: paddingPx,
        right: paddingPx,
        top: paddingPx,
        bottom: paddingPx,
      };
    }
    if (paddingPx) {
      return {
        left: paddingPx.left || 0,
        right: paddingPx.right || 0,
        top: paddingPx.top || 0,
        bottom: paddingPx.bottom || 0,
      };
    }
    return { left: 0, right: 0, top: 0, bottom: 0 };
  }

  /**
   * Calculate the viewport region that fits the target content within the available
   * canvas area (accounting for CSS pixel padding).
   */
  getHomeTarget(
    options: {
      cover?: boolean;
      position?: Strand;
      paddingPx?: number | { left?: number; right?: number; top?: number; bottom?: number };
    } = {}
  ): { x: number; y: number; width: number; height: number } {
    // Get actual canvas dimensions in CSS pixels
    const rendererPosition = this.getRendererScreenPosition();
    const canvasWidth = rendererPosition?.width || this.width;
    const canvasHeight = rendererPosition?.height || this.height;

    // Use provided padding or fall back to default homePaddingPx
    const paddingPx = options.paddingPx !== undefined ? options.paddingPx : this.homePaddingPx;
    const padding = this.normalizePadding(paddingPx);

    // Calculate available area after padding (in CSS pixels)
    const availableWidth = Math.max(1, canvasWidth - padding.left - padding.right);
    const availableHeight = Math.max(1, canvasHeight - padding.top - padding.bottom);

    // Get the target content bounds (what we want to show)
    const content = options.position
      ? {
          x: options.position[1],
          y: options.position[2],
          width: options.position[3] - options.position[1],
          height: options.position[4] - options.position[2],
        }
      : {
          x: this.homePosition[1],
          y: this.homePosition[2],
          width: this.homePosition[3] - this.homePosition[1],
          height: this.homePosition[4] - this.homePosition[2],
        };

    // Calculate aspect ratios
    const availableAspect = availableWidth / availableHeight;
    const contentAspect = content.width / content.height;

    // Determine the world-unit dimensions needed to fit content in available area
    let viewWidth: number;
    let viewHeight: number;
    let viewX: number;
    let viewY: number;

    const fitToWidth = options.cover ? contentAspect < availableAspect : contentAspect > availableAspect;

    if (fitToWidth) {
      // Content is wider relative to available area - fit to width
      viewWidth = content.width;
      viewHeight = content.width / availableAspect;
      viewX = content.x;
      viewY = content.y - (viewHeight - content.height) / 2;
    } else {
      // Content is taller relative to available area - fit to height
      viewHeight = content.height;
      viewWidth = content.height * availableAspect;
      viewX = content.x - (viewWidth - content.width) / 2;
      viewY = content.y;
    }

    // Now we need to expand the viewport to account for the padding.
    // The ratio of world units per CSS pixel in the available area:
    const worldPerCssPixel = viewWidth / availableWidth;

    // Convert padding from CSS pixels to world units
    const padLeftWorld = padding.left * worldPerCssPixel;
    const padRightWorld = padding.right * worldPerCssPixel;
    const padTopWorld = padding.top * worldPerCssPixel;
    const padBottomWorld = padding.bottom * worldPerCssPixel;

    // Expand the viewport to include padding areas
    return {
      x: viewX - padLeftWorld,
      y: viewY - padTopWorld,
      width: viewWidth + padLeftWorld + padRightWorld,
      height: viewHeight + padTopWorld + padBottomWorld,
    };
  }

  isViewportAtHome(
    options: {
      cover?: boolean;
      tolerance?: number;
      target?: Projection;
    } = {}
  ): boolean {
    const { cover = false, tolerance = 1, target = this.getViewport() } = options;
    const homeTarget = this.getHomeTarget({ cover });

    return (
      Math.abs(target.x - homeTarget.x) <= tolerance &&
      Math.abs(target.y - homeTarget.y) <= tolerance &&
      Math.abs(target.width - homeTarget.width) <= tolerance &&
      Math.abs(target.height - homeTarget.height) <= tolerance
    );
  }

  isViewportAtHomeZoomLevel(
    options: {
      cover?: boolean;
      tolerance?: number;
      target?: Projection;
    } = {}
  ): boolean {
    const { cover = false, tolerance = 0.05, target = this.getViewport() } = options;
    const homeTarget = this.getHomeTarget({ cover });
    const targetScale = this.renderer.getScale(target.width, target.height) || this._lastGoodScale;
    const homeScale = this.renderer.getScale(homeTarget.width, homeTarget.height) || this._lastGoodScale;

    if (homeScale === 0) {
      return false;
    }

    return Math.abs(targetScale / homeScale - 1) <= tolerance;
  }

  goHome(
    options: {
      cover?: boolean;
      position?: Strand;
      paddingPx?: number | { left?: number; right?: number; top?: number; bottom?: number };
    } = {}
  ) {
    if (this.world.width <= 0 || this.world.height <= 0) return;

    // Check if we have any padding to apply
    const paddingPx = options.paddingPx !== undefined ? options.paddingPx : this.homePaddingPx;
    const padding = this.normalizePadding(paddingPx);
    const hasPadding = padding.left > 0 || padding.right > 0 || padding.top > 0 || padding.bottom > 0;

    if (hasPadding) {
      // Use the new padding-aware calculation
      const target = this.getHomeTarget(options);
      this.target[1] = Math.round(target.x);
      this.target[2] = Math.round(target.y);
      this.target[3] = Math.round(target.x + target.width);
      this.target[4] = Math.round(target.y + target.height);
    } else {
      // Original behavior without padding
      const scaleFactor = this.getScaleFactor();

      const target = options.position
        ? {
            x: options.position[1],
            y: options.position[2],
            width: options.position[3] - options.position[1],
            height: options.position[4] - options.position[2],
          }
        : {
            x: this.homePosition[1],
            y: this.homePosition[2],
            width: this.homePosition[3] - this.homePosition[1],
            height: this.homePosition[4] - this.homePosition[2],
          };

      const width = this.width * scaleFactor;
      const height = this.height * scaleFactor;

      const widthScale = target.width / width;
      const heightScale = target.height / height;
      const ar = width / height;

      if (options.cover ? widthScale > heightScale : widthScale < heightScale) {
        const fullWidth = ar * target.height;
        const space = (fullWidth - target.width) / 2;

        this.target[1] = Math.round(-space + target.x);
        this.target[2] = Math.round(target.y);
        this.target[3] = Math.round(fullWidth - space + target.x);
        this.target[4] = Math.round(target.height + target.y);
      } else {
        const fullHeight = target.width / ar;
        const space = (fullHeight - target.height) / 2;

        this.target[1] = Math.round(target.x);
        this.target[2] = Math.round(target.y - space);
        this.target[3] = Math.round(target.x + target.width);
        this.target[4] = Math.round(target.y + fullHeight - space);
      }
    }
    this.constrainBounds(this.target);

    this.updateControllerPosition();
  }

  /**
   * Resize world
   *
   * This is generally called when the world is re-sized. This recalculates the current target accordingly. It needs to
   * be improved, tested and planned.
   *
   * @param fromWidth
   * @param toWidth
   * @param fromHeight
   * @param toHeight
   */
  resize(fromWidth: number, toWidth: number, fromHeight: number, toHeight: number) {
    // Step 1. Do we need to calculate a new focal point?

    if (this.transitionManager.hasPending()) {
      this.transitionManager.stopTransition();
    }

    // @todo figure out if there is some focal point that we can trim, given the resize request.
    //      for example if it expand beyond the world, we can crop the focal point.
    this.updateFocalPosition(fromWidth - toWidth, fromHeight - toHeight);

    const widthRatio = toWidth / fromWidth;
    const heightRatio = toHeight / fromHeight;

    this.target[3] = this.target[1] + (this.target[3] - this.target[1]) * widthRatio;
    this.target[4] = this.target[2] + (this.target[4] - this.target[2]) * heightRatio;

    this.goHome({ position: this.focalPosition });
    this.renderer.resize(toWidth, toHeight);
    this.pendingUpdate = true;

    this.transitionManager.resumeTransition();
  }

  updateFocalPosition(widthDiff?: number, heightDiff?: number) {
    if (!this.manualFocalPosition) {
      const w = this.width;
      const h = this.height;
      const min = Math.min(w, h);

      const marginTrimWidth = 0;
      const marginTrimHeight = 0;

      const baseX = this.x + marginTrimWidth;
      const baseY = this.y + marginTrimHeight;

      if (w < h) {
        const diff = this.height - this.width;
        // []
        this.focalPosition = DnaFactory.projection({
          x: baseX,
          y: baseY + diff / 2,
          width: min - marginTrimWidth * 2,
          height: min - marginTrimHeight * 2,
        });
        this.pendingUpdate = true;
      } else {
        const diff = this.width - this.height;
        // [   ]
        this.focalPosition = DnaFactory.projection({
          x: baseX + diff / 2,
          y: baseY,
          width: min - marginTrimWidth * 2,
          height: min - marginTrimHeight * 2,
        });
        this.pendingUpdate = true;
      }
    }
  }

  _viewport = { x: 0, y: 0, width: 0, height: 0 };

  /**
   * Get Viewport
   *
   * Returns a projection based on the current target.
   *
   * @todo rename to getProjection.
   * @todo evaluate if we actually need this.
   */
  getViewport(): Projection {
    this._viewport.x = this.target[1];
    this._viewport.y = this.target[2];
    this._viewport.width = this.target[3] - this.target[1];
    this._viewport.height = this.target[4] - this.target[2];
    return this._viewport;
  }

  /**
   * Set Viewport
   *
   * This is a helper for setting the viewport based on x, y, width and height, opposed to the x1, y1, x2, y2 native
   * co-ordinates of the target.
   *
   * @param data
   */
  setViewport = (data: { x?: number; y?: number; width?: number; height?: number }) => {
    const x = Math.round(typeof data.x === 'undefined' ? this.target[1] : data.x);
    const y = Math.round(typeof data.y === 'undefined' ? this.target[2] : data.y);

    if (data.width) {
      this.target[3] = x + data.width;
    } else {
      this.target[3] = this.target[3] - this.target[1] + x;
    }
    if (data.height) {
      this.target[4] = y + data.height;
    } else {
      this.target[4] = this.target[4] - this.target[2] + y;
    }

    if (Math.abs(this.target[1] - x) > 0.01) {
      this.target[1] = x;
    }
    if (Math.abs(this.target[2] - y) > 0.01) {
      this.target[2] = y;
    }

    this.pendingUpdate = true;
  };

  constrainBounds(target: Strand, { panPadding = 0, ref = false }: { ref?: boolean; panPadding?: number } = {}) {
    const { minX, maxX, minY, maxY } = this.getBounds({
      target,
      padding: panPadding,
    });

    let isConstrained = false;
    const constrained = ref ? target : dna(target);
    const width = Math.round(target[3] - target[1]);
    const height = Math.round(target[4] - target[2]);

    if (minX > target[1]) {
      isConstrained = true;
      constrained[1] = minX;
      constrained[3] = minX + width;
    }
    if (minY > target[2]) {
      isConstrained = true;
      constrained[2] = minY;
      constrained[4] = minY + height;
    }
    if (maxX < target[1]) {
      isConstrained = true;
      constrained[1] = maxX;
      constrained[3] = maxX + width;
    }
    if (maxY < target[2]) {
      isConstrained = true;
      constrained[2] = maxY;
      constrained[4] = maxY + height;
    }

    return [isConstrained, constrained] as const;
  }

  /**
   * Get bounds
   *
   * Returns the minimum and maximum bounds. This absolutely needs improved. With the addition of zones this is becoming
   * more of an issue. It has to take into account the current layout. There also needs to be a new method for creating
   * a "home" view  that will fit the content to the view.
   */
  getBounds(options: { padding: number; target?: Strand }) {
    const target = options.target || this.target;
    const padding = options.padding;
    const visRatio = this.options.visibilityRatio;
    const hiddenRatio = Math.abs(1 - visRatio);

    if (this.world.hasActiveZone()) {
      const zone = this.world.getActiveZone();

      if (zone) {
        zone.recalculateBounds();
        const zoneBounds = getZoneConstrainedBounds(target, zone.points, padding);
        if (zoneBounds) {
          return zoneBounds;
        }
      }
    }

    const wt = target[3] - target[1];
    const ww = this.world.width;

    // const addConstraintPaddingX = ww / visRatio < wt;

    // Add constrain padding = false (zoomed in)
    const xB = -wt * hiddenRatio;
    const xD = ww - wt - xB;

    // ADd constrain padding = true (zoomed out)
    // const xA = ww * visRatio - wt;
    // const xC = ww * visRatio;
    // const xA = -500 / this.getScaleFactor(true);
    // const xC = -200 / this.getScaleFactor(true);
    // const xC = Math.min(-((wt - ww) / 2), ww * hiddenRatio);
    // const xA = Math.max(xC, ww - wt);

    // const minX = addConstraintPaddingX ? xA : xB;
    // const maxX = addConstraintPaddingX ? xC : xD;

    const ht = target[4] - target[2];
    const hw = this.world.height;

    // Add constrain padding = false (zoomed in)
    const yB = -ht * hiddenRatio;
    const yD = hw - ht - yB;

    // Add constrain padding = true (zoomed out)
    // const yA = hw * visRatio - ht;
    // const yC = hw * visRatio;
    // const yC = Math.min(-((ht - hw) / 2), hw * hiddenRatio);
    // const yA = Math.max(yC, hw * hiddenRatio - ht);
    //
    // const addConstraintPaddingY = hw / visRatio < ht;

    // const minY = addConstraintPaddingY ? yA : yB;
    // const maxY = addConstraintPaddingY ? yC : yD;

    const maxX = Math.round(Math.max(xB, xD));
    const minX = Math.round(Math.min(xB, xD));
    const maxY = Math.round(Math.max(yB, yD));
    const minY = Math.round(Math.min(yB, yD));

    return { minX, maxX, minY, maxY } as const;
  }

  getScaleFactor(dpi = false) {
    const scale = this.renderer.getScale(this.target[3] - this.target[1], this.target[4] - this.target[2], dpi);
    if (scale === 0) {
      return this._lastGoodScale;
    }
    this._lastGoodScale = scale;
    return scale;
  }

  private copyStrandValues(target: Strand, next: Strand) {
    target[0] = next[0];
    target[1] = next[1];
    target[2] = next[2];
    target[3] = next[3];
    target[4] = next[4];
  }

  private getZoomConstraintState(target: Strand) {
    const width = target[3] - target[1];
    const height = target[4] - target[2];
    const nextScale = this.renderer.getScale(width, height);
    const scaleFactor = nextScale === 0 ? this._lastGoodScale : nextScale;

    if (nextScale !== 0) {
      this._lastGoodScale = nextScale;
    }

    const displayWidth = width * scaleFactor;
    const displayHeight = height * scaleFactor;
    const widthScale = this.world.width / displayWidth;
    const heightScale = this.world.height / displayHeight;

    const minScale =
      widthScale > heightScale
        ? (displayWidth * this.options.maxUnderZoom) / this.world.width
        : (displayHeight * this.options.maxUnderZoom) / this.world.height;

    const sWidth = this.getRendererScreenPosition()?.width;
    const ratio = sWidth ? sWidth / this.world.width : 1;
    const maxScale = Math.max(ratio || 1, this.options.maxOverZoom);

    return {
      scaleFactor,
      minScale,
      maxScale,
    };
  }

  constrainTarget(
    target: Strand,
    {
      origin,
      panPadding = 0,
      ref = false,
    }: {
      origin?: { x: number; y: number };
      panPadding?: number;
      ref?: boolean;
    } = {}
  ) {
    let isConstrained = false;
    const constrained = ref ? target : dna(target);
    const { scaleFactor, minScale, maxScale } = this.getZoomConstraintState(constrained);
    const clampedScale = Math.max(minScale, Math.min(maxScale, scaleFactor));

    if (Math.abs(clampedScale - scaleFactor) > 0.000001) {
      const zoomOrigin = origin || {
        x: constrained[1] + (constrained[3] - constrained[1]) / 2,
        y: constrained[2] + (constrained[4] - constrained[2]) / 2,
      };
      const adjusted = transform(
        constrained,
        scaleAtOrigin(scaleFactor / clampedScale, zoomOrigin.x, zoomOrigin.y),
        this.zoomBuffer
      );

      this.copyStrandValues(constrained, adjusted);
      isConstrained = true;
    }

    const [isPanConstrained] = this.constrainBounds(constrained, {
      ref: true,
      panPadding,
    });

    return [isConstrained || isPanConstrained, constrained] as const;
  }

  /**
   * Zoom
   */
  getZoomedPosition(
    factor: number,
    {
      origin,
      fromPos: _fromPos,
    }: {
      origin?: { x: number; y: number };
      fromPos?: Strand;
    }
  ) {
    const source = _fromPos || this.target;
    const { scaleFactor, minScale, maxScale } = this.getZoomConstraintState(source);

    const realFactor = 1 / factor;
    const proposedScale = scaleFactor * realFactor;
    const isZoomingOut = realFactor < 1;

    if (isZoomingOut) {
      if (proposedScale < minScale) {
        factor = scaleFactor / minScale;
      }
    } else {
      // Zooming in.
      if (proposedScale > maxScale) {
        factor = scaleFactor / maxScale;
      }
    }

    // set the new scale.
    const proposedStrand = transform(
      source,
      scaleAtOrigin(
        factor,
        origin ? origin.x : source[1] + (source[3] - source[1]) / 2,
        origin ? origin.y : source[2] + (source[4] - source[2]) / 2
      ),
      this.zoomBuffer
    );

    const zoomPanPadding = this.world.hasActiveZone() ? 0 : 100;
    this.constrainBounds(proposedStrand, {
      ref: true,
      panPadding: zoomPanPadding,
    });

    return proposedStrand;
  }

  clampRegion({
    x,
    y,
    width,
    height,
    padding = 0,
  }: {
    x: number;
    y: number;
    width: number;
    height: number;
    padding?: number;
  }) {
    const w = this.width;
    const h = this.height;
    const matchesHeight = width / w < height / h;

    const rx = x - padding;
    const ry = y - padding;
    const rWidth = width + padding * 2;
    const rHeight = height + padding * 2;

    if (matchesHeight) {
      // pad on the left and right.
      const actualWidth = (rHeight / h) * w;
      return {
        x: rx - (actualWidth - rWidth) / 2,
        y: ry,
        width: actualWidth,
        height: rHeight,
      };
    }
    // pad on the top and bottom.
    const actualHeight = (rWidth / w) * h;
    return {
      x: rx,
      y: ry - (actualHeight - rHeight) / 2,
      width: rWidth,
      height: actualHeight,
    };
  }

  /**
   * Converts units from the viewer to the world.
   *
   * Needs to be tested, as this will become more important with the event system.
   *
   * @param x
   * @param y
   */
  viewerToWorld(x: number, y: number) {
    const scaleFactor = this.getScaleFactor();
    // is this right?
    const xo = this.target[1] + x / scaleFactor;
    const yo = this.target[2] + y / scaleFactor;

    this._viewerToWorld.x = xo;
    this._viewerToWorld.y = yo;
    return { x: xo, y: yo };
  }

  /**
   * Converts units from the viewer to the world.
   *
   * Needs to be tested, as this will become more important with the event system.
   *
   * @param x
   * @param y
   * @param width
   * @param height
   */
  worldToViewer(x: number, y: number, width: number, height: number) {
    const strand = DnaFactory.singleBox(width, height, x, y);

    mutate(strand, compose(scale(this.getScaleFactor()), translate(-this.target[1], -this.target[2])));

    return {
      // visible: visible[0] !== 0,
      x: strand[1],
      y: strand[2],
      width: strand[3] - strand[1],
      height: strand[4] - strand[2],
      strand,
    };
  }

  /**
   * Set scale
   *
   * This will set the scale of the target, with an optional origin.
   *
   * @param scaleFactor
   * @param origin
   */
  setScale(scaleFactor: number, origin?: { x: number; y: number }) {
    mutate(
      this.target,
      scaleAtOrigin(
        scaleFactor,
        origin ? origin.x : this.target[1] + (this.target[3] - this.target[1]) / 2,
        origin ? origin.y : this.target[2] + (this.target[4] - this.target[2]) / 2
      )
    );
    this.pendingUpdate = true;
  }

  /**
   * Sync runtime instances
   *
   * Allows a single controller to drive 2 runtime instances, or 2 controllers to both
   * control each other.
   *
   * @param runtime
   */
  syncTo(runtime: Runtime) {
    const oldTarget = this.target;
    this.target = runtime.target;
    this.pendingUpdate = true;

    // Return an unsubscribe.
    return () => {
      this.target = oldTarget;
    };
  }

  /**
   * Stop the runtime
   *
   * Stops the internal clock, where no more updates will occur. Returns a function to restart it.
   */
  stop(): () => void {
    if (typeof this.stopId !== 'undefined') {
      window.cancelAnimationFrame(this.stopId);
      this.stopId = undefined;
    }

    return () => {
      this.render(performance.now());
    };
  }

  reset() {
    this.renderer.reset();
    this.resetReadyState('runtime-reset');
  }

  resetReadyState(reason: AtlasReadyResetReason = 'manual') {
    this.ready = false;
    this.readyCycle += 1;
    this.readyReason = reason;
    this.readyTimestamp = undefined;
    if (this.renderer.resetReadyState) {
      this.renderer.resetReadyState();
    }
    this.pendingUpdate = true;
  }

  getReadyState(): {
    ready: boolean;
    cycle: number;
    reason: AtlasReadyResetReason;
    timestamp?: number;
  } {
    return {
      ready: this.ready,
      cycle: this.readyCycle,
      reason: this.readyReason,
      timestamp: this.readyTimestamp,
    };
  }

  selectZone(zone: number | string) {
    this.world.selectZone(zone);
    this.pendingUpdate = true;
  }

  goToZone(
    id: string,
    options: {
      paddingPx?: number | { left?: number; right?: number; top?: number; bottom?: number };
      immediate?: boolean;
    } = {}
  ): boolean {
    const zone = this.world.getZoneById(id);
    if (!zone) {
      return false;
    }

    zone.recalculateBounds();
    if (zone.points[0] === 0) {
      return false;
    }

    this.world.selectZone(id);

    const homeTarget = this.getHomeTarget({
      position: zone.points,
      paddingPx: options.paddingPx,
    });

    if (options.immediate) {
      this.transitionManager.stopTransition();
      this.setViewport(homeTarget);
      this.constrainBounds(this.target, { ref: true });
      this.updateControllerPosition();
      this.pendingUpdate = true;
      return true;
    }

    this.transitionManager.applyTransition(
      DnaFactory.singleBox(homeTarget.width, homeTarget.height, homeTarget.x, homeTarget.y),
      undefined,
      {
        duration: 1000,
        easing: easingFunctions.easeOutExpo,
        constrain: false,
      }
    );
    this.updateNextFrame();
    this.pendingUpdate = true;

    return true;
  }

  deselectZone() {
    this.world.deselectZone();
    this.pendingUpdate = true;
  }

  getZoneRuntimeState(zoneId: string, viewport: Projection = this.getViewport()): RuntimeZoneState {
    const zone = this.world.getZoneById(zoneId);
    if (!zone) {
      return {
        zoneId,
        exists: false,
        active: false,
        visibleInViewport: false,
      };
    }

    zone.recalculateBounds();
    const active = this.world.getActiveZone()?.id === zoneId;

    if (zone.points[0] === 0) {
      return {
        zoneId,
        exists: true,
        active,
        visibleInViewport: false,
      };
    }

    const zoneX = zone.points[1];
    const zoneY = zone.points[2];
    const zoneWidth = zone.points[3] - zone.points[1];
    const zoneHeight = zone.points[4] - zone.points[2];
    const visibleInViewport =
      zoneX < viewport.x + viewport.width &&
      zoneX + zoneWidth > viewport.x &&
      zoneY < viewport.y + viewport.height &&
      zoneY + zoneHeight > viewport.y;

    return {
      zoneId,
      exists: true,
      active,
      visibleInViewport,
    };
  }

  hook<Name extends keyof RuntimeHooks, Arg = UnwrapHookArg<Name>>(name: keyof RuntimeHooks, arg: Arg) {
    const len = this.hooks[name].length;
    if (len !== 0) {
      for (let x = 0; x < len; x++) {
        this.hooks[name][x](arg as any);
      }
    }
  }

  registerHook<Name extends keyof RuntimeHooks, Hook = UnwrapHook<Name>>(name: Name, hook: Hook) {
    this.hooks[name].push(hook as any);
    return () => {
      this.hooks[name] = (this.hooks[name] as any[]).filter((e) => e !== (hook as any));
    };
  }

  /**
   * Render
   *
   * The hottest path in the runtime, called every 16.7ms, if possible in the future be double-timed on 120hz monitors.
   *
   * @   param t
   */
  render = (t: number) => {
    const delta = t - this.lastTime;

    if (this.isCommitting || (this.fpsLimit && delta < 1000 / this.fpsLimit)) {
      this.stopId = window.requestAnimationFrame(this.render);
      return;
    }

    this.lastTime = t;
    // First flush
    this.world.flushSubscriptions();
    // Set up our loop.
    this.stopId = window.requestAnimationFrame(this.render);

    // Called every frame.
    this.hook('useFrame', delta);

    let pendingUpdate = this.pendingUpdate;
    const rendererPendingUpdate = this.renderer.pendingUpdate();
    const worldPendingUpdate = this.world.hasPendingAnimation();
    const debugEnabled = this.hasDebugSubscribers();

    if (this.transitionManager.hasPending()) {
      this.transitionManager.runTransition(this.target, delta);

      this.pendingUpdate = true;
      pendingUpdate = true;
      this.updateControllerPosition();
    }

    if (worldPendingUpdate) {
      this.pendingUpdate = true;
      pendingUpdate = true;
    }

    // Finalize a pivot switch endInteraction() deferred (see
    // pivotSwitchPending/finalizePivotSwitch), now that the check above has
    // given any out-of-bounds snap-back triggered by that gesture's release
    // a chance to actually start (or, if it turns out there's nothing to
    // snap back from, a chance to *not* start). Checked here, right after
    // that step and before getPointsAt() captures this frame's object
    // positions -- see finalizePivotSwitch's own comment for why it can't
    // wait until the rotateFromWorldCenter block further down without
    // lagging a frame behind.
    //
    // Also gated on !panMomentumActive: an inertial/elastic pan-back-into-
    // bounds animation drives `target` through per-frame zero-duration
    // transitions, so transitionManager.hasPending() alone is back to false
    // within the same frame it's set and can't be used, on its own, to tell
    // whether that animation is still running -- see panMomentumActive's own
    // comment.
    if (this.pivotSwitchPending && !this.transitionManager.hasPending() && !this.panMomentumActive) {
      this.finalizePivotSwitch();
    }

    if (
      !this.firstRender &&
      !pendingUpdate &&
      // Check if there was a pending update from the renderer.
      !rendererPendingUpdate &&
      !worldPendingUpdate &&
      // Then check the points, the first will catch invalidation.
      this.target[0] === this.lastTarget[0] &&
      // The following are x1, y1, x2, y2 points of the target.
      this.target[1] === this.lastTarget[1] &&
      this.target[2] === this.lastTarget[2] &&
      this.target[3] === this.lastTarget[3] &&
      this.target[4] === this.lastTarget[4]
    ) {
      // Nothing to do, target didn't change since last time.
      return;
    }

    // Group.
    // console.groupCollapsed(`Previous frame took ${delta} ${delta > 17 ? '<-' : ''} ${delta > 40 ? '<--' : ''}`);
    const frame = ++this.debugFrame;
    let paintCount = 0;

    if (debugEnabled) {
      this.emitDebug({
        type: 'frame-start',
        at: t,
        runtimeId: this.id,
        frame,
        delta,
        mode: this.mode,
        pendingUpdate,
        rendererPendingUpdate,
        target: [this.target[1], this.target[2], this.target[3], this.target[4]],
      });
    }

    // The screen-space point actually passed to the renderer as the
    // rotation pivot for this frame -- see currentWorldPivot's doc comment
    // for how this tracks the live viewport center while idle, but holds
    // fixed for the duration of an active pan/zoom transition.
    let currentRotationPivotScreen: { x: number; y: number } | undefined;

    // Must run before getPointsAt() below, not after: getPointsAt() ->
    // WorldObject#getAllPointsAt() -> applyRotation() reads each object's
    // rotationPivot to decide which tile/resolution layer is actually
    // visible under the current rotation. Updating pivots afterward means
    // that read sees last frame's pivot, one frame stale relative to the
    // target this frame is about to render -- harmless while idle (pivot
    // isn't moving), but during an animated pan/zoom the live pivot moves
    // every frame, so selection and the actual paint transform (which does
    // use this frame's pivot -- see CanvasRenderer#applyTransform) disagree
    // for the whole transition. That mismatch is what let a corner of a
    // rotated, zoomed-in tile go permanently under-selected -- and thus
    // rendered from a coarser fallback layer, seen as blur -- once the
    // transition settled and nothing re-triggered a correcting pass.
    if (this.rotateFromWorldCenter) {
      this.viewport = this.getRendererScreenPosition();
      this.updateViewportCenterPoint();
      const worldPivot = this.currentWorldPivot();
      this.updateWorldObjectRotationPivots(worldPivot);
      currentRotationPivotScreen = worldPivot ? this.projectToScreen(worldPivot) : undefined;
    }

    this.hook('useBeforeFrame', delta);
    // Before everything kicks off, add a hook.
    this.renderer.beforeFrame(this.world, delta, this.target, this.hookOptions);
    // Calculate a scale factor by passing in the height and width of the target.
    const scaleFactor = this.getScaleFactor();
    // Get the points to render based on this scale factor and the current x,y,w,h in the target buffer.
    const points = this.renderer.getPointsAt(this.world, this.target, this.aggregate, scaleFactor);
    const pointsLen = points.length;

    for (let p = 0; p < pointsLen; p++) {
      // each point is an array of [SpacialContent, Strand, Strand]
      // The first is used to get real rendering data, like Image URLs etc.
      // The second is the points themselves for the layer. If this is a single
      // image this will be a single set of 5 points, for tiled images, it will be
      // the correct list of tiles, and a much longer list of points.
      const paint = points[p][0];
      const point = points[p][1];
      const transformation = points[p][2];

      // This is the position of the points. We apply the transform that came with the points.
      // The points before the transformation are just points relative to their parent (canvas?)
      // When we apply the transform, they become relative to the viewer. Both of these point
      // values are useful, but for rendering, we want the viewer-points.
      // @todo add option in renderer to omit this transform, instead passing it as a param.
      const position = transformation ? transform(point, transformation, this.transformBuffer) : point;
      // Another hook before painting a layer.

      

      this.renderer.prepareLayer(
        paint,
        paint.__parent && transformation
          ? transform(paint.__parent.crop || paint.__parent.points, transformation)
          : position,
          currentRotationPivotScreen?.x, currentRotationPivotScreen?.y
      );

      // For loop helps keep this fast, looping through all of the tiles that make up an image.
      // This could be a single point, where len is one.
      const totalTiles = position.length / 5;
      for (let i = 0; i < totalTiles; i++) {
        const key = i * 5;
        // First key position tells us if we should render or not. A 0 will usually
        // indicate that the image is off-screen.
        if (position[key] === 0) {
          continue;
        }

        // This is the most expensive call by a long shot, the client implementation.
        // In the reference Canvas implementation, this will grab the URL of the image,
        // load it into an image tag and then paint it onto the canvas at the viewer points.
        this.renderer.paint(
          paint,
          i,
          position[key + 1],
          position[key + 2],
          position[key + 3] - position[key + 1],
          position[key + 4] - position[key + 2]
        );
        paintCount++;
        if (debugEnabled) {
          let imageUrl: string | undefined;
          if ((paint as any).getImageUrl) {
            try {
              imageUrl = (paint as any).getImageUrl(i);
            } catch (err) {
              imageUrl = undefined;
            }
          }
          this.emitDebug({
            type: 'paint',
            at: t,
            runtimeId: this.id,
            frame,
            layerIndex: p,
            tileIndex: i,
            x: position[key + 1],
            y: position[key + 2],
            width: position[key + 3] - position[key + 1],
            height: position[key + 4] - position[key + 2],
            paintId: (paint as any).id || `${p}:${i}`,
            paintType: paint?.constructor?.name || paint.type || 'UnknownPaint',
            ownerId: (paint as any).__owner?.value?.id,
            compositeId: (paint as any).__parent?.id,
            imageUrl,
          });
        }
        this.hook('useAfterPaint', paint);
      }

      this.renderer.finishLayer(paint, point);
    }
    // A final hook after the entire frame is complete.
    this.renderer.afterFrame(this.world, delta, this.target, this.hookOptions);
    // Mark this frame as consumed before running after-frame hooks so hooks can request the next frame.
    this.pendingUpdate = false;
    this.hook('useAfterFrame', delta);
    // Finally at the end, we set up the frame we just rendered.
    this.lastTarget[0] = this.target[0];
    this.lastTarget[1] = this.target[1];
    this.lastTarget[2] = this.target[2];
    this.lastTarget[3] = this.target[3];
    this.lastTarget[4] = this.target[4];
    // We've just finished our first render.
    this.firstRender = false;
    this.logNextRender = false;
    if (!this.ready && this.renderer.isReady()) {
      this.ready = true;
      this.readyTimestamp = performance.now();
      this.world.trigger('ready');
    }

    if (debugEnabled) {
      this.emitDebug({
        type: 'frame-end',
        at: t,
        runtimeId: this.id,
        frame,
        delta,
        scaleFactor,
        paintCount,
        ready: this.ready,
        pendingUpdate: this.pendingUpdate,
        worldWidth: this.world.width,
        worldHeight: this.world.height,
        target: [this.target[1], this.target[2], this.target[3], this.target[4]],
      });
    }
    // Flush world subscriptions.
    this.world.flushSubscriptions();
    const updates = this.world.getScheduledUpdates(this.target, scaleFactor);
    const len = updates.length;
    if (len > 0) {
      for (let i = 0; i < len; i++) {
        const update = updates[len - i - 1]();
        if (update) {
          update.then(() => {
            this.pendingUpdate = true;
          });
        } else {
          this.pendingUpdate = true;
        }
      }
    }
  };

  updateNextFrame() {
    this.pendingUpdate = true;
  }

  addDebugSubscriber(callback: (event: RuntimeDebugEvent) => void) {
    this.debugSubscribers.add(callback);
    return () => {
      this.removeDebugSubscriber(callback);
    };
  }

  removeDebugSubscriber(callback: (event: RuntimeDebugEvent) => void) {
    this.debugSubscribers.delete(callback);
  }

  private hasDebugSubscribers() {
    return this.debugSubscribers.size > 0;
  }

  private emitDebug(event: RuntimeDebugEvent) {
    if (this.debugSubscribers.size === 0) {
      return;
    }
    for (const callback of this.debugSubscribers) {
      callback(event);
    }
  }
}
