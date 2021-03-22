/* eslint-disable prettier/prettier */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as React from 'react';
import { DnaFactory } from '@atlas-viewer/dna';
import { GetTile, getTileFromImageService } from '../src/modules/iiif/get-tiles';
import { StaticRenderer } from '../src/modules/static-renderer/static-renderer';
import { World } from '../src/world';
import { popmotionController } from '../src/modules/popmotion-controller/popmotion-controller';
import { SingleImage } from '../src/spacial-content/single-image';
import { WorldObject } from '../src/world-objects/world-object';
import { Runtime } from '../src/renderer/runtime';
import { BrowserEventManager } from '../src/modules/browser-event-manager/browser-event-manager';
import { WebGLRenderer } from '../src/modules/webgl-renderer/webgl-renderer';
import { TiledImage } from '../src/spacial-content/tiled-image';
import { CompositeResource } from '../src/spacial-content/composite-resource';

export default { title: 'WebGL renderer' };

const staticTiles = [
  {
    id: 'https://libimages1.princeton.edu/loris/pudl0001%2F4609321%2Fs42%2F00000001.jp2/info.json',
    width: 5233,
    height: 7200,
  },
  {
    id: 'https://iiif.bodleian.ox.ac.uk/iiif/image/5009dea1-d1ae-435d-a43d-453e3bad283f/info.json',
    width: 4093,
    height: 2743,
  },
  {
    id: 'https://dlcs-ida.org/iiif-img/2/1/M-1011_R-09_0182/info.json',
    width: 2240,
    height: 1760,
  },
];

function createShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (shader) {
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (success) {
      return shader;
    }

    console.log(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
  }

  throw new Error('Invalid shader');
}

function createProgram(gl: WebGLRenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader) {
  const program = gl.createProgram();
  if (program) {
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    const success = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (success) {
      return program;
    }

    console.log(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
  }
  throw new Error('Invalid program');
}

function resizeCanvasToDisplaySize(canvas: HTMLCanvasElement) {
  // Lookup the size the browser is displaying the canvas in CSS pixels.
  const displayWidth = canvas.clientWidth;
  const displayHeight = canvas.clientHeight;

  // Check if the canvas is not the same size.
  const needResize = canvas.width !== displayWidth || canvas.height !== displayHeight;

  if (needResize) {
    // Make the canvas the same size
    canvas.width = displayWidth;
    canvas.height = displayHeight;
  }

  return needResize;
}

function setRectangle(gl: WebGLRenderingContext, x: number, y: number, width: number, height: number) {
  // gl.bufferData(gl.ARRAY_BUFFER, DnaFactory.singleBox(width, height, x, y).slice(1), gl.STATIC_DRAW);
  const x1 = x;
  const x2 = x + width;
  const y1 = y;
  const y2 = y + height;

  // NOTE: gl.bufferData(gl.ARRAY_BUFFER, ...) will affect
  // whatever buffer is bound to the `ARRAY_BUFFER` bind point
  // but so far we only have one buffer. If we had more than one
  // buffer we'd want to bind that buffer to `ARRAY_BUFFER` first.

  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2]), gl.STATIC_DRAW);
}

function createAndSetupTexture(gl: WebGLRenderingContext) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  // Set up texture so we can render any size image and so we are
  // working with pixels.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  return texture;
}

function loadImage(src: string) {
  return new Promise(resolve => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = src;
    image.onload = () => {
      resolve(image);
    };
  });
}

function randomInt(range: number) {
  return Math.floor(Math.random() * range);
}

export const Renderer: React.FC = () => {
  const canvas = useRef<HTMLCanvasElement>();

  // language=GLSL
  const vertexShaderSource = `
      // an attribute will receive data from a buffer
      attribute vec2 a_position;
      uniform vec2 u_resolution;
      varying vec4 v_color;

      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;


      // all shaders have a main function
      void main() {

          // convert the position from pixels to 0.0 to 1.0
          vec2 zeroToOne = a_position / u_resolution;

          // convert from 0->1 to 0->2
          vec2 zeroToTwo = zeroToOne * 2.0;

          // convert from 0->2 to -1->+1 (clip space)
          vec2 clipSpace = zeroToTwo - 1.0;

          gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
          
          v_texCoord = a_texCoord;
      }
  `;

  // language=GLSL
  const fragmentShaderSource = `
      // fragment shaders don't have a default precision so we need
      // to pick one. mediump is a good default
      precision mediump float;

      uniform sampler2D u_image;
      varying vec2 v_texCoord;

      void main() {
           gl_FragColor = texture2D(u_image, v_texCoord);
//          gl_FragColor = vec4(1, 0, 0.5, 1);
      }
  `;

  useLayoutEffect(() => {
    const gl = canvas.current?.getContext('webgl');
    const image =
      'https://iiif.princeton.edu/loris/iiif/2/pudl0001%2F4609321%2Fs42%2F00000001.jp2/0,0,5240,7200/655,/0/default.jpg';

    if (gl) {
      loadImage(image).then((img: any) => {
        const fragmentShader: WebGLShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
        const vertexShader: WebGLShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
        const program = createProgram(gl, fragmentShader, vertexShader);

        const positionAttributeLocation = gl.getAttribLocation(program, 'a_position');
        const resolutionUniformLocation = gl.getUniformLocation(program, 'u_resolution');
        const colorUniformLocation = gl.getUniformLocation(program, 'u_color');

        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

        resizeCanvasToDisplaySize(gl.canvas as HTMLCanvasElement);

        // Tell WebGL how to convert from clip space back to pixels.
        // Says map 0-1 to 0-width/height
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

        // Clear the canvas
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        // Use our shaders
        gl.useProgram(program);

        // Next we need to tell WebGL how to take data from the buffer we setup above and supply it to the attribute in the shader. First off we need to turn the attribute on
        gl.enableVertexAttribArray(positionAttributeLocation);

        // Set rect
        setRectangle(gl, 0, 0, img.width / 3, img.height / 3);

        const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');
        const texCoordBuffer = gl.createBuffer();

        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array([0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0, 1.0]),
          gl.STATIC_DRAW
        );
        gl.enableVertexAttribArray(texCoordLocation);
        gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

        // Create texture.
        createAndSetupTexture(gl);

        // Upload image..
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img as any);

        // Binding position buffer.
        // Bind the position buffer.
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

        // Tell the attribute how to get data out of positionBuffer (ARRAY_BUFFER)
        gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);
        gl.uniform2f(resolutionUniformLocation, gl.canvas.width, gl.canvas.height);
        // gl.drawArrays(gl.TRIANGLES, 0, 6);

        // for (let ii = 0; ii < 50; ++ii) {
        //   // Setup a random rectangle
        //   // This will write to positionBuffer because
        //   // its the last thing we bound on the ARRAY_BUFFER
        //   // bind point
        //   setRectangle(gl, randomInt(300), randomInt(300), randomInt(300), randomInt(300));
        //
        //   // Set a random color.
        //   gl.uniform4f(colorUniformLocation, Math.random(), Math.random(), Math.random(), 1);
        //
        //   // Draw the rectangle.
        //   gl.drawArrays(gl.TRIANGLES, 0, 6);
        // }

        gl.drawArrays(gl.TRIANGLES, 0, 6);
      });
    }
  }, [fragmentShaderSource, vertexShaderSource]);

  return (
    <div>
      <canvas ref={canvas as any} style={{ width: 800, height: 600 }} />
    </div>
  );
};

