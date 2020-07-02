import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal, render } from 'react-dom';
import {
  Atlas,
  HTMLPortal,
  useAfterFrame,
  useAfterPaint,
  useBeforeFrame,
  useCanvas,
  useFrame,
  useRuntime,
} from '../../src/modules/react-reconciler/Atlas';
import { GetTile, getTiles } from '../../src/modules/iiif';
import { WorldObject } from '../../src/world-objects/world-object';
import usePortal from './use-portal';
import { useSpring } from 'react-spring';
import { World } from '../../src/world';
import { clamp } from '@popmotion/popcorn';
import { Position } from '../../src/types';
import { scaleAtOrigin, transform } from '@atlas-viewer/dna';

const TiledImage: React.FC<{ x?: number; y?: number }> = props => {
  const [tiles, setTiles] = useState<GetTile[]>([]);
  const [index, setIndex] = useState(0);
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

  const scale = 400 / first.width;

  return (
    <>
      <worldObject scale={scale} height={first.height} width={first.width} x={props.x} y={props.y}>
        <compositeImage key={service.id} id={service.id} width={first.width} height={first.height}>
          {first.thumbnail ? (
            <worldImage
              uri={first.thumbnail.id}
              target={{ width: first.width, height: first.height }}
              display={{ width: first.thumbnail.width, height: first.thumbnail.height }}
            />
          ) : null}
          {(service.tiles || []).map((tile: any) =>
            (tile.scaleFactors || []).map((size: number) => (
              <tiledImage
                key={`${tile}-${size}`}
                uri={service.id}
                display={{ width: first.width, height: first.height }}
                tile={tile}
                scaleFactor={size}
              />
            ))
          )}
        </compositeImage>
      </worldObject>
      {index > 0 ? (
        <Button
          onClick={e => {
            e.stopPropagation();
            setIndex(i => i - 1);
          }}
          id="prev-button"
          x={props.x || 0}
          y={0}
          height={30}
          width={100}
          lineHeight={1.3}
          textAlign="center"
        >
          prev
        </Button>
      ) : null}
      {index < tiles.length ? (
        <Button
          onClick={e => {
            e.stopPropagation();
            console.log('next..');
            setIndex(i => i + 1);
          }}
          id="next-button"
          x={(props.x || 0) + 300}
          y={0}
          height={30}
          width={100}
          lineHeight={1.3}
          textAlign="center"
        >
          next
        </Button>
      ) : null}
      {index === 0 ? <TestVideo /> : null}
    </>
  );
};

