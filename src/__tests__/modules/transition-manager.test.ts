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
});
