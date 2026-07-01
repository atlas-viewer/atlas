import { MutableRefObject, version } from 'react';

export type PortalRoot = {
  render: (node: any) => void;
  unmount: () => void;
  unmounted: boolean;
};

export async function renderReactDom(html: HTMLElement, toRender: any, root: MutableRefObject<any>) {
  if (version.startsWith('18.') || version.startsWith('19.')) {
    // @ts-ignore
    const module = await import('react-dom/client');
    const createRoot = module.default ? module.default.createRoot : module.createRoot;
    let current: PortalRoot | undefined = root.current;
    if (!current) {
      const reactRoot = createRoot(html);
      current = {
        unmounted: false,
        render(node: any) {
          // Guard against React's "Cannot update an unmounted root" error. The
          // portal render is async (dynamic import + the reconciler may create
          // the host lazily), so a render can be attempted after the owning
          // component has already torn the root down.
          if (this.unmounted) return;
          reactRoot.render(node);
        },
        unmount() {
          if (this.unmounted) return;
          this.unmounted = true;
          reactRoot.unmount();
        },
      };
      root.current = current;
    }
    current.render(toRender);
  } else {
    // @ts-ignore
    if (typeof ReactDOM !== 'undefined') {
      // @ts-ignore
      const { render, unmountComponentAtNode } = ReactDOM;
      root.current = wrapLegacyRoot(html, render, unmountComponentAtNode, root.current);
      root.current.render(toRender);
    } else {
      // Probably only bundlers or
      const module = await import('react-dom');
      const render = module.default ? module.default.render : module.render;
      const unmountComponentAtNode = module.default
        ? module.default.unmountComponentAtNode
        : module.unmountComponentAtNode;
      root.current = wrapLegacyRoot(html, render, unmountComponentAtNode, root.current);
      root.current.render(toRender);
    }
  }
}

function wrapLegacyRoot(
  html: HTMLElement,
  render: (node: any, container: HTMLElement) => void,
  unmountComponentAtNode: (container: HTMLElement) => void,
  existing: PortalRoot | undefined
): PortalRoot {
  if (existing) {
    return existing;
  }
  return {
    unmounted: false,
    render(node: any) {
      if (this.unmounted) return;
      render(node, html);
    },
    unmount() {
      if (this.unmounted) return;
      this.unmounted = true;
      unmountComponentAtNode(html);
    },
  };
}
