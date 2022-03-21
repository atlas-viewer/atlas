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

interface HasSparseGrid {
  sparseGrid: null | {
    width: number;
    height: number;
    columns: number;
    rows: number;
    tile: { width: number; height: number };
    generateTileUrl: () => string;
  };
}

function sparseGridDefaults(): HasSparseGrid {
  return {
    sparseGrid: null,
  };
}

function findSparseGridGaps(
  object: HasSparseGrid & GenericObject,
  viewport: { x: number; y: number; width: number; height: number }
): Array<{ x: number; y: number; width: number; height: number }> {
  return [];
}

function generateSparseGrid(
  object: HasSparseGrid & GenericObject,
  tile: { width: number; height: number },
  dimensions: { width: number; height: number }
) {
  //
}

function defragmentSparseGrid(object: HasSparseGrid & GenericObject) {
  //
}

function pruneSparseGrid(object: HasSparseGrid & GenericObject) {
  //
}
