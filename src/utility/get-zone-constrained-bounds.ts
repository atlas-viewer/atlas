import type { Strand } from "@atlas-viewer/dna";

export type ZoneConstrainedBounds = {
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
};

export function getZoneConstrainedBounds(
	target: Strand,
	zonePoints: Strand,
	padding: number,
): ZoneConstrainedBounds | null {
	if (!zonePoints || zonePoints[0] === 0) {
		return null;
	}

	const targetWidth = target[3] - target[1];
	const targetHeight = target[4] - target[2];
	const zoneWidth = zonePoints[3] - zonePoints[1];
	const zoneHeight = zonePoints[4] - zonePoints[2];

	const canPanX = targetWidth < zoneWidth;
	const canPanY = targetHeight < zoneHeight;

	const centeredX = zonePoints[1] + zoneWidth / 2 - targetWidth / 2;
	const centeredY = zonePoints[2] + zoneHeight / 2 - targetHeight / 2;

	return {
		minX: canPanX ? zonePoints[1] - padding : centeredX,
		maxX: canPanX ? zonePoints[3] - targetWidth + padding : centeredX,
		minY: canPanY ? zonePoints[2] - padding : centeredY,
		maxY: canPanY ? zonePoints[4] - targetHeight + padding : centeredY,
	};
}
