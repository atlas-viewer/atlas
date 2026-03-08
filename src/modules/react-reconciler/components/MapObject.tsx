/* @refresh skip */
import React, { useMemo } from "react";
import {
	createMapProjection,
	latitudeToMercatorY,
	longitudeToMercatorX,
	validateMapBounds,
} from "../../maps/projection";
import type { MapBounds } from "../../maps/types";
import { MapProjectionContext } from "../hooks/use-map-projection";

export type MapObjectProps = {
	id?: string;
	bounds: MapBounds;
	x?: number;
	y?: number;
	width: number;
	height: number;
	preserveAspectRatio?: boolean;
	scale?: number;
	rotation?: number;
	children?: React.ReactNode;
};

export const MapObject: React.FC<MapObjectProps> = ({
	bounds,
	width,
	height,
	preserveAspectRatio = true,
	children,
	...worldObjectProps
}) => {
	validateMapBounds(bounds);

	const mapRect = useMemo(() => {
		if (!preserveAspectRatio) {
			return { x: 0, y: 0, width, height };
		}

		const mercatorWidth =
			longitudeToMercatorX(bounds.east) - longitudeToMercatorX(bounds.west);
		const mercatorHeight =
			latitudeToMercatorY(bounds.south) - latitudeToMercatorY(bounds.north);
		const mapAspect = mercatorWidth / mercatorHeight;
		const worldAspect = width / height;

		if (!Number.isFinite(mapAspect) || mapAspect <= 0) {
			return { x: 0, y: 0, width, height };
		}

		if (worldAspect > mapAspect) {
			const fittedWidth = height * mapAspect;
			return {
				x: (width - fittedWidth) / 2,
				y: 0,
				width: fittedWidth,
				height,
			};
		}

		const fittedHeight = width / mapAspect;
		return {
			x: 0,
			y: (height - fittedHeight) / 2,
			width,
			height: fittedHeight,
		};
	}, [
		bounds.east,
		bounds.north,
		bounds.south,
		bounds.west,
		height,
		preserveAspectRatio,
		width,
	]);

	const projection = useMemo(() => {
		const baseProjection = createMapProjection({
			bounds,
			width: mapRect.width,
			height: mapRect.height,
		});

		return {
			lngLatToWorld(lng: number, lat: number) {
				const world = baseProjection.lngLatToWorld(lng, lat);
				return {
					x: world.x + mapRect.x,
					y: world.y + mapRect.y,
				};
			},
			worldToLngLat(x: number, y: number) {
				return baseProjection.worldToLngLat(x - mapRect.x, y - mapRect.y);
			},
			lngLatBoundsToWorldRect(inputBounds: MapBounds) {
				const rect = baseProjection.lngLatBoundsToWorldRect(inputBounds);
				return {
					x: rect.x + mapRect.x,
					y: rect.y + mapRect.y,
					width: rect.width,
					height: rect.height,
				};
			},
			worldRectToLngLatBounds(rect: {
				x: number;
				y: number;
				width: number;
				height: number;
			}) {
				return baseProjection.worldRectToLngLatBounds({
					x: rect.x - mapRect.x,
					y: rect.y - mapRect.y,
					width: rect.width,
					height: rect.height,
				});
			},
			projectRing(ring: Array<[number, number]>) {
				return ring.map(([lng, lat]) => {
					const point = baseProjection.lngLatToWorld(lng, lat);
					return [point.x + mapRect.x, point.y + mapRect.y] as [number, number];
				});
			},
		};
	}, [bounds, mapRect.height, mapRect.width, mapRect.x, mapRect.y]);

	const contextValue = useMemo(
		() => ({
			bounds,
			width,
			height,
			mapRect,
			projection,
		}),
		[bounds, height, mapRect, projection, width],
	);

	return React.createElement(
		MapProjectionContext.Provider,
		{ value: contextValue },
		React.createElement(
			"world-object",
			{ width, height, ...worldObjectProps },
			children,
		),
	);
};
