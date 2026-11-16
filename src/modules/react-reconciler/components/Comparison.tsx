import React, { forwardRef } from 'react';
import type { ComparisonController, ComparisonOptions } from '../../comparison/comparison';

export type ComparisonProps = ComparisonOptions;
/** A nonvisual scene declaration. Put the divider in the surrounding DOM tree. */
export const Comparison = forwardRef<ComparisonController, ComparisonProps>((props, ref) => (
  <comparison {...props} ref={ref} />
));
Comparison.displayName = 'Comparison';
