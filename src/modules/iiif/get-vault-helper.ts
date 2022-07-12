import { ImageServiceLoader } from '@atlas-viewer/iiif-image-api';
import { createThumbnailHelper } from '@iiif/vault-helpers/thumbnail';
import type { Vault } from '@iiif/vault/dist';

function getGlobal(): any {
  if (typeof self !== 'undefined') {
    return self;
  }
  if (typeof window !== 'undefined') {
    return window;
  }
  if (typeof global !== 'undefined') {
    return global;
  }
  return {};
}

function getGlobalVault() {
  const g = getGlobal();

  // Found a vault.
  if (typeof g['IIIF_VAULT'] !== 'undefined') {
    return g['IIIF_VAULT'];
  }

  if (typeof g.IIIFVault === 'undefined') {
    throw new Error('Vault not found');
  }

  g['IIIF_VAULT'] = new g.IIIFVault.Vault();

  return g['IIIF_VAULT'];
}

const moduleState: {
  vault: Vault;
  loader: ImageServiceLoader;
  helper: any;
} = {} as any;

export function getVaultHelper() {
  if (!moduleState.helper) {
    moduleState.vault = getGlobalVault();
    moduleState.loader = new ImageServiceLoader();
    moduleState.helper = createThumbnailHelper(moduleState.vault as any, { imageServiceLoader: moduleState.loader });
  }
  return moduleState;
}
