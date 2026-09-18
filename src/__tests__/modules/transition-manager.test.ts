import { dna } from '@atlas-viewer/dna';
import { TransitionManager } from '../../modules/transition-manager/transition-manager';

describe('Transition manager', () => {
  test('runTransition - left to right', () => {
    const buffer = dna([1, -100, -100, 100, 100]);
    const tm = new TransitionManager({ target: buffer } as any);

    tm.customTransition((transition) => {
      transition.to = dna([1, 100, 100, 300, 300]);
      transition.from = dna([1, -100, -100, 100, 100]);
      transition.total_time = 100;
      transition.elapsed_time = 0;
      transition.timingFunction = (t: number) => t;
      transition.done = false;
    });

    tm.runTransition(buffer, 25);
    expect(buffer[1]).toBe(-50);
    expect(buffer[2]).toBe(-50);
    expect(buffer[3]).toBe(150);
    expect(buffer[4]).toBe(150);

    tm.runTransition(buffer, 25);
    expect(buffer[1]).toBe(0);
    expect(buffer[2]).toBe(0);
    expect(buffer[3]).toBe(200);
    expect(buffer[4]).toBe(200);

    tm.runTransition(buffer, 25);
    expect(buffer[1]).toBe(50);
    expect(buffer[2]).toBe(50);
    expect(buffer[3]).toBe(250);
    expect(buffer[4]).toBe(250);
  });
  test('runTransition - right to left', () => {
    const buffer = dna([1, 100, 100, 300, 300]);
    const tm = new TransitionManager({ target: buffer } as any);

    tm.customTransition((transition) => {
      transition.to = dna([1, -100, -100, 100, 100]);
      transition.from = dna([1, 100, 100, 300, 300]);
      transition.total_time = 100;
      transition.elapsed_time = 0;
      transition.timingFunction = (t: number) => t;
      transition.done = false;
    });

    tm.runTransition(buffer, 25);
    expect(buffer[1]).toBe(50);
    expect(buffer[2]).toBe(50);
    expect(buffer[3]).toBe(250);
    expect(buffer[4]).toBe(250);

    tm.runTransition(buffer, 25);
    expect(buffer[1]).toBe(0);
    expect(buffer[2]).toBe(0);
    expect(buffer[3]).toBe(200);
    expect(buffer[4]).toBe(200);

    tm.runTransition(buffer, 25);
    expect(buffer[1]).toBe(-50);
    expect(buffer[2]).toBe(-50);
    expect(buffer[3]).toBe(150);
    expect(buffer[4]).toBe(150);

    tm.runTransition(buffer, 25);
    expect(buffer[1]).toBe(-100);
    expect(buffer[2]).toBe(-100);
    expect(buffer[3]).toBe(100);
    expect(buffer[4]).toBe(100);
  });

  test('constrainTarget animates toward a constrained arbitrary target', () => {
    const buffer = dna([1, 0, 0, 100, 100]);
    const tm = new TransitionManager({
      target: buffer,
      updateNextFrame: vi.fn(),
      constrainTarget: vi.fn(() => [true, dna([1, -25, -25, 125, 125])]),
    } as any);

    tm.constrainTarget(dna([1, -50, -50, 150, 150]));

    expect(tm.getPendingTransition().done).toBe(false);
    expect(tm.getPendingTransition().to[1]).toBe(-25);
    expect(tm.getPendingTransition().to[2]).toBe(-25);
  });

  // Regression test for the td-overshoot fix: a single-frame delta large
  // enough to jump past total_time (a backgrounded tab resuming, a dropped
  // frame, a GC pause) used to leave td > 1. easeOutQuart-shaped curves
  // (1 - (1-t)^4) are only monotonic on [0, 1] -- fed a t past 1, they
  // curve back down instead of continuing toward the endpoint, so `step`
  // would land short of (or even behind) `to` on the exact frame that also
  // marks the transition done, stranding `target` there permanently since
  // nothing else re-triggers a correction.
  test('runTransition clamps an overshooting delta to the transition\'s end value, not wherever a non-monotonic easing curve lands past t=1', () => {
    const buffer = dna([1, 0, 0, 0, 0]);
    const tm = new TransitionManager({ target: buffer } as any);

    // Shaped like easeOutQuart: strictly increasing on [0,1], reaching 1 at
    // t=1, then curving back down for t>1 -- exactly the failure mode an
    // unclamped td would hit.
    const nonMonotonicPastOne = (t: number) => 1 - Math.pow(1 - t, 4);

    tm.customTransition((transition) => {
      transition.to = dna([1, 100, 100, 100, 100]);
      transition.from = dna([1, 0, 0, 0, 0]);
      transition.total_time = 100;
      transition.elapsed_time = 90;
      transition.timingFunction = nonMonotonicPastOne;
      transition.done = false;
    });

    // A single oversized delta pushes elapsed_time well past total_time in
    // one step (90 + 40 = 130, i.e. td = 1.3 unclamped).
    tm.runTransition(buffer, 40);

    expect(buffer[1]).toBe(100);
    expect(buffer[2]).toBe(100);
    expect(buffer[3]).toBe(100);
    expect(buffer[4]).toBe(100);
    expect(tm.hasPending()).toBe(false);
  });
});

describe('Transition manager constrainBounds', () => {
  test('clears isConstraining when nothing needed correcting', () => {
    const target = dna([1, 0, 0, 100, 100]);
    const runtime = {
      target,
      // Reports nothing out of bounds -- the branch that matters here.
      constrainBounds: () => [false, dna(target)],
    };
    const tm = new TransitionManager(runtime as any);

    (tm as any).constrainBounds();

    // Without the fix, this stays true forever: the only other place it's
    // cleared is inside the corrective transition's own callback, which
    // never runs when there was nothing to correct.
    expect(tm.isConstraining).toBe(false);
  });

  test('leaves isConstraining true while a real correction is in flight', () => {
    const target = dna([1, -500, -500, -400, -400]);
    const runtime = {
      target,
      updateNextFrame: () => {},
      constrainBounds: () => [true, dna([1, 0, 0, 100, 100])],
    };
    const tm = new TransitionManager(runtime as any);

    (tm as any).constrainBounds();

    // The corrective transition is now pending -- isConstraining should
    // stay true until *that* transition's own completion callback clears
    // it, not flip false immediately the way the "nothing to do" path does.
    expect(tm.isConstraining).toBe(true);
    expect(tm.hasPending()).toBe(true);
  });
});
