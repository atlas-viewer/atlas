import {
  createCompositeLoader,
  createLoader,
  emptyHostElement,
  emptyHostElementMap,
  getStorageFromIndex,
} from '../../clean-objects/hosts/helpers';

function deferred() {
  let resolve!: (t?: any) => any;
  const defer = new Promise((res) => {
    resolve = res;
  });

  return [defer, resolve] as const;
}

describe('Host utilities', function () {
  test('Simple async host loader', async () => {
    const host = emptyHostElement('dom-host');

    const [defer, resolve] = deferred();

    const loader = createLoader(host, () => {
      return defer;
    });

    const loaderPromise = loader();

    expect(host.loading).toEqual(true);
    expect(host.element).toEqual(undefined);

    resolve({ host: 'test-host' });

    await loaderPromise;

    expect(host.loading).toEqual(false);
    expect(host.element).toEqual({ host: 'test-host' });
  });

  test('Simple async host loader (thrash)', async () => {
    expect.assertions(1);
    const host = emptyHostElement('dom-host');

    const [defer, resolve] = deferred();

    const loader = createLoader(host, () => {
      expect(true).toEqual(true);
      return defer;
    });

    const loaderPromise1 = loader();
    const loaderPromise2 = loader();
    const loaderPromise3 = loader();

    resolve({ host: 'test-host' });

    await loaderPromise1;
    await loaderPromise2;
    await loaderPromise3;
  });

  test('Simple async host loader throws error', async () => {
    const host = emptyHostElement('dom-host');

    const loader = createLoader(host, () => {
      throw new Error('This is an error');
    });

    await loader();

    expect(host.loading).toEqual(false);
    expect(host.element).toEqual(undefined);
    expect(host.error).toEqual(new Error('This is an error'));
  });

  test('Cancel async host loader', async () => {
    const host = emptyHostElement('dom-host');

    const [defer, resolve] = deferred();

    let signal!: AbortSignal;

    const loader = createLoader(
      host,
      (s) => {
        signal = s!;
        return defer;
      },
      true
    );

    const loaderPromise = loader();

    expect(host.abortController).toBeDefined();
    expect(host.loading).toEqual(true);
    expect(host.element).toEqual(undefined);

    // Abort, then resolve.
    host.abortController!.abort();
    resolve({ host: 'test-host' });

    await loaderPromise;

    expect(signal.aborted).toEqual(true);
    expect(host.loading).toEqual(false);
    expect(host.element).not.toBeDefined();
  });

  test('Detect cancel in signal', async () => {
    expect.assertions(1);

    const host = emptyHostElement('dom-host');

    const [defer, resolve] = deferred();

    const loader = createLoader(
      host,
      async (signal) => {
        const value = await defer;

        expect(signal?.aborted).toEqual(true);

        return value;
      },
      true
    );

    const loaderPromise = loader();
    // Abort, then resolve.
    host.abortController!.abort();
    resolve({ host: 'test-host' });

    await loaderPromise;
  });

  test('Composite loader', async () => {
    const host = emptyHostElementMap('any', 4); // 4xN

    const loader = createCompositeLoader(host, ({ index, row, column }) => {
      return { index, row, column };
    });

    await Promise.all([
      // Load 2 full rows.
      loader(0),
      loader(1),
      loader(2),
      loader(3),
      loader(4),
      loader(5),
      loader(6),
      loader(7),
    ]);

    expect(host.elements).toMatchInlineSnapshot(`
      Object {
        "0": Object {
          "0": Object {
            "column": 0,
            "index": 0,
            "row": 0,
          },
          "1": Object {
            "column": 0,
            "index": 4,
            "row": 1,
          },
        },
        "1": Object {
          "0": Object {
            "column": 1,
            "index": 1,
            "row": 0,
          },
          "1": Object {
            "column": 1,
            "index": 5,
            "row": 1,
          },
        },
        "2": Object {
          "0": Object {
            "column": 2,
            "index": 2,
            "row": 0,
          },
          "1": Object {
            "column": 2,
            "index": 6,
            "row": 1,
          },
        },
        "3": Object {
          "0": Object {
            "column": 3,
            "index": 3,
            "row": 0,
          },
          "1": Object {
            "column": 3,
            "index": 7,
            "row": 1,
          },
        },
      }
    `);
  });

  test('Composite loader - some async', async () => {
    const host = emptyHostElementMap('any', 4); // 4xN

    const [defer1, resolve1] = deferred();
    const [defer2, resolve2] = deferred();
    const loader = createCompositeLoader(host, ({ index, row, column }) => {
      if (index === 0) {
        return defer1;
      }
      if (index === 2) {
        return defer2;
      }

      return { index, row, column };
    });

    await Promise.all([
      // Wait for odd rows.
      loader(1),
      loader(3),
    ]);

    const promise1 = loader(0);
    const promise2 = loader(2);

    expect(host.elements).toEqual({
      '1': {
        '0': { index: 1, row: 0, column: 1 },
      },
      '3': {
        '0': { index: 3, row: 0, column: 3 },
      },
    });

    resolve1({ index: 0, row: 0, column: 0 });
    resolve2({ index: 2, row: 0, column: 2 });
    await promise1;
    await promise2;

    expect(host.elements).toEqual({
      '0': { '0': { index: 0, row: 0, column: 0 } },
      '1': { '0': { index: 1, row: 0, column: 1 } },
      '2': { '0': { index: 2, row: 0, column: 2 } },
      '3': { '0': { index: 3, row: 0, column: 3 } },
    });
  });

  test('Composite loader - abort', async () => {
    const host = emptyHostElementMap('any', 4); // 4xN

    const [defer1, resolve1] = deferred();
    const loader = createCompositeLoader(
      host,
      ({ index, row, column }) => {
        if (index === 0) {
          return defer1;
        }

        return { index, row, column };
      },
      true
    );

    await loader(1);

    const promise1 = loader(0);

    expect(host.elements).toEqual({
      '1': { '0': { index: 1, row: 0, column: 1 } },
    });

    const controller1 = getStorageFromIndex<AbortController>(host, 0, 'abortMap');

    expect(controller1).toBeDefined();

    controller1!.abort();

    resolve1({ index: 0, row: 0, column: 0 });

    expect(getStorageFromIndex<AbortController>(host, 0, 'loadingMap')).toEqual(true);

    await promise1;

    expect(host.elements).toEqual({
      '1': { '0': { index: 1, row: 0, column: 1 } },
    });

    expect(getStorageFromIndex<AbortController>(host, 0, 'loadingMap')).toEqual(false);
    expect(getStorageFromIndex<AbortController>(host, 1, 'loadingMap')).toEqual(false);
  });

  test('Composite loader - error', async () => {
    const host = emptyHostElementMap('any', 4); // 4xN
    const loader = createCompositeLoader(
      host,
      ({ index, row, column }) => {
        if (index === 0) {
          throw new Error('This is an error');
        }

        return { index, row, column };
      },
      true
    );

    await loader(0);
    await loader(1);

    expect(host.elements).toEqual({
      '1': { '0': { index: 1, row: 0, column: 1 } },
    });

    expect(getStorageFromIndex<AbortController>(host, 0, 'errorMap')).toEqual(new Error('This is an error'));
    expect(getStorageFromIndex<AbortController>(host, 1, 'errorMap')).toEqual(undefined);

    expect(host.elements).toEqual({
      '1': { '0': { index: 1, row: 0, column: 1 } },
    });

    expect(getStorageFromIndex<AbortController>(host, 0, 'loadingMap')).toEqual(false);
    expect(getStorageFromIndex<AbortController>(host, 1, 'loadingMap')).toEqual(false);
  });
});
