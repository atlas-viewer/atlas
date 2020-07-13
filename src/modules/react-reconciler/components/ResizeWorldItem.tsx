import React from 'react';
import { useResizeWorldItem } from '../hooks/use-resize-world-item';
import { HTMLPortal } from './HTMLPortal';

export const ResizeWorldItem: React.FC<JSX.IntrinsicElements['worldObject'] & {
  handleSize?: number;
  resizable?: boolean;
  onSave: (pos: Partial<{ x: number; y: number; width: number; height: number }>) => void;
}> = ({ handleSize = 6, resizable, onSave, children, ...props }) => {
  const { portalRef, mode, mouseEvent, isEditing } = useResizeWorldItem(
    { x: props.x || 0, y: props.y || 0, width: props.width, height: props.height },
    onSave
  );

  return (
    <>
      <worldObject {...props}>
        {children}
        <HTMLPortal
          ref={portalRef}
          target={{ x: 0, y: 0, height: props.height, width: props.width }}
          relative
          interactive={false}
        >
          {mode === 'sketch' && resizable ? (
            <>
              <div
                onMouseDown={mouseEvent('translate')}
                style={{
                  display: 'block',
                  width: '100%',
                  height: '100%',
                  border: '1px dashed #999',
                  boxSizing: 'border-box',
                  pointerEvents: isEditing ? 'none' : mode === 'sketch' ? 'initial' : 'none',
                }}
              />

              <div
                title="east"
                onMouseDown={mouseEvent('east')}
                style={{
                  cursor: 'e-resize',
                  position: 'absolute',
                  background: '#fff',
                  height: handleSize * 2,
                  width: handleSize,
                  right: 0,
                  top: '50%',
                  transform: `translate(${handleSize / 2}px, -${handleSize}px)`,
                  zIndex: 999,
                  boxShadow: '0px 2px 3px 0 rgba(0,0,0,0.5)',
                  border: '1px solid #999',
                  pointerEvents: isEditing ? 'none' : mode === 'sketch' ? 'initial' : 'none',
                }}
              />

              <div
                title="west"
                onMouseDown={mouseEvent('west')}
                style={{
                  cursor: 'w-resize',
                  position: 'absolute',
                  background: '#fff',
                  height: handleSize * 2,
                  width: handleSize,
                  left: 0,
                  top: '50%',
                  transform: `translate(-${handleSize / 2}px, -${handleSize}px)`,
                  zIndex: 999,
                  boxShadow: '0px 2px 3px 0 rgba(0,0,0,0.5)',
                  border: '1px solid #999',
                  pointerEvents: isEditing ? 'none' : mode === 'sketch' ? 'initial' : 'none',
                }}
              />

              <div
                title="north"
                onMouseDown={mouseEvent('north')}
                style={{
                  cursor: 'n-resize',
                  position: 'absolute',
                  background: '#fff',
                  height: handleSize,
                  width: handleSize * 2,
                  left: '50%',
                  top: 0,
                  transform: `translate(-${handleSize}px, -${handleSize / 2}px)`,
                  zIndex: 999,
                  boxShadow: '0px 2px 3px 0 rgba(0,0,0,0.5)',
                  border: '1px solid rgba(0,0,0,.5)',
                  pointerEvents: isEditing ? 'none' : mode === 'sketch' ? 'initial' : 'none',
                }}
              />

              <div
                title="south"
                onMouseDown={mouseEvent('south')}
                style={{
                  cursor: 's-resize',
                  position: 'absolute',
                  background: '#fff',
                  height: handleSize,
                  width: handleSize * 2,
                  left: '50%',
                  bottom: 0,
                  transform: `translate(-${handleSize}px, ${handleSize / 2}px)`,
                  zIndex: 999,
                  boxShadow: '0px 2px 3px 0 rgba(0,0,0,0.5)',
                  border: '1px solid #999',
                  pointerEvents: isEditing ? 'none' : mode === 'sketch' ? 'initial' : 'none',
                }}
              />

              <div
                title="north-east"
                onMouseDown={mouseEvent('north-east')}
                style={{
                  cursor: 'ne-resize',
                  position: 'absolute',
                  background: '#fff',
                  height: handleSize,
                  width: handleSize,
                  right: 0,
                  top: 0,
                  transform: `translate(${handleSize / 2}px, -${handleSize / 2}px)`,
                  zIndex: 999,
                  boxShadow: '0px 2px 3px 0 rgba(0,0,0,0.5)',
                  border: '1px solid #999',
                  pointerEvents: isEditing ? 'none' : mode === 'sketch' ? 'initial' : 'none',
                }}
              />

              <div
                title="south-east"
                onMouseDown={mouseEvent('south-east')}
                style={{
                  cursor: 'se-resize',
                  position: 'absolute',
                  background: '#fff',
                  height: handleSize,
                  width: handleSize,
                  bottom: 0,
                  right: 0,
                  transform: `translate(${handleSize / 2}px, ${handleSize / 2}px)`,
                  zIndex: 999,
                  boxShadow: '0px 2px 3px 0 rgba(0,0,0,0.5)',
                  border: '1px solid #999',
                  pointerEvents: isEditing ? 'none' : mode === 'sketch' ? 'initial' : 'none',
                }}
              />

              <div
                title="south-west"
                onMouseDown={mouseEvent('south-west')}
                style={{
                  cursor: 'sw-resize',
                  position: 'absolute',
                  background: '#fff',
                  height: handleSize,
                  width: handleSize,
                  bottom: 0,
                  left: 0,
                  transform: `translate(-${handleSize / 2}px, ${handleSize / 2}px)`,
                  zIndex: 999,
                  boxShadow: '0px 2px 3px 0 rgba(0,0,0,0.5)',
                  border: '1px solid #999',
                  pointerEvents: isEditing ? 'none' : mode === 'sketch' ? 'initial' : 'none',
                }}
              />

              <div
                title="north-west"
                onMouseDown={mouseEvent('north-west')}
                style={{
                  cursor: 'nw-resize',
                  position: 'absolute',
                  background: '#fff',
                  height: handleSize,
                  width: handleSize,
                  top: 0,
                  left: 0,
                  transform: `translate(-${handleSize / 2}px, -${handleSize / 2}px)`,
                  zIndex: 999,
                  boxShadow: '0px 2px 3px 0 rgba(0,0,0,0.5)',
                  border: '1px solid #999',
                  pointerEvents: isEditing ? 'none' : mode === 'sketch' ? 'initial' : 'none',
                }}
              />
            </>
          ) : null}
        </HTMLPortal>
      </worldObject>
    </>
  );
};
