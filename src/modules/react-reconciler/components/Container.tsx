import React from 'react';

export const Container = React.forwardRef<HTMLDivElement, any>((props, ref) => {
  // @ts-ignore
  return <div {...props} ref={ref} part={props.className} />;
});
