/**
 * @jest-environment jsdom
 */

import { createDOMHost } from '../../clean-objects/hosts/dom';

describe('DOM Host', function () {
  test('Create simple DOM host', () => {
    const host = createDOMHost('dom-host');

    expect(host).toBeDefined();
    expect(host.element).toBeDefined();
    expect(host.loading).toEqual(false);
  });
});
