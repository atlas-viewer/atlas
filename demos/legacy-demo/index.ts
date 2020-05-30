// import { Vault } from '@hyperion-framework/vault';
import { renderWorld } from './render-world';
// import { imagesFromIIIF } from './images-from-iiif';
import { GridBuilder } from '../../src/modules/grid-builder/grid-builder';
import { SingleImage } from '../../src/spacial-content/single-image';
import { Vault } from '@hyperion-framework/vault';
import { AnnotationNormalized, AnnotationPageNormalized, CanvasNormalized } from '@hyperion-framework/types';
import { fromImageService } from '../../src/modules/image-service-data-source/from-image-service';
import { Zone } from '../../src/world-objects/zone';

const vault = new Vault();
// @ts-ignore
const loader = vault.imageService;

(async () => {
  const manifest = await vault.loadManifest(
    'https://iiif.bodleian.ox.ac.uk/iiif/manifest/748a9d50-5a3a-440e-ab9d-567dd68b6abb.json'
  );
  const tiles: any[] = [];
  for (const canvasRef of manifest.items) {
    const canvas = vault.fromRef<CanvasNormalized>(canvasRef);
    for (const page of canvas.items) {
      for (const anno of vault.fromRef<AnnotationPageNormalized>(page).items) {
        // console.log(vault.fromRef(vault.fromRef<AnnotationNormalized>(anno).body[0]).service[0]);
        const annotation = vault.fromRef<any>(vault.fromRef<AnnotationNormalized>(anno).body[0]);
        const serviceSnippet = annotation.service[0];
        const imageService = await loader.loadService({
          id: serviceSnippet.id,
          width: canvas.width,
          height: canvas.height,
        });

        const { best: thumbnail } = (await vault.getThumbnail(
          canvas,
          {
            maxHeight: 512,
            maxWidth: 512,
          },
          true
        )) as any;

        const compositeResource = fromImageService(imageService);

        if (thumbnail) {
          compositeResource.addImages([
            SingleImage.fromImage(thumbnail.id, {
              height: thumbnail.height,
              width: thumbnail.width,
            }),
          ]);
        }

        tiles.push({
          id: imageService.id,
          width: canvas.width,
          height: canvas.height,
          layers: [compositeResource],
        });
      }
    }
  }

  const builder = new GridBuilder();

  const width = 800;
  const height = 600;
  const tileSize = 150;
  const grid = true as any;
  const zones = false as any;
  // const width = window.innerWidth;
  // const height = window.innerHeight;

  document.body.style.margin = '0px';
  document.body.style.margin = '0px';

  if (grid) {
    builder.setWidth(width);
    builder.setViewingDirection('left-to-right');
    // builder.setColumns(width / (tileSize));
    builder.setPadding(40);
    builder.setSpacing(20);

    window.addEventListener('resize', () => {
      builder.setWidth(width);
      builder.setColumns(Math.round(width / 400));
      builder.recalculate();
    });
  } else {
    builder.setWidth(tiles.length * tileSize);
    builder.setViewingDirection('left-to-right');
    builder.setColumns(tiles.length);
    builder.setPadding(72);
    builder.setSpacing(40);
  }

  builder.addContent(tiles);

  builder.recalculate();

  const world = builder.getWorld();

  const objects = world.getObjects();

  // Create an initial viewport.
  const viewport = { width: width, height: height, x: 0, y: 0, scale: 1 };

  const [renderer, runtime] = renderWorld(world, viewport);

  if (zones) {
    if (zones) {
      for (const obj of objects) {
        world.addZone(new Zone([obj]));
      }
    }

    runtime.selectZone(0);

    console.log(renderer);
    const state = { current: 0 };
    const controls = document.createElement('div');
    const next = document.createElement('button');
    next.addEventListener('click', () => {
      if (state.current < world.zones.length) {
        state.current++;
        runtime.selectZone(state.current);
      }
    });
    next.innerText = 'next';

    const prev = document.createElement('button');
    prev.addEventListener('click', () => {
      if (state.current) {
        state.current--;
        runtime.selectZone(state.current);
      }
    });
    prev.innerText = 'prev';

    controls.appendChild(next);
    controls.appendChild(prev);
    document.body.append(controls);
  }
})();
