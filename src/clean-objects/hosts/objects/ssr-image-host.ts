// Update host

function host() {
  return {
    updateHost() {
      const url = '';
      // Happens in commit phase
      return `<img src="${url}" style="position: fixed; top: {x}px; left: {y}px;"/>`;
    },
    shouldUpdate() {
      // Happens before commit phase
      return true;
    },
    setPosition() {
      const hostData = '';
      const x = '0';
      const y = '0';
      // Happens every frame
      return hostData.replace(/\{x}/, x).replace(/\{y}/, y);
    },
  };
}
