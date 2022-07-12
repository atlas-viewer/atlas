import { MutableRefObject, version } from 'react';

export async function renderReactDom(html: HTMLElement, toRender: any, root: MutableRefObject<any>) {
  if (version.startsWith('18.')) {
    // @ts-ignore
    const { createRoot } = await import('react-dom/client');
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
      const { render } = await import('react-dom');
      render(toRender, html);
    }
  }
}
