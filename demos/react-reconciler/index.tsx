import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal, render } from 'react-dom';
import {
  Atlas,
  useAfterFrame,
  useAfterPaint,
  useBeforeFrame,
  useCanvas,
  useFrame,
  useRuntime,
} from '../../src/modules/react-reconciler/Atlas';
import { GetTile, getTiles } from './get-tiles';
import { WorldObject } from '../../src/world-objects/world-object';
import usePortal from './use-portal';

const TiledImage: React.FC<{ x?: number; y?: number }> = props => {
  const [tiles, setTiles] = useState<GetTile[]>([]);
  const [index] = useState(0);
  const shouldLogPaint = useRef(false);
  const canvas = useCanvas();
  const runtime = useRuntime();
  const selected = useRef<any>();

  useAfterPaint(paint => {
    if (shouldLogPaint.current) {
      console.log(paint.display.scale);
    }
  });

  useAfterFrame(() => {
    shouldLogPaint.current = false;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      if (selected.current) {
        const worldObject: WorldObject = selected.current as any;
        const { x, y, width, height } = runtime.worldToViewer(
          worldObject.x,
          worldObject.y,
          worldObject.width,
          worldObject.height
        );
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'red';
        ctx.strokeRect(x, y, width, height);
      }
    }
  });

  useEffect(() => {
    getTiles('https://wellcomelibrary.org/iiif/b18035723/manifest')
      .then(t => {
        setTiles(t);
      })
      .catch(() => {
        // do nothing...
      });
  }, []);

  if (tiles.length === 0) {
    return null;
  }

  const first = tiles[index];

  const service = first.imageService;

  return (
    <worldObject
      key={index}
      scale={400 / first.width}
      height={first.height}
      width={first.width}
      x={props.x}
      y={props.y}
      id={'test-3'}
      onClick={e => {
        if (selected.current) {
          selected.current = undefined;
        } else {
          selected.current = e.atlasTarget;
        }
        console.log('Click world object');
        shouldLogPaint.current = true;
        runtime.pendingUpdate = true;
      }}
    >
      <compositeImage id={service.id} width={first.width} height={first.height}>
        <worldImage
          uri={first.thumbnail.id}
          target={{ width: first.width, height: first.height }}
          display={{ width: first.thumbnail.width, height: first.thumbnail.height }}
          onClick={e => {
            console.log('Image click');
          }}
        />
        {(service.tiles || []).map(tile => (
          <>
            {(tile.scaleFactors || []).map(size => (
              <tiledImage
                onClick={e => {
                  console.log('Tile click', size, tile);
                }}
                key={`${tile}-${size}`}
                uri={service.id}
                display={{ width: first.width, height: first.height }}
                tile={tile}
                scaleFactor={size}
              />
            ))}
          </>
        ))}
      </compositeImage>
    </worldObject>
  );
};

const TestVideo: React.FC = () => {
  const target = usePortal('test');
  const ref = useRef<HTMLVideoElement>();
  const [ready, setReady] = useState(false);
  const [counter, setCounter] = useState(0);
  const worldObject = useRef<WorldObject>();
  const runtime = useRuntime();
  const canvas = useCanvas();
  const playing = useRef(false);

  useFrame(() => {
    if (ref.current && playing.current) {
      runtime.pendingUpdate = true;
    }
  });

  useEffect(() => {
    if (ref.current) {
      ref.current.addEventListener('play', () => {
        console.log('play');
        playing.current = true;
      });
      ref.current.addEventListener('pause', () => {
        console.log('pause');
        playing.current = false;
      });
    }
  });

  useAfterFrame(() => {
    const ctx = canvas.getContext('2d');
    if (ref.current && worldObject.current && ctx) {
      const { x, y, width, height } = runtime.worldToViewer(
        worldObject.current.x,
        worldObject.current.y,
        worldObject.current.width,
        worldObject.current.height
      );
      ctx.drawImage(ref.current, x, y, width, height);
    }
  });

  useEffect(() => {
    render(<video ref={ref as any} />, target);
    setReady(true);
  }, [counter]);

  useLayoutEffect(() => {
    if (ref.current) {
      console.log(ref);
      ref.current.style.opacity = '0';
      ref.current.src = 'https://assets.mixkit.co/videos/preview/mixkit-lake-full-of-boats-3423-large.mp4';
    }
  }, [ready]);

  return (
    <worldObject
      ref={worldObject as any}
      x={100}
      y={50}
      width={320}
      height={180}
      id={'test-video'}
      onClick={e => {
        e.stopPropagation();
        console.log('====> Click video');

        if (ref.current) {
          ref.current.play();
        }
      }}
    >
      <paragraph id="video-text" target={{ x: 0, y: 0, width: 320, height: 180 }}>
        {' '}
      </paragraph>
    </worldObject>
  );
};

