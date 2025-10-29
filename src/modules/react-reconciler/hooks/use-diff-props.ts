import { useRef } from "react";
import type { AtlasProps } from "../Atlas";

function diffProps(
  beforeProps: AtlasProps & {
    width: number;
    height: number;
  },
  afterProps: AtlasProps & {
    width: number;
    height: number;
  }
) {
  const changes: Record<string, { before: any; after: any }> = {};

  // Get all unique keys from both objects
  const allKeys = new Set([...Object.keys(beforeProps), ...Object.keys(afterProps)]);

  for (const key of allKeys) {
    const beforeValue = (beforeProps as any)[key];
    const afterValue = (afterProps as any)[key];

    // Simple comparison - could be enhanced for deep object comparison if needed
    if (beforeValue !== afterValue) {
      changes[key] = {
        before: beforeValue,
        after: afterValue,
      };
    }
  }

  return Object.keys(changes).length > 0 ? changes : null;
}

export function useDiffProps(props: any, name = '', enabled = false) {
  const prevProps = useRef(props);
  if (prevProps.current && enabled) {
    console.log('Diff:', name, diffProps(prevProps.current, props));
    prevProps.current = props;
  }
}
