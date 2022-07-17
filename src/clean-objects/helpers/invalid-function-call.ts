export function createInvalidFunctionCall(message: string) {
  return function invalidFunctionCall() {
    throw new Error(message);
  } as (...args: any) => any;
}
