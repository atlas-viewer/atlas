import React from 'react';
import { render } from 'react-dom';
import { Atlas } from '../../src/modules/react-reconciler/Atlas';

render(
  <Atlas width={800} height={600}>
    <worldObject id="1" height={600} width={800}>
      <worldImage
        uri="/torbjorn-sandbakk.jpg"
        target={{ width: 800, height: 600 }}
        display={{ width: 7410, height: 4940 }}
      />
    </worldObject>
  </Atlas>,
  document.getElementById('root')
);