export const StaticImage: React.FC = () => {
  const viewer = useRef<any>();

  useLayoutEffect(() => {
    const renderer = new WebGLRenderer(viewer.current);
    const viewport = { width: 800, height: 600, x: 0, y: 0, scale: 1 };
    const world = new World();

    const controller = popmotionController({
      minZoomFactor: 0.5,
      maxZoomFactor: 3,
      enableClickToZoom: false,
    });

    // Similar to creating HTML elements, we start from the inside and work our way out appending items.
    const image = new SingleImage();
    image.applyProps({
      uri: 'http://iiif.io/api/presentation/2.1/example/fixtures/resources/page1-full.png',
      target: { width: 1200, height: 1800 },
      display: { width: 1200, height: 1800 },
    });

    // Image goes inside a "canvas"
    const worldObject = new WorldObject();
    worldObject.applyProps({
      width: 1200,
      height: 1800,
      id: '1',
    });

    // Finally append everything together.
    worldObject.appendChild(image);
    world.appendChild(worldObject);

    // Create our runtime.
    const runtime = new Runtime(renderer, world, viewport, [controller]);

    // runtime.

    // And start listening to browser events proxied from our div element.
    new BrowserEventManager(viewer.current, runtime);

    // Reset the viewport to fit the bounds
    runtime.goHome();
  }, []);

  return (
    <div>
      <canvas style={{ width: 800, height: 600, overflow: 'hidden', position: 'relative' }} ref={viewer} />
    </div>
  );
};

export const DefaultStaticTiles: React.FC = () => {
  const index = 0;
  const [tiles, setTile] = useState<GetTile | undefined>();
  const viewer = useRef<any>();

  useEffect(() => {
    getTileFromImageService(staticTiles[index].id, staticTiles[index].width, staticTiles[index].height).then(s => {
      setTile(s);
    });
  }, [index]);

  useLayoutEffect(() => {
    if (tiles) {
      const renderer = new WebGLRenderer(viewer.current);
      const viewport = { width: 800, height: 600, x: 0, y: 0, scale: 1 };
      const world = new World();

      const controller = popmotionController({
        minZoomFactor: 0.5,
        maxZoomFactor: 3,
        enableClickToZoom: false,
      });

      // Similar to creating HTML elements, we start from the inside and work our way out appending items.
      // Tiles images are more complex.

      const tiledImages = (tiles.imageService.tiles || []).flatMap(tile => {
        return tile.scaleFactors.map(size => {
          return TiledImage.fromTile(
            tiles.imageService.id,
            { height: staticTiles[index].height, width: staticTiles[index].width },
            tile,
            size
          );
        });
      });

      const compositeImage = new CompositeResource({
        width: staticTiles[index].width,
        height: staticTiles[index].height,
        id: tiles.imageService.id,
        images: tiledImages,
      });

      // Image goes inside a "canvas"
      const worldObject = new WorldObject();
      worldObject.applyProps({
        width: staticTiles[index].width,
        height: staticTiles[index].height,
        id: '1',
      });

      // Finally append everything together.
      // for (const tiledImage of tiledImages) {
      //
      // }
      worldObject.appendChild(compositeImage);
      world.appendChild(worldObject);

      // Create our runtime.
      const runtime = new Runtime(renderer, world, viewport, [controller]);

      // runtime.fpsLimit = 5;

      // And start listening to browser events proxied from our div element.
      new BrowserEventManager(viewer.current, runtime);

      // Reset the viewport to fit the bounds
      runtime.goHome();
    }
  }, [tiles]);

  return (
    <div>
      <canvas style={{ width: 800, height: 600, overflow: 'hidden', position: 'relative' }} ref={viewer} />
    </div>
  );
};
