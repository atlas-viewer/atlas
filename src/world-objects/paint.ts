import { SpacialContent } from '../spacial-content';
import { Strand } from '@atlas-viewer/dna';

export type Paintable = SpacialContent /*| TemporalContent*/;

export type Paint = [Paintable, Strand, Strand | undefined];
