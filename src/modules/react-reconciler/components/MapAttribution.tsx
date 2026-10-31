import React from "react";
import { OSM_ATTRIBUTION } from "../../maps/tile-source";

export type MapAttributionItem = {
	text: string;
	href?: string;
};

export type MapAttributionProps = {
	/** Defaults to OpenStreetMap contributors, matching the default tile source. */
	items?: MapAttributionItem[];
	position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
	style?: React.CSSProperties;
};

const POSITIONS: Record<
	NonNullable<MapAttributionProps["position"]>,
	React.CSSProperties
> = {
	"bottom-right": { bottom: 0, right: 0 },
	"bottom-left": { bottom: 0, left: 0 },
	"top-right": { top: 0, right: 0 },
	"top-left": { top: 0, left: 0 },
};

/**
 * Plain DOM attribution control. Tile providers require attribution to be visible; render this
 * over the viewer, e.g. via `AtlasAuto`'s `htmlChildren`.
 */
export const MapAttribution: React.FC<MapAttributionProps> = ({
	items = [OSM_ATTRIBUTION],
	position = "bottom-right",
	style,
}) => (
	<div
		data-atlas-map-attribution=""
		style={{
			position: "absolute",
			zIndex: 10,
			padding: "2px 6px",
			font: "11px/1.4 system-ui, sans-serif",
			background: "rgba(255, 255, 255, 0.75)",
			color: "#333",
			pointerEvents: "auto",
			...POSITIONS[position],
			...style,
		}}
	>
		{items.map((item, index) => (
			<React.Fragment key={item.text}>
				{index > 0 ? " | " : null}
				{item.href ? (
					<a
						href={item.href}
						target="_blank"
						rel="noreferrer noopener"
						style={{ color: "inherit" }}
					>
						{item.text}
					</a>
				) : (
					item.text
				)}
			</React.Fragment>
		))}
	</div>
);
