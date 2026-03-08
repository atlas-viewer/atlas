import { getCompositeSelectionsByFrame } from '../../../modules/react-reconciler/devtools/diagnostics';
import { RuntimeDebugEvent } from '../../../modules/react-reconciler/devtools/types';

describe('Composite selection diagnostics', () => {
  test('groups paint events by frame and composite id', () => {
    const events: RuntimeDebugEvent[] = [
      {
        type: 'paint',
        at: 1,
        runtimeId: 'rt-1',
        frame: 10,
        layerIndex: 0,
        tileIndex: 0,
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        paintId: 'tile-a',
        paintType: 'TiledImage',
        compositeId: 'comp-1',
      },
      {
        type: 'paint',
        at: 2,
        runtimeId: 'rt-1',
        frame: 10,
        layerIndex: 1,
        tileIndex: 1,
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        paintId: 'tile-b',
        paintType: 'TiledImage',
        compositeId: 'comp-1',
      },
      {
        type: 'paint',
        at: 3,
        runtimeId: 'rt-1',
        frame: 11,
        layerIndex: 0,
        tileIndex: 0,
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        paintId: 'thumb',
        paintType: 'SingleImage',
        compositeId: 'comp-2',
      },
    ];

    const grouped = getCompositeSelectionsByFrame(events, 10);

    expect(grouped[0].frame).toBe(11);
    expect(grouped[0].composites[0].compositeId).toBe('comp-2');
    expect(grouped[1].frame).toBe(10);
    expect(grouped[1].composites[0].layers.length).toBe(2);
  });
});
