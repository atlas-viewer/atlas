/** @jsx h */
import { StyledContainer } from '../../../clean-objects/objects/styled-container';
import { Box } from '../../../clean-objects/objects/box';
import { h } from '../../../clean-objects/runtime/h';
import { AllHostTypes, GetObjectDefinitionProps, ObjectDefinition } from '../../../clean-objects/objects/_types';
import { Container } from '../../../clean-objects/objects/container';
import { ReactNode } from 'react';
import { ContainerDefinition, GenericObject } from '../../../clean-objects/traits/generic-object';
import { getDefinitionByTag } from '../../../clean-objects/runtime/reconciler-config';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      container: GetObjectDefinitionProps<typeof Container> & { children?: ReactNode };
      'styled-container': GetObjectDefinitionProps<typeof StyledContainer> & { children?: ReactNode };
      box: GetObjectDefinitionProps<typeof Box>;
    }
  }
}

describe('Host development test', function () {
  test('h helper', () => {
    // The setup.

    const test = (
      <container width={200} height={200} style={{ background: '#333' }}>
        <box height={100} width={100} style={{ background: 'red', border: '2px solid green' }} />
        <box height={70} width={100} style={{ background: 'blue' }} />
      </container>
    ) as any as GenericObject<ContainerDefinition>;

    expect(test.node.type).toEqual('container');
    expect(test.node.list).toHaveLength(2);
  });

  test('it can create a DOM tree', () => {
    const box2 = <box height={70} width={100} style={{ background: 'blue' }} />;
    const test = (
      <container width={200} height={200} style={{ background: '#333' }}>
        <box height={100} width={100} style={{ background: 'red', border: '2px solid green' }} />
        {box2}
      </container>
    ) as any as GenericObject<ContainerDefinition>;

    // OK - so we need a repeatable step to mount and unmount items in a tree to their objects.
    // In this simple example, we need 2 DOM elements mounted to the styled container.
    // The following steps should happen:
    //   - Mounting events
    //   - Host properties created
    //   - Unmount events
    //
    // Out of scope:
    //   - Positioning
    //   - Styling
    //
    //
    // MOUNT: The process, from the top.
    //   - Input: RootContainer, List of paintables, host state
    //   - Host data:
    //       - DOM element
    //       - Host parent (useful when detached) <---- Add this to generic object
    //       - isMounted
    //       - isRoot (skip)
    //   - Go through and create all hosts, if required.
    //   - Go through and mount all hosts, if requited.
    //   - Unmount any remaining hosts.
    //   - Ping events for newly mounted.
    //   - Definition Helpers
    //      - Mount to root
    //      - Mount to object
    //      - Unmount
    //      - Update host (used later)
    //
    // UPDATE: The second step is positioning + updating.
    //   - Input: List of paintables, host state
    //   - Go through and call update host
    //   - Done?

    function mountToRootNode() {
      //
    }
  });
});
