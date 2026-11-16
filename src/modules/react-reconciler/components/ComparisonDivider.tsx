import React, { forwardRef, useLayoutEffect, useRef } from 'react';
import type { ComparisonController, ComparisonDetail } from '../../comparison/comparison';
import { createComparisonDivider } from '../../comparison/divider';
import type { ComparisonSplit } from '../../comparison/geometry';

export type ComparisonDividerProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange' | 'children'> & {
  comparison: ComparisonController | null | undefined;
  'aria-label': string;
  onSplitChange?: (split: ComparisonSplit, detail: ComparisonDetail) => void;
  onSplitCommit?: (split: ComparisonSplit, detail: ComparisonDetail) => void;
};

/** React DOM component: use in AtlasAuto.htmlChildren or a positioned viewer wrapper. */
export const ComparisonDivider = forwardRef<HTMLElement, ComparisonDividerProps>(function ComparisonDivider(
  { comparison, onSplitChange, onSplitCommit, ...props },
  ref
) {
  const container = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onSplitChange, onSplitCommit });
  callbacks.current = { onSplitChange, onSplitCommit };
  useLayoutEffect(() => {
    if (!comparison || !container.current) return;
    const divider = createComparisonDivider(comparison, { container: container.current, label: props['aria-label'] });
    const assign = (value: HTMLElement | null) => {
      if (typeof ref === 'function') ref(value);
      else if (ref) ref.current = value;
    };
    assign(divider.element);
    const input = (event: Event) => {
      const { split, ...detail } = (event as CustomEvent<ComparisonDetail & { split: ComparisonSplit }>).detail;
      callbacks.current.onSplitChange?.(split, detail);
    };
    const commit = (event: Event) => {
      const { split, ...detail } = (event as CustomEvent<ComparisonDetail & { split: ComparisonSplit }>).detail;
      callbacks.current.onSplitCommit?.(split, detail);
    };
    divider.element.addEventListener('comparisoninput', input);
    divider.element.addEventListener('comparisoncommit', commit);
    return () => {
      divider.element.removeEventListener('comparisoninput', input);
      divider.element.removeEventListener('comparisoncommit', commit);
      divider.destroy();
      assign(null);
    };
  }, [comparison, ref, props['aria-label']]);
  return (
    <div {...props} ref={container} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', ...props.style }} />
  );
});
