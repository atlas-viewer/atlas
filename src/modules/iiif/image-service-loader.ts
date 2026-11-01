import { ImageServiceLoader } from '@atlas-viewer/iiif-image-api';

/** A failed image server must not block unrelated viewers sharing the loader. */
export class AtlasImageServiceLoader extends ImageServiceLoader {
  private pending = new Map<string, ReturnType<ImageServiceLoader['loadService']>>();

  constructor(private timeoutMs = 8000) {
    // The upstream throttle has one global slot, with no finally on rejection.
    super({ disableThrottling: true });
  }

  loadService(resource: Parameters<ImageServiceLoader['loadService']>[0], forceFresh = false) {
    const id = resource.id || resource['@id'];
    const key = `${id?.replace(/\/info\.json\/?$/, '')}:${forceFresh}`;
    const existing = this.pending.get(key);
    if (existing) return existing;
    const promise = super.loadService(resource, forceFresh).catch((error) => {
      // Upstream decrements on success only.
      this.fetchingCount--;
      throw error;
    }).finally(() => this.pending.delete(key));
    this.pending.set(key, promise);
    return promise;
  }

  async fetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const abort = () => controller.abort(init?.signal?.reason);
    if (init?.signal?.aborted) abort();
    else init?.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(new Error(`IIIF metadata timed out: ${input}`)), this.timeoutMs);
    try {
      const response = await fetch(input, { ...init, signal: controller.signal });
      if (!response.ok) throw new Error(`IIIF metadata HTTP ${response.status}: ${input}`);
      // Consume the body inside the timeout too: receiving headers alone is not completion.
      const body = await response.text();
      JSON.parse(body);
      return new Response(body, { status: response.status, headers: response.headers });
    } finally {
      clearTimeout(timer);
      init?.signal?.removeEventListener('abort', abort);
    }
  }
}
