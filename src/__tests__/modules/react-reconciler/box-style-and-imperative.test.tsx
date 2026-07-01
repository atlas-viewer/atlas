/** @vitest-environment happy-dom */

import React, { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { Box } from '../../../objects/box';
import type { BoxRef } from '../../react-reconciler/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Exercise `Box.applyProps` directly without going through React so the
 * rendering layer is not needed for the core logic tests.
 */
function makeBox(): Box {
  const box = new Box();
  box.applyProps({ target: { x: 0, y: 0, width: 100, height: 50 } });
  return box;
}

// ---------------------------------------------------------------------------
// Unit tests — Box.applyProps style handling
// ---------------------------------------------------------------------------

describe('Box applyProps – style prop lifecycle', () => {
  test('setting an outline shorthand expands to sub-properties', () => {
    const box = makeBox();
    box.applyProps({ style: { outline: '2px solid red' } });
    expect(box.props.style?.outlineWidth).toBe('2px ');
    expect(box.props.style?.outlineStyle).toBe('solid');
    expect(box.props.style?.outlineColor).toBe('red');
  });

  test('removing outline clears the expanded sub-properties', () => {
    const box = makeBox();
    box.applyProps({ style: { outline: '2px solid red' } });
    // Remove it on the next render.
    box.applyProps({ style: {} });
    expect(box.props.style?.outlineWidth).toBeUndefined();
    expect(box.props.style?.outlineStyle).toBeUndefined();
    expect(box.props.style?.outlineColor).toBeUndefined();
  });

  test('setting a border shorthand expands to sub-properties', () => {
    const box = makeBox();
    box.applyProps({ style: { border: '1px solid blue' } });
    expect(box.props.style?.borderWidth).toBe('1px ');
    expect(box.props.style?.borderStyle).toBe('solid');
    expect(box.props.style?.borderColor).toBe('blue');
  });

  test('removing border clears the expanded sub-properties', () => {
    const box = makeBox();
    box.applyProps({ style: { border: '1px solid blue' } });
    // Next render: no border.
    box.applyProps({ style: {} });
    expect(box.props.style?.borderWidth).toBeUndefined();
    expect(box.props.style?.borderStyle).toBeUndefined();
    expect(box.props.style?.borderColor).toBeUndefined();
  });

  test('setting style then passing undefined style clears it entirely', () => {
    const box = makeBox();
    box.applyProps({ style: { backgroundColor: 'red', border: '2px solid green' } });
    // React passes no style on the next render.
    box.applyProps({});
    expect(box.props.style?.backgroundColor).toBeUndefined();
    expect(box.props.style?.borderWidth).toBeUndefined();
    expect(box.props.style?.borderColor).toBeUndefined();
  });

  test('style change bumps revision', () => {
    const box = makeBox();
    const rev0 = box.__revision;
    box.applyProps({ style: { backgroundColor: 'red' } });
    const rev1 = box.__revision;
    box.applyProps({ style: { backgroundColor: 'blue' } });
    const rev2 = box.__revision;
    expect(rev1).toBeGreaterThan(rev0);
    expect(rev2).toBeGreaterThan(rev1);
  });

  test('identical style on re-render does NOT bump revision', () => {
    const box = makeBox();
    box.applyProps({ style: { backgroundColor: 'red' } });
    const rev = box.__revision;
    box.applyProps({ style: { backgroundColor: 'red' } });
    expect(box.__revision).toBe(rev);
  });

  test('removing backgroundColor bumps revision', () => {
    const box = makeBox();
    box.applyProps({ style: { backgroundColor: 'red' } });
    const rev = box.__revision;
    box.applyProps({ style: {} });
    expect(box.__revision).toBeGreaterThan(rev);
  });

  test('style is replaced wholesale, not merged (deep-partial bug)', () => {
    const box = makeBox();
    box.applyProps({ style: { backgroundColor: 'red', opacity: 0.5 } });
    // Next render only passes backgroundColor.
    box.applyProps({ style: { backgroundColor: 'red' } });
    // opacity should be gone, not silently retained.
    expect(box.props.style?.opacity).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Unit tests — imperative translate / resize / clearSize
// ---------------------------------------------------------------------------

describe('Box imperative API', () => {
  test('translate moves the points and accumulates', () => {
    const box = makeBox(); // x=0, y=0, w=100, h=50
    box.translate(10, 20);
    expect(box.points[1]).toBe(10);
    expect(box.points[2]).toBe(20);
    expect(box.points[3]).toBe(110);
    expect(box.points[4]).toBe(70);

    box.translate(5, 5);
    expect(box.points[1]).toBe(15);
    expect(box.points[2]).toBe(25);
  });

  test('translate bumps revision', () => {
    const box = makeBox();
    const rev = box.__revision;
    box.translate(1, 2);
    expect(box.__revision).toBeGreaterThan(rev);
  });

  test('resize adds to dimensions and accumulates', () => {
    const box = makeBox(); // w=100, h=50
    box.resize(20, 10);
    expect(box.points[3]).toBe(120); // x2 = x + w + delta
    expect(box.points[4]).toBe(60);

    box.resize(5, 5);
    expect(box.points[3]).toBe(125);
    expect(box.points[4]).toBe(65);
  });

  test('resize bumps revision', () => {
    const box = makeBox();
    const rev = box.__revision;
    box.resize(10, 5);
    expect(box.__revision).toBeGreaterThan(rev);
  });

  test('clearSize removes accumulated resize deltas', () => {
    const box = makeBox(); // w=100, h=50
    box.resize(20, 10);
    box.clearSize();
    expect(box.points[3]).toBe(100);
    expect(box.points[4]).toBe(50);
    expect(box._imperativeDeltaWidth).toBe(0);
    expect(box._imperativeDeltaHeight).toBe(0);
  });

  test('clearSize bumps revision', () => {
    const box = makeBox();
    box.resize(10, 5);
    const rev = box.__revision;
    box.clearSize();
    expect(box.__revision).toBeGreaterThan(rev);
  });

  test('applyProps preserves imperative translation across React re-renders', () => {
    const box = makeBox(); // x=0, y=0
    box.translate(30, 40);
    // React re-renders with the same target.
    box.applyProps({ target: { x: 0, y: 0, width: 100, height: 50 } });
    // The imperative translation should be preserved.
    expect(box.points[1]).toBe(30);
    expect(box.points[2]).toBe(40);
  });

  test('applyProps preserves imperative resize across React re-renders', () => {
    const box = makeBox(); // w=100, h=50
    box.resize(20, 10);
    box.applyProps({ target: { x: 0, y: 0, width: 100, height: 50 } });
    expect(box.points[3]).toBe(120);
    expect(box.points[4]).toBe(60);
  });

  test('translate does not affect resize deltas and vice-versa', () => {
    const box = makeBox();
    box.translate(10, 10);
    box.resize(20, 30);
    expect(box._imperativeTranslateX).toBe(10);
    expect(box._imperativeTranslateY).toBe(10);
    expect(box._imperativeDeltaWidth).toBe(20);
    expect(box._imperativeDeltaHeight).toBe(30);
    box.clearSize();
    expect(box._imperativeTranslateX).toBe(10);
    expect(box._imperativeTranslateY).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Unit tests — boxSizing style property
// ---------------------------------------------------------------------------

describe('Box applyProps – boxSizing', () => {
  test('boxSizing defaults to undefined (canvas renderer treats absent as border-box)', () => {
    const box = makeBox();
    box.applyProps({ style: { backgroundColor: 'red' } });
    expect(box.props.style?.boxSizing).toBeUndefined();
  });

  test('boxSizing: border-box is stored in style', () => {
    const box = makeBox();
    box.applyProps({ style: { boxSizing: 'border-box', backgroundColor: 'red' } });
    expect(box.props.style?.boxSizing).toBe('border-box');
  });

  test('boxSizing: content-box is stored in style', () => {
    const box = makeBox();
    box.applyProps({ style: { boxSizing: 'content-box', border: '4px solid black' } });
    expect(box.props.style?.boxSizing).toBe('content-box');
  });

  test('changing boxSizing bumps revision', () => {
    const box = makeBox();
    box.applyProps({ style: { boxSizing: 'border-box', backgroundColor: 'red' } });
    const rev = box.__revision;
    box.applyProps({ style: { boxSizing: 'content-box', backgroundColor: 'red' } });
    expect(box.__revision).toBeGreaterThan(rev);
  });

  test('boxSizing is cleared when style is removed', () => {
    const box = makeBox();
    box.applyProps({ style: { boxSizing: 'content-box', backgroundColor: 'red' } });
    box.applyProps({});
    expect(box.props.style?.boxSizing).toBeUndefined();
  });
});
