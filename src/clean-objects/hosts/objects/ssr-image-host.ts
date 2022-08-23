// Update host

type HostReturn<Prepare, Final> = {
  prepareUpdate(): Prepare;
  shouldUpdate(): boolean;
  commitUpdate(hostData: Prepare): Final;
};

function host(): HostReturn<(pos: { x: number; y: number }) => string, string> {
  return {
    prepareUpdate() {
      const url = '';
      // Happens in commit phase
      return ({ x, y }: { x: number; y: number }) =>
        `<img src="${url}" style="position: fixed; top: ${x}px; left: ${y}px;"/>`;
    },
    shouldUpdate() {
      // Happens before commit phase
      return true;
    },
    commitUpdate(hostData) {
      const x = 0;
      const y = 0;
      // Happens every frame
      return hostData({ x, y });
    },
  };
}
