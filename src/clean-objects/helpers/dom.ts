export function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  options?: ElementCreationOptions
): HTMLElementTagNameMap[K];
export function createElement(tagName: string, options?: any) {
  return document.createElement(tagName, options);
}
