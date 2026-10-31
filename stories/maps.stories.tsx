import { GcpTransformer } from "@allmaps/transform";
import type * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createFittedMapProjection } from "../src/modules/maps/projection";
import type {
	MapBounds,
	MapGeoJSONFeature,
	MapGeoJSONInput,
} from "../src/modules/maps/types";
import { createWarpAdapterController } from "../src/modules/maps/warped/adapter";
import { fromAllmapsTransformer } from "../src/modules/maps/warped/transformer";
import type {
	WarpControlPoint,
	WarpTransformationType,
} from "../src/modules/maps/warped/types";
import { AtlasAuto } from "../src/modules/react-reconciler/components/AtlasAuto";
import { MapAttribution } from "../src/modules/react-reconciler/components/MapAttribution";
import { MapGeoJSON } from "../src/modules/react-reconciler/components/MapGeoJSON";
import { MapObject } from "../src/modules/react-reconciler/components/MapObject";
import { MapTileLayer } from "../src/modules/react-reconciler/components/MapTileLayer";
import { MapWarpedImage } from "../src/modules/react-reconciler/components/MapWarpedImage";
import { RegionHighlight } from "../src/modules/react-reconciler/components/RegionHighlight";
import { useMapProjection } from "../src/modules/react-reconciler/hooks/use-map-projection";
import type { Runtime } from "../src/renderer/runtime";
import eastBostonAnnotation from "./fixtures/allmaps-east-boston.json";
import type { MapWarpedImageService } from "../src/modules/react-reconciler/components/MapWarpedImage";

export default { title: "Maps" };

const NYC_BOUNDS: MapBounds = {
	west: -74.3,
	south: 40.45,
	east: -73.6,
	north: 40.95,
};

const OSM_ATTRIBUTION = <MapAttribution />;

function Controls({
	runtime,
	children,
}: {
	runtime: React.MutableRefObject<Runtime | undefined>;
	children?: React.ReactNode;
}) {
	return (
		<div
			style={{
				display: "flex",
				gap: 8,
				marginBottom: 8,
				flexWrap: "wrap",
				alignItems: "center",
			}}
		>
			<button onClick={() => runtime.current?.goHome()}>Home</button>
			<button onClick={() => runtime.current?.world.zoomIn()}>Zoom in</button>
			<button onClick={() => runtime.current?.world.zoomOut()}>Zoom out</button>
			{children}
		</div>
	);
}

// --- Basics -------------------------------------------------------------------------------------

