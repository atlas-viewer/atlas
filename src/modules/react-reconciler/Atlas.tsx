import { DnaFactory, type Projection } from "@atlas-viewer/dna";
import type React from "react";
import {
	memo,
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import useMeasure from "react-use-measure";
import type {
	Runtime,
	RuntimeOptions,
	ViewerFilters,
	ViewerMode,
} from "../../renderer/runtime";
import {
	getNavigatorVisibleZoneIdSet,
	getNavigatorWorldRegion,
	getNavigatorWorldTransform,
	type NavigatorRendererStyle,
	type NavigatorZoneWindowOptions,
	navigatorToWorldPoint,
} from "../navigator-renderer/navigator-renderer";
import type { PdfScrollZoneControllerConfig } from "../pdf-scroll-zone-controller/pdf-scroll-zone-controller";
import type { PopmotionControllerConfig } from "../popmotion-controller/popmotion-controller";
import type { AtlasImageLoadErrorEvent } from "../shared/image-load-events";
import type { ImageLoadingConfig } from "../shared/image-loading-config";
import type {
	AtlasReadyEvent,
	AtlasReadyRenderer,
} from "../shared/ready-events";
import type { AtlasWebGLFallbackEvent } from "../webgl-renderer/types";
import { AtlasContext, BoundsContext } from "./components/AtlasContext";
import { AtlasWithReconciler } from "./components/AtlasWithReconciler";
import { Container } from "./components/Container";
import { DevTools, type DevToolsProps } from "./components/DevTools";
import { registerAtlasRuntime } from "./devtools/registry";
import { useClassname } from "./hooks/use-classname";
import { useDiffProps } from "./hooks/use-diff-props";
import { ModeContext } from "./hooks/use-mode";
import { usePreset } from "./hooks/use-preset";
import type { PresetNames, Presets } from "./presets";
import type { Preset } from "./presets/_types";
import { useIsomorphicLayoutEffect } from "./utility/react";

function getReadyRenderer(renderer: unknown): AtlasReadyRenderer {
	const maybeRenderer = renderer as {
		renderers?: unknown[];
		constructor?: { name?: string };
	};
	if (Array.isArray(maybeRenderer?.renderers)) {
		return "composite";
	}
	const constructorName = maybeRenderer?.constructor?.name || "";
	if (constructorName === "CanvasRenderer") {
		return "canvas";
	}
	if (constructorName === "WebGLRenderer") {
		return "webgl";
	}
	if (constructorName === "StaticRenderer") {
		return "static";
	}
	return "unknown";
}

export type AtlasProps = {
	debug?: boolean;
	mode?: ViewerMode;
	onCreated?: (ctx: Preset) => void | Promise<void>;
	resetWorldOnChange?: boolean;
	unstable_webglRenderer?: boolean;
	onWebGLFallback?: (event: AtlasWebGLFallbackEvent) => void;
	onReady?: (event: AtlasReadyEvent) => void;
	onImageError?: (event: AtlasImageLoadErrorEvent) => void;
	readyResetKey?: string | number;
	webglFallbackOnImageLoadError?: boolean;
	// compatibility: webglReadiness?: 'first-meaningful-paint' | 'immediate'
	webglReadiness?: "first-meaningful-paint" | "immediate";
	imageLoading?: Partial<ImageLoadingConfig>;
	unstable_noReconciler?: boolean;
	overlayStyle?: any;
	containerStyle?: any;
	containerProps?: any;
	controllerConfig?: PopmotionControllerConfig | PdfScrollZoneControllerConfig;
	interactionMode?: "popmotion" | "pdf-scroll-zone";
	renderPreset?: PresetNames | Presets;
	hideInlineStyle?: boolean;
	homeCover?: true | false | "start" | "end";
	homeOnResize?: boolean;
	homePosition?: Projection;
	/**
	 * Home padding in CSS pixels. Can be a number (symmetric) or an object with any of
	 * `left`, `right`, `top`, `bottom` for per-side CSS pixel margins.
	 */
	homePaddingPx?:
		| number
		| { left?: number; right?: number; top?: number; bottom?: number };
	className?: string;
	background?: string;
	enableNavigator?: boolean;
	navigatorOptions?: {
		width?: number;
		idleFade?: boolean;
		idleMs?: number;
		fadeDurationMs?: number;
		opacityActive?: number;
		opacityIdle?: number;
		style?: Partial<NavigatorRendererStyle>;
		pdfScrollZoneZoneWindow?: NavigatorZoneWindowOptions;
	};
	htmlChildren?: ReactNode;
	children: ReactNode;
	devTools?: boolean | DevToolsProps;
	runtimeOptions?: Partial<RuntimeOptions>;
	filters?: Partial<ViewerFilters>;
};

const filterProperties = [
	"brightness",
	"contrast",
	"grayscale",
	"hueRotate",
	"invert",
	"saturate",
	"sepia",
	"blur",
] as const;

export const Atlas: React.FC<
	AtlasProps & {
		width: number;
		height: number;
	}
> = memo(function Atlas(props) {
	let {
		htmlChildren,
		renderPreset: _renderPreset,
		onCreated,
		mode: _mode = "explore",
		resetWorldOnChange = true,
		// eslint-disable-next-line
		unstable_webglRenderer = false,
		onWebGLFallback,
		onReady,
		onImageError,
		readyResetKey,
		webglFallbackOnImageLoadError = false,
		webglReadiness,
		imageLoading,
		// eslint-disable-next-line
		unstable_noReconciler = false,
		hideInlineStyle = false,
		controllerConfig,
		interactionMode = "popmotion",
		children,
		overlayStyle,
		containerStyle,
		enableNavigator,
		className,
		containerProps = {},
		homePosition,
		homeOnResize,
		homeCover,
		background,
		navigatorOptions,
		runtimeOptions,
		debug,
		filters,
		homePaddingPx,
		devTools,
		...restProps
	} = props;

	useDiffProps(props, "Atlas.tsx", props.debug);

	const [mode, setMode] = useState(_mode);
	const [activeWebGL, setActiveWebGL] = useState(unstable_webglRenderer);
	const fallbackLockedRef = useRef(false);
	const pendingRestoreViewportRef = useRef<Projection | null>(null);
	const currentRuntimeRef = useRef<Runtime | null>(null);
	const readyResetBaselineRef = useRef<string | number | undefined>(undefined);
	const lastReadyNotifiedCycleRef = useRef<number | undefined>(undefined);
	// Reference to the current HTML Canvas element
	// Set by React by passing <canvas ref={...} />
	// Used to instantiate the controller and viewer with the correct HTML element.
	const [isReady, setIsReady] = useState(false);
	const strictModeDoubleRender = useRef(false);
	const navigatorIdleTimer = useRef<number | undefined>(undefined);
	const [isNavigatorIdle, setIsNavigatorIdle] = useState(false);
	const [isNavigatorDragging, setIsNavigatorDragging] = useState(false);
	const navigatorDraggingRef = useRef(false);

	const resolvedNavigatorOptions = useMemo(
		() => ({
			width: navigatorOptions?.width ?? 120,
			idleFade: navigatorOptions?.idleFade ?? true,
			idleMs: navigatorOptions?.idleMs ?? 800,
			fadeDurationMs: navigatorOptions?.fadeDurationMs ?? 250,
			opacityActive: navigatorOptions?.opacityActive ?? 0.94,
			opacityIdle: navigatorOptions?.opacityIdle ?? 0,
			style: navigatorOptions?.style,
			zoneWindow:
				interactionMode === "pdf-scroll-zone"
					? navigatorOptions?.pdfScrollZoneZoneWindow || { total: 9 }
					: undefined,
		}),
		[navigatorOptions, interactionMode],
	);

	const renderPreset = useMemo<PresetNames | Presets>(() => {
		let presetName: PresetNames = "default-preset";
		let presetOptions: Record<string, unknown> = {};
		let hasExplicitPresetOptions = false;

		if (Array.isArray(_renderPreset)) {
			presetName = _renderPreset[0];
			presetOptions = { ...(_renderPreset[1] || {}) };
			hasExplicitPresetOptions = true;
		} else if (typeof _renderPreset === "string") {
			presetName = _renderPreset;
		}

		if (debug) {
			presetOptions.debug = debug;
			hasExplicitPresetOptions = true;
		}

		if (presetName === "default-preset") {
			const injectedNavigatorRendererOptions: Record<string, unknown> = {};
			if (resolvedNavigatorOptions.style) {
				injectedNavigatorRendererOptions.style = resolvedNavigatorOptions.style;
			}
			if (resolvedNavigatorOptions.zoneWindow) {
				injectedNavigatorRendererOptions.zoneWindow =
					resolvedNavigatorOptions.zoneWindow;
			}

			if (Object.keys(injectedNavigatorRendererOptions).length > 0) {
				const existingNavigatorRendererOptions =
					(presetOptions.navigatorRendererOptions || {}) as Record<
						string,
						unknown
					>;
				presetOptions.navigatorRendererOptions = {
					...existingNavigatorRendererOptions,
					...injectedNavigatorRendererOptions,
				};
				hasExplicitPresetOptions = true;
			}
		}

		if (hasExplicitPresetOptions) {
			return [presetName, presetOptions as any] as Presets;
		}

		return _renderPreset || "default-preset";
	}, [
		_renderPreset,
		debug,
		resolvedNavigatorOptions.style,
		resolvedNavigatorOptions.zoneWindow,
	]);

	// This is an HTML element that sits above the Canvas element that is passed to the controller.
	// Additional non-canvas drawn elements can be placed here and positioned. CSS is applied to this
	// element by this component to absolutely position it. The overlay is updated if the "bounds" change
	// on the parent element and matches the size of it.

	// This measures the height and width of the Atlas element.
	const [_ref, bounds, forceRefresh] = useMeasure({ scroll: true });
	const outerContainerRef = useRef<HTMLDivElement>();
	const ref = (component: HTMLDivElement) => {
		outerContainerRef.current = component;
		_ref(component);
	};

	const handleWebGLFallback = useCallback(
		(event: AtlasWebGLFallbackEvent) => {
			if (fallbackLockedRef.current) {
				return;
			}

			fallbackLockedRef.current = true;
			if (currentRuntimeRef.current) {
				// compatibility: pendingRestoreViewportRef.current = currentRuntimeRef.current.getViewport();
				pendingRestoreViewportRef.current =
					currentRuntimeRef.current.getViewport();
			}
			setActiveWebGL(false);
			if (onWebGLFallback) {
				onWebGLFallback(event);
			}
		},
		[onWebGLFallback],
	);

	const handleCreated = useCallback(
		(ctx: Preset) => {
			if (pendingRestoreViewportRef.current) {
				ctx.runtime.setViewport(pendingRestoreViewportRef.current);
				ctx.runtime.updateNextFrame();
				pendingRestoreViewportRef.current = null;
			}

			if (onCreated) {
				return onCreated(ctx);
			}
		},
		[onCreated],
	);

	const [presetName, preset, viewport, refs] = usePreset(renderPreset, {
		width: restProps.width,
		height: restProps.height,
		forceRefresh,
		controllerConfig,
		interactionMode,
		unstable_webglRenderer: activeWebGL,
		onWebGLFallback: handleWebGLFallback,
		onImageError,
		webglFallbackOnImageLoadError,
		webglReadiness,
		imageLoading,
	});

	useEffect(() => {
		if (!preset) {
			return;
		}
		return registerAtlasRuntime(preset);
	}, [preset]);

	// This holds the class name for the container. This is changes when the
	// editing mode changes.
	const [containerClassName, setContainerClassName] = useState("");

	useEffect(() => {
		setMode(_mode);
	}, [_mode]);

	useEffect(() => {
		currentRuntimeRef.current = preset ? preset.runtime : null;
		readyResetBaselineRef.current = undefined;
		lastReadyNotifiedCycleRef.current = undefined;
	}, [preset]);

	useEffect(() => {
		if (!unstable_webglRenderer) {
			setActiveWebGL(false);
			return;
		}

		if (!fallbackLockedRef.current) {
			setActiveWebGL(true);
		}
	}, [unstable_webglRenderer]);

	useEffect(() => {
		if (!preset || !onReady) {
			return;
		}

		const runtime = preset.runtime;
		return runtime.world.addLayoutSubscriber((type) => {
			// compatibility: if (type !== 'ready')
			if (type !== "ready") {
				return;
			}

			const readyState = runtime.getReadyState();
			if (lastReadyNotifiedCycleRef.current === readyState.cycle) {
				return;
			}
			lastReadyNotifiedCycleRef.current = readyState.cycle;
			if (!readyState.timestamp) {
				return;
			}
			onReady({
				runtimeId: runtime.id,
				cycle: readyState.cycle,
				reason: readyState.reason,
				renderer: getReadyRenderer(runtime.renderer),
				timestamp: readyState.timestamp,
			});
		});
	}, [preset, onReady]);

	useEffect(() => {
		if (!preset) {
			return;
		}
		if (typeof readyResetKey === "undefined") {
			readyResetBaselineRef.current = undefined;
			return;
		}

		if (typeof readyResetBaselineRef.current === "undefined") {
			readyResetBaselineRef.current = readyResetKey;
			return;
		}

		if (readyResetBaselineRef.current !== readyResetKey) {
			readyResetBaselineRef.current = readyResetKey;
			lastReadyNotifiedCycleRef.current = undefined;
			// compatibility: preset.runtime.resetReadyState('ready-reset-key-change');
			preset.runtime.resetReadyState("ready-reset-key-change");
		}
	}, [preset, readyResetKey]);

	// This changes the mutable state object with the position (top/left/width/height) of the
	// canvas element on the page. This is used in the editing tools such as BoxDraw for comparing
	// positions.
	useEffect(() => {
		if (preset && preset.em) {
			preset.em.updateBounds();
		}
	}, [preset, bounds]);

	useEffect(() => {
		preset?.runtime.setOptions(runtimeOptions || {});
	}, [runtimeOptions]);

	// This changes the mode in the state object when the prop passed in changes. This will
	// be picked up by the renderer on the next method. There is not current way to detect this change.
	// @todo create a mode change event.
	useEffect(() => {
		if (preset && preset.runtime) {
			preset.runtime.mode = mode;
		}
		if (isReady && preset) {
			preset.ready = true;
		}
	}, [preset, isReady, mode]);

	useEffect(() => {
		if (preset) {
			// Home cover handled separately.
			if (!homeCover) {
				// PDF scroll mode owns viewport positioning and must not be overridden by world goHome.
				preset.runtime.manualHomePosition =
					interactionMode === "pdf-scroll-zone" || !!homePosition;
				preset.runtime.setHomePosition(homePosition);
			}
		}
	}, [preset, homeCover, homePosition, interactionMode]);

	// Home padding: apply to runtime when preset or prop changes.
	useEffect(() => {
		if (preset) {
			preset.runtime.setHomePaddingPx(homePaddingPx);
		}
	}, [preset, homePaddingPx]);

	// When the width and height change this will resize the viewer and then reset the view to fit the element.
	// @todo improve or make configurable.
	// @todo resize event.
	useEffect(() => {
		if (preset) {
			const rt: Runtime = preset.runtime;
			const didDimensionChange =
				viewport.current.width !== restProps.width ||
				viewport.current.height !== restProps.height;

			if (didDimensionChange) {
				rt.resize(
					viewport.current.width,
					restProps.width,
					viewport.current.height,
					restProps.height,
				);
				viewport.current.width = restProps.width;
				viewport.current.height = restProps.height;
				viewport.current.didUpdate = true;
				rt.updateNextFrame();
			}
		}
	}, [preset, restProps.width, restProps.height, viewport]);

	useEffect(() => {
		if (filters && preset) {
			const rt: Runtime = preset.runtime;
			let didUpdate = false;
			rt.hookOptions.enableFilters = true;

			for (const property of filterProperties) {
				if (filters[property]) {
					if (
						filters[property] !== preset.runtime.hookOptions.filters[property]
					) {
						rt.hookOptions.filters[property] = filters[property] as number;
						didUpdate = true;
					}
				} else if (rt.hookOptions.filters[property]) {
					rt.hookOptions.filters[property] = 0;
					didUpdate = true;
				}
			}

			if (didUpdate) {
				rt.updateNextFrame();
			}
		} else {
			if (preset) {
				const rt: Runtime = preset.runtime;
				for (const property of filterProperties) {
					rt.hookOptions.filters[property] = 0;
				}
				rt.hookOptions.enableFilters = false;
				rt.updateNextFrame();
			}
		}
	}, [preset, filters]);

	function recalculateHomeCover() {
		if (preset) {
			if (preset.overlay) {
				preset.overlay.style.width = `${bounds.width}px`;
				preset.overlay.style.height = `${bounds.height}px`;
			}

			if (preset.container) {
				preset.container.style.width = `${bounds.width}px`;
				preset.container.style.height = `${bounds.height}px`;
			}

			if (homeCover) {
				const w = preset.runtime.world.width;
				const h = preset.runtime.world.height;
				const ratio = w / h;

				const viewportWidth = viewport.current.width;
				const viewportHeight = viewport.current.height;
				let viewportRatio = viewportWidth / viewportHeight;

				if (ratio > viewportRatio) {
					viewportRatio = viewportHeight / viewportWidth;
					// Viewport too tall.
					preset.runtime.manualHomePosition = true;
					let x = (w - h / viewportRatio) / 2;
					if (homeCover === "start") {
						x = 0;
					}
					if (homeCover === "end") {
						x = w - h / viewportRatio;
					}

					const newHomePosition = {
						x,
						y: 0,
						width: h / viewportRatio,
						height: h,
					};

					preset.runtime.setHomePosition(newHomePosition);
				} else {
					let y = (h - w / viewportRatio) / 2;
					if (homeCover === "start") {
						y = 0;
					}
					if (homeCover === "end") {
						y = h - w / viewportRatio;
					}

					// Viewport too wide. Need to make the home position cover the entire width.
					preset.runtime.manualHomePosition = true;

					const newHomePosition = {
						x: 0,
						y,
						width: w,
						height: w / viewportRatio,
					};

					preset.runtime.setHomePosition(newHomePosition);
				}
				if (homeOnResize) {
					preset.runtime.goHome({});
				}
			}
		}
	}

	// When the bounds of the container change, we need to reflect those changes in the overlay.
	// @todo move to canvas.
	useIsomorphicLayoutEffect(() => {
		recalculateHomeCover();
	}, [
		preset,
		props.runtimeOptions?.maxOverZoom,
		bounds.height,
		bounds.width,
		homeCover,
	]);

	// When the window resizes we need to recalculate the width.
	// @todo possibly move to controller.
	useIsomorphicLayoutEffect(() => {
		const windowResizeCallback = () => {
			if (preset) {
				const rt: Runtime = preset.runtime;
				if (
					viewport.current.width !== restProps.width ||
					viewport.current.height !== restProps.height
				) {
					rt.resize(
						viewport.current.width,
						restProps.width,
						viewport.current.height,
						restProps.height,
					);
					viewport.current.width = restProps.width;
					viewport.current.height = restProps.height;
					rt.updateNextFrame();
					viewport.current.didUpdate = true;
				}
			}
		};

		window.addEventListener("resize", windowResizeCallback);

		return () => window.removeEventListener("resize", windowResizeCallback);
	}, [preset, restProps.height, restProps.width]);

	const getNavigatorRenderer = () => {
		if (!preset) {
			return undefined;
		}
		const renderer = preset.renderer as {
			renderers?: Array<{ invalidateWorldLayer?: () => void }>;
		};
		if (!Array.isArray(renderer.renderers)) {
			return undefined;
		}
		return renderer.renderers.find(
			(item) => typeof item.invalidateWorldLayer === "function",
		);
	};

	const getRendererDpi = useCallback(() => {
		if (!preset) {
			return window.devicePixelRatio || 1;
		}
		const renderer = preset.renderer as {
			dpi?: number;
			renderers?: Array<{ dpi?: number }>;
		};
		const primaryRenderer = Array.isArray(renderer.renderers)
			? renderer.renderers[0]
			: renderer;
		const dpi = primaryRenderer?.dpi;
		if (typeof dpi === "number" && Number.isFinite(dpi) && dpi > 0) {
			return dpi;
		}
		return window.devicePixelRatio || 1;
	}, [preset]);

	const getNavigatorRegion = useCallback(
		(runtime: Runtime) =>
			getNavigatorWorldRegion(runtime.world, {
				target: runtime.getViewport(),
				zoneWindow: resolvedNavigatorOptions.zoneWindow,
			}),
		[resolvedNavigatorOptions.zoneWindow],
	);

	const recalculateNavigatorDimensions = () => {
		if (preset && preset.navigator) {
			const region = getNavigatorRegion(preset.runtime);
			const wHeight = region.height;
			const wWidth = region.width;

			const ratio = getRendererDpi();
			const safeWorldWidth = Math.max(1, wWidth);
			const safeWorldHeight = Math.max(1, wHeight);
			const configuredWidth = Math.max(1, resolvedNavigatorOptions.width);
			const maxNavigatorHeight = Math.max(1, restProps.height - 20);
			let canvasWidth = configuredWidth;
			let canvasHeight = (configuredWidth / safeWorldWidth) * safeWorldHeight;

			if (canvasHeight > maxNavigatorHeight) {
				const scale = maxNavigatorHeight / canvasHeight;
				canvasHeight = maxNavigatorHeight;
				canvasWidth = Math.max(1, configuredWidth * scale);
			}

			preset.navigator.width = canvasWidth * ratio;
			preset.navigator.height = canvasHeight * ratio;
			preset.navigator.style.width = canvasWidth + "px";
			preset.navigator.style.height = canvasHeight + "px";

			const navigatorRenderer = getNavigatorRenderer();
			if (navigatorRenderer && navigatorRenderer.invalidateWorldLayer) {
				navigatorRenderer.invalidateWorldLayer();
			}
		}
	};

	useIsomorphicLayoutEffect(() => {
		if (preset) {
			recalculateNavigatorDimensions();
			const rt = preset.runtime;
			return rt.world.addLayoutSubscriber((type) => {
				if (type === "repaint") {
					const navigatorRenderer = getNavigatorRenderer();
					if (navigatorRenderer && navigatorRenderer.invalidateWorldLayer) {
						navigatorRenderer.invalidateWorldLayer();
					}
				}
				if (type === "recalculate-world-size" || type === "zone-changed") {
					recalculateNavigatorDimensions();
					recalculateHomeCover();
					if (
						type === "recalculate-world-size" &&
						(viewport.current.width !== restProps.width ||
							viewport.current.height !== restProps.height)
					) {
						rt.resize(
							viewport.current.width,
							restProps.width,
							viewport.current.height,
							restProps.height,
						);
					}
				}
			});
		}
		return () => {
			// no-op
		};
	}, [
		preset,
		restProps.width,
		restProps.height,
		resolvedNavigatorOptions.width,
		getNavigatorRegion,
		getRendererDpi,
	]);

	const Canvas = useCallback(
		function Canvas(props: { children: React.ReactElement }): JSX.Element {
			const activate = () => {
				setIsReady(true);
			};

			useEffect(() => {
				if (preset) {
					if (interactionMode !== "pdf-scroll-zone") {
						preset.runtime.goHome();
					}

					const result = handleCreated && handleCreated(preset);
					return void (result && result.then
						? result.then(activate)
						: activate());
				} else {
					throw new Error("Invalid configuration - no runtime found");
				}
			}, []);

			return props.children;
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[preset, handleCreated, interactionMode],
	);

	useEffect(() => {
		if (preset) {
			const rt = preset.runtime;
			if (resetWorldOnChange) {
				return rt.world.addLayoutSubscriber((type) => {
					if (
						type === "recalculate-world-size" &&
						interactionMode !== "pdf-scroll-zone"
					) {
						rt.goHome();
					}
				});
			}
		}
		return () => {
			// no-op
		};
	}, [preset, resetWorldOnChange, interactionMode]);

	useEffect(() => {
		if (preset) {
			const rt = preset.runtime;
			return rt.registerHook("useBeforeFrame", () => {
				if (viewport.current.didUpdate && preset.canvas) {
					const ratio = getRendererDpi();
					const canvasWidth = viewport.current.width;
					const canvasHeight = viewport.current.height;

					preset.canvas.width = canvasWidth * ratio;
					preset.canvas.height = canvasHeight * ratio;
					preset.canvas.style.width = canvasWidth + "px";
					preset.canvas.style.height = canvasHeight + "px";

					const context = preset.canvas.getContext("2d");
					if (context) {
						context.setTransform(1, 0, 0, 1, 0, 0);
						context.scale(ratio, ratio);
					}

					if (preset.parityCanvas) {
						preset.parityCanvas.width = canvasWidth * ratio;
						preset.parityCanvas.height = canvasHeight * ratio;
						preset.parityCanvas.style.width = canvasWidth + "px";
						preset.parityCanvas.style.height = canvasHeight + "px";

						const parityContext = preset.parityCanvas.getContext("2d");
						if (parityContext) {
							parityContext.setTransform(1, 0, 0, 1, 0, 0);
							parityContext.scale(ratio, ratio);
						}
					}

					if (preset && preset.em) {
						preset.em.updateBounds();
					}

					viewport.current.didUpdate = false;
				}
			});
		}
		return () => {
			// no-op
		};
	}, [preset, resetWorldOnChange, getRendererDpi]);

	// @todo move to controller.
	useEffect(() => {
		const keyupSpace = () => {
			if (preset) {
				setMode("sketch");
				setContainerClassName("mode-sketch");
			}
			window.removeEventListener("keyup", keyupSpace);
		};

		const keydownSpace = (e: KeyboardEvent) => {
			if (e.code === "Space" && preset && preset.runtime.mode === "sketch") {
				const tagName = (e.target as any)?.tagName?.toLowerCase();
				if (tagName === "input" || tagName === "textarea") return;
				// Check if content-editable
				if ((e.target as any)?.isContentEditable) return;

				e.preventDefault();
				setMode("explore");
				setContainerClassName("mode-explore");
				window.addEventListener("keyup", keyupSpace);
			}
		};

		window.addEventListener("keydown", keydownSpace);

		return () => {
			// no-op
			window.removeEventListener("keydown", keydownSpace);
			window.removeEventListener("keyup", keyupSpace);
		};
	}, [preset]);

	const markNavigatorActive = useCallback(() => {
		if (!enableNavigator || !resolvedNavigatorOptions.idleFade) {
			return;
		}
		setIsNavigatorIdle(false);
		if (typeof navigatorIdleTimer.current !== "undefined") {
			window.clearTimeout(navigatorIdleTimer.current);
		}
		navigatorIdleTimer.current = window.setTimeout(() => {
			if (!navigatorDraggingRef.current) {
				setIsNavigatorIdle(true);
			}
		}, resolvedNavigatorOptions.idleMs);
	}, [
		enableNavigator,
		resolvedNavigatorOptions.idleFade,
		resolvedNavigatorOptions.idleMs,
	]);

	useEffect(
		() => () => {
			if (typeof navigatorIdleTimer.current !== "undefined") {
				window.clearTimeout(navigatorIdleTimer.current);
				navigatorIdleTimer.current = undefined;
			}
		},
		[],
	);

	useEffect(() => {
		if (
			!preset?.canvas ||
			!enableNavigator ||
			!resolvedNavigatorOptions.idleFade
		) {
			return;
		}

		const element = preset.canvas;
		const activate = () => markNavigatorActive();
		const eventNames = [
			"pointerdown",
			"pointermove",
			"pointerup",
			"touchstart",
			"touchmove",
			"touchend",
			"wheel",
		] as const;

		for (const eventName of eventNames) {
			element.addEventListener(eventName, activate, { passive: true });
		}
		markNavigatorActive();

		return () => {
			for (const eventName of eventNames) {
				element.removeEventListener(eventName, activate);
			}
		};
	}, [
		preset,
		enableNavigator,
		resolvedNavigatorOptions.idleFade,
		markNavigatorActive,
	]);

	useEffect(() => {
		if (!preset?.navigator || !enableNavigator) {
			return;
		}

		const navigatorCanvas = preset.navigator;
		const runtime = preset.runtime;
		const drag = {
			active: false,
			pointerId: -1,
			offsetX: 0,
			offsetY: 0,
			startClientX: 0,
			startClientY: 0,
			startWorldX: 0,
			startWorldY: 0,
		};

		const setDragging = (dragging: boolean) => {
			navigatorDraggingRef.current = dragging;
			setIsNavigatorDragging(dragging);
		};

		const getWorldPointFromEvent = (event: PointerEvent) => {
			const rect = navigatorCanvas.getBoundingClientRect();
			if (rect.width <= 0 || rect.height <= 0) {
				return { x: 0, y: 0 };
			}
			const localX = event.clientX - rect.left;
			const localY = event.clientY - rect.top;
			const region = getNavigatorRegion(runtime);
			const transform = getNavigatorWorldTransform(
				region.width,
				region.height,
				rect.width,
				rect.height,
				region.x,
				region.y,
			);
			return navigatorToWorldPoint(transform, localX, localY);
		};

		const moveViewport = (
			worldX: number,
			worldY: number,
			{
				preserveOffset = true,
				constrainAfterMove = false,
			}: { preserveOffset?: boolean; constrainAfterMove?: boolean } = {},
		) => {
			const viewport = runtime.getViewport();
			const nextX = preserveOffset
				? worldX - drag.offsetX
				: worldX - viewport.width / 2;
			const nextY = preserveOffset
				? worldY - drag.offsetY
				: worldY - viewport.height / 2;
			const proposed = DnaFactory.singleBox(
				viewport.width,
				viewport.height,
				nextX,
				nextY,
			);
			const [, constrained] = runtime.constrainBounds(proposed, { ref: true });

			runtime.setViewport({
				x: constrained[1],
				y: constrained[2],
				width: constrained[3] - constrained[1],
				height: constrained[4] - constrained[2],
			});
			runtime.updateControllerPosition();
			runtime.updateNextFrame();

			if (constrainAfterMove) {
				runtime.world.constraintBounds(true);
			}
		};
		const getZoneAtWorldPoint = (worldX: number, worldY: number) => {
			const visibleZoneIds = getNavigatorVisibleZoneIdSet(runtime.world, {
				target: runtime.getViewport(),
				zoneWindow: resolvedNavigatorOptions.zoneWindow,
			});
			for (const zone of runtime.world.zones) {
				if (visibleZoneIds && !visibleZoneIds.has(zone.id)) {
					continue;
				}
				zone.recalculateBounds();
				if (zone.points[0] === 0) {
					continue;
				}
				if (
					worldX >= zone.points[1] &&
					worldX <= zone.points[3] &&
					worldY >= zone.points[2] &&
					worldY <= zone.points[4]
				) {
					return zone;
				}
			}
			return undefined;
		};

		const onPointerDown = (event: PointerEvent) => {
			if (event.button !== 0) {
				return;
			}

			markNavigatorActive();
			const worldPoint = getWorldPointFromEvent(event);
			const viewport = runtime.getViewport();
			const isInsideViewport =
				worldPoint.x >= viewport.x &&
				worldPoint.y >= viewport.y &&
				worldPoint.x <= viewport.x + viewport.width &&
				worldPoint.y <= viewport.y + viewport.height;

			drag.active = true;
			drag.pointerId = event.pointerId;
			drag.startClientX = event.clientX;
			drag.startClientY = event.clientY;
			drag.startWorldX = worldPoint.x;
			drag.startWorldY = worldPoint.y;

			if (isInsideViewport) {
				drag.offsetX = worldPoint.x - viewport.x;
				drag.offsetY = worldPoint.y - viewport.y;
			} else {
				drag.offsetX = viewport.width / 2;
				drag.offsetY = viewport.height / 2;
				moveViewport(worldPoint.x, worldPoint.y, {
					preserveOffset: true,
					constrainAfterMove: true,
				});
			}

			setDragging(true);
			navigatorCanvas.setPointerCapture(event.pointerId);
			event.preventDefault();
			event.stopPropagation();
		};

		const onPointerMove = (event: PointerEvent) => {
			if (!drag.active || event.pointerId !== drag.pointerId) {
				return;
			}
			const worldPoint = getWorldPointFromEvent(event);
			moveViewport(worldPoint.x, worldPoint.y, {
				preserveOffset: true,
			});
			markNavigatorActive();
			event.preventDefault();
			event.stopPropagation();
		};

		const finishDrag = (event: PointerEvent) => {
			if (!drag.active || event.pointerId !== drag.pointerId) {
				return;
			}
			const worldPoint = getWorldPointFromEvent(event);
			const dragDistance = Math.hypot(
				event.clientX - drag.startClientX,
				event.clientY - drag.startClientY,
			);
			let didNavigateToZone = false;
			if (dragDistance < 4) {
				const zone = getZoneAtWorldPoint(drag.startWorldX, drag.startWorldY);
				if (zone) {
					didNavigateToZone = runtime.goToZone(zone.id);
					if (didNavigateToZone) {
						runtime.updateNextFrame();
					}
				}
			}
			drag.active = false;
			drag.pointerId = -1;
			setDragging(false);
			if (!didNavigateToZone) {
				runtime.world.constraintBounds(true);
			}
			if (navigatorCanvas.hasPointerCapture(event.pointerId)) {
				navigatorCanvas.releasePointerCapture(event.pointerId);
			}
			markNavigatorActive();
			event.preventDefault();
			event.stopPropagation();
		};

		const onPointerCancel = (event: PointerEvent) => {
			if (!drag.active || event.pointerId !== drag.pointerId) {
				return;
			}
			drag.active = false;
			drag.pointerId = -1;
			setDragging(false);
			if (navigatorCanvas.hasPointerCapture(event.pointerId)) {
				navigatorCanvas.releasePointerCapture(event.pointerId);
			}
			markNavigatorActive();
		};

		navigatorCanvas.addEventListener("pointerdown", onPointerDown);
		navigatorCanvas.addEventListener("pointermove", onPointerMove);
		navigatorCanvas.addEventListener("pointerup", finishDrag);
		navigatorCanvas.addEventListener("pointercancel", onPointerCancel);

		return () => {
			setDragging(false);
			navigatorCanvas.removeEventListener("pointerdown", onPointerDown);
			navigatorCanvas.removeEventListener("pointermove", onPointerMove);
			navigatorCanvas.removeEventListener("pointerup", finishDrag);
			navigatorCanvas.removeEventListener("pointercancel", onPointerCancel);
		};
	}, [preset, enableNavigator, markNavigatorActive, getNavigatorRegion]);

	strictModeDoubleRender.current = true;

	const { height: _, width: __, ...canvasProps } = restProps;
	const widthClassName = useClassname([restProps.width, restProps.height]);
	let isInteractive = true;
	// if we have a render preset and that render preset sets interactive to false, then... disable it
	if (
		renderPreset &&
		Array.isArray(renderPreset) &&
		renderPreset.length > 1 &&
		(renderPreset[1] as any).interactive === false
	) {
		isInteractive = false;
	}

	// use css custom prop if set, otherwise background prop, or default
	background = background ?? "#000";
	if (outerContainerRef.current) {
		const computed = getComputedStyle(outerContainerRef.current);
		background = computed.getPropertyValue("--atlas-background") || background;
	}

	const autoDevToolsProps = typeof devTools === "object" ? devTools : undefined;
	const navigatorContainerStyle = {
		"--atlas-navigator-fade-duration": `${resolvedNavigatorOptions.fadeDurationMs}ms`,
		"--atlas-navigator-opacity-active": `${resolvedNavigatorOptions.opacityActive}`,
		"--atlas-navigator-opacity-idle": `${resolvedNavigatorOptions.opacityIdle}`,
	} as React.CSSProperties;

	return (
		<Container
			ref={ref}
			className={[
				"atlas",
				hideInlineStyle ? "" : `atlas-width-${widthClassName}`,
				containerClassName,
				className,
				`atlas-${presetName}`,
			]
				.filter(Boolean)
				.join(" ")
				.trim()}
			style={{
				...containerStyle,
				...(hideInlineStyle
					? {}
					: { width: restProps.width, height: restProps.height }),
			}}
		>
			{presetName === "static-preset" ? (
				<Container
					className="atlas-static-container"
					ref={refs.container as any}
					tabIndex={0}
					{...containerProps}
				/>
			) : (
				<>
					<canvas
						className="atlas-canvas"
						/*@ts-expect-error*/
						part="atlas-canvas"
						tabIndex={0}
						{...canvasProps}
						{...containerProps}
						ref={refs.canvas as any}
						data-background={background}
					/>
					{activeWebGL ? (
						<canvas
							className="atlas-parity-canvas"
							/*@ts-expect-error*/
							part="atlas-parity-canvas"
							aria-hidden="true"
							data-background="transparent"
							ref={refs.parityCanvas as any}
						/>
					) : null}
				</>
			)}

			<Container
				className={[
					"atlas-overlay",
					isInteractive ? "atlas-overlay--interactive" : "",
				]
					.filter(Boolean)
					.join(" ")
					.trim()}
				style={{ ...(overlayStyle || {}) }}
				ref={refs.overlay as any}
			>
				{unstable_noReconciler ? (
					<Canvas>
						<BoundsContext.Provider value={bounds}>
							<ModeContext.Provider value={mode}>
								<AtlasContext.Provider value={preset}>
									{children}
								</AtlasContext.Provider>
							</ModeContext.Provider>
						</BoundsContext.Provider>
					</Canvas>
				) : (
					<AtlasWithReconciler
						bounds={bounds}
						preset={preset}
						mode={mode}
						interactionMode={interactionMode}
						setIsReady={setIsReady}
						onCreated={handleCreated}
					>
						{children}
					</AtlasWithReconciler>
				)}
			</Container>
			{enableNavigator ? (
				<Container
					className={[
						"atlas-navigator",
						resolvedNavigatorOptions.idleFade && isNavigatorIdle
							? "atlas-navigator--idle"
							: "",
						isNavigatorDragging ? "atlas-navigator--dragging" : "",
					]
						.filter(Boolean)
						.join(" ")
						.trim()}
					style={navigatorContainerStyle}
				>
					<canvas
						className="atlas-navigator-canvas"
						/*@ts-expect-error*/
						part="atlas-navigator-canvas"
						ref={refs.navigator as any}
					/>
				</Container>
			) : null}
			{/* compatibility: {devTools ? <DevTools */}
			{devTools ? (
				<DevTools
					{...autoDevToolsProps}
					runtimeId={autoDevToolsProps?.runtimeId || preset?.runtime.id}
				/>
			) : null}
			{hideInlineStyle ? (
				// We still need this, even if inline styles are hidden, this classname is unique to this viewport.
				<style>{`.atlas-width-${widthClassName} { width: ${restProps.width}px; height: ${restProps.height}px; }`}</style>
			) : (
				<style>{`
        .atlas { position: relative; display: flex; background: ${background}; z-index: var(--atlas-z-index, 10); -webkit-touch-callout: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; user-select: none; }
        .atlas-width-${widthClassName} { width: ${restProps.width}px; height: ${restProps.height}px; }
        .atlas-canvas { flex: 1 1 0px; }
        .atlas-parity-canvas { position: absolute; top: 0; left: 0; pointer-events: none; }
        .atlas-canvas:focus, .atlas-static-container:focus { outline: none }
        .atlas-canvas:focus-visible, .atlas-canvas-container:focus-visible { outline: var(--atlas-focus, 2px solid darkorange) }
        .atlas-static-preset { touch-action: inherit; }
        .atlas-static-container { position: relative; overflow: hidden; flex: 1 1 0px; }
        .atlas-overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; overflow: hidden; }
        /** setting the pointer events to none means that Atlas will own the touch and mousewheel events **/
        .atlas-overlay--interactive { pointer-events: none; }
        .atlas-static-image { position: absolute; user-select: none; transform-origin: 0px 0px; }
        .atlas-navigator { position: absolute; top: var(--atlas-navigator-top, 10px); right: var(--atlas-navigator-right, 10px); left: var(--atlas-navigator-left); bottom: var(--atlas-navigator-bottom); opacity: var(--atlas-navigator-opacity-active, .94); transition: opacity var(--atlas-navigator-fade-duration, 250ms) ease; z-index: var(--atlas-navigator-z-index, 30); }
        .atlas-navigator--idle { opacity: var(--atlas-navigator-opacity-idle, .4); }
         .atlas-navigator-canvas { width: 100%; height: 100%; display: block; cursor: grab; touch-action: none; border-radius: var(--atlas-navigator-radius, 6px); border: var(--atlas-navigator-border, 1px solid rgba(0, 0, 0, 0.7)); box-shadow: var(--atlas-navigator-shadow, 0 6px 16px rgba(2, 6, 23, 0.45)); box-sizing: border-box; }
        .atlas-navigator--dragging .atlas-navigator-canvas { cursor: grabbing; }
      `}</style>
			)}
			{htmlChildren}
		</Container>
	);
});
