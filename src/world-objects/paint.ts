import type { LayerContext } from '../modules/comparison/geometry';
import type { ComparisonController } from '../modules/comparison/comparison';
import { SpacialContent } from '../spacial-content';
import { Strand } from '@atlas-viewer/dna';

export type Paintable = SpacialContent /*| TemporalContent*/;

export type Paint = [Paintable, Strand, Strand | undefined, LayerContext?];

/** Lets image-only consumers omit annotation traversal rather than discard collected paints. */
export type PaintSelectionOptions = { includeAnnotations?: boolean; comparison?: { controller: ComparisonController; width: number; height: number } };
