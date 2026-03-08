/** @vitest-environment happy-dom */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Strand } from "@atlas-viewer/dna";
import React from "react";
import { ReactAtlas } from "../../../modules/react-reconciler/reconciler";
import type { Renderer } from "../../../renderer/renderer";
import { Runtime } from "../../../renderer/runtime";
import { CompositeResource } from "../../../spacial-content/composite-resource";
import { MapTiledImage } from "../../../spacial-content/map-tiled-image";
import type { PositionPair } from "../../../types";
import { World } from "../../../world";
import type { Paint } from "../../../world-objects/paint";

class MockRenderer implements Renderer {
	beforeFrame(): void {}
	paint(): void {}
	afterFrame(): void {}
	getScale(): number {
		return 1;
	}
	prepareLayer(): void {}
	finishLayer(): void {}
	afterPaintLayer(): void {}
	pendingUpdate(): boolean {
		return false;
	}
	getPointsAt(
		world: World,
		target: Strand,
		aggregate: Strand,
		scaleFactor: number,
	): Paint[] {
		return world.getPointsAt(target, aggregate, scaleFactor);
	}
	getViewportBounds(): PositionPair | null {
		return null;
	}
	isReady(): boolean {
		return true;
	}
	resize(): void {}
	reset(): void {}
	getRendererScreenPosition() {
		return { x: 0, y: 0, top: 0, left: 0, width: 1000, height: 800 };
	}
}

function createRuntime() {
	const runtime = new Runtime(new MockRenderer(), new World(1000, 3000), {
		x: 0,
		y: 0,
		width: 1000,
		height: 800,
		scale: 1,
	});
	runtime.stop();
	return runtime;
}

async function flushRender() {
	await Promise.resolve();
	await Promise.resolve();
	await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("map components", () => {
	test("MapObject owns map context and world-object wrapper", () => {
		const source = readFileSync(
			resolve(
				process.cwd(),
				"src/modules/react-reconciler/components/MapObject.tsx",
			),
			"utf8",
		);

		expect(source).toContain("MapProjectionContext.Provider");
		expect(source).toContain("React.createElement(");
		expect(source).toContain("world-object");
		expect(source).toContain("createMapProjection");
	});

	test("MapTileLayer defaults to OSM and emits map-tiled-image layers", () => {
		const source = readFileSync(
			resolve(
				process.cwd(),
				"src/modules/react-reconciler/components/MapTileLayer.tsx",
			),
			"utf8",
		);

		expect(source).toContain("tileSize = 256");
		expect(source).toContain("minZoom = 0");
		expect(source).toContain("maxZoom = 19");
		expect(source).toContain("DEFAULT_OSM_TILE_TEMPLATE");
		expect(source).toContain("React.createElement(");
		expect(source).toContain("map-tiled-image");
		expect(source).toContain("map.mapRect.width / sourceWidth");
		expect(source).toContain("map.mapRect.height / sourceHeight");
		expect(source).toContain("coverage.tileSpanX * tileSize");
		expect(source).toContain("coverage.tileSpanY * tileSize");
		expect(source).toContain("quality: 0.9");
		expect(source).toContain("clipToBounds: true");
		expect(source).toContain("useDevicePixelRatio = false");
		expect(source).toContain("maxTilesPerLayer");
		expect(source).toContain("maxTotalTiles");
	});

	test("low-level map-tiled-image intrinsic renders through reconciler", async () => {
		const runtime = createRuntime();

		ReactAtlas.render(
			React.createElement(
				"world",
				null,
				React.createElement(
					"world-object",
					{ id: "map-layer", x: 0, y: 0, width: 2400, height: 1600 },
					React.createElement(
						"composite-image",
						{ id: "map-composite", width: 2400, height: 1600 },
						React.createElement("map-tiled-image", {
							id: "map-z8",
							bounds: { west: -74.3, south: 40.45, east: -73.6, north: 40.95 },
							worldWidth: 2400,
							worldHeight: 1600,
							zoom: 8,
							scaleFactor: 2,
						}),
						React.createElement("map-tiled-image", {
							id: "map-z9",
							bounds: { west: -74.3, south: 40.45, east: -73.6, north: 40.95 },
							worldWidth: 2400,
							worldHeight: 1600,
							zoom: 9,
							scaleFactor: 1,
						}),
					),
				),
			),
			runtime,
		);

		await flushRender();

		const worldObjects = runtime.world.getObjects().filter(Boolean);
		expect(worldObjects).toHaveLength(1);
		const mapObject = worldObjects[0]!;

		expect(mapObject.layers).toHaveLength(1);
		const composite = mapObject.layers[0] as CompositeResource;
		expect(composite).toBeInstanceOf(CompositeResource);
		expect(composite.allImages).toHaveLength(2);
		for (const image of composite.allImages) {
			expect(image).toBeInstanceOf(MapTiledImage);
		}
	});
});
