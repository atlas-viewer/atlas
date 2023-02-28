import React, { useEffect, useReducer } from 'react';
import { ContainerDefinition, GenericObject } from '../traits/generic-object';
import { useControls, button } from 'leva';
import { getDefinitionByTag } from '../runtime/reconciler-config';
import { addEventListener, isEvented } from '../traits/evented';
import { hasStyles } from '../traits/has-styles';

export function Inpsector(props: { container: GenericObject<ContainerDefinition> }) {
  console.log(props.container);
  return (
    <div>
      <div style={{ position: 'relative', width: 500, height: 500 }}>
        <Container item={props.container} />
      </div>
    </div>
  );
}

export function Container(props: { item: GenericObject<ContainerDefinition> }) {
  const [, forceUpdate] = useReducer((x) => x + 1, 0);

  useEffect(() => {
    if (!isEvented(props.item)) {
      return undefined;
    }

    return addEventListener(props.item, 'update', () => {
      forceUpdate();
    });
  }, [props.item]);

  return (
    <div
      style={{
        position: 'absolute',
        top: props.item.display.points[2],
        left: props.item.display.points[1],
        width: props.item.display.width,
        height: props.item.display.height,
        outline: '1px solid red',
        ...(hasStyles(props.item) ? props.item.style : {}),
      }}
    >
      {props.item.node.list?.map((listItem) =>
        listItem ? listItem.node.type === 'container' ? <Container item={listItem} /> : <Item item={listItem} /> : null
      )}
      <ItemControls item={props.item} />
    </div>
  );
}

function Item({ item }: { item: GenericObject }) {
  const [, forceUpdate] = useReducer((x) => x + 1, 0);

  useEffect(() => {
    if (!isEvented(item)) {
      return undefined;
    }

    return addEventListener(item, 'update', () => {
      forceUpdate();
    });
  }, [item]);

  return (
    <div
      style={{
        position: 'absolute',
        top: item.display.points[2],
        left: item.display.points[1],
        width: item.display.width,
        height: item.display.height,
        outline: '1px solid green',
        ...(hasStyles(item) ? item.style.rules : {}),
      }}
    >
      {item.id}
      <ItemControls item={item} />
    </div>
  );
}

export function ItemControls({ item }: { item: GenericObject }) {
  const update = (props: any) => {
    getDefinitionByTag(item.tagName).applyProps(item, {
      ...item.props,
      ...props,
    });
    return undefined;
  };
  useControls(item.id, {
    width: {
      value: item.display.width,
      onChange: (value) => update({ width: value }),
    },
    height: { value: item.display.height, onChange: (value) => update({ height: value }) },
    'console log': button(() => console.log(item)),
    position: {
      value: { x: item.display.points[1], y: item.display.points[2] },
      step: 1,
      onChange: (value) =>
        update({
          x: value.x,
          y: value.y,
        }),
    },
  });

  return null;

  // return <Inpsector container={item} />;
}
