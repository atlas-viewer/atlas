/* @refresh skip */
import React from "react";
import type { BoxStyle } from "../../../objects/box";
import type { GeometryStyle } from "../../../objects/geometry";
import type { MapGeoJSONInput } from "../../maps/types";
import { useMapGeoJSON } from "../hooks/use-map-geojson";
import { useMapProjectionContext } from "../hooks/use-map-projection";

export type MapGeoJSONProps = {
	data: MapGeoJSONInput;
	markerSize?: number;
	markerStyle?: BoxStyle;
	lineStyle?: GeometryStyle;
	polygonStyle?: GeometryStyle;
	interactive?: boolean;
};

export const MapGeoJSON: React.FC<MapGeoJSONProps> = ({
	data,
	markerSize = 8,
	markerStyle = {
		backgroundColor: "rgba(220, 38, 38, 0.9)",
		border: "1px solid white",
	},
	lineStyle = {
		borderColor: "#1d4ed8",
		borderWidth: "2",
		borderStyle: "solid",
	},
	polygonStyle = {
		backgroundColor: "rgba(37, 99, 235, 0.25)",
		borderColor: "#1d4ed8",
		borderWidth: "2",
		borderStyle: "solid",
	},
	interactive,
}) => {
	const map = useMapProjectionContext();
	const geoJSON = useMapGeoJSON();
	const projected = geoJSON.project(data);

	return React.createElement(
		React.Fragment,
		null,
		projected.map((item) => {
			if (item.kind === "point") {
				return React.createElement("box", {
					key: item.key,
					interactive,
					target: {
						x: item.x - markerSize / 2,
						y: item.y - markerSize / 2,
						width: markerSize,
						height: markerSize,
					},
					style: markerStyle,
				});
			}

			return React.createElement("shape", {
				id: item.key,
				key: item.key,
				interactive,
				open: item.open,
				target: { x: 0, y: 0, width: map.width, height: map.height },
				points: item.points,
				style: item.open ? lineStyle : polygonStyle,
			});
		}),
	);
};
