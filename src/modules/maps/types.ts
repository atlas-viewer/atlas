export type MapBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type LngLatPoint = {
  lng: number;
  lat: number;
};

export type WorldPoint = {
  x: number;
  y: number;
};

export type WorldRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MapProjection = {
  lngLatToWorld: (lng: number, lat: number) => WorldPoint;
  worldToLngLat: (x: number, y: number) => LngLatPoint;
  lngLatBoundsToWorldRect: (bounds: MapBounds) => WorldRect;
  worldRectToLngLatBounds: (rect: WorldRect) => MapBounds;
  projectRing: (ring: Array<[number, number]>) => Array<[number, number]>;
};

export type MapTileUrlContext = {
  z: number;
  x: number;
  y: number;
  s?: string;
  subdomains?: string[];
  tileSize?: number;
};

export type MapTileSource = string | ((ctx: MapTileUrlContext) => string);

export type GeoJSONPoint = {
  type: 'Point';
  coordinates: [number, number];
};

export type GeoJSONMultiPoint = {
  type: 'MultiPoint';
  coordinates: Array<[number, number]>;
};

export type GeoJSONLineString = {
  type: 'LineString';
  coordinates: Array<[number, number]>;
};

export type GeoJSONMultiLineString = {
  type: 'MultiLineString';
  coordinates: Array<Array<[number, number]>>;
};

export type GeoJSONPolygon = {
  type: 'Polygon';
  coordinates: Array<Array<[number, number]>>;
};

export type GeoJSONMultiPolygon = {
  type: 'MultiPolygon';
  coordinates: Array<Array<Array<[number, number]>>>;
};

export type MapGeoJSONGeometry =
  | GeoJSONPoint
  | GeoJSONMultiPoint
  | GeoJSONLineString
  | GeoJSONMultiLineString
  | GeoJSONPolygon
  | GeoJSONMultiPolygon;

export type MapGeoJSONFeature<
  TGeometry extends MapGeoJSONGeometry | null = MapGeoJSONGeometry,
  TProperties = Record<string, unknown> | null,
> = {
  type: 'Feature';
  id?: string | number;
  geometry: TGeometry;
  properties?: TProperties;
};

export type MapGeoJSONFeatureCollection<
  TGeometry extends MapGeoJSONGeometry | null = MapGeoJSONGeometry,
  TProperties = Record<string, unknown> | null,
> = {
  type: 'FeatureCollection';
  features: Array<MapGeoJSONFeature<TGeometry, TProperties>>;
};

export type MapGeoJSONInput = MapGeoJSONGeometry | MapGeoJSONFeature | MapGeoJSONFeatureCollection;
