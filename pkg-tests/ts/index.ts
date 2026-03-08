import {
  AtlasAuto,
  createMapProjection,
  DEFAULT_OSM_TILE_TEMPLATE,
  type MapBounds,
  type MapTileSource,
  type WarpAdapter,
  type WarpControlPoint,
  type WarpTransformationType,
} from '@atlas-viewer/atlas';

const _AtlasAuto = AtlasAuto;
void _AtlasAuto;

const bounds: MapBounds = {
  west: -74.3,
  south: 40.45,
  east: -73.6,
  north: 40.95,
};

const projection = createMapProjection({
  bounds,
  width: 2400,
  height: 1600,
});

const worldPoint = projection.lngLatToWorld(-74.0, 40.7);
const lngLat = projection.worldToLngLat(worldPoint.x, worldPoint.y);
void lngLat;
void DEFAULT_OSM_TILE_TEMPLATE;

const tileSource: MapTileSource = ({ z, x, y }) => `https://tiles.example.org/${z}/${x}/${y}.png`;
void tileSource;

const controlPoints: WarpControlPoint[] = [{ image: { x: 0, y: 0 }, map: { lng: -74.0, lat: 40.7 } }];
const transformationType: WarpTransformationType = 'projective';
void transformationType;

const adapter: WarpAdapter = {
  setMapGcps(_controlPoints) {},
  setMapTransformationType(_type) {},
  update(_reason) {},
};

adapter.setMapGcps(controlPoints);
