import { createInvalidFunctionCall } from './invalid-function-call';

export const doesNotSupport = {
  append: createInvalidFunctionCall('Cannot append'),
  insertBefore: createInvalidFunctionCall('Cannot insert before'),
  remove: createInvalidFunctionCall('Cannot remove'),
  prepareUpdate: (): true => true,
};
