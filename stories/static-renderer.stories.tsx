import * as React from 'react';
import { Renderer } from 'react-dom';
import { Runtime } from '../src/renderer/runtime';
import '../src/modules/react-reconciler/types';
import { World } from '../src/world';
import { StaticRenderer } from '../src/modules/static-renderer/static-renderer';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { WorldObject } from '../src/world-objects/world-object';
import { GetTile, getTileFromImageService } from '../src/modules/iiif/get-tiles';
import { SingleImage } from '../src/spacial-content/single-image';
import { BrowserEventManager } from '../src/modules/browser-event-manager/browser-event-manager';
import { popmotionController } from '../src/modules/popmotion-controller/popmotion-controller';
import { TiledImage } from '../src/spacial-content/tiled-image';
import { CompositeResource } from '../src/spacial-content/composite-resource';
import { useAtlasImage } from '../src/modules/react-reconciler/hooks/use-atlas-image';
import { Wunder } from './annotations.stories';
import useMeasure from 'react-use-measure';

export default { title: 'Static renderer' };

const staticTiles = [
  {
    id: 'https://libimages1.princeton.edu/loris/pudl0001%2F4609321%2Fs42%2F00000001.jp2/info.json',
    width: 5233,
    height: 7200,
  },
  {
    id: 'https://iiif.bodleian.ox.ac.uk/iiif/image/5009dea1-d1ae-435d-a43d-453e3bad283f/info.json',
    width: 4093,
    height: 2743,
  },
];

export const DefaultStatic: React.FC = () => {
  const index = 0;
  const [tiles, setTile] = useState<GetTile | undefined>();
  const viewer = useRef<any>();

  useEffect(() => {
    getTileFromImageService(staticTiles[index].id, staticTiles[index].width, staticTiles[index].height).then(s => {
      setTile(s);
    });
  }, [index]);

  useLayoutEffect(() => {
    const renderer = new StaticRenderer(viewer.current);
    const viewport = { width: 800, height: 600, x: 0, y: 0, scale: 1 };
    const world = new World();

    const controller = popmotionController({
      minZoomFactor: 0.5,
      maxZoomFactor: 3,
      enableClickToZoom: false,
    });

    // Similar to creating HTML elements, we start from the inside and work our way out appending items.
    const image = new SingleImage();
    image.applyProps({
      uri: 'http://iiif.io/api/presentation/2.1/example/fixtures/resources/page1-full.png',
      target: { width: 1200, height: 1800 },
      display: { width: 1200, height: 1800 },
    });

    // Image goes inside a "canvas"
    const worldObject = new WorldObject();
    worldObject.applyProps({
      width: 1200,
      height: 1800,
      id: '1',
    });

    // Finally append everything together.
    worldObject.appendChild(image);
    world.appendChild(worldObject);

    // Create our runtime.
    const runtime = new Runtime(renderer, world, viewport, [controller]);

    // And start listening to browser events proxied from our div element.
    new BrowserEventManager(viewer.current, runtime);

    // Reset the viewport to fit the bounds
    runtime.goHome();
  }, []);

  return (
    <div>
      <div style={{ width: 800, height: 600, overflow: 'hidden', position: 'relative' }} ref={viewer} />
      default static
    </div>
  );
};

export const DefaultStaticTiles: React.FC = () => {
  const index = 0;
  const [tiles, setTile] = useState<GetTile | undefined>();
  const viewer = useRef<any>();

  useEffect(() => {
    getTileFromImageService(staticTiles[index].id, staticTiles[index].width, staticTiles[index].height).then(s => {
      setTile(s);
    });
  }, [index]);

  useLayoutEffect(() => {
    if (tiles) {
      console.log(tiles);
      const renderer = new StaticRenderer(viewer.current);
      const viewport = { width: 800, height: 600, x: 0, y: 0, scale: 1 };
      const world = new World();

      const controller = popmotionController({
        minZoomFactor: 0.5,
        maxZoomFactor: 3,
        enableClickToZoom: false,
      });

      // Similar to creating HTML elements, we start from the inside and work our way out appending items.
      // Tiles images are more complex.

      const tiledImages = (tiles.imageService.tiles || []).flatMap(tile => {
        return tile.scaleFactors.map(size => {
          return TiledImage.fromTile(
            tiles.imageService.id,
            { height: staticTiles[index].height, width: staticTiles[index].width },
            tile,
            size
          );
        });
      });

      const compositeImage = new CompositeResource({
        width: staticTiles[index].width,
        height: staticTiles[index].height,
        id: tiles.imageService.id,
        images: tiledImages,
      });

      // Image goes inside a "canvas"
      const worldObject = new WorldObject();
      worldObject.applyProps({
        width: staticTiles[index].width,
        height: staticTiles[index].height,
        id: '1',
      });

      // Finally append everything together.
      // for (const tiledImage of tiledImages) {
      //
      // }
      worldObject.appendChild(compositeImage);
      world.appendChild(worldObject);

      // Create our runtime.
      const runtime = new Runtime(renderer, world, viewport, [controller]);

      // And start listening to browser events proxied from our div element.
      new BrowserEventManager(viewer.current, runtime);

      // Reset the viewport to fit the bounds
      runtime.goHome();
    }
  }, [tiles]);

  return (
    <div>
      <div style={{ width: 800, height: 600, overflow: 'hidden', position: 'relative' }} ref={viewer} />
      default static
    </div>
  );
};

export const StaticRenderHook = () => {
  const containerRef = useRef<any>();
  const { loading, uri } = useAtlasImage(<Wunder index={0} />, {
    height: 600,
    width: 800,
    containerRef,
  });

  return <div ref={containerRef}>{loading ? 'loading...' : <img alt="atlas image" src={uri} />}</div>;
};

export const StaticRenderHookBackgroundImage = () => {
  const [ref, bounds] = useMeasure();
  const { loading, uri } = useAtlasImage(<Wunder index={0} />, {
    height: bounds.height || 500,
    width: bounds.width || 1000,
    cover: true,
  });

  return (
    <div>
      <div
        ref={ref}
        style={{
          height: 500,
          backgroundImage: loading ? '#000' : `url(${uri})`,
          color: '#fff',
        }}
      >
        <div style={{ height: 500, backgroundColor: 'rgba(0, 0, 0, .6)', backdropFilter: 'grayscale()' }}>
          <h1 style={{ textAlign: 'center', paddingTop: 100 }}>This is a big title</h1>
        </div>
      </div>
    </div>
  );
};
