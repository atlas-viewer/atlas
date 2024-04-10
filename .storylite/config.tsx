import type { SLAddonPropsWithoutId, SLAppComponentProps } from '@storylite/storylite';

const config: Partial<SLAppComponentProps> = {
  title: ' ⚡️ Atlas Viewer',
  defaultStory: 'annotations-selectiondemo',
  useIframeStyles: false,
  iframeProps: {
    style: {},
  },
  addons: [],
};

export default config;
