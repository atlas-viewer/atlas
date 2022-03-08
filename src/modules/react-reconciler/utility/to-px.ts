export function toPx(str: string | number) {
  if (Number(str) == str) {
    return `${str}px`;
  }

  return str;
}
