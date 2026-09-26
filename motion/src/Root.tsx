import { Composition } from 'remotion';
import { AlbumPromo } from './AlbumPromo';
import { exampleTheme } from './theme';

const FPS = 30;
const DURATION = 10 * FPS;

/** Mismo motion en los dos formatos de redes; el tema llega por --props=albums/<album>.json. */
export function Root() {
  return (
    <>
      <Composition
        id="Vertical"
        component={AlbumPromo}
        width={1080}
        height={1920}
        fps={FPS}
        durationInFrames={DURATION}
        defaultProps={exampleTheme}
      />
      <Composition
        id="Cuadrado"
        component={AlbumPromo}
        width={1080}
        height={1080}
        fps={FPS}
        durationInFrames={DURATION}
        defaultProps={exampleTheme}
      />
    </>
  );
}