export const FiniteOSMDefault: React.FC = () => {
	const runtime = useRef<Runtime>();

	return (
		<div>
			<Controls runtime={runtime} />
			<AtlasAuto
				height={560}
				htmlChildren={OSM_ATTRIBUTION}
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

const TILE_PROVIDERS = {
	osm: {
		label: "OpenStreetMap",
		tileSource: ({ z, x, y }: { z: number; x: number; y: number }) =>
			`https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
		maxZoom: 19,
		attribution: [
			{
				text: "© OpenStreetMap contributors",
				href: "https://www.openstreetmap.org/copyright",
			},
		],
	},
	topo: {
		label: "OpenTopoMap",
		tileSource: ({
			z,
			x,
			y,
			s,
			subdomains,
		}: {
			z: number;
			x: number;
			y: number;
			s?: string;
			subdomains?: string[];
		}) => {
			const sub = s || (subdomains || ["a"])[(x + y) % (subdomains || ["a"]).length];
			return `https://${sub}.tile.opentopomap.org/${z}/${x}/${y}.png`;
		},
		maxZoom: 17,
		attribution: [
			{
				text: "© OpenStreetMap contributors, SRTM",
				href: "https://www.openstreetmap.org/copyright",
			},
			{ text: "© OpenTopoMap", href: "https://opentopomap.org" },
		],
	},
} as const;

/**
 * A function tile source. Function identity is ignored (inline functions do not reload the layer),
 * `tileSourceKey` is what tells the layer the source changed.
 */
export const CustomTileProvider: React.FC = () => {
	const [provider, setProvider] = useState<keyof typeof TILE_PROVIDERS>("osm");
	const current = TILE_PROVIDERS[provider];

	return (
		<div>
			<div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
				{(Object.keys(TILE_PROVIDERS) as Array<keyof typeof TILE_PROVIDERS>).map(
					(key) => (
						<button
							key={key}
							disabled={key === provider}
							onClick={() => setProvider(key)}
						>
							{TILE_PROVIDERS[key].label}
						</button>
					),
				)}
			</div>
			<AtlasAuto
				height={560}
				htmlChildren={
					<MapAttribution items={[...current.attribution]} />
				}
			>
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
							tileSource={({ z, x, y }) =>
								current.tileSource({ z, x, y, subdomains: ["a", "b", "c"] })
							}
							tileSourceKey={provider}
							maxZoom={current.maxZoom}
						/>
					</MapObject>
				</world>
			</AtlasAuto>
		</div>
	);
};

// --- Overlays -----------------------------------------------------------------------------------

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

export const LngLatBoxesAndPolygons: React.FC = () => {
	return (
		<AtlasAuto height={560} htmlChildren={OSM_ATTRIBUTION}>
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

const PARKS: MapGeoJSONInput = {
	type: "FeatureCollection",
	features: [
		{
			// A polygon with a hole: the hole is cut out, not filled.
			type: "Feature",
			id: "park-with-pond",
			properties: { kind: "park", name: "Park with a pond" },
			geometry: {
				type: "Polygon",
				coordinates: [
					[
						[-74.2, 40.82],
						[-74.0, 40.82],
						[-74.0, 40.92],
						[-74.2, 40.92],
						[-74.2, 40.82],
					],
					[
						[-74.14, 40.86],
						[-74.06, 40.86],
						[-74.06, 40.89],
						[-74.14, 40.89],
						[-74.14, 40.86],
					],
				],
			},
		},
		{
			type: "Feature",
			id: "islands",
			properties: { kind: "island", name: "Two islands" },
			geometry: {
				type: "MultiPolygon",
				coordinates: [
					[
						[
							[-74.26, 40.52],
							[-74.18, 40.52],
							[-74.2, 40.58],
							[-74.26, 40.52],
						],
					],
					[
						[
							[-74.12, 40.5],
							[-74.04, 40.5],
							[-74.06, 40.56],
							[-74.12, 40.5],
						],
					],
				],
			},
		},
		{
			type: "Feature",
			id: "route",
			properties: { kind: "route", name: "A route" },
			geometry: {
				type: "LineString",
				coordinates: [
					[-74.2, 40.6],
					[-74.05, 40.7],
					[-73.8, 40.8],
				],
			},
		},
		{
			type: "Feature",
			id: "stops",
			properties: { kind: "stop", name: "Stops (a geometry collection)" },
			geometry: {
				type: "GeometryCollection",
				geometries: [
					{ type: "Point", coordinates: [-73.99, 40.72] },
					{ type: "Point", coordinates: [-73.93, 40.78] },
					{
						type: "LineString",
						coordinates: [
							[-73.99, 40.72],
							[-73.93, 40.78],
						],
					},
				],
			},
		},
	],
};

const KIND_COLORS: Record<string, string> = {
	park: "#16a34a",
	island: "#ca8a04",
	route: "#2563eb",
	stop: "#dc2626",
};

function colorFor(feature: MapGeoJSONFeature | undefined) {
	return KIND_COLORS[(feature?.properties as any)?.kind] || "#6b7280";
}

export const GeoJSONFeatureComposition: React.FC = () => {
	const [selected, setSelected] = useState<string>();
	const [markerUnit, setMarkerUnit] = useState<"world" | "screen">("screen");

	return (
		<div>
			<div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
				<label>
					<input
						type="checkbox"
						checked={markerUnit === "screen"}
						onChange={(e) => setMarkerUnit(e.target.checked ? "screen" : "world")}
					/>{" "}
					Screen sized markers
				</label>
				<span>
					Clicked: <strong>{selected || "nothing"}</strong>
				</span>
			</div>
			<AtlasAuto height={560} htmlChildren={OSM_ATTRIBUTION}>
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
						<MapGeoJSON
							data={PARKS}
							markerSize={12}
							markerSizeUnit={markerUnit}
							markerStyle={(feature) => ({
								backgroundColor: colorFor(feature),
								border: "2px solid white",
							})}
							lineStyle={(feature) => ({
								borderColor: colorFor(feature),
								borderWidth: "3",
								borderStyle: "solid",
							})}
							polygonStyle={(feature) => ({
								backgroundColor: `${colorFor(feature)}55`,
								borderColor: colorFor(feature),
								borderWidth: "2",
								borderStyle: "solid",
							})}
							onFeatureClick={(feature) =>
								setSelected((feature?.properties as any)?.name)
							}
						/>
					</MapObject>
				</world>
			</AtlasAuto>
		</div>
	);
};

export const MapWithZoneInterop: React.FC = () => {
	return (
		<AtlasAuto height={560} htmlChildren={OSM_ATTRIBUTION}>
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
			enableNavigator
			htmlChildren={OSM_ATTRIBUTION}
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
					<MapTileLayer maxZoom={21} />
					<RegionOverlay />
				</MapObject>
			</world>
		</AtlasAuto>
	);
};

// --- Zoom and layout ----------------------------------------------------------------------------

const PLACES: Record<string, MapBounds> = {
	"Times Square": { west: -73.9885, south: 40.7565, east: -73.9835, north: 40.7595 },
	"Brooklyn Bridge": {
		west: -73.9995,
		south: 40.7035,
		east: -73.9925,
		north: 40.7085,
	},
	"Central Park": { west: -73.9735, south: 40.7645, east: -73.9515, north: 40.7815 },
};

/**
 * The tile budget used to cap zoom for the whole map. Levels beyond it are now built for the area
 * around the viewport only, so street level is reachable over a metro sized map.
 */
export const DeepZoomViewportWindows: React.FC = () => {
	const runtime = useRef<Runtime>();
	const frame = useMemo(
		() =>
			createFittedMapProjection({
				bounds: NYC_BOUNDS,
				width: 2400,
				height: 1600,
			}),
		[],
	);

	const flyTo = (name: string) => {
		const rect = frame.projection.lngLatBoundsToWorldRect(PLACES[name]);
		runtime.current?.transitionManager.goToRegion(rect, {
			transition: { duration: 900 },
		});
	};

	return (
		<div>
			<Controls runtime={runtime}>
				{Object.keys(PLACES).map((name) => (
					<button key={name} onClick={() => flyTo(name)}>
						{name}
					</button>
				))}
			</Controls>
			<AtlasAuto
				height={560}
				runtimeOptions={{ maxOverZoom: 40 }}
				htmlChildren={OSM_ATTRIBUTION}
				onCreated={(ctx) => {
					runtime.current = ctx.runtime;
				}}
			>
				<world>
					<MapObject
						id="deep-map"
						x={0}
						y={0}
						width={2400}
						height={1600}
						bounds={NYC_BOUNDS}
					>
						<MapTileLayer maxZoom={19} />
					</MapObject>
				</world>
			</AtlasAuto>
		</div>
	);
};

export const PreserveAspectRatioOff: React.FC = () => {
	const [preserve, setPreserve] = useState(false);

	return (
		<div>
			<label>
				<input
					type="checkbox"
					checked={preserve}
					onChange={(e) => setPreserve(e.target.checked)}
				/>{" "}
				preserveAspectRatio
			</label>
			<AtlasAuto height={500} htmlChildren={OSM_ATTRIBUTION}>
				<world>
					<MapObject
						id="stretched"
						x={0}
						y={0}
						width={2400}
						height={700}
						bounds={NYC_BOUNDS}
						preserveAspectRatio={preserve}
					>
						<MapTileLayer minZoom={7} maxZoom={14} />
					</MapObject>
				</world>
			</AtlasAuto>
		</div>
	);
};

export const RotatedMapObject: React.FC = () => {
	const [rotation, setRotation] = useState(25);

	return (
		<div>
			<label>
				rotation{" "}
				<input
					type="range"
					min={0}
					max={359}
					value={rotation}
					onChange={(e) => setRotation(e.target.valueAsNumber)}
				/>{" "}
				{rotation}°
			</label>
			<AtlasAuto height={560} htmlChildren={OSM_ATTRIBUTION}>
				<world>
					<MapObject
						id="rotated"
						x={0}
						y={0}
						width={2400}
						height={1600}
						bounds={NYC_BOUNDS}
						rotation={rotation}
					>
						<MapTileLayer minZoom={7} maxZoom={15} />
						<LngLatOverlayLayer />
					</MapObject>
				</world>
			</AtlasAuto>
		</div>
	);
};

export const InvalidBoundsAreReported: React.FC = () => {
	const [message, setMessage] = useState<string>();

	return (
		<div>
			<p>
				Bounds that cross the antimeridian (west &gt; east) are not supported. The map
				renders nothing and reports the problem through <code>onError</code>
				instead of throwing out of React.
			</p>
			<p>
				Reported: <strong>{message || "nothing yet"}</strong>
			</p>
			<AtlasAuto height={200}>
				<world>
					<MapObject
						id="broken"
						x={0}
						y={0}
						width={2400}
						height={1600}
						bounds={{ west: 170, south: -10, east: -170, north: 10 }}
						onError={(error) => setMessage(error.message)}
					>
						<MapTileLayer />
					</MapObject>
				</world>
			</AtlasAuto>
		</div>
	);
};

// --- Warping ------------------------------------------------------------------------------------

const WARP_IMAGE = { width: 1000, height: 700 };

/**
 * A recognisable test card (grid, numbers and a border), so warping is easy to see.
 * Generated so the story does not depend on a hosted image.
 */
function createTestCard(): string {
	const canvas = document.createElement("canvas");
	canvas.width = WARP_IMAGE.width;
	canvas.height = WARP_IMAGE.height;
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		return "";
	}
	ctx.fillStyle = "#fef3c7";
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	ctx.strokeStyle = "rgba(120, 53, 15, 0.45)";
	ctx.lineWidth = 1;
	for (let x = 0; x <= canvas.width; x += 50) {
		ctx.beginPath();
		ctx.moveTo(x, 0);
		ctx.lineTo(x, canvas.height);
		ctx.stroke();
	}
	for (let y = 0; y <= canvas.height; y += 50) {
		ctx.beginPath();
		ctx.moveTo(0, y);
		ctx.lineTo(canvas.width, y);
		ctx.stroke();
	}

	ctx.fillStyle = "#78350f";
	ctx.font = "14px sans-serif";
	for (let x = 100; x < canvas.width; x += 100) {
		for (let y = 100; y < canvas.height; y += 100) {
			ctx.fillText(`${x},${y}`, x + 4, y - 4);
		}
	}

	ctx.strokeStyle = "#b91c1c";
	ctx.lineWidth = 8;
	ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
	ctx.fillStyle = "#b91c1c";
	ctx.font = "bold 56px sans-serif";
	ctx.fillText("N", canvas.width / 2 - 20, 70);
	return canvas.toDataURL("image/png");
}

/** Corners plus a few interior points, with the interior displaced a little: types disagree. */
const WARP_CONTROL_POINTS: WarpControlPoint[] = [
	{ image: { x: 0, y: 0 }, map: { lng: -74.2, lat: 40.9 } },
	{ image: { x: 1000, y: 0 }, map: { lng: -73.78, lat: 40.86 } },
	{ image: { x: 1000, y: 700 }, map: { lng: -73.82, lat: 40.58 } },
	{ image: { x: 0, y: 700 }, map: { lng: -74.24, lat: 40.62 } },
	{ image: { x: 500, y: 350 }, map: { lng: -74.0, lat: 40.78 } },
	{ image: { x: 250, y: 175 }, map: { lng: -74.1, lat: 40.8 } },
	{ image: { x: 750, y: 525 }, map: { lng: -73.88, lat: 40.67 } },
];

const WARP_TYPES: WarpTransformationType[] = [
	"helmert",
	"affine",
	"projective",
	"polynomial2",
	"thinPlateSpline",
];

function ControlPointMarkers({ points }: { points: WarpControlPoint[] }) {
	const data = useMemo<MapGeoJSONInput>(
		() => ({
			type: "MultiPoint",
			coordinates: points.map((point) => [point.map.lng, point.map.lat]),
		}),
		[points],
	);

	return (
		<MapGeoJSON
			data={data}
			markerSize={12}
			markerSizeUnit="screen"
			markerStyle={{
				backgroundColor: "rgba(217, 119, 6, 0.95)",
				border: "2px solid white",
			}}
		/>
	);
}

/**
 * A single image georeferenced onto the map with control points. The control points are held by a
 * `WarpAdapterController`, which builds the transformer and tells the image to re-fit when they
 * change - tile images are not reloaded.
 */
export const WarpedImage: React.FC = () => {
	const card = useMemo(createTestCard, []);
	const [type, setType] = useState<WarpTransformationType>("projective");
	const [opacity, setOpacity] = useState(0.75);
	const [showPoints, setShowPoints] = useState(true);
	const [error, setError] = useState<string>();
	const [bend, setBend] = useState(0);

	const controller = useMemo(() => createWarpAdapterController(), []);

	// "Bend" drags the centre control point, to show how each type reacts.
	const points = useMemo(
		() =>
			WARP_CONTROL_POINTS.map((point, index) =>
				index === 4
					? {
							...point,
							map: {
								lng: point.map.lng + bend * 0.08,
								lat: point.map.lat - bend * 0.05,
							},
						}
					: point,
			),
		[bend],
	);

	useEffect(() => {
		controller.setControlPoints(points);
		setError(controller.getError()?.message);
	}, [controller, points]);

	useEffect(() => {
		controller.setTransformationType(type);
		setError(controller.getError()?.message);
	}, [controller, type]);

	return (
		<div>
			<div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
				{WARP_TYPES.map((candidate) => (
					<button
						key={candidate}
						disabled={candidate === type}
						onClick={() => setType(candidate)}
					>
						{candidate}
					</button>
				))}
				<label>
					opacity{" "}
					<input
						type="range"
						min={0}
						max={1}
						step={0.05}
						value={opacity}
						onChange={(e) => setOpacity(e.target.valueAsNumber)}
					/>
				</label>
				<label>
					move centre point{" "}
					<input
						type="range"
						min={-1}
						max={1}
						step={0.05}
						value={bend}
						onChange={(e) => setBend(e.target.valueAsNumber)}
					/>
				</label>
				<label>
					<input
						type="checkbox"
						checked={showPoints}
						onChange={(e) => setShowPoints(e.target.checked)}
					/>{" "}
					control points
				</label>
				{error ? <strong style={{ color: "#b91c1c" }}>{error}</strong> : null}
			</div>
			<AtlasAuto height={560} htmlChildren={OSM_ATTRIBUTION}>
				<world>
					<MapObject
						id="warp-map"
						x={0}
						y={0}
						width={2400}
						height={1600}
						bounds={NYC_BOUNDS}
					>
						<MapTileLayer minZoom={8} maxZoom={14} />
						<MapWarpedImage
							id="test-card"
							uri={card}
							width={WARP_IMAGE.width}
							height={WARP_IMAGE.height}
							controller={controller}
							opacity={opacity}
							onError={(e) => setError(e.message)}
						/>
						{showPoints ? (
							<ControlPointMarkers points={points} />
						) : null}
					</MapObject>
				</world>
			</AtlasAuto>
		</div>
	);
};

/**
 * Atlas has its own transformation implementation, but any Allmaps `GcpTransformer` can be used
 * through `fromAllmapsTransformer` - handy for the transformation types and projections Atlas does
 * not implement itself.
 */
export const WarpedImageWithAllmapsTransformer: React.FC = () => {
	const card = useMemo(createTestCard, []);

	const transformer = useMemo(() => {
		const gcps = WARP_CONTROL_POINTS.map((point) => ({
			resource: [point.image.x, point.image.y] as [number, number],
			geo: [point.map.lng, point.map.lat] as [number, number],
		}));
		// Allmaps expects (north-up) lng/lat and takes the y axis of the image as pointing down.
		return fromAllmapsTransformer(new GcpTransformer(gcps as any, "polynomial2"));
	}, []);

	return (
		<AtlasAuto height={560} htmlChildren={OSM_ATTRIBUTION}>
			<world>
				<MapObject
					id="allmaps-map"
					x={0}
					y={0}
					width={2400}
					height={1600}
					bounds={NYC_BOUNDS}
				>
					<MapTileLayer minZoom={8} maxZoom={14} />
					<MapWarpedImage
						id="allmaps-card"
						uri={card}
						width={WARP_IMAGE.width}
						height={WARP_IMAGE.height}
						transformer={transformer}
						opacity={0.75}
						resolution={24}
					/>
					<ControlPointMarkers points={WARP_CONTROL_POINTS} />
				</MapObject>
			</world>
		</AtlasAuto>
	);
};

// Snapshot of https://annotations.allmaps.org/maps/a9458d2f895dcdfb, the OpenLayers
// example on https://allmaps.org/. Keep its original pixel coordinates and provenance.
const EAST_BOSTON_POINTS: WarpControlPoint[] = eastBostonAnnotation.body.features.map(({ properties, geometry }) => ({
	image: { x: properties.resourceCoords[0], y: properties.resourceCoords[1] },
	map: { lng: geometry.coordinates[0], lat: geometry.coordinates[1] },
}));
const EAST_BOSTON_BOUNDS: MapBounds = {
	west: -71.065,
	south: 42.335,
	east: -70.95,
	north: 42.41,
};

/** Real georeferencing data from Allmaps, with tiles fetched directly from the IIIF service. */
export const AllmapsAnnotationOnOSM: React.FC = () => {
	const runtime = useRef<Runtime>();
	const [service, setService] = useState<MapWarpedImageService>();
	const [error, setError] = useState<string>();
	const [attempt, setAttempt] = useState(0);
	const [opacity, setOpacity] = useState(0.75);
	const [showPoints, setShowPoints] = useState(false);
	// The annotation specifies polynomial order 1, equivalent to Atlas's affine transform.
	const [type, setType] = useState<WarpTransformationType>('affine');

	useEffect(() => {
		const abort = new AbortController();
		const source = eastBostonAnnotation.target.source;
		setError(undefined);
		fetch(`${source.id}/info.json`, { signal: abort.signal })
			.then(async (response) => {
				if (!response.ok) throw new Error(`IIIF service returned HTTP ${response.status}`);
				const info = await response.json();
				if (info.width !== source.width || info.height !== source.height) {
					throw new Error('IIIF image dimensions no longer match the annotation.');
				}
				if (
					!Array.isArray(info.tiles) ||
					!info.tiles.length ||
					!info.tiles.every(
						(tile: { width: number; height?: number; scaleFactors: number[] }) =>
							Number.isInteger(tile.width) &&
							tile.width > 0 &&
							(tile.height === undefined || (Number.isInteger(tile.height) && tile.height > 0)) &&
							Array.isArray(tile.scaleFactors) &&
							tile.scaleFactors.length &&
							tile.scaleFactors.every((scale) => Number.isInteger(scale) && scale > 0)
					)
				)
					throw new Error('IIIF service did not advertise a valid tile pyramid.');
				if (!abort.signal.aborted) {
					setService({ id: source.id, width: info.width, height: info.height, tiles: info.tiles });
				}
			})
			.catch((reason) => {
				if (!abort.signal.aborted) setError(String(reason));
			});
		return () => abort.abort();
	}, [attempt]);

	return (
		<div>
			<p>
				East Boston — <a href="https://allmaps.org/#plugins">Allmaps example</a>,{' '}
				<a href={eastBostonAnnotation.id}>georeference annotation</a> and{' '}
				<a href={`${eastBostonAnnotation.target.source.id}/info.json`}>IIIF image service</a>. Zoom in to load finer
				IIIF tiles; reduce opacity to compare with OSM.
			</p>
			<Controls runtime={runtime}>
				<label>
					Transformation{' '}
					<select value={type} onChange={(event) => setType(event.target.value as WarpTransformationType)}>
						<option value="affine">Affine (annotation default)</option>
						<option value="thinPlateSpline">Thin plate spline</option>
					</select>
				</label>
				<label>
					Map opacity {Math.round(opacity * 100)}%{' '}
					<input
						type="range"
						min={0}
						max={1}
						step={0.05}
						value={opacity}
						onChange={(event) => setOpacity(event.target.valueAsNumber)}
					/>
				</label>
				<label>
					<input type="checkbox" checked={showPoints} onChange={(event) => setShowPoints(event.target.checked)} /> Show{' '}
					{EAST_BOSTON_POINTS.length} control points
				</label>
			</Controls>
			{error ? (
				<p role="alert">
					{error} <button onClick={() => setAttempt((value) => value + 1)}>Retry</button>
				</p>
			) : !service ? (
				<p role="status">Loading IIIF tile metadata…</p>
			) : null}
			<AtlasAuto
				height={560}
				runtimeOptions={{ maxOverZoom: 8 }}
				containerProps={{ style: { position: 'relative' } }}
				onCreated={(ctx) => {
					runtime.current = ctx.runtime;
				}}
				htmlChildren={
					<MapAttribution
						items={[
							{ text: '© OpenStreetMap contributors', href: 'https://www.openstreetmap.org/copyright' },
							{ text: 'Map: Digital Commonwealth', href: 'https://www.digitalcommonwealth.org/' },
							{ text: 'Georeferencing: Allmaps', href: eastBostonAnnotation.id },
						]}
					/>
				}
			>
				<world>
					<MapObject id="allmaps-east-boston" x={0} y={0} width={2400} height={1600} bounds={EAST_BOSTON_BOUNDS}>
						<MapTileLayer />
						{service ? (
							<MapWarpedImage
								id="east-boston-sheet"
								service={service}
								controlPoints={EAST_BOSTON_POINTS}
								transformationType={type}
								opacity={opacity}
								renderOptions={{ renderLayers: 1, renderSmallestFallback: false }}
								onError={(reason) => setError(reason.message)}
							/>
						) : null}
						{showPoints ? <ControlPointMarkers points={EAST_BOSTON_POINTS} /> : null}
					</MapObject>
				</world>
			</AtlasAuto>
			<p>This example shows the full sheet. The Allmaps proof-of-concept story applies annotation masks.</p>
		</div>
	);
};

const IIIF_WARP_SERVICE =
	"https://iiif.bodleian.ox.ac.uk/iiif/image/5009dea1-d1ae-435d-a43d-453e3bad283f";

/** A tiled IIIF image, warped tile by tile and re-fitted without reloading tiles. */
export const WarpedIIIFService: React.FC = () => {
	const [info, setInfo] = useState<any>();
	const [type, setType] = useState<WarpTransformationType>("affine");

	useEffect(() => {
		let cancelled = false;
		fetch(`${IIIF_WARP_SERVICE}/info.json`)
			.then((response) => response.json())
			.then((json) => {
				if (!cancelled) {
					setInfo(json);
				}
			})
			.catch(() => {
				// Offline: leave the story empty.
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const controlPoints = useMemo<WarpControlPoint[]>(() => {
		if (!info) {
			return [];
		}
		const { width, height } = info;
		return [
			{ image: { x: 0, y: 0 }, map: { lng: -74.2, lat: 40.86 } },
			{ image: { x: width, y: 0 }, map: { lng: -73.8, lat: 40.82 } },
			{ image: { x: width, y: height }, map: { lng: -73.84, lat: 40.62 } },
			{ image: { x: 0, y: height }, map: { lng: -74.22, lat: 40.66 } },
		];
	}, [info]);

	return (
		<div>
			<div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
				{(["affine", "projective", "thinPlateSpline"] as const).map(
					(candidate) => (
						<button
							key={candidate}
							disabled={candidate === type}
							onClick={() => setType(candidate)}
						>
							{candidate}
						</button>
					),
				)}
				{info ? null : <span>Loading image service…</span>}
			</div>
			<AtlasAuto height={560} htmlChildren={OSM_ATTRIBUTION}>
				<world>
					<MapObject
						id="iiif-map"
						x={0}
						y={0}
						width={2400}
						height={1600}
						bounds={NYC_BOUNDS}
					>
						<MapTileLayer minZoom={8} maxZoom={14} />
						{info ? (
							<MapWarpedImage
								id="iiif-warped"
								service={{
									id: IIIF_WARP_SERVICE,
									width: info.width,
									height: info.height,
									tiles: info.tiles,
								}}
								controlPoints={controlPoints}
								transformationType={type}
								opacity={0.8}
							/>
						) : null}
					</MapObject>
				</world>
			</AtlasAuto>
		</div>
	);
};

export const WarpErrorsAreReported: React.FC = () => {
	const [message, setMessage] = useState<string>();

	return (
		<div>
			<p>
				A projective transformation needs four control points; only two are given. The
				image is not drawn and the problem is reported through <code>onError</code>.
			</p>
			<p>
				Reported: <strong>{message || "nothing yet"}</strong>
			</p>
			<AtlasAuto height={300}>
				<world>
					<MapObject
						id="warp-error"
						x={0}
						y={0}
						width={2400}
						height={1600}
						bounds={NYC_BOUNDS}
					>
						<MapTileLayer minZoom={8} maxZoom={12} />
						<MapWarpedImage
							uri="https://example.org/image.jpg"
							width={1000}
							height={700}
							controlPoints={WARP_CONTROL_POINTS.slice(0, 2)}
							transformationType="projective"
							onError={(error) => setMessage(error.message)}
						/>
					</MapObject>
				</world>
			</AtlasAuto>
		</div>
	);
};
