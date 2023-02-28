# Atlas 2.0

This is the basis for a second version of Atlas with lessons learned. The properties and behaviours of objects on an 
Atlas world are to be split into traits. This model is inspired by the "Entity component system" often used in game 
development.

In this model objects look much more similar to each other, and new objects can be composed utilising different traits.


## Traits
List of the current traits and the functions they offer. Each also offers an `applyProps()` function for
transforming props to internal state on the object, diffing and notifying if the model changed.

- **Generic object**
  - objectForEach()
  - getTopParent()
- **Container**
  - append()
  - insertBefore()
  - remove()
  - hideInstance()
- **Evented**
  - addEventListener()
  - removeEventListener()
  - dispatchEvent()
  - propagatePointerEvent()
  - propagateTouchEvent()
  - propagateEvent()
- **Has styles**
  - stylesDidUpdate()
- **Layouts**
  - addLayoutSubscription()
  - triggerLayout()
  - flushLayoutSubscriptions()
- **Paintable**
  - getObjectsAt()
  - getAllPointsAt()
- **Revision**
- **Scheduled updates**
  - getScheduledUpdates()

## Runtime simplification

- Setting home position
- Starting / stopping controllers
- Passing position to controller *controller could get runtime*
- Trigger resize
- 


### Textures + Composition layers

Every paintable object in Atlas will be able to generate a texture in one or more formats. For example, an image might have an HTML texture (e.g. an HTML image element) and an image bytes texture. This texture will be supported by various Composition Layers (e.g. HTML Canvas, HTML Overlay, WebGL canvas etc.). These layers take the texture and render it based on: where it is in the Atlas tree, any crop information and display properties for position/rotation.

We need a way to:
* Define how an object creates a texture / multiple texture types
* LRU caching for textures baked in, with locks for currently used resources
* Determine which layer will render the object and potentially trigger texture creation
* Internal mechanism for invalidating textures based on props

### Option 1 - objects own textures
This option would have something like this baked into objects:
```ts
const Box = { /* ...other properties */
  async createTexture(object, type) {
    // Implementation
  },
  supportTextures: ['html-element'],
}

```

And all the code for all textures would be inside the objects themselves.

* PRO: It keeps things together
* PRO: Simple solution
* CON: Would not always work in every environment (e.g. Node vs. Browser)
* CON: Would add code that might not be used

### Option 2 - texture function mapping

This option would have the creation functions external, and require configuration to
set up a correct environment for textures. These texture functions could then be optionally 
included in a bundle as needed.

```ts
async function createHTMLTexture(object) {
   // Implementation
}

// Somewhere when configuring the app:
const config = {
  textures: [
    [Box, [createHTMLTexture]]
  ],
  layers: {
    html: [Box, customIsSupportedByMyLayerFunction],
  }
}
```

* PRO: Smaller bundles
* PRO: Works across environments
* PRO: Objects can reuse texture creation
* CON: Spreads the code out
* CON: Requires configuration


### Requesting textures

A composition layer is the final painting target for content in Atlas. It will decide
what it wants to render based on the current viewport of the wider viewer and will raise events 
for requesting textures. Possibly a process like:

* Layer see that it wants to draw an object that has a texture
  * Layer knows that it supports rendering the object
* Layer checks if the object is already "loading"
* Layer raises event to runtime saying "load this texture"
  * Contains priority information + distance
* Runtime picks up the event and picks the correct function to call and pushes it into a job queue
* Job runs, and the texture is saved onto the object
  * Event is propagated to the object, allowing parents to take the texture and update themselves (e.g. mipmaps).
* Object marked as needing to be re-rendered
* Layer renders texture


### Container textures

A container might support a texture. For example, a container that has a composition of images might
decide to create a small optimised version and display it when zoomed far out. Take, for example, a 2x2 tiled image.

If you are zoomed far out, by default the 4 images would have their textures requested. The container would then be able to listen for the texture loading, and create its own optimised texture. This could also be a recursive operation, with containers then notifying containers.

Not every container would need a texture, so it could be baked in as an option. This would require a sort of "texture composition" method.

```ts
function composeImageTexture(object, texture) {
  // Implementation
}

const config = {
  mipmaps: [
    [Container, [composeImageTexture]],
  ],
  layers: {
    // Saying, render textures from the container to the canvas.
    canvas: [Container],
  },
};
```

It's worth noting that containers themselves might have rendering, such as the styled container. This enables things like borders, backgrounds for containers. These are always rendered before the items inside.

#### Example: container texture -> HTML tree

If we had the following Atlas object structure:
```html
<container id="a">
  <container id="b">
    <image />
  </container>
  <container id="c">
    <image />
  </container>
</container>
```
And we configured the system to render HTML we could use the system above so that the rendering STOPS at the first container. The steps would be roughly:

For this to work, the renderer needs two passes per frame:
* One deep pass to request all textures for ALL objects visible
* Second pass that will allow containers to cut the iterations


The first pass, in the example above, would:
* Find container "A" and load its texture (div el)
  * Find container "B" and load its texture (div el)
    * Find Image 1 and load its texture (img el)
  * Find container "C" and load its texture (div el)
    * Find Image 2 and load its texture (img el)

When each image is and container is loaded, it would "append" it to the parent once it's available. The second pass in the frame will be empty until the textures are loaded. Once the textures are loaded and available, the second pass will be:

* Find container "A" - returns its self (div el)

And that's it, the whole element is used.

Now the container can decide if it wants to return itself OR allow more granular items to be returned further down. It could do this based on:

* Depth of containers
* Number of elements in its host (it could delete itself after a certain number?)
* Zoom level - the container could use a simple lossy version of the deep tree with placeholders for smaller zoom levels.


The first pass could happen less often than the second pass - when frames are rendering. 


### Mapping textures + object types
There are only a handful of types that could possibly be supported:

* External images
* SVG vector images
* Polygons + complex shapes
* Boxes
* HTML bridge

Other elements might come, but these are the typical.

Traits:

Existing
- HasStyles -> HasBoxStyles: This will map to rendering a box
- Geometry -> Polygons and complex shapes

New
- Has image source
- Has HTML bridge
- Has tile source?
