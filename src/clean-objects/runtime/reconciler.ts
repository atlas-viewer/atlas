import React from 'react';
import createReconciler from 'react-reconciler';
import { reconcilerConfig } from './reconciler-config';
import { createLoop } from './loop';
import { RenderRoot } from './render';

const roots = new Map<Element, RenderRoot>();
const { loop, advance, invalidate } = createLoop(roots);
const reconciler = createReconciler ? createReconciler(reconcilerConfig) : null;

// Root configuration would require a full re-render
type RootConfiguration = {
  /**
   * This would be tied to the environment, so would likely not change.
   */
  eventManager: any;

  /**
   * This would be again specific to the environment. We should make it possible
   * to change what is rendering, but it would have to be from this list.
   */
  availableRenderers: any;

  /**
   * Again specific to the environment. Since there is only one at the moment
   * it's most likely just going to be a case of switching on and off.
   */
  availableControllers: any;
};

/**
 * createRoot
 *
 * How will this work.
 *
 * - Loop through the enabled renderers and create a sub-host for each
 * - Avoid using the React component that we currently have
 * - Using Zustand state for things the existing wrapper did (portable)
 * - AtlasProps eqv. is just passed to the store, very light wrapper for convenience
 * - Allows use of the reconciler without ReactDOM (and possible new canvas panel)
 * - Possible lightweight wrapper around reconciler
 *
 *     const box1 = ref();
 *     h('box', {
 *       ref: box1,
 *       width: 200,
 *       height: 200,
 *       onClick: () => box1.applyProps({ width: 400, height: 400 })
 *     }, [
 *      h('image', { src: '...' })
 *   ]);
 *
 *   This could be used with:
 *   "@jsx Atlas.h"
 *
 *   Comment to add a JSX-like environment without React, just using the reconciler config. It would be
 *   more difficult to work with... as it wouldn't support things like hooks. Should be very capable for
 *   simple static world definitions.
 *
 * - If there are multiple Atlas instances they will sync to a single loop (adapter from R3F)
 * - Need to consider the server-mode where you could use a static renderer, the container might be: {html: ''} and
 *   everything else just stored. This would be a different API, but can't have too much tied in at this point.
 * - Previously Atlas.tsx was effectively a root renderer - that composed the rest, need to shift from this model.
 *
 * DOM Container (this one)
 *
 * - The DOM container will have a width/height that may change over time that is controlled by the user
 * - We have the following elements under that container:
 *     - div.atlas - this is automatically resized to fit the user-specific container and guarantees position style
 *     - div.atlas-static-container - for static images sits in place of canvas (not overlay)
 *     - div.atlas-canvas - for HTML5 canvas elements (webgl or normal)
 *     - div.atlas-overlay - for HTML-based overlays that sit on top
 *     - svg.atlas-svg-overlay - for SVG-based overlays
 *     - div.atlas-navigator - for the small navigator
 *
 *  This is a one-to-one with the renderers, and as such should be defined by those. A renderer should be able
 *  to create its own root and style as required. This should include any stylesheets (although they could be collected)
 *  and HTML class names. The order of the renderers is important. We could use z-index to control where each goes with
 *  gaps for custom or future ones to slot in. This means they can be added in any order on the DOM (although try to
 *  avoid this).
 *
 *  Stream container (maybe)
 *
 *  - For server-side or non-browser renderers
 *  - Each renderer can have a stream for putting content in.
 *  - Stream format should support replacements, e.g. a chunk with <!--future-content--><div>loading</div><!--/future-content-->
 *    And later a chunk with: `<!-- @id: future-content -->: ...`
 *  - This would allow a stream to be sent and collected, but regions replaced.
 *  - For server rendering - with a custom handler - this could stream viewer content
 *  - Could also be used with an Image API like sharp to compose an image
 */
function createRoot(container: HTMLElement, root: RootConfiguration) {
  const prevRoot = roots.get(container);
  if (prevRoot) console.warn('Atlas.createRoot should only be called once!');

  // reconciler.createContainer();

  let configured = false;
  return {
    configure() {
      configured = true;
    },
    render() {
      if (!configured) this.configure();

      // Do render things.
    },
  };
}

function render() {
  //
}

if (reconciler) {
  reconciler.injectIntoDevTools({
    bundleType: process.env.NODE_ENV === 'production' ? 0 : 1,
    rendererPackageName: '@react-three/fiber',
    version: React.version,
  });
}
