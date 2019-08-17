import { PooledMap } from '../../src/data-structures/pooled-map';

describe('pooled map', () => {
  test('it will save values to a fixed size', () => {
    const map = new PooledMap<string>(3);

    // Set 3 values.
    map.set('a', 'A');
    map.set('b', 'B');
    map.set('c', 'C');

    expect(map.get('a')).toEqual('A');
    expect(map.get('b')).toEqual('B');
    expect(map.get('c')).toEqual('C');

    map.set('d', 'D');

    expect(map.get('d')).toEqual('D');
    expect(map.get('c')).toEqual('C');
    expect(map.get('b')).toEqual('B');
    expect(map.get('a')).toEqual(null);
  });

  test('you can lock a value', () => {
    const map = new PooledMap<string>(3);

    // Set 3 values.
    map.set('a', 'A');
    map.set('b', 'B');
    map.set('c', 'C');

    map.lock('a');

    map.set('d', 'D');

    expect(map.get('a')).toEqual('A');
    expect(map.get('b')).toEqual('B');
    expect(map.get('c')).toEqual('C');
    expect(map.get('d')).toEqual('D');

    map.set('e', 'E');

    expect(map.get('a')).toEqual('A');
    expect(map.get('b')).toEqual(null);
    expect(map.get('c')).toEqual('C');
    expect(map.get('d')).toEqual('D');
    expect(map.get('e')).toEqual('E');

    map.unlock('a');

    expect(map.get('a')).toEqual(null);
  });

  test('can use a function to get fresh value', () => {
    const map = new PooledMap<string>(3);

    const mockSetter = jest.fn(() => 'A');

    map.set('a', 'A');
    map.set('b', 'B');
    map.set('c', 'C');
    map.set('d', 'D');

    expect(map.get('a', mockSetter)).toEqual('A');
    expect(mockSetter).toBeCalledTimes(1);
  });

  test('can unlock value that is not locked without error', () => {
    const map = new PooledMap<string>(3);
    expect(() => map.unlock('iDoNotExist')).not.toThrow();
  });

  test('can not lock value that does not exist', () => {
    const map = new PooledMap<string>(3);
    expect(() => map.lock('iDoNotExist')).toThrow();
  });
});
