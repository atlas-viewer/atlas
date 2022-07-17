import { applyGenericObjectProps, genericObjectDefaults } from '../../../clean-objects/traits/generic-object';
import { applyCompositeProps, compositeDefaults } from '../../../clean-objects/traits/composite';
import { bestResourceIndexAtRatio } from '../../../utils';

describe('Composite trait', function () {
  test('simple image swapping', () => {
    const composite = {
      ...genericObjectDefaults('container'),
      ...compositeDefaults(),
    };

    const small = { ...genericObjectDefaults('node') };
    const large = { ...genericObjectDefaults('node') };

    applyGenericObjectProps(small, { width: 100, height: 100 });
    applyGenericObjectProps(large, { height: 100, width: 100 });
    applyGenericObjectProps(composite, { width: 200, height: 200 });

    applyCompositeProps(composite, {
      maxImageSize: -1,
      quality: 1,
      minSize: 100,
      renderLayers: 1,
      renderSmallestFallback: false,
    });
  });
});
