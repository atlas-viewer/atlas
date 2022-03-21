import {
  ContainerDefinition,
  GenericObject,
  genericObjectDefaults,
  NodeDefinition,
} from '../../clean-objects/traits/generic-object';
import {
  addLayoutSubscription,
  flushLayoutSubscriptions,
  Layout,
  layoutDefaults,
  triggerLayout,
} from '../../clean-objects/traits/layout';
import { append } from '../../clean-objects/traits/container';

describe('Layout trait', function () {
  let tree: {
    containerA1: GenericObject<ContainerDefinition> & Layout;
    containerA1_1: GenericObject<ContainerDefinition>;
    object___A1_1_1: GenericObject<NodeDefinition>;
    object___A1_1_2: GenericObject<NodeDefinition>;
    containerA1_2: GenericObject<ContainerDefinition>;
    object___A1_2_1: GenericObject<NodeDefinition>;
    object___A1_2_2: GenericObject<NodeDefinition>;
  };
  beforeEach(() => {
    tree = {} as any;
    tree.containerA1 = { ...genericObjectDefaults('container'), ...layoutDefaults() };
    tree.containerA1_1 = genericObjectDefaults('container');
    tree.object___A1_1_1 = genericObjectDefaults('node');
    tree.object___A1_1_2 = genericObjectDefaults('node');
    tree.containerA1_2 = genericObjectDefaults('container');
    tree.object___A1_2_1 = genericObjectDefaults('node');
    tree.object___A1_2_2 = genericObjectDefaults('node');

    append(tree.containerA1, tree.containerA1_1);
    append(tree.containerA1_1, tree.object___A1_1_1);
    append(tree.containerA1_1, tree.object___A1_1_2);

    append(tree.containerA1, tree.containerA1_2);
    append(tree.containerA1_2, tree.object___A1_2_1);
    append(tree.containerA1_2, tree.object___A1_2_2);
  });

  test('triggering the correct component', () => {
    triggerLayout(tree.containerA1, { type: 'repaint' });
    triggerLayout(tree.containerA1_1, { type: 'repaint' });
    triggerLayout(tree.object___A1_1_1, { type: 'repaint' });
    triggerLayout(tree.object___A1_1_2, { type: 'repaint' });
    triggerLayout(tree.containerA1_2, { type: 'repaint' });
    triggerLayout(tree.object___A1_2_1, { type: 'repaint' });
    triggerLayout(tree.object___A1_2_2, { type: 'repaint' });

    expect(tree.containerA1.layout.triggerQueue).toHaveLength(7);
  });

  test('adding layout subscription', () => {
    expect.assertions(9);

    const callback = (event: any) => {
      expect(event).toEqual({ type: 'repaint' });
    };

    const callback_for_containerA1 = callback.bind({});
    const callback_for_containerA1_1 = callback.bind({});
    const callback_for_object___A1_1_1 = callback.bind({});
    const callback_for_object___A1_1_2 = callback.bind({});
    const callback_for_containerA1_2 = callback.bind({});
    const callback_for_object___A1_2_1 = callback.bind({});
    const callback_for_object___A1_2_2 = callback.bind({});

    addLayoutSubscription(tree.containerA1, callback_for_containerA1);
    addLayoutSubscription(tree.containerA1_1, callback_for_containerA1_1);
    addLayoutSubscription(tree.object___A1_1_1, callback_for_object___A1_1_1);
    addLayoutSubscription(tree.object___A1_1_2, callback_for_object___A1_1_2);
    addLayoutSubscription(tree.containerA1_2, callback_for_containerA1_2);
    addLayoutSubscription(tree.object___A1_2_1, callback_for_object___A1_2_1);
    addLayoutSubscription(tree.object___A1_2_2, callback_for_object___A1_2_2);

    triggerLayout(tree.containerA1, { type: 'repaint' });

    expect(tree.containerA1.layout.triggerQueue).toHaveLength(1);

    flushLayoutSubscriptions(tree.containerA1);

    expect(tree.containerA1.layout.triggerQueue).toHaveLength(0);
  });

  test('removing subscriptions', () => {
    expect.assertions(6);

    const callback = (event: any) => {
      expect(event).toEqual({ type: 'repaint' });
    };

    const callback_for_containerA1 = callback.bind({});
    const callback_for_containerA1_1 = callback.bind({});
    const callback_for_object___A1_1_1 = callback.bind({});
    const callback_for_object___A1_1_2 = callback.bind({});
    const callback_for_containerA1_2 = callback.bind({});
    const callback_for_object___A1_2_1 = callback.bind({});
    const callback_for_object___A1_2_2 = callback.bind({});

    const unsubscribe_1 = addLayoutSubscription(tree.containerA1, callback_for_containerA1);
    const unsubscribe_2 = addLayoutSubscription(tree.containerA1_1, callback_for_containerA1_1);
    const unsubscribe_3 = addLayoutSubscription(tree.object___A1_1_1, callback_for_object___A1_1_1);
    const unsubscribe_4 = addLayoutSubscription(tree.object___A1_1_2, callback_for_object___A1_1_2);
    const unsubscribe_5 = addLayoutSubscription(tree.containerA1_2, callback_for_containerA1_2);
    const unsubscribe_6 = addLayoutSubscription(tree.object___A1_2_1, callback_for_object___A1_2_1);
    const unsubscribe_7 = addLayoutSubscription(tree.object___A1_2_2, callback_for_object___A1_2_2);

    // Unsubscribe half.
    unsubscribe_2();
    unsubscribe_4();
    unsubscribe_6();

    triggerLayout(tree.containerA1, { type: 'repaint' });

    expect(tree.containerA1.layout.triggerQueue).toHaveLength(1);

    flushLayoutSubscriptions(tree.containerA1);

    expect(tree.containerA1.layout.triggerQueue).toHaveLength(0);
  });
});
