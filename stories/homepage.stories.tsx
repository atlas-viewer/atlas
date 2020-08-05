import * as React from "react";
import "../src/modules/react-reconciler/types";
import { Atlas } from "../src/modules/react-reconciler/Atlas";

export default { title: 'Atlas' };

export const Default = () => (
  <>
    <h1>Atlas</h1>
    <p>A thing.</p>
    <Atlas width={600} height={400}>
      <worldObject id="1" height={1800} width={1200}>
        <worldImage
          uri="http://iiif.io/api/presentation/2.1/example/fixtures/resources/page1-full.png"
          target={{ width: 1200, height: 1800 }}
          display={{ width: 1200, height: 1800 }}
        />
      </worldObject>
    </Atlas>
  </>
)
