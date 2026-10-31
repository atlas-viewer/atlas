/* @refresh skip */
import React, { useMemo } from "react";
import type { BoxStyle } from "../../../objects/box";
import type { GeometryStyle } from "../../../objects/geometry";
import type { MapGeoJSONFeature, MapGeoJSONInput } from "../../maps/types";
import { useMapGeoJSON } from "../hooks/use-map-geojson";
import { useMapProjectionContext } from "../hooks/use-map-projection";
import { useMapViewportScale } from "../hooks/use-map-viewport-scale";

type StyleSource<T> = T | ((feature: MapGeoJSONFeature | undefined) => T);

export type MapGeoJSONFeatureHandler = (
	feature: MapGeoJSONFeature | undefined,
	event: any,
) => void;

export type MapGeoJSONProps = {
	data: MapGeoJSONInput;
	/** Marker size in world units, or CSS-like pixels when `markerSizeUnit` is `"screen"`. */
	markerSize?: number;
	/**
	 * `"world"` markers scale with the map (default). `"screen"` markers keep the same on-screen
	 * size at every zoom level.
	 */
	markerSizeUnit?: "world" | "screen";
	/** Styles can be a function of the feature, to style by `feature.properties`. */
	markerStyle?: StyleSource<BoxStyle>;
	lineStyle?: StyleSource<GeometryStyle>;
	polygonStyle?: StyleSource<GeometryStyle>;
	interactive?: boolean;
	onFeatureClick?: MapGeoJSONFeatureHandler;
	onFeaturePointerEnter?: MapGeoJSONFeatureHandler;
	onFeaturePointerLeave?: MapGeoJSONFeatureHandler;
};

const DEFAULT_MARKER_STYLE: BoxStyle = {
	backgroundColor: "rgba(220, 38, 38, 0.9)",
	border: "1px solid white",
};

const DEFAULT_LINE_STYLE: GeometryStyle = {
	borderColor: "#1d4ed8",
	borderWidth: "2",
	borderStyle: "solid",
};

const DEFAULT_POLYGON_STYLE: GeometryStyle = {
	backgroundColor: "rgba(37, 99, 235, 0.25)",
	borderColor: "#1d4ed8",
	borderWidth: "2",
	borderStyle: "solid",
};

function resolveStyle<T>(
	source: StyleSource<T>,
	feature: MapGeoJSONFeature | undefined,
): T {
	return typeof source === "function"
		? (source as (feature: MapGeoJSONFeature | undefined) => T)(feature)
		: source;
}

export const MapGeoJSON: React.FC<MapGeoJSONProps> = ({
	data,
	markerSize = 8,
	markerSizeUnit = "world",
	markerStyle = DEFAULT_MARKER_STYLE,
	lineStyle = DEFAULT_LINE_STYLE,
	polygonStyle = DEFAULT_POLYGON_STYLE,
	interactive,
	onFeatureClick,
	onFeaturePointerEnter,
	onFeaturePointerLeave,
}) => {
	const map = useMapProjectionContext();
	const geoJSON = useMapGeoJSON();
	const projected = useMemo(() => geoJSON.project(data), [geoJSON, data]);

	const screenScale = useMapViewportScale(markerSizeUnit === "screen");
	const worldMarkerSize =
		markerSizeUnit === "screen" ? markerSize / screenScale : markerSize;

	const hasHandlers = !!(
		onFeatureClick ||
		onFeaturePointerEnter ||
		onFeaturePointerLeave
	);
	const isInteractive = interactive ?? hasHandlers;

	return React.createElement(
		React.Fragment,
		null,
		projected.map((item) => {
			const handlers = hasHandlers
				? {
						onClick: onFeatureClick
							? (e: any) => onFeatureClick(item.feature, e)
							: undefined,
						onPointerEnter: onFeaturePointerEnter
							? (e: any) => onFeaturePointerEnter(item.feature, e)
							: undefined,
						onPointerLeave: onFeaturePointerLeave
							? (e: any) => onFeaturePointerLeave(item.feature, e)
							: undefined,
					}
				: {};

			if (item.kind === "point") {
				return React.createElement("box", {
					key: item.key,
					interactive: isInteractive,
					target: {
						x: item.x - worldMarkerSize / 2,
						y: item.y - worldMarkerSize / 2,
						width: worldMarkerSize,
						height: worldMarkerSize,
					},
					style: resolveStyle(markerStyle, item.feature),
					...handlers,
				});
			}

			return React.createElement("shape", {
				id: item.key,
				key: item.key,
				interactive: isInteractive,
				open: item.open,
				target: { x: 0, y: 0, width: map.width, height: map.height },
				points: item.points,
				holes: item.holes,
				style: resolveStyle(item.open ? lineStyle : polygonStyle, item.feature),
				...handlers,
			});
		}),
	);
};
