# Hosts

Hosts are external integrations (e.g. the DOM) used to hold resources. Renderers 
may share similar methods and hosts. An image host for the DOM may be used for
a static image renderer, WebGL renderer and also a Canvas renderer. The logic
and customisations for loading, retrying can be shared across these.

It's unclear what hosts will do, how they will be selected and how they will be customised.

## What is a host

A host either loads or acts as a container for a specific type of resource. The host is unique to the environment
it is running in and may be swapped out. A host should be able to provide methods to load or extract information
about the contained resource. 

For example, an image host could create and load an image using the DOM in the browser, or on the server provide 
a way to extract HTML `<img src=" .. " />` or even load the bytes of an image using Node HTTP. It is up to renderers
to construct the correct Host for resources it comes across. This does add overhead for developing renderers but also
allows for more stability when creating custom renderers.

### What hosts do

- Image Host - A host loading a single image.
- Tiled Image Host - A host that loads many tiled images.
- Virtual Tile Canvas Host - A host loading images onto virtual tiles held in a canvas, disposing of images
- Box host - A host loading a DIV element + style
  - Converting a box to canvas draw instructions (subset of CSS)
  - Converting a box to a set of Bytes to WebGL + a shader
  - Converting a box to HTML with inline styles (text)
  - Converting a box to HTML + CSS classes (text)
  - Converting a box to HTML with styles (DOM)
- SVG host - A host loading an SVG element
  - Providing SVG as an image
  - Converting SVG to draw commands on a canvas
  - Rasterizing an SVG at various sizes to be drawn


How are these split/composed.

- Box operator
  - DOM Box host
  - WebGL Box host
  - Canvas Box host

It's almost as though we have the host, and then operators on that host. The purpose of having hosts split out
is for them to be shared, both in terms of code but also at runtime to avoid work being done twice in different
renderers.
