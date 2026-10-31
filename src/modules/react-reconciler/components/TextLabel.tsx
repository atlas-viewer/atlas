import React from 'react';
import { TextLabelObject, type TextLabelObjectProps } from '../../../objects/text-label';
import type { AllEvents } from '../types';

export type TextLabelProps = TextLabelObjectProps & AllEvents;
const activate = () => {};

export const TextLabel = React.forwardRef<TextLabelObject, TextLabelProps>((props, ref) =>
  React.createElement('text-label', {
    onPointerEnter: activate,
    onPointerLeave: activate,
    onPointerDown: activate,
    onPointerUp: activate,
    onPointerCancel: activate,
    ...props,
    ref,
  })
);
TextLabel.displayName = 'TextLabel';
