import { MutableRefObject, version } from 'react';

export async function renderReactDom(html: HTMLElement, toRender: any, root: MutableRefObject<any>) {
  if (version.startsWith('18.')) {
    // @ts-ignore
    const module = await import('react-dom/client');
    const createRoot = module.default ? module.default.createRoot : module.createRoot;
    if (!root.current) {
      root.current = createRoot(html);
    }
    root.current.render(toRender);
  } else {
    // @ts-ignore
    if (typeof ReactDOM !== 'undefined') {
      // @ts-ignore
      const { render } = ReactDOM;
      render(toRender, html);
    } else {
      // Probably only bundlers or
      const module = await import('react-dom');
      const render = module.default ? module.default.render : module.render;
      render(toRender, html);
    }
  }
}
