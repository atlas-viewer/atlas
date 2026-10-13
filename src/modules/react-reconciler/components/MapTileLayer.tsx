/* @refresh skip */
import React, { useCallback, useMemo, useRef } from "react";
import type { CompositeResourceProps } from "../../../spacial-content/composite-resource";
import { DEFAULT_OSM_TILE_TEMPLATE } from "../../maps/tile-source";
import type { MapTileSource, MapTileUrlContext } from "../../maps/types";
import { useMapProjectionContext } from "../hooks/use-map-projection";

export type MapTileLayerProps = {
	id?: string;
	tileUrlTemplate?: string;
	tileSource?: MapTileSource;
	/**
	 * Change this when a function `tileSource` starts returning different tiles. Function
	 * identity is deliberately ignored, so inline arrow functions do not reload the layer.
	 */
	tileSourceKey?: string | number;
	subdomains?: string[];
	tileSize?: number;
	/** Request `@2x` tiles from templates that use `{r}`. */
	retina?: boolean;
	minZoom?: number;
	maxZoom?: number;
	maxQualityLevels?: number;
	maxTilesPerLayer?: number;
	maxTotalTiles?: number;
	/**
	 * Zoom levels that do not fit the tile budgets for the whole map are built on demand for the
	 * area around the viewport. Disable to cap the zoom at what fits the budgets.
	 */
	viewportWindows?: boolean;
	maxTilesPerWindow?: number;
	windowMargin?: number;
	useDevicePixelRatio?: boolean;
	renderOptions?: CompositeResourceProps;
};

let layerCounter = 0;

export const MapTileLayer: React.FC<MapTileLayerProps> = ({
	id,
	tileUrlTemplate,
	tileSource,
	tileSourceKey,
	subdomains,
	tileSize = 256,
	retina,
	minZoom = 0,
	maxZoom = 19,
	maxQualityLevels,
	maxTilesPerLayer,
	maxTotalTiles,
	viewportWindows = true,
	maxTilesPerWindow,
	windowMargin,
	useDevicePixelRatio = false,
	renderOptions,
}) => {
	const map = useMapProjectionContext();
	const counter = useRef<number>();
	if (counter.current === undefined) {
		counter.current = ++layerCounter;
	}

	const source = tileSource || tileUrlTemplate || DEFAULT_OSM_TILE_TEMPLATE;

	// Function sources are called through a stable wrapper so that inline arrow functions
	// do not cause the layer to rebuild on every render.
	const functionSource = useRef<((ctx: MapTileUrlContext) => string) | null>(null);
	functionSource.current = typeof source === "function" ? source : null;
	const stableFunctionSource = useCallback(
		(ctx: MapTileUrlContext) =>
			functionSource.current ? functionSource.current(ctx) : "",
		[],
	);
	const resolvedSource: MapTileSource =
		typeof source === "function" ? stableFunctionSource : source;
	const sourceKey =
		typeof source === "string"
			? source
			: `function:${tileSourceKey === undefined ? "" : tileSourceKey}`;

	const resolvedRenderOptions = useMemo<CompositeResourceProps>(
		() => ({
			useDevicePixelRatio,
			...(renderOptions || {}),
		}),
		[renderOptions, useDevicePixelRatio],
	);

	const compositeId = id || `map-tile-layer-${counter.current}`;
	const { mapRect } = map;

	const layer = React.createElement("map-tile-pyramid", {
		id: compositeId,
		bounds: map.bounds,
		worldWidth: mapRect.width,
		worldHeight: mapRect.height,
		tileSize,
		tileSource: resolvedSource,
		sourceKey,
		subdomains,
		retina,
		minZoom,
		maxZoom,
		maxQualityLevels,
		maxTilesPerLayer,
		maxTotalTiles,
		viewportWindows,
		maxTilesPerWindow,
		windowMargin,
		renderOptions: resolvedRenderOptions,
	});

	if (mapRect.x === 0 && mapRect.y === 0) {
		return layer;
	}

	return React.createElement(
		"world-object",
		{
			id: `${compositeId}-frame`,
			x: mapRect.x,
			y: mapRect.y,
			width: mapRect.width,
			height: mapRect.height,
		},
		layer,
	);
};
