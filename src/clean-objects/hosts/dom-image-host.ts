interface DOMImageHostOptions {
  crossOrigin: boolean;
  onLoad: (host: DOMImageHost) => void;
}

class DOMImageHost {
  loading = false;
  loaded = false;
  didError = false;
  lastError: Error | null = null;
  options: DOMImageHostOptions;
  image: HTMLImageElement | null = null;
  currentUrl: string | null = null;

  constructor(options?: Partial<DOMImageHostOptions>) {
    this.options = Object.assign(
      {
        crossOrigin: false,
        onLoad: () => {},
      },
      options || {}
    );
  }

  getElement() {
    return this.image;
  }

  load({ url, crossOrigin = this.options.crossOrigin }: { url: string; crossOrigin?: boolean }) {
    if (this.currentUrl === url && (this.loading || this.loaded)) {
      return;
    }

    this.currentUrl = url;
    this.loading = true;
    try {
      const image: HTMLImageElement = document.createElement('img');
      image.decoding = 'auto';
      image.onload = () => {
        if (url === this.currentUrl) {
          this.loading = false;
          this.loaded = true;
          this.image = image;
          this.options.onLoad(this);
        }
        // imageCache[url] = image;
        image.onload = null;
      };
      if (crossOrigin) {
        image.crossOrigin = 'anonymous';
      }
      image.src = url;
    } catch (e) {
      this.loading = false;
      this.didError = true;
      this.lastError = e as Error;
    }
  }

  isLoaded() {
    return this.loaded;
  }
}
