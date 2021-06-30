import * as A from './standalone';

declare global {
  const Atlas: typeof A;
}

export default A;
