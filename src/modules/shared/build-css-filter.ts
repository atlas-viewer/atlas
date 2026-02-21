import { HookOptions } from '../../renderer/runtime';

export function buildCssFilter(options: HookOptions): string {
  if (
    !options.enableFilters ||
    (!options.filters.brightness &&
      !options.filters.contrast &&
      !options.filters.grayscale &&
      !options.filters.invert &&
      !options.filters.sepia &&
      !options.filters.saturate &&
      !options.filters.hueRotate &&
      !options.filters.blur)
  ) {
    return 'none';
  }

  let filter = '';
  if (options.filters.brightness) {
    filter += `brightness(${~~(100 + options.filters.brightness * 100)}%) `;
  }
  if (options.filters.contrast) {
    filter += `contrast(${~~(100 + options.filters.contrast * 100)}%) `;
  }
  if (options.filters.grayscale) {
    filter += `grayscale(${~~(options.filters.grayscale * 100)}%) `;
  }
  if (options.filters.invert) {
    filter += `invert(${~~(options.filters.invert * 100)}%) `;
  }
  if (options.filters.sepia) {
    filter += `sepia(${~~(options.filters.sepia * 100)}%) `;
  }
  if (options.filters.saturate) {
    filter += `saturate(${~~(100 + options.filters.saturate * 100)}%) `;
  }
  if (options.filters.hueRotate) {
    filter += `hue-rotate(${options.filters.hueRotate}deg) `;
  }
  if (options.filters.blur) {
    filter += `blur(${options.filters.blur}px) `;
  }

  return filter.trim();
}
