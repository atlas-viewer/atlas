### Installation

Install everything.
```
yarn add atlas-viewer
```

Install the bits you want:
```
yarn add @atlas-viewer/atlas-viewer
yarn add @atlas-viewer/hyperion-data-source
yarn add @atlas-viewer/canvas-renderer
yarn add @atlas-viewer/grid-builder
yarn add @atlas-viewer/popmotion-controller
```

### API Composer
Creating an API using Composer.

```js
const CustomAtlas = createAPI({
  configure: (canvasEl, manifestId) => {
    return {
      data: {
        manifesto: { manifest: manifestId },
      },
      builder: {
        maxColumns: '4',
        spacing: 40,
      },
      controllers: {
        popmotion: {
          el: canvasEl,  
        },
      },
      renderers: {
        canvas: {
          el: canvasEl,
        }, 
      },
    };
  },
  dataSources: [
    require('@atlas-viewer/hyperion-data-source'),
    require('@atlas-viewer/manifesto-data-source'),
  ],
  controllers: [
    require('@atlas-viewer/popmotion-controller'),
    require('@atlas-viewer/keyboard-controller'),
  ],
  builder: require('@atlas-viewer/grid-builder'),
  renderers: [
    require('@atlas-viewer/canvas-renderer'),
    require('@atlas-viewer/debug-renderer'),
  ],
});
```

Usage:
```js
const { world, runtime } = new CustomAtlas(
  document.getElementById('canvas'), 
  'http://example.org/manifest.json'
);
```

Custom configuration, same plugins:
```js
const { world, runtime }  = CustomAtlas.configure({
    // ... instead of helper constructor.
}); 
```

Extending:
```js
const GamePadAtlas = CustomAtlas.extend({ 
   controllers: [
    '@atlas-viewer/gamepad-controller', 
  ],
  options: { 
    controllers: { override: true },
  },
});
```
