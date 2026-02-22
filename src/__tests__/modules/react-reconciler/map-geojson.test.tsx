/** @vitest-environment happy-dom */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createMapProjection } from "../../../modules/maps/projection";
import type { MapGeoJSONInput } from "../../../modules/maps/types";
import { projectMapGeoJSON } from "../../../modules/react-reconciler/hooks/use-map-geojson";

describe("MapGeoJSON", () => {
	test("source renders polygons/lines as shape and points as box", () => {
		const source = readFileSync(
			resolve(
				process.cwd(),
				"src/modules/react-reconciler/components/MapGeoJSON.tsx",
			),
			"utf8",
		);

		expect(source).toContain("React.createElement(");
		expect(source).toContain("box");
		expect(source).toContain("shape");
		expect(source).toContain("open: item.open");
		expect(source).toContain("markerSize");
	});

	test("projects feature collection geometries to map world primitives", () => {
		const projection = createMapProjection({
			bounds: { west: -74.3, south: 40.45, east: -73.6, north: 40.95 },
			width: 2400,
			height: 1600,
		});

		const featureCollection: MapGeoJSONInput = {
			type: "FeatureCollection",
			features: [
				{
					type: "Feature",
					id: "point-a",
					geometry: { type: "Point", coordinates: [-74.0, 40.7] },
					properties: {},
				},
				{
					type: "Feature",
					id: "line-a",
					geometry: {
						type: "LineString",
						coordinates: [
							[-74.1, 40.75],
							[-73.95, 40.8],
						],
					},
					properties: {},
				},
				{
					type: "Feature",
					id: "polygon-a",
					geometry: {
						type: "Polygon",
						coordinates: [
							[
								[-74.2, 40.9],
								[-73.95, 40.9],
								[-73.95, 40.7],
								[-74.2, 40.7],
								[-74.2, 40.9],
							],
						],
					},
					properties: {},
				},
			],
		};

		const projected = projectMapGeoJSON(featureCollection, projection);

		const points = projected.filter((item) => item.kind === "point");
		const lines = projected.filter(
			(item) => item.kind === "shape" && item.open,
		);
		const polygons = projected.filter(
			(item) => item.kind === "shape" && !item.open,
		);

		expect(points).toHaveLength(1);
		expect(lines).toHaveLength(1);
		expect(polygons).toHaveLength(1);
	});

	test("handles multipoint and multipolygon conversions", () => {
		const projection = createMapProjection({
			bounds: { west: -74.3, south: 40.45, east: -73.6, north: 40.95 },
			width: 2400,
			height: 1600,
		});

		const projected = projectMapGeoJSON(
			{
				type: "FeatureCollection",
				features: [
					{
						type: "Feature",
						id: "multi-point",
						properties: {},
						geometry: {
							type: "MultiPoint",
							coordinates: [
								[-74.0, 40.7],
								[-73.9, 40.8],
							],
						},
					},
					{
						type: "Feature",
						id: "multi-polygon",
						properties: {},
						geometry: {
							type: "MultiPolygon",
							coordinates: [
								[
									[
										[-74.2, 40.9],
										[-74.1, 40.9],
										[-74.1, 40.8],
										[-74.2, 40.8],
										[-74.2, 40.9],
									],
								],
							],
						},
					},
				],
			},
			projection,
		);

		expect(projected).toHaveLength(3);
		expect(projected.filter((item) => item.kind === "point")).toHaveLength(2);
		expect(projected.filter((item) => item.kind === "shape")).toHaveLength(1);
	});
});
