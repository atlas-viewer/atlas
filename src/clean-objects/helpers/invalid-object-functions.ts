import { createInvalidFunctionCall } from './invalid-function-call';

export const doesNotSupport = {
  append: createInvalidFunctionCall('Cannot append'),
  insertBefore: createInvalidFunctionCall('Cannot insert before'),
  remove: createInvalidFunctionCall('Cannot remove'),
  createHost: createInvalidFunctionCall('Does not support hosts'),
  mountHost: createInvalidFunctionCall('Does not support hosts'),
  updateHost: createInvalidFunctionCall('Does not support hosts'),
  prepareUpdate: (): true => true,
};
