class TiledImage extends HTMLElement {
  constructor() {
    super();
  }

  static get observedAttributes() {
    return ['src'];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'src') {
      Atlas.getTileFromImageService(newValue, 0, 0).then(tiles => {
        const id = tiles.imageService.id.endsWith('/info.json')
          ? tiles.imageService.id.slice(0, -'/info.json'.length)
          : tiles.imageService.id;

        const tiledImages = (tiles.imageService.tiles || []).flatMap(tile => {
          return tile.scaleFactors.map(size => {
            return Atlas.TiledImage.fromTile(
              id,
              { height: tiles.imageService.height, width: tiles.imageService.width },
              tile,
              size
            );
          });
        });

        const compositeImage = new Atlas.CompositeResource({
          width: tiles.imageService.width,
          height: tiles.imageService.height,
          id: tiles.imageService.id,
          images: tiledImages,
        });

        // Image goes inside a "canvas"
        const worldObject = new Atlas.WorldObject();
        worldObject.applyProps({
          width: tiles.imageService.width,
          height: tiles.imageService.height,
          id: tiles.imageService.id,
        });

        worldObject.appendChild(compositeImage);

        this.worldObject = worldObject;

        this.dispatchEvent(
          new CustomEvent('atlas-world-object', {
            bubbles: true,
            cancelable: false,
          })
        );
      });
    }
  }
}

class AtlasViewer extends HTMLElement {
  constructor() {
    super();

    this.attachShadow({ mode: 'open' });

    const wrapper = document.createElement('div');
    const canvas = document.createElement('canvas');

    canvas.style.background = '#000';
    canvas.height = 600;
    canvas.width = 800;

    wrapper.appendChild(canvas);

    this.shadowRoot.append(wrapper);

    const renderer = new Atlas.CanvasRenderer(canvas);
    const viewport = { width: 800, height: 600, x: 0, y: 0, scale: 1 };
    const world = new Atlas.World();

    const controller = Atlas.popmotionController({
      minZoomFactor: 0.5,
      maxZoomFactor: 3,
      enableClickToZoom: false,
    });

    // Create our runtime.
    const runtime = new Atlas.Runtime(renderer, world, viewport, [controller]);

    // And start listening to browser events proxied from our div element.
    new Atlas.BrowserEventManager(wrapper, runtime);

    // Reset the viewport to fit the bounds
    runtime.goHome();

    this.world = world;
    this.runtime = runtime;
  }

  connectedCallback() {
    const runtime = this.runtime;
    const observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        //Detect <img> insertion
        if (mutation.addedNodes.length) {
          if (mutation.addedNodes[0] instanceof TiledImage) {
            const tile = mutation.addedNodes[0];
            tile.addEventListener('atlas-world-object', e => {
              runtime.world.appendChild(e.target.worldObject);
              runtime.pendingUpdate = true;
              runtime.world.recalculateWorldSize();
              runtime.world.triggerRepaint();
              runtime.goHome();
            });
          }
          if (mutation.addedNodes[0] instanceof Image) {
            const image = mutation.addedNodes[0];
            image.addEventListener('load', () => {
              const worldImage = new Atlas.SingleImage({
                id: image.src,
                uri: image.src,
                width: image.width,
                height: image.height,
                scale: 1,
              });

              const worldObject = new Atlas.WorldObject({
                id: image.src,
                width: image.width,
                height: image.height,
                layers: [worldImage],
              });

              runtime.world.appendWorldObject(worldObject);

              runtime.pendingUpdate = true;
              runtime.world.recalculateWorldSize();
              runtime.world.triggerRepaint();

              runtime.goHome();
            });
          }
        }
      });
    });

    observer.observe(this, { childList: true });
  }
}

customElements.define('atlas-viewer', AtlasViewer);
customElements.define('atlas-tiled-image', TiledImage);
