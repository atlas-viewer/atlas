import { createContext } from 'react';

/** Tracks asynchronous scene resources when rendering an offscreen export. */
export type ImageResourceLoading = {
  beginLoad(): { complete(error?: Error): void; dispose(): void };
};

export const ImageResourceLoadingContext = createContext<ImageResourceLoading | null>(null);
