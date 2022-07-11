export function getRatio(a: number, b: number) {
  if (a === 0) {
    return [0, 1];
  }
  if (b === 0) {
    return [1, 0];
  }

  const ratio = Math.abs(a) / Math.abs(b);

  return [ratio, 1 - ratio];
}
