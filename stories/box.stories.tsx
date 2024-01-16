import * as React from 'react';
import { AtlasAuto, BoxStyle } from '../src';
import { useState } from 'react';

export default { title: 'Boxes' };

export const DefaultBoxes = () => {
  const [r, setR] = useState(true);
  const styles: BoxStyle[] = [
    //
    { background: 'red' },
    { backgroundColor: 'red', opacity: 0.5 },
    { backgroundColor: 'blue' },
    { backgroundColor: 'pink' },
    { backgroundColor: 'pink', borderColor: 'red', borderWidth: '5px', borderStyle: 'solid' },
    {
      backgroundColor: 'pink',
      outlineWidth: '5px',
      outlineColor: 'orange',
      outlineOffset: '5px',
      outlineStyle: 'solid',
    },
    {
      backgroundColor: 'pink',
      borderColor: 'red',
      borderStyle: 'solid',
      borderWidth: '5px',
      outlineWidth: '5px',
      outlineColor: 'orange',
      outlineOffset: '5px',
      outlineStyle: 'solid',
    },
    { backgroundColor: 'red', boxShadow: '10px 10px 0 0 white' },
    {
      backgroundColor: 'red',
      boxShadow: '10px 10px 10px 0 white',
    },
    {
      backgroundColor: 'yellow',
      border: '2px solid rgba(255, 5, 100)',
      outline: '2px solid orange',
      outlineOffset: '-8px',
    },
    {
      background: 'white',
      boxShadow: '10px 5px 5px red',
    },
    {
      background: 'white',
      boxShadow: '60px -16px teal',
    },
    {
      background: 'white',
      boxShadow: '12px 12px 12px 1px rgba(255, 255, 255, 0.6)',
    },
    {
      background: 'white',
      boxShadow: '3px 3px red, -5px 0 4px olive',
    },
    {
      backgroundColor: 'lightblue',
      ':hover': {
        backgroundColor: 'green',
      },
      ':active': {
        backgroundColor: 'blue',
      },
    },
    { opacity: 0 },
  ];

  return (
    <>
      <button onClick={() => setR((t) => !t)}>{r ? 'current: canvas' : 'current: html'}</button>
      <AtlasAuto key={r ? 'a' : 'b'} renderPreset={['default-preset', { canvasBox: r }]}>
        <world>
          {styles.map((style, k) => (
            <world-object x={k * 110} height={100} width={100}>
              <box target={{ width: 100, height: 100 }} style={style} />
            </world-object>
          ))}
          <world-object x={styles.length * 110} height={100} width={100}>
            <box
              //
              className="css-class"
              relativeStyle={true}
              target={{ width: 100, height: 100 }}
            />
          </world-object>

          <world-object x={styles.length * 110 + 110} height={100} width={100}>
            <box
              relativeStyle
              style={{ backgroundColor: 'orange', borderStyle: 'solid', borderWidth: '5px', borderColor: 'teal' }}
              target={{ width: 100, height: 100 }}
            />
          </world-object>

          <world-object x={styles.length * 110 + 110 * 2} height={100} width={100}>
            <box target={{ width: 100, height: 100 }} style={{ backgroundColor: 'pink' }} relativeStyle relativeSize />
          </world-object>

          <world-object x={styles.length * 110 + 110 * 3} height={100} width={100}>
            <box target={{ width: 100, height: 100 }} />
          </world-object>
        </world>
      </AtlasAuto>
      <style>{`
        .css-class{background-image: url('http://localhost:6007/static/media/img.732d55c5.png');}
        .css-class--hover{background: blue;}
      `}</style>
    </>
  );
};