const Button: React.FC<{
  x: number;
  y: number;
  height: number;
  width: number;
  id: string;
  lineHeight?: number;
  textAlign?: string;
  onClick?: (e: any) => void;
}> = ({ children, x, y, width, height, onClick, ...props }) => {
  return (
    <worldObject x={x} y={y} height={height} width={width} id={props.id} onClick={onClick}>
      <paragraph
        {...props}
        textAlign="center"
        target={{ x: 0, y: 0, width, height }}
        backgroundColor="cornflowerblue"
        color="white"
      >
        {children as any}
      </paragraph>
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
    if (ref.current && worldObject.current && ctx && playing.current) {
      const { x, y, width, height } = runtime.worldToViewer(
        worldObject.current.x,
        worldObject.current.y,
        worldObject.current.width,
        worldObject.current.height
      );
      ctx.drawImage(ref.current as any, x, y, width, height);
    }
  });

  useEffect(() => {
    render(<video ref={ref as any} />, target);
    setReady(true);
  }, [counter]);

  useLayoutEffect(() => {
    if (ref.current) {
      ref.current.style.opacity = '0';
      ref.current.src = 'https://assets.mixkit.co/videos/preview/mixkit-lake-full-of-boats-3423-large.mp4';
    }
  }, [ready]);

  return (
    <>
      <worldObject ref={worldObject as any} x={450} y={200} width={320} height={180} id={'test-video'}>
        <paragraph id="video-text" target={{ x: 0, y: 0, width: 320, height: 180 }}>
          {' '}
        </paragraph>
      </worldObject>
      <Button
        id="play-video"
        x={550}
        y={300}
        width={100}
        height={30}
        lineHeight={1.4}
        textAlign="center"
        onClick={e => {
          e.stopPropagation();
          if (ref.current) {
            ref.current.play();
          }
        }}
      >
        Play
      </Button>
    </>
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
    <DraggableWorldItem
      width={400}
      height={300}
      id={'test-2'}
      onMouseMove={(e: any) => {
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
        display={{ width: 741, height: 494 }}
        onClick={e => {
          console.log('Image click');
        }}
      />
      <paragraph
        interactive
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
    </DraggableWorldItem>
  );
};

const TestHtml: React.FC = () => {
  const [counter, setCounter] = useState(0);

  return (
    <worldObject x={690} y={440} width={100} height={100}>
      <HTMLPortal target={{ x: 0, y: 0, width: 100, height: 100 }}>
        <svg width="98" height="98" xmlns="http://www.w3.org/2000/svg">
          <g transform="translate(-91 -552)" fill="none" fillRule="evenodd">
            <circle fill="#242E7A" cx="140" cy="601" r="49" />
            <path fill="#FFF603" d="M139.5 565l29.5 59h-59z" />
            <path
              fill="#242E7A"
              d="M109 604.396L141 574l-27.876 35zM109 613.396L141 583l-27.876 35zM127 640.396L159 610l-27.876 35zM116 628.738L152 594l-31.36 40z"
            />
            <path
              d="M221.064 578.2h9.536l7.296 44.8h-7.04l-1.28-8.896v.128h-8l-1.28 8.768h-6.528l7.296-44.8zm7.68 29.952l-3.136-22.144h-.128l-3.072 22.144h6.336zm15.104-23.552h-7.36v-6.4h21.76v6.4h-7.36V623h-7.04v-38.4zm17.792-6.4h7.04v38.4h11.584v6.4H261.64v-44.8zm27.712 0h9.536l7.296 44.8h-7.04l-1.28-8.896v.128h-8l-1.28 8.768h-6.528l7.296-44.8zm7.68 29.952l-3.136-22.144h-.128l-3.072 22.144h6.336zm21.504 15.488c-3.413 0-5.995-.97-7.744-2.912-1.75-1.941-2.624-4.725-2.624-8.352v-2.56h6.656v3.072c0 2.901 1.216 4.352 3.648 4.352 1.195 0 2.101-.352 2.72-1.056.619-.704.928-1.845.928-3.424 0-1.877-.427-3.53-1.28-4.96-.853-1.43-2.432-3.147-4.736-5.152-2.901-2.56-4.928-4.875-6.08-6.944-1.152-2.07-1.728-4.405-1.728-7.008 0-3.541.896-6.283 2.688-8.224 1.792-1.941 4.395-2.912 7.808-2.912 3.37 0 5.92.97 7.648 2.912 1.728 1.941 2.592 4.725 2.592 8.352v1.856h-6.656v-2.304c0-1.536-.299-2.656-.896-3.36-.597-.704-1.472-1.056-2.624-1.056-2.347 0-3.52 1.43-3.52 4.288 0 1.621.437 3.136 1.312 4.544.875 1.408 2.464 3.115 4.768 5.12 2.944 2.56 4.97 4.885 6.08 6.976 1.11 2.09 1.664 4.544 1.664 7.36 0 3.67-.907 6.485-2.72 8.448-1.813 1.963-4.448 2.944-7.904 2.944z"
              fill="#FFF"
            />
            <path
              d="M218.738 562.4h1.98v5.13h2.124v-5.13h1.98V575h-1.98v-5.67h-2.124V575h-1.98v-12.6zm9.378 7.236l-2.394-7.236h2.106l1.35 4.626h.036l1.35-4.626h1.926l-2.394 7.236V575h-1.98v-5.364zm5.274-7.236h2.916c.984 0 1.722.264 2.214.792s.738 1.302.738 2.322v1.242c0 1.02-.246 1.794-.738 2.322s-1.23.792-2.214.792h-.936V575h-1.98v-12.6zm2.916 5.67c.324 0 .567-.09.729-.27.162-.18.243-.486.243-.918v-1.494c0-.432-.081-.738-.243-.918-.162-.18-.405-.27-.729-.27h-.936v3.87h.936zm4.032-5.67h5.4v1.8h-3.42v3.33h2.718v1.8h-2.718v3.87h3.42v1.8h-5.4v-12.6zm6.534 0h2.934c1.02 0 1.764.237 2.232.711.468.474.702 1.203.702 2.187v.774c0 1.308-.432 2.136-1.296 2.484v.036c.48.144.819.438 1.017.882.198.444.297 1.038.297 1.782v2.214c0 .36.012.651.036.873.024.222.084.441.18.657h-2.016a2.886 2.886 0 0 1-.144-.576 8.665 8.665 0 0 1-.036-.972v-2.304c0-.576-.093-.978-.279-1.206-.186-.228-.507-.342-.963-.342h-.684v5.4h-1.98v-12.6zm2.7 5.4c.396 0 .693-.102.891-.306.198-.204.297-.546.297-1.026v-.972c0-.456-.081-.786-.243-.99-.162-.204-.417-.306-.765-.306h-.9v3.6h.72zm4.554-5.4h1.98V575h-1.98v-12.6zm6.318 12.78c-.972 0-1.716-.276-2.232-.828-.516-.552-.774-1.332-.774-2.34v-6.624c0-1.008.258-1.788.774-2.34.516-.552 1.26-.828 2.232-.828.972 0 1.716.276 2.232.828.516.552.774 1.332.774 2.34v6.624c0 1.008-.258 1.788-.774 2.34-.516.552-1.26.828-2.232.828zm0-1.8c.684 0 1.026-.414 1.026-1.242v-6.876c0-.828-.342-1.242-1.026-1.242-.684 0-1.026.414-1.026 1.242v6.876c0 .828.342 1.242 1.026 1.242zm4.338-10.98h2.484l1.926 7.542h.036V562.4h1.764V575h-2.034l-2.376-9.198h-.036V575h-1.764v-12.6z"
              fill="#9E9E9E"
            />
          </g>
        </svg>
      </HTMLPortal>
    </worldObject>
  );
};

const ExampleText: React.FC = () => {
  const obj = useRef<WorldObject>();
  // const runtime = useRuntime();

  // const [fixedX, setFixedX] = useState(0);
  //
  // const [{ x, y }, set] = useSpring(() => ({ x: 0, y: 300 }));
  // const bind = useDrag(
  //   state => {
  //     if (state.dragging) {
  //       set({ x: state.movement[0], y: state.movement[1], immediate: true });
  //     } else {
  //       setFixedX(x.value);
  //       set({ x: x.value, y: 0, immediate: false });
  //     }
  //   },
  //   { domTarget: obj }
  // );
  //
  // useEffect(bind as any, [bind]);

  const [colour, setColour] = useState('black');
  const [text, setText] = useState('initial');

  // useFrame(() => {
  //   // @ts-ignore
  //   if (obj.current && x.value) {
  //     // @ts-ignore
  //     obj.current.points[1] = x.value + fixedX;
  //     obj.current.points[2] = 300 + y.value;
  //     runtime.pendingUpdate = true;
  //   }
  // });

  return (
    <worldObject
      ref={obj}
      x={0}
      y={300}
      height={400}
      width={400}
      id={'test-test-2'}
      onClick={() => {
        setColour(c => (c === 'black' ? 'white' : 'black'));
      }}
    >
      <paragraph
        id="para-3"
        fontSize={12}
        paddingX={20}
        paddingY={20}
        onPointerDown={() => {
          setText('POINTER DOWN');
        }}
        onPointerLeave={() => {
          setText('POINTER LEAVE');
        }}
        onTouchStart={() => {
          setText('TOUCH START');
        }}
        onTouchEnd={() => {
          setText('TOUCH END');
          // set({ x: 0 });
        }}
        target={{ x: 20, y: 20, width: 360, height: 100 }}
      >
        {text}
      </paragraph>
      <paragraph
        id="2"
        fontSize={12}
        paddingX={20}
        paddingY={20}
        target={{ x: 20, y: 120, width: 360, height: 120 }}
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

const DraggableWorldItem: React.FC<{ id?: string; x?: number; y?: number; width: number; height: number }> = ({
  x,
  y,
  width,
  height,
  children,
}) => {
  const worldObject = useRef<WorldObject>();
  const [position, setPosition] = useState({ x: x || 0, y: y || 0 });
  const delta = useRef({ x: 0, y: 0 });
  const start = useRef({ x: 0, y: 0 });
  const isSelected = useRef(false);
  const runtime = useRuntime();
  const canvas = useCanvas();
  const isDragging = useRef(false);

  useFrame(() => {
    const obj = worldObject.current;
    if (obj && isDragging.current && isSelected.current) {
      runtime.pendingUpdate = true;
      const newX = position.x + delta.current.x; // need to do a scale
      const newY = position.y + delta.current.y; // need to do a scale

      obj.points[3] = newX + (obj.points[3] - obj.points[1]);
      obj.points[4] = newY + (obj.points[4] - obj.points[2]);
      obj.points[1] = newX; // need to do a scale
      obj.points[2] = newY; // need to do a scale
    }
  }, [position]);

  useAfterFrame(() => {
    const obj = worldObject.current;

    if (obj && (isDragging.current || isSelected.current)) {
      const ctx = canvas.getContext('2d');
      const points = runtime.worldToViewer(
        obj.points[1],
        obj.points[2],
        obj.points[3] - obj.points[1],
        obj.points[4] - obj.points[2]
      );
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'red';
      ctx.strokeRect(points.x, points.y, points.width, points.height);
    }
  });

  return (
    <worldObject
      ref={worldObject}
      onClick={() => {
        isSelected.current = !isSelected.current;
        runtime.pendingUpdate = true;
      }}
      onDragStart={e => {
        if (isSelected.current) {
          e.stopPropagation();
          isDragging.current = true;
          start.current.x = e.atlas.x;
          start.current.y = e.atlas.y;
        }
      }}
      onDragEnd={e => {
        if (isSelected.current) {
          e.stopPropagation();
          isDragging.current = false;
          const ax = e.atlas.x - start.current.x;
          const ay = e.atlas.y - start.current.y;
          delta.current.x = 0;
          delta.current.y = 0;
          // Add the delta
          setPosition(pos => ({
            x: pos.x + ax,
            y: pos.y + ay,
          }));
          start.current.x = 0;
          start.current.y = 0;
        }
      }}
      onDrag={e => {
        if (isSelected.current) {
          e.stopPropagation();
          delta.current.x = e.atlas.x - start.current.x;
          delta.current.y = e.atlas.y - start.current.y;
        }
      }}
      x={position.x}
      y={position.y}
      height={height}
      width={width}
    >
      {children}
    </worldObject>
  );
};

const MultipleImages: React.FC = () => {
  const [images, setImages] = useState([{ x: 0, y: 0 }]);

  return (
    <>
      <Button
        id="add-image"
        x={0}
        y={0}
        width={100}
        height={40}
        onClick={() => setImages(img => [...img, { x: 0, y: 0 }])}
      >
        Add image
      </Button>
      {images.map((image, key) => (
        <DraggableWorldItem key={key} height={100} width={100} x={image.x} y={image.y}>
          <worldImage
            uri="https://avatars2.githubusercontent.com/u/52743082?s=200&v=4"
            target={{ width: 100, height: 100 }}
            display={{ width: 100, height: 100 }}
          />
        </DraggableWorldItem>
      ))}
    </>
  );
};

// const initialDelta = { x: 0, y: 0 };
// const _dragState = { x: 0, y: 0, immediate: true };
const PanWorld: React.FC = ({ children }) => {
  const world = useRef<World>();
  const runtime = useRuntime();
  const canvas = useCanvas();
  const position = useRef({ x: runtime.target[1], y: runtime.target[2] });
  const delta = useRef({ x: 0, y: 0 });
  const isMoving = useRef(false);
  const [smoothDelta, setDelta] = useSpring<{ x1: number; x2: number; y1: number; y2: number }>(
    () => ({ x1: 0, x2: runtime.width, y1: 0, y2: runtime.height } as any)
  );
  const start = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);

  useFrame(() => {
    const obj = world.current;
    if (obj && isDragging.current) {
      setDelta({
        x1: position.current.x - delta.current.x,
        y1: position.current.y - delta.current.y,
        x2: position.current.x - delta.current.x + runtime.width,
        y2: position.current.y - delta.current.y + runtime.height,
      });
    }

    if (isMoving.current) {
      runtime.pendingUpdate = true;

      runtime.target[1] = smoothDelta.x1.value; // need to do a scale
      runtime.target[2] = smoothDelta.y1.value; // need to do a scale
      runtime.target[3] = smoothDelta.x2.value;
      runtime.target[4] = smoothDelta.y2.value;
    }
  }, [position]);

  // const world = useRef();
  // const runtime = useRuntime();
  // const canvas = useCanvas();
  // const [{ x, y }, set] = useSpring(() => ({ x: runtime.x, y: runtime.y } as any));
  // const delta = useRef(initialDelta);
  // const bind = useGesture(
  //   {
  //     onDragStart: () => {
  //       delta.current.x = -runtime.target[1];
  //       delta.current.y = -runtime.target[2];
  //       set(Object.create({ x: runtime.target[1], x: runtime.target[2], immediate: true }));
  //     },
  //     onDrag: state => {
  //       _dragState.x = delta.current.x + state.movement[0];
  //       _dragState.y = delta.current.y + state.movement[1];
  //       //if (state.dragging) {
  //       set(_dragState);
  //     },
  //     onDragEnd: () => {
  //       delta.current.x = 0;
  //       delta.current.y = 0;
  //     },
  //   },
  //   { domTarget: canvas }
  // );

  // const bind = useDrag(
  //   state => {
  //     if (state.dragging) {
  //       set({ x: state.movement[0], y: state.movement[1], immediate: true });
  //     } else {
  //       set({ x: x.value, y: 0, immediate: false });
  //     }
  //   },
  //   { domTarget: canvas }
  // );

  // useEffect(bind as any, [bind]);

  // useFrame(() => {
  //   if (runtime.target[1] !== x.value || runtime.target[1] !== y.value) {
  //     const w = runtime.width;
  //     const h = runtime.height;
  //     runtime.target[1] = -x.value;
  //     runtime.target[2] = -y.value;
  //     runtime.target[3] = -x.value + w;
  //     runtime.target[4] = -y.value + h;
  //     runtime.pendingUpdate = true;
  //   }
  // });

  const options = {
    zoomOutFactor: 0.8,
    zoomInFactor: 1.25,
    maxZoomFactor: 1,
    minZoomFactor: 0.05,
    zoomDuration: 300,
    zoomWheelConstant: 100,
    zoomClamp: 0.6,
  };
  const devicePixelRatio = 1;

  function zoomTo(factor: number, origin?: Position, stream = false) {
    if (factor < 1 && runtime.scaleFactor / factor > (1 / options.minZoomFactor) * devicePixelRatio) {
      factor = runtime.scaleFactor * (options.minZoomFactor / devicePixelRatio);
    }
    if (factor >= 1 && runtime.scaleFactor / factor < 1 / options.maxZoomFactor) {
      factor = runtime.scaleFactor;
    }
    // Save the before for the tween.
    const fromPos = runtime.getViewport();
    // set the new scale.
    const newPoints = transform(
      runtime.target,
      scaleAtOrigin(
        factor,
        origin ? origin.x : runtime.target[1] + (runtime.target[3] - runtime.target[1]) / 2,
        origin ? origin.y : runtime.target[2] + (runtime.target[4] - runtime.target[2]) / 2
      )
    );

    setDelta({
      x1: newPoints[1],
      y1: newPoints[2],
      x2: newPoints[3],
      y2: newPoints[4],
    });

    runtime.target[1] = newPoints[1];
    runtime.target[2] = newPoints[2];
    runtime.target[3] = newPoints[3];
    runtime.target[4] = newPoints[4];
    // // Need to update our observables, for pop-motion
    // if (currentZoom) {
    //   currentZoom.stop();
    // }

    // setDelta()

    // currentZoom = tween({
    //   from: fromPos,
    //   to: Object.create({
    //     x: newPoints[1],
    //     y: newPoints[2],
    //     width: newPoints[3] - newPoints[1],
    //     height: newPoints[4] - newPoints[2],
    //   }),
    //   duration: zoomDuration,
    //   ease: stream ? easing.easeOut : easing.easeInOut,
    // }).start(viewer);
  }

  useEffect(() => {
    const ev = (e: WheelEvent) => {
      const { top, left } = canvas.getBoundingClientRect();
      const zoomFactor = 1 + (e.deltaY * devicePixelRatio) / 1;
      zoomTo(
        // Generating a zoom from the wheel delta
        clamp(1 - options.zoomClamp, 1 + options.zoomClamp, zoomFactor),
        // Convert the cursor to an origin
        runtime.viewerToWorld(e.pageX * devicePixelRatio - left, e.pageY * devicePixelRatio - top),
        true
      );
    };
    canvas.addEventListener('wheel', ev);

    return () => canvas.removeEventListener('wheel', ev);
  }, []);

  return (
    <world
      ref={world}
      // onWheel={e => {
      //   const { top, left } = canvas.getBoundingClientRect();
      //   const zoomFactor = 1 + (e.deltaY * devicePixelRatio) / 1;
      //   zoomTo(
      //     // Generating a zoom from the wheel delta
      //     clamp(1 - options.zoomClamp, 1 + options.zoomClamp, zoomFactor),
      //     // Convert the cursor to an origin
      //     runtime.viewerToWorld(e.pageX * devicePixelRatio - left, e.pageY * devicePixelRatio - top),
      //     true
      //   );
      // }}
      onDragStart={e => {
        isDragging.current = true;
        isMoving.current = true;
        start.current.x = e.clientX;
        start.current.y = e.clientY;
        position.current.x = runtime.target[1];
        position.current.y = runtime.target[2];
      }}
      onDragEnd={e => {
        isDragging.current = false;
        const ax = e.clientX - start.current.x;
        const ay = e.clientY - start.current.y;
        delta.current.x = 0;
        delta.current.y = 0;
        // Add the delta
        position.current.x = position.current.x - ax;
        position.current.y = position.current.y - ay;
        start.current.x = 0;
        start.current.y = 0;
      }}
      onDrag={e => {
        delta.current.x = (e.clientX - start.current.x) / runtime.scaleFactor;
        delta.current.y = (e.clientY - start.current.y) / runtime.scaleFactor;
      }}
    >
      {children}
    </world>
  );
};

render(
  <Atlas width={800} height={600}>
    <PanWorld>
      <TestImage />
      <ExampleText />
      <TiledImage x={400} />
      <TestHtml />
      <MultipleImages />
    </PanWorld>
  </Atlas>,
  document.getElementById('root')
);
