const htmlLayer = (id, element) => {
  // Initialisation of the layer can go here.

  return {
    id, // id must be returned.
    resize() {},
    pendingUpdate() {},
    paint() {},
    objects: {
      create(box: any) {



      },
      remove() {},
      update() {},
    },
    hooks: {
      afterFrame: [],
      useAfterPaint: [],
      useBeforeFrame: [],
      useFrame: [],
    }
  };
};
