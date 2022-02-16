import { Strand } from '@atlas-viewer/dna';

export function observeStrand(name: string, value: Strand, pollRateMs = 200) {
  const lastValue: Strand = new Float32Array(value);
  setInterval(() => {
    if (!value) {
      return;
    }
    if (value.length !== lastValue.length) {
      lastValue.set(value);
      return;
    }

    for (let i = 0; i < value.length; i++) {
      if (value[i] !== lastValue[i]) {
        lastValue.set(value);
        return;
      }
    }
  }, pollRateMs);
}

export function observeArray(name: string, value: Array<any>, pollRateMs = 200) {
  let lastValue: Array<any> = [...value];
  setInterval(() => {
    if (!value) {
      return;
    }
    if (value.length !== lastValue.length) {
      lastValue = [...value];
      return;
    }

    for (let i = 0; i < value.length; i++) {
      if (value[i] !== lastValue[i]) {
        lastValue = [...value];
        return;
      }
    }
  }, pollRateMs);
}
