import { GenericObject, GenericObjectProps } from './generic-object';

export interface HasGeometry {
  geometry: { type: 'none' } | { type: 'polygon'; points: [number, number][]; clip?: boolean };
}

export function hasGeometryDefaults(): HasGeometry {
  return {
    geometry: { type: 'none' },
  };
}

function hasGeometry(a: unknown): a is HasGeometry {
  return !!(a || ({} as any)).geometry;
}

export function applyGeometryProps(
  toObject: GenericObject,
  props: GenericObjectProps | (GenericObjectProps & HasGeometry)
) {
  let didUpdate = false;

  if (hasGeometry(props)) {
    switch (props.geometry.type) {
      case 'polygon': {
        // @todo what happens if the geometry is OUTSIDE the points?
        //   - option 1 - geometry will overwrite points/height/width
        //   - option 2 - geometry is scaled down to fit within the bounds
        //   - option 3 - ignore it and leave up to the object implementation (current)

        // @todo IF we were to reculate the bounds/points, we should grow/shrink evenly in all directions. This would
        //   match expected behaviour if you say - rotated around the center. We could also add a geometry origin...
        //
        // Uses
        //  - Geometry could be used for clipping, say an image type, the geometry might be useful for that.
        //    e.g on an HTML canvas - fill in the bounds and clip with geometry.
        //  - Could be used simply to better represent another shape, such as the touch target for an SVG or a
        //    rotated image.
        //  - Rotated container - a container could have a rotation, that would change it's points - but then also
        //    change its geometry. When traversing THROUGH you would need to take into account that rotation and
        //    undo it (by counter-rotating the point)

        toObject.geometry = props.geometry;
        didUpdate = true;
        break;
      }
    }
  }
  return didUpdate;
}
