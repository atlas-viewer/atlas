import type * as React from "react";
import { useMemo, useRef } from "react";
import type { MapGeoJSONInput } from "../src/modules/maps/types";
import { createWarpAdapterController } from "../src/modules/maps/warped/adapter";
import type {
	WarpAdapter,
	WarpControlPoint,
} from "../src/modules/maps/warped/types";
import { AtlasAuto } from "../src/modules/react-reconciler/components/AtlasAuto";
import { MapGeoJSON } from "../src/modules/react-reconciler/components/MapGeoJSON";
import { MapObject } from "../src/modules/react-reconciler/components/MapObject";
import { MapTileLayer } from "../src/modules/react-reconciler/components/MapTileLayer";
import { RegionHighlight } from "../src/modules/react-reconciler/components/RegionHighlight";
import { useMapProjection } from "../src/modules/react-reconciler/hooks/use-map-projection";
import type { Runtime } from "../src/renderer/runtime";

export default { title: "Maps" };

const NYC_BOUNDS = {
	west: -74.3,
	south: 40.45,
	east: -73.6,
	north: 40.95,
};

function MapControls({
	runtime,
}: {
	runtime: React.MutableRefObject<Runtime | undefined>;
}) {
	return (
		<div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
			<button onClick={() => runtime.current?.goHome()}>Home</button>
			<button onClick={() => runtime.current?.world.zoomIn()}>Zoom in</button>
			<button onClick={() => runtime.current?.world.zoomOut()}>Zoom out</button>
		</div>
	);
}

function LngLatOverlayLayer() {
	const map = useMapProjection();

	const polygonPoints = useMemo(
		() =>
			map.projectRing([
				[-74.18, 40.88],
				[-73.92, 40.88],
				[-73.85, 40.72],
				[-74.12, 40.68],
				[-74.18, 40.88],
			]),
		[map],
	);

	const boxRect = map.lngLatBoundsToWorldRect({
		west: -74.05,
		south: 40.67,
		east: -73.95,
		north: 40.75,
	});

	return (
		<>
			<shape
				id="lnglat-poly"
				open={false}
				target={{ x: 0, y: 0, width: 2400, height: 1600 }}
				points={polygonPoints}
				style={{
					backgroundColor: "rgba(15, 118, 110, 0.25)",
					borderColor: "#0f766e",
					borderWidth: "2",
					borderStyle: "solid",
				}}
			/>
			<box
				target={{
					x: boxRect.x,
					y: boxRect.y,
					width: boxRect.width,
					height: boxRect.height,
				}}
				style={{
					backgroundColor: "rgba(168, 85, 247, 0.25)",
					border: "2px solid #7e22ce",
				}}
			/>
		</>
	);
}

export const FiniteOSMDefault: React.FC = () => {
	const runtime = useRef<Runtime>();

	return (
		<div>
			<MapControls runtime={runtime} />
			<AtlasAuto
				height={560}
				onCreated={(ctx) => {
					runtime.current = ctx.runtime;
				}}
			>
				<world>
					<MapObject
						id="city-map"
						x={0}
						y={0}
						width={2400}
						height={1600}
						bounds={NYC_BOUNDS}
					>
						<MapTileLayer />
					</MapObject>
				</world>
			</AtlasAuto>
		</div>
	);
};

export const CustomTileProvider: React.FC = () => {
	return (
		<AtlasAuto height={560}>
			<world>
				<MapObject
					id="custom-map"
					x={0}
					y={0}
					width={2400}
					height={1600}
					bounds={NYC_BOUNDS}
				>
					<MapTileLayer
						tileUrlTemplate="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
						subdomains={["a", "b", "c"]}
					/>
				</MapObject>
			</world>
		</AtlasAuto>
	);
};

export const LngLatBoxesAndPolygons: React.FC = () => {
	return (
		<AtlasAuto height={560}>
			<world>
				<MapObject
					id="overlay-map"
					x={0}
					y={0}
					width={2400}
					height={1600}
					bounds={NYC_BOUNDS}
				>
					<MapTileLayer minZoom={8} maxZoom={14} />
					<LngLatOverlayLayer />
				</MapObject>
			</world>
		</AtlasAuto>
	);
};

