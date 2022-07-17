// Sparse grid.
//
// This is model designed for maps and very large tile sets.
// In theory this could represent an infinite plane, that will create visible tiles
// As they are viewed.
//
// This requires a postFrame call to one of the functions here to prepare the grid.
//
// Mechanics
// ===============================================================
// - Storing the full size of the grid space in a compact form
// - Maintaining a points array, possibly out of order, while maintaining hide region functionality
// - Possible recycling of old tiles, slicing the head from the points array, and expanding it.
//    - Least recently used
//    - Further from last target
//    - First in, first out
//
// Requirements
// ===============================================================
// - Compatible with everything else
// - Fast - this needs to happen before a frame
// - Work with various tile sizes (also non-square)
// - Not complicate hosts (indicies) for storing data (like images)
//    - Could instead use a Map of x/y { 0: { 0: {}, 256: {}, 512: {} } }
//    - Access time should be quicker.
//
//
// Example
// ===============================================================
// 1024 x 1024 tiles, each 256 = 68 megapixel image
// Not work pre-generating every one.
//
// Say we were at the very top, and loaded a 1000x1000 at 0,0
// We would need to load the following tiles:
//
//       0,0 |   0,256 |   0,512 |   0,768
//     256,0 | 256,256 | 256,512 | 256,768
//     512,0 | 512,256 | 512,512 | 512,768
//     768,0 | 768,256 | 768,512 | 768,768
//
// These 16 tiles would be appended on the point array.
//
// These would then be ready for the frame, that can filter that points array down and render as normal.
// The code here needs to be able to:
// - Hold the state for the virtual grid
// - Keep track of which tiles are prepared, and which regions are prepared.
// - Fill in the blanks, if there are already regions
// - Possibly de-fragment, which can be done when idle
// - Possibly first-in first-out recycling

import { GenericObject } from './generic-object';
import { createEmptyStorage, GridStorage } from '../helpers/grid-storage';
import { dna, dnaLength } from '@atlas-viewer/dna';
import { Projection } from '../../types';

type GenerateTileUrl = (dims: { x: number; y: number }) => string;

interface HasSparseGrid {
  sparseGrid: {
    width: number;
    height: number;
    columns: number;
    rows: number;
    tile: { width: number; height: number };
    generateTileUrl: GenerateTileUrl;
    state: {
      totalLoaded: number;
      loadedMap: GridStorage<boolean>;
    };
    props?: {
      preGenerateArea?: Projection | Array<Projection>;
    };
  };
}

interface SparseGridProps {
  grid?: {
    generateTileUrl?: GenerateTileUrl;
    preGenerateArea?: Projection | Array<Projection>;
  };
}

export function applySparseGridProps(grid: HasSparseGrid & GenericObject, props: SparseGridProps) {
  let didChange = false;
  if (props.grid) {
    if (props.grid.generateTileUrl && props.grid.generateTileUrl !== grid.sparseGrid.generateTileUrl) {
      grid.sparseGrid.generateTileUrl = props.grid.generateTileUrl;
      didChange = true;
    }

    if (
      props.grid.preGenerateArea &&
      (!grid.sparseGrid.props || grid.sparseGrid.props.preGenerateArea !== props.grid.preGenerateArea)
    ) {
      didChange = true;
      const areas = Array.isArray(props.grid.preGenerateArea)
        ? props.grid.preGenerateArea
        : [props.grid.preGenerateArea];
      for (const box of areas) {
        generateSparseGrid(grid, box);
      }
    }
  }

  return didChange;
}

export function sparseGridDefaults(grid: HasSparseGrid['sparseGrid']): HasSparseGrid {
  return {
    sparseGrid: grid,
  };
}

export function createInitialGrid(
  tile: { width: number; height?: number },
  dimensions: { width: number; height: number },
  generateTileUrl: GenerateTileUrl
): HasSparseGrid['sparseGrid'] {
  const _tile = {
    width: tile.width,
    height: tile.height || tile.width,
  };

  const columns = Math.ceil(dimensions.width / _tile.width);
  const rows = Math.ceil(dimensions.height / _tile.height);

  return {
    tile: _tile,
    width: dimensions.width,
    height: dimensions.height,
    rows,
    generateTileUrl,
    columns,
    state: {
      totalLoaded: 0,
      loadedMap: createEmptyStorage(),
    },
  };
}

export function generateSparseGrid(
  object: HasSparseGrid & GenericObject,
  viewport: { x: number; y: number; width: number; height: number }
) {
  if (!object.sparseGrid) {
    throw new Error('Does not contain sparse grid');
  }
  const tiles: Array<{ r: number; c: number }> = [];

  const columnStart = Math.floor(viewport.x / object.sparseGrid.tile.width);
  const rowStart = Math.floor(viewport.y / object.sparseGrid.tile.height);
  const columnEnd = Math.ceil((viewport.x + viewport.width) / object.sparseGrid.tile.width);
  const rowEnd = Math.ceil((viewport.y + viewport.height) / object.sparseGrid.tile.height);
  const state = object.sparseGrid.state;

  for (let c = columnStart; c < columnEnd; c++) {
    for (let r = rowStart; r < rowEnd; r++) {
      if (state.loadedMap[r] && state.loadedMap[r][c]) {
        continue;
      }
      // Generate new tile.
      tiles.push({ r, c });
    }
  }

  // @todo Check length of points.
  if (dnaLength(object.points) <= state.totalLoaded + tiles.length) {
    // resize, more than doubles each time
    const points = object.points;
    const newPoints = dna(tiles.length * 5 + object.points.length * 2);
    newPoints.set(points, 0);
    object.points = newPoints;
  }

  let cursor = state.totalLoaded;
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    const x = tile.c * object.sparseGrid.tile.width;
    const y = tile.r * object.sparseGrid.tile.height;
    state.loadedMap[tile.r] = state.loadedMap[tile.r] || {};
    state.loadedMap[tile.r][tile.c] = true;

    object.points[cursor * 5] = 0;
    object.points[cursor * 5 + 1] = x;
    object.points[cursor * 5 + 2] = y;
    object.points[cursor * 5 + 3] = x + object.sparseGrid.tile.width;
    object.points[cursor * 5 + 4] = y + object.sparseGrid.tile.height;
    cursor += 1;
  }

  state.totalLoaded += tiles.length;

  return {
    loaded: tiles.length,
  };
}

function defragmentSparseGrid(object: HasSparseGrid & GenericObject) {
  //
}

function pruneSparseGrid(object: HasSparseGrid & GenericObject) {
  //
}
