import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("interaction mode wiring", () => {
	test("Atlas exposes interactionMode and forwards top-level controller config", () => {
		const atlasSource = readFileSync(
			resolve(process.cwd(), "src/modules/react-reconciler/Atlas.tsx"),
			"utf8",
		);

		expect(atlasSource).toContain(
			"interactionMode?: 'popmotion' | 'pdf-scroll-zone'",
		);
		expect(atlasSource).toContain("controllerConfig,");
		expect(atlasSource).toContain("interactionMode,");
	});

	test("usePreset forwards controllerConfig and interactionMode to presets", () => {
		const source = readFileSync(
			resolve(process.cwd(), "src/modules/react-reconciler/hooks/use-preset.ts"),
			"utf8",
		);

		expect(source).toContain("controllerConfig: options.controllerConfig");
		expect(source).toContain("interactionMode: options.interactionMode");
	});

	test("default and static presets keep popmotion as default mode", () => {
		const defaultPresetSource = readFileSync(
			resolve(
				process.cwd(),
				"src/modules/react-reconciler/presets/default-preset.ts",
			),
			"utf8",
		);
		const staticPresetSource = readFileSync(
			resolve(
				process.cwd(),
				"src/modules/react-reconciler/presets/static-preset.ts",
			),
			"utf8",
		);

		expect(defaultPresetSource).toContain("interactionMode = 'popmotion'");
		expect(staticPresetSource).toContain("interactionMode = 'popmotion'");
		expect(defaultPresetSource).toContain(
			"interactionMode === 'pdf-scroll-zone' ? pdfScrollZoneController : popmotionController",
		);
		expect(staticPresetSource).toContain(
			"interactionMode === 'pdf-scroll-zone' ? pdfScrollZoneController : popmotionController",
		);
	});
});