const TestImage: React.FC = () => {
  const position = useRef<any>();
  const runtime = useRuntime();
  const canvas = useCanvas();

  useFrame(() => {
    if (position.current && !runtime.firstRender) {
      runtime.pendingUpdate = true;
    }
  });

  useAfterFrame(() => {
    const ctx = canvas.getContext('2d');
    if (ctx && position.current) {
      const { x, y, width, height } = runtime.worldToViewer(position.current.x, position.current.y, 20, 20);
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'white';
      ctx.drawImage(canvas, x, y, width, height, x - width, y - height, width * 2, height * 2);
      ctx.strokeRect(x - width, y - height, width * 2, height * 2);
    }
  });

  return (
    <worldObject
      width={400}
      height={300}
      id={'test-2'}
      onMouseMove={e => {
        position.current = e.atlas;
      }}
      onMouseLeave={() => {
        position.current = undefined;
        runtime.pendingUpdate = true;
      }}
      onClick={e => {
        console.log('====> Click top left image');
      }}
    >
      <worldImage
        uri="/torbjorn-sandbakk.jpg"
        target={{ width: 400, height: 300 }}
        display={{ width: 7410, height: 4940 }}
        onClick={e => {
          console.log('Image click');
        }}
      />
      <paragraph
        backgroundColor="#000"
        color="#fff"
        paddingX={10}
        paddingY={10}
        id="1"
        fontSize={12}
        target={{ x: 20, y: 40, width: 300, height: 35 }}
      >
        Testing everything about this worksTesting everything about this works.
      </paragraph>
    </worldObject>
  );
};

const ExampleText: React.FC = () => {
  const [colour, setColour] = useState('black');

  return (
    <worldObject
      y={300}
      height={400}
      width={400}
      id={'test-test-2'}
      onClick={() => {
        console.log('setting colour');
        setColour(c => (c === 'black' ? 'white' : 'black'));
      }}
    >
      <paragraph
        id="2"
        fontSize={12}
        paddingX={20}
        paddingY={20}
        target={{ x: 20, y: 20, width: 360, height: 220 }}
        color={colour}
        backgroundColor={colour !== 'black' ? 'black' : '#fff'}
      >
        Aperiam soluta repellat placeat corrupti nobis qui dolor. Laudantium in aut maxime sequi incidunt iste qui amet.
        Odit consequatur dolor ut eos quod fugit. Temporibus consequatur et sed sint placeat voluptas. Voluptatem
        voluptatem laborum a ullam. Nemo soluta nihil et iusto dolore repudiandae non. Minima consequatur error rem quos
        eum. Corporis et temporibus cumque animi sit iste soluta. Dolor dolores fugiat ea minus ex officiis totam. Est
        minima voluptatibus pariatur ipsum. Provident soluta voluptatem asperiores praesentium eaque non. Doloribus
        omnis molestias fuga accusantium quo quae. Dolorum ut adipisci fugiat ratione expedita. Sed voluptas ratione ut
        consequuntur aut. Ipsam facilis minima ipsum et. Eveniet beatae delectus earum deleniti non. Aut officiis nemo
        velit enim beatae. Hic laboriosam alias eius amet accusantium in. Facere quo ut officiis dolor expedita quas
        animi non. Sapiente deserunt iure rerum. Voluptas modi hic provident quo. Molestiae quo pariatur dolores earum
        maxime eos tempora.
      </paragraph>
    </worldObject>
  );
};

render(
  <Atlas width={800} height={600}>
    <world onClick={e => console.log('Clicked whole world.', e.atlasTarget)}>
      <TestImage />
      <ExampleText />
      <TiledImage x={400} />
      <TestVideo />
    </world>
  </Atlas>,
  document.getElementById('root')
);