export const GeoJSONFeatureComposition: React.FC = () => {
	const geojson: MapGeoJSONInput = {
		type: "FeatureCollection" as const,
		features: [
			{
				type: "Feature" as const,
				id: "line-1",
				properties: { kind: "line" },
				geometry: {
					type: "LineString" as const,
					coordinates: [
						[-74.2, 40.6],
						[-74.05, 40.7],
						[-73.8, 40.8],
					],
				},
			},
			{
				type: "Feature" as const,
				id: "poly-1",
				properties: { kind: "polygon" },
				geometry: {
					type: "Polygon" as const,
					coordinates: [
						[
							[-74.24, 40.9],
							[-73.98, 40.9],
							[-74.02, 40.78],
							[-74.24, 40.9],
						],
					],
				},
			},
			{
				type: "Feature" as const,
				id: "point-1",
				properties: { kind: "point" },
				geometry: {
					type: "Point" as const,
					coordinates: [-73.99, 40.72],
				},
			},
		],
	};

	return (
		<AtlasAuto height={560}>
			<world>
				<MapObject
					id="geojson-map"
					x={0}
					y={0}
					width={2400}
					height={1600}
					bounds={NYC_BOUNDS}
				>
					<MapTileLayer />
					<MapGeoJSON data={geojson} markerSize={10} />
				</MapObject>
			</world>
		</AtlasAuto>
	);
};

export const MapWithZoneInterop: React.FC = () => {
	return (
		<AtlasAuto height={560}>
			<world>
				<zone id="zone-a" x={0} y={0} width={2500} height={1700}>
					<MapObject
						id="zone-map-a"
						x={0}
						y={0}
						width={2400}
						height={1600}
						bounds={NYC_BOUNDS}
					>
						<MapTileLayer minZoom={8} maxZoom={13} />
					</MapObject>
				</zone>
				<zone id="zone-b" x={2500} y={0} width={2500} height={1700}>
					<MapObject
						id="zone-map-b"
						x={0}
						y={0}
						width={2400}
						height={1600}
						bounds={{ west: -123.2, south: 37.4, east: -121.7, north: 38.2 }}
					>
						<MapTileLayer minZoom={8} maxZoom={13} />
					</MapObject>
				</zone>
			</world>
		</AtlasAuto>
	);
};

function RegionOverlay() {
	const map = useMapProjection();
	const region = map.lngLatBoundsToWorldRect({
		west: -74.08,
		south: 40.7,
		east: -73.95,
		north: 40.8,
	});

	return (
		<RegionHighlight
			region={{
				id: "r-1",
				x: region.x,
				y: region.y,
				width: region.width,
				height: region.height,
			}}
			isEditing={false}
			onSave={() => {
				// no-op
			}}
			onClick={() => {
				// no-op
			}}
			style={{
				backgroundColor: "rgba(14, 116, 144, 0.3)",
				border: "2px solid #0e7490",
			}}
		/>
	);
}

export const MapWithRegionHighlightInterop: React.FC = () => {
	return (
		<AtlasAuto
			height={560}
			runtimeOptions={{ maxOverZoom: 8 }}
			unstable_webglRenderer
		>
			<world>
				<MapObject
					id="highlight-map"
					x={0}
					y={0}
					width={24000}
					height={16000}
					bounds={NYC_BOUNDS}
				>
					<MapTileLayer
						maxZoom={21}
						maxTilesPerLayer={16384}
						maxTotalTiles={90000}
					/>
					<RegionOverlay />
				</MapObject>
			</world>
		</AtlasAuto>
	);
};

export const WarpedImageExtensionScaffold: React.FC = () => {
	const controlPoints: WarpControlPoint[] = [
		{ image: { x: 0, y: 0 }, map: { lng: -74.08, lat: 40.9 } },
		{ image: { x: 1000, y: 0 }, map: { lng: -73.85, lat: 40.88 } },
		{ image: { x: 1000, y: 700 }, map: { lng: -73.86, lat: 40.7 } },
		{ image: { x: 0, y: 700 }, map: { lng: -74.1, lat: 40.72 } },
	];

	const adapter: WarpAdapter = {
		setMapGcps(next) {
			console.log("setMapGcps", next.length);
		},
		setMapTransformationType(type) {
			console.log("setMapTransformationType", type);
		},
		update(reason) {
			console.log("update", reason);
		},
	};

	useMemo(() => {
		const controller = createWarpAdapterController(adapter, {
			onUpdate(reason) {
				console.log("warp-update-hook", reason);
			},
		});

		controller.setControlPoints(controlPoints);
		controller.setTransformationType("projective");
		controller.update("manual");

		return controller;
	}, [adapter, controlPoints]);

	return (
		<AtlasAuto height={560}>
			<world>
				<MapObject
					id="warp-scaffold-map"
					x={0}
					y={0}
					width={2400}
					height={1600}
					bounds={NYC_BOUNDS}
				>
					<MapTileLayer minZoom={8} maxZoom={12} />
					<MapGeoJSON
						data={{
							type: "MultiPoint",
							coordinates: controlPoints.map((point) => [
								point.map.lng,
								point.map.lat,
							]),
						}}
						markerSize={12}
						markerStyle={{
							backgroundColor: "rgba(217, 119, 6, 0.9)",
							border: "2px solid white",
						}}
					/>
				</MapObject>
			</world>
		</AtlasAuto>
	);
};
