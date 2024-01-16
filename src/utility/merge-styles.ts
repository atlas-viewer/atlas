import { BoxStyle } from '../objects/box';

export function mergeStyles(defaultStyle?: BoxStyle, style?: BoxStyle): BoxStyle | undefined {
  if (!defaultStyle) {
    return style;
  }
  if (!style) {
    return defaultStyle;
  }
  return {
    ...defaultStyle,
    ...(style || {}),
    ':hover': defaultStyle[':hover']
      ? Object.assign(defaultStyle[':hover'] || {}, style[':hover'] || {})
      : style[':hover'],
    ':active': defaultStyle[':active']
      ? Object.assign(defaultStyle[':active'] || {}, style[':active'] || {})
      : style[':hover'],
  };
}
