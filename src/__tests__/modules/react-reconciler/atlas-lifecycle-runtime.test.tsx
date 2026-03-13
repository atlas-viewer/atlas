/** @vitest-environment happy-dom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { Atlas } from "../../../modules/react-reconciler/Atlas";
import { presets } from "../../../modules/react-reconciler/presets";

type MockPresetRecord = ReturnType<typeof createMockPreset>;

function createMockPreset(options: any) {
	const layoutSubscribers = new Set<(type: string) => void>();
	const readyState = {
		ready: false,
		cycle: 1,
		reason: "initial",
		timestamp: undefined as number | undefined,
	};
	const runtime = {
		id: `runtime-${Math.random().toString(36).slice(2)}`,
		mode: "explore",
		world: {
			width: 1024,
			height: 1024,
			zones: [],
			getActiveZone: () => undefined,
			addLayoutSubscriber: vi.fn((callback: (type: string) => void) => {
				layoutSubscribers.add(callback);
				return () => {
					layoutSubscribers.delete(callback);
				};
			}),
		},
		hookOptions: {
			enableFilters: false,
			filters: {
				brightness: 0,
				contrast: 0,
				grayscale: 0,
				hueRotate: 0,
				invert: 0,
				saturate: 0,
				sepia: 0,
				blur: 0,
			},
		},
		manualHomePosition: false,
		goHome: vi.fn(),
		getViewport: vi.fn(() => ({
			x: 12,
			y: 34,
			width: 300,
			height: 200,
			scale: 1,
		})),
		setViewport: vi.fn(),
		updateNextFrame: vi.fn(),
		setOptions: vi.fn(),
		setHomePosition: vi.fn(),
		setHomePaddingPx: vi.fn(),
		resize: vi.fn(),
		registerHook: vi.fn(() => () => undefined),
		stopControllers: vi.fn(),
		startControllers: vi.fn(),
		stop: vi.fn(),
		reset: vi.fn(),
		resetReadyState: vi.fn(),
		getReadyState: vi.fn(() => readyState),
	};

	return {
		options,
		runtime,
		readyState,
		emitLayout(type: string) {
			for (const callback of layoutSubscribers) {
				callback(type);
			}
		},
		preset: {
			name: "default-preset",
			runtime,
			renderer: {
				renderers: [{ dpi: 1 }],
				getRendererScreenPosition: () => ({
					x: 0,
					y: 0,
					top: 0,
					left: 0,
					width: 300,
					height: 200,
				}),
			},
			em: {
				updateBounds: vi.fn(),
			},
			setInteractivity: vi.fn(),
			canvas: options.canvasElement,
			parityCanvas: options.parityCanvasElement,
			overlay: options.overlayElement,
			container: options.containerElement,
			navigator: options.navigatorElement,
			unmount: vi.fn(),
		},
	};
}

async function flush() {
	await Promise.resolve();
	await Promise.resolve();
}

describe("Atlas lifecycle runtime behavior", () => {
	let container: HTMLDivElement;
	let root: Root;
	let originalDefaultPreset: (typeof presets)["default-preset"];

	beforeAll(() => {
		(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
	});

	afterEach(async () => {
		if (root) {
			await act(async () => {
				root.unmount();
				await flush();
			});
		}
		if (container?.parentNode) {
			container.parentNode.removeChild(container);
		}
		if (originalDefaultPreset) {
			presets["default-preset"] = originalDefaultPreset;
		}
	});

	test("callback churn and same-value navigator options do not recreate the preset", async () => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);

		const createdPresets: MockPresetRecord[] = [];
		originalDefaultPreset = presets["default-preset"];
		presets["default-preset"] = ((options: any) => {
			const record = createMockPreset(options);
			createdPresets.push(record);
			return record.preset as any;
		}) as any;

		const firstOnImageError = vi.fn();
		const firstOnWebGLFallback = vi.fn();

		await act(async () => {
			root.render(
				<Atlas
					width={300}
					height={200}
					unstable_noReconciler
					onImageError={firstOnImageError}
					onWebGLFallback={firstOnWebGLFallback}
					navigatorOptions={{
						width: 140,
						style: {
							background: "rgba(1, 2, 3, 0.4)",
						},
					}}
				>
					<React.Fragment />
				</Atlas>,
			);
			await flush();
		});

		expect(createdPresets).toHaveLength(1);

		const secondOnImageError = vi.fn();
		const secondOnWebGLFallback = vi.fn();

		await act(async () => {
			root.render(
				<Atlas
					width={300}
					height={200}
					unstable_noReconciler
					onImageError={secondOnImageError}
					onWebGLFallback={secondOnWebGLFallback}
					navigatorOptions={{
						width: 140,
						style: {
							background: "rgba(1, 2, 3, 0.4)",
						},
					}}
				>
					<React.Fragment />
				</Atlas>,
			);
			await flush();
		});

		expect(createdPresets).toHaveLength(1);

		act(() => {
			createdPresets[0].options.onImageError?.({ renderer: "canvas" });
			createdPresets[0].options.onWebGLFallback?.({
				reason: "image-load-failed",
			});
		});

		expect(firstOnImageError).not.toHaveBeenCalled();
		expect(firstOnWebGLFallback).not.toHaveBeenCalled();
		expect(secondOnImageError).toHaveBeenCalledTimes(1);
		expect(secondOnWebGLFallback).toHaveBeenCalledTimes(1);
	});

	test("hard-construction changes recreate once and immediately reapply runtime options", async () => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);

		const createdPresets: MockPresetRecord[] = [];
		originalDefaultPreset = presets["default-preset"];
		presets["default-preset"] = ((options: any) => {
			const record = createMockPreset(options);
			createdPresets.push(record);
			return record.preset as any;
		}) as any;

		const runtimeOptions = { maxOverZoom: 7 };

		await act(async () => {
			root.render(
				<Atlas
					width={300}
					height={200}
					unstable_noReconciler
					interactionMode="popmotion"
					runtimeOptions={runtimeOptions}
				>
					<React.Fragment />
				</Atlas>,
			);
			await flush();
		});

		expect(createdPresets).toHaveLength(1);
		expect(createdPresets[0].options.runtimeOptions).toEqual(runtimeOptions);
		expect(createdPresets[0].runtime.setOptions).toHaveBeenCalledWith(
			runtimeOptions,
		);

		await act(async () => {
			root.render(
				<Atlas
					width={300}
					height={200}
					unstable_noReconciler
					interactionMode="pdf-scroll-zone"
					runtimeOptions={runtimeOptions}
				>
					<React.Fragment />
				</Atlas>,
			);
			await flush();
		});

		expect(createdPresets).toHaveLength(2);
		expect(createdPresets[0].preset.unmount).toHaveBeenCalledTimes(1);
		expect(createdPresets[1].options.runtimeOptions).toEqual(runtimeOptions);
		expect(createdPresets[1].runtime.setOptions).toHaveBeenCalledWith(
			runtimeOptions,
		);
	});

	test("worldKey swaps stage a second preset and only commit after staging runtime becomes ready", async () => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);

		const createdPresets: MockPresetRecord[] = [];
		originalDefaultPreset = presets["default-preset"];
		presets["default-preset"] = ((options: any) => {
			const record = createMockPreset(options);
			createdPresets.push(record);
			return record.preset as any;
		}) as any;

		const onCreated = vi.fn();
		const onReady = vi.fn();

		await act(async () => {
			root.render(
				<Atlas
					width={300}
					height={200}
					unstable_noReconciler
					worldKey={1}
					onCreated={onCreated}
					onReady={onReady}
				>
					<React.Fragment />
				</Atlas>,
			);
			await flush();
		});

		expect(createdPresets).toHaveLength(1);
		expect(onCreated).toHaveBeenCalledWith(createdPresets[0].preset, {
			stage: "active",
			worldKey: 1,
		});

		await act(async () => {
			root.render(
				<Atlas
					width={300}
					height={200}
					unstable_noReconciler
					worldKey={2}
					onCreated={onCreated}
					onReady={onReady}
				>
					<React.Fragment />
				</Atlas>,
			);
			await flush();
		});

		expect(createdPresets).toHaveLength(2);
		expect(createdPresets[1].options.staging).toBe(true);
		expect(onCreated).toHaveBeenCalledWith(createdPresets[1].preset, {
			stage: "staging",
			worldKey: 2,
		});
		expect(onReady).not.toHaveBeenCalled();
		expect(createdPresets[0].preset.unmount).not.toHaveBeenCalled();

		await act(async () => {
			createdPresets[1].readyState.ready = true;
			createdPresets[1].readyState.timestamp = 1234;
			createdPresets[1].emitLayout("ready");
			await flush();
		});

		expect(createdPresets[0].preset.unmount).toHaveBeenCalledTimes(1);
		expect(onReady).toHaveBeenCalledTimes(1);
		expect(onReady).toHaveBeenCalledWith({
			runtimeId: createdPresets[1].runtime.id,
			cycle: 1,
			reason: "initial",
			renderer: "unknown",
			timestamp: 1234,
		});
	});

	test("same worldKey updates stay immediate and do not create a staging preset", async () => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);

		const createdPresets: MockPresetRecord[] = [];
		originalDefaultPreset = presets["default-preset"];
		presets["default-preset"] = ((options: any) => {
			const record = createMockPreset(options);
			createdPresets.push(record);
			return record.preset as any;
		}) as any;

		await act(async () => {
			root.render(
				<Atlas width={300} height={200} unstable_noReconciler worldKey={7}>
					<React.Fragment />
				</Atlas>,
			);
			await flush();
		});

		await act(async () => {
			root.render(
				<Atlas width={300} height={200} unstable_noReconciler worldKey={7}>
					<div />
				</Atlas>,
			);
			await flush();
		});

		expect(createdPresets).toHaveLength(1);
	});

	test("onCreated callback churn does not retrigger existing active or staging presets", async () => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);

		const createdPresets: MockPresetRecord[] = [];
		originalDefaultPreset = presets["default-preset"];
		presets["default-preset"] = ((options: any) => {
			const record = createMockPreset(options);
			createdPresets.push(record);
			return record.preset as any;
		}) as any;

		const firstOnCreated = vi.fn();
		const secondOnCreated = vi.fn();

		await act(async () => {
			root.render(
				<Atlas
					width={300}
					height={200}
					unstable_noReconciler
					worldKey={1}
					onCreated={firstOnCreated}
				>
					<React.Fragment />
				</Atlas>,
			);
			await flush();
		});

		await act(async () => {
			root.render(
				<Atlas
					width={300}
					height={200}
					unstable_noReconciler
					worldKey={2}
					onCreated={firstOnCreated}
				>
					<React.Fragment />
				</Atlas>,
			);
			await flush();
		});

		expect(createdPresets).toHaveLength(2);
		expect(firstOnCreated).toHaveBeenCalledTimes(2);

		await act(async () => {
			root.render(
				<Atlas
					width={300}
					height={200}
					unstable_noReconciler
					worldKey={2}
					onCreated={secondOnCreated}
				>
					<div />
				</Atlas>,
			);
			await flush();
		});

		expect(createdPresets).toHaveLength(2);
		expect(firstOnCreated).toHaveBeenCalledTimes(2);
		expect(secondOnCreated).not.toHaveBeenCalled();
	});

	test("hard-construction prop changes during a transaction rebuild staging without recreating the active preset", async () => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);

		const createdPresets: MockPresetRecord[] = [];
		originalDefaultPreset = presets["default-preset"];
		presets["default-preset"] = ((options: any) => {
			const record = createMockPreset(options);
			createdPresets.push(record);
			return record.preset as any;
		}) as any;

		await act(async () => {
			root.render(
				<Atlas
					width={300}
					height={200}
					unstable_noReconciler
					worldKey={1}
					interactionMode="popmotion"
				>
					<React.Fragment />
				</Atlas>,
			);
			await flush();
		});

		await act(async () => {
			root.render(
				<Atlas
					width={300}
					height={200}
					unstable_noReconciler
					worldKey={2}
					interactionMode="popmotion"
				>
					<React.Fragment />
				</Atlas>,
			);
			await flush();
		});

		expect(createdPresets).toHaveLength(2);
		expect(createdPresets[0].preset.unmount).not.toHaveBeenCalled();

		await act(async () => {
			root.render(
				<Atlas
					width={300}
					height={200}
					unstable_noReconciler
					worldKey={2}
					interactionMode="pdf-scroll-zone"
				>
					<React.Fragment />
				</Atlas>,
			);
			await flush();
		});

		expect(createdPresets).toHaveLength(3);
		expect(createdPresets[0].preset.unmount).not.toHaveBeenCalled();
		expect(createdPresets[1].preset.unmount).toHaveBeenCalledTimes(1);
		expect(createdPresets[2].options.staging).toBe(true);
		expect(createdPresets[2].options.interactionMode).toBe("pdf-scroll-zone");
	});
});
