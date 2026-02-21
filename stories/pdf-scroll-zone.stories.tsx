import * as React from "react";
import { useState } from "react";
import { Atlas } from "../src/modules/react-reconciler/Atlas";
import type { Runtime } from "../src/renderer/runtime";
import "../src/modules/react-reconciler/types";

export default { title: "PDF Scroll Zone" };

const testPages = [
	{
		id: "https://iiif.wellcomecollection.org/image/b18035723_0001.JP2/full/715,/0/default.jpg",
		width: 7150,
		height: 10000,
	},
	{
		id: "https://iiif.wellcomecollection.org/image/b18035723_0002.JP2/full/715,/0/default.jpg",
		width: 7150,
		height: 10000,
	},
	{
		id: "https://iiif.wellcomecollection.org/image/b18035723_0003.JP2/full/715,/0/default.jpg",
		width: 7150,
		height: 10000,
	},
	{
		id: "https://iiif.wellcomecollection.org/image/b18035723_0004.JP2/full/715,/0/default.jpg",
		width: 7150,
		height: 10000,
	},
	{
		id: "https://iiif.wellcomecollection.org/image/b18035723_0005.JP2/full/715,/0/default.jpg",
		width: 7150,
		height: 10000,
	},
	{
		id: "https://iiif.wellcomecollection.org/image/b18035723_0006.JP2/full/715,/0/default.jpg",
		width: 7150,
		height: 10000,
	},
];

function Page({
	pageId,
	pageNumber,
	width,
	height,
	x,
	y,
}: {
	pageId: string;
	pageNumber: number;
	width: number;
	height: number;
	x: number;
	y: number;
}) {
	return (
		<zone
			id={`page-${pageNumber}`}
			x={x}
			y={y}
			width={width}
			height={height}
			margin={20}
		>
			<world-object
				id={`page-object-${pageNumber}`}
				x={x}
				y={y}
				width={width}
				height={height}
			>
				<world-image
					uri={pageId}
					target={{ x: 0, y: 0, width: width, height: height }}
					display={{ width: width, height: height }}
				/>
			</world-object>
		</zone>
	);
}

export function WrapperZonesAndGoToZone() {
	const [runtime, setRuntime] = useState<Runtime | undefined>();
	const pageGap = 24;
	const maxPageWidth = Math.max(...testPages.map((page) => page.width));
	const pageLayouts = testPages.map((page, index) => {
		return {
			...page,
			pageNumber: index + 1,
			x: Math.round((maxPageWidth - page.width) / 2),
			y:
				index === 0
					? 0
					: testPages
							.slice(0, index)
							.reduce((sum, current) => sum + current.height + pageGap, 0),
		};
	});

	return (
		<div style={{ background: "#f3f4f6", minHeight: "100vh", padding: 16 }}>
			<div
				style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}
			>
				{pageLayouts.map((page) => (
					<button
						key={page.pageNumber}
						onClick={() => runtime?.goToZone(`page-${page.pageNumber}`)}
					>
						Go to page {page.pageNumber}
					</button>
				))}
				<button onClick={() => runtime?.deselectZone()}>Exit zone</button>
			</div>

			<Atlas
				enableNavigator
				width={1280}
				height={800}
				interactionMode="pdf-scroll-zone"
				onCreated={(ctx) => setRuntime(ctx.runtime)}
				containerStyle={{ border: "1px solid #d0d7de" }}
				devTools
			>
				{pageLayouts.map((page) => (
					<Page
						key={page.pageNumber}
						pageId={page.id}
						pageNumber={page.pageNumber}
						width={page.width}
						height={page.height}
						x={page.x}
						y={page.y}
					/>
				))}
			</Atlas>
		</div>
	);
}
