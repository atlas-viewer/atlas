/* @refresh skip */
import React, { useMemo } from "react";
import type { CompositeResourceProps } from "../../../spacial-content/composite-resource";
import { estimateFiniteTileGridCoverage } from "../../../spacial-content/map-tiled-image";
import { DEFAULT_OSM_TILE_TEMPLATE } from "../../maps/tile-source";
import type { MapTileSource } from "../../maps/types";
import { useMapProjectionContext } from "../hooks/use-map-projection";

export type MapTileLayerProps = {
	id?: string;
	tileUrlTemplate?: string;
	tileSource?: MapTileSource;
	subdomains?: string[];
	tileSize?: number;
	minZoom?: number;
	maxZoom?: number;
	maxQualityLevels?: number;
	maxTilesPerLayer?: number;
	maxTotalTiles?: number;
	useDevicePixelRatio?: boolean;
	renderOptions?: CompositeResourceProps;
};

const DEFAULT_MAX_TILES_PER_LAYER = 16000;
const DEFAULT_MAX_TOTAL_TILES = 120000;
const DEFAULT_MAX_QUALITY_LEVELS = 12;

export const MapTileLayer: React.FC<MapTileLayerProps> = ({
	id,
	tileUrlTemplate,
	tileSource,
	subdomains,
	tileSize = 256,
	minZoom = 0,
	maxZoom = 19,
	maxQualityLevels = DEFAULT_MAX_QUALITY_LEVELS,
	maxTilesPerLayer = DEFAULT_MAX_TILES_PER_LAYER,
	maxTotalTiles = DEFAULT_MAX_TOTAL_TILES,
	useDevicePixelRatio = false,
	renderOptions,
}) => {
	const map = useMapProjectionContext();

	const normalizedMinZoom = Math.max(0, Math.floor(minZoom));
	const normalizedMaxZoom = Math.max(normalizedMinZoom, Math.floor(maxZoom));

	const source = tileSource || tileUrlTemplate || DEFAULT_OSM_TILE_TEMPLATE;

	const zoomEntries = useMemo(() => {
		const entries: Array<{
			zoom: number;
			coverage: ReturnType<typeof estimateFiniteTileGridCoverage>;
		}> = [];
		let totalTiles = 0;
		for (let z = normalizedMinZoom; z <= normalizedMaxZoom; z++) {
			const coverage = estimateFiniteTileGridCoverage({
				bounds: map.bounds,
				zoom: z,
			});
			if (
				coverage.count > maxTilesPerLayer ||
				totalTiles + coverage.count > maxTotalTiles
			) {
				break;
			}
			totalTiles += coverage.count;
			entries.push({ zoom: z, coverage });
		}

		if (!entries.length) {
			let fallbackZoom = normalizedMinZoom;
			while (fallbackZoom > 0) {
				const coverage = estimateFiniteTileGridCoverage({
					bounds: map.bounds,
					zoom: fallbackZoom,
				});
				if (coverage.count <= maxTilesPerLayer) {
					break;
				}
				fallbackZoom -= 1;
			}
			entries.push({
				zoom: fallbackZoom,
				coverage: estimateFiniteTileGridCoverage({
					bounds: map.bounds,
					zoom: fallbackZoom,
				}),
			});
		}

		if (entries.length > maxQualityLevels) {
			const lowest = entries[0];
			const highest = entries[entries.length - 1];
			const floorZoom = Math.max(
				lowest.zoom + 1,
				highest.zoom - (maxQualityLevels - 2),
			);
			return [
				lowest,
				...entries.filter((entry) => entry.zoom >= floorZoom),
			].filter(
				(entry, index, arr) =>
					index === 0 || entry.zoom !== arr[index - 1].zoom,
			);
		}

		return entries;
	}, [
		map.bounds,
		maxQualityLevels,
		maxTilesPerLayer,
		maxTotalTiles,
		normalizedMaxZoom,
		normalizedMinZoom,
	]);

	const resolvedRenderOptions = useMemo<CompositeResourceProps>(
		() => ({
			layerPolicy: "always-blend",
			renderLayers: 2,
			renderSmallestFallback: true,
			prefetchRadius: 0,
			quality: 0.9,
			useDevicePixelRatio,
			fadeInMs: 300,
			fadeFallbackTiles: true,
			fadeOnLayerChange: true,
			clipToBounds: true,
			...(renderOptions || {}),
		}),
		[renderOptions, useDevicePixelRatio],
	);

	const sourceKey = typeof source === "string" ? source : "function-source";
	const compositeId = id || `map-tile-layer-${map.width}x${map.height}`;

	const tiles = zoomEntries.map(({ zoom, coverage }) => {
		const sourceWidth = coverage.tileSpanX * tileSize;
		const sourceHeight = coverage.tileSpanY * tileSize;
		const scaleFactor = Math.max(
			map.mapRect.width / sourceWidth,
			map.mapRect.height / sourceHeight,
		);
		return React.createElement("map-tiled-image", {
			key: `${compositeId}-${zoom}-${sourceKey}-${tileSize}`,
			id: `${compositeId}-z${zoom}`,
			bounds: map.bounds,
			worldWidth: map.mapRect.width,
			worldHeight: map.mapRect.height,
			zoom,
			scaleFactor,
			tileSize,
			tileSource: source,
			subdomains,
		});
	});

	const composite = React.createElement(
		"composite-image",
		{
			id: compositeId,
			width: map.mapRect.width,
			height: map.mapRect.height,
			renderOptions: resolvedRenderOptions,
		},
		tiles,
	);

	if (map.mapRect.x === 0 && map.mapRect.y === 0) {
		return composite;
	}

	return React.createElement(
		"world-object",
		{
			id: `${compositeId}-frame`,
			x: map.mapRect.x,
			y: map.mapRect.y,
			width: map.mapRect.width,
			height: map.mapRect.height,
		},
		composite,
	);
};
