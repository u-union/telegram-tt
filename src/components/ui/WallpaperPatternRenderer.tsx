import React, { FC, useRef, useEffect, memo, useMemo } from "../../lib/teact/teact";
import { ApiWallpaper } from "../../api/types";
import { hexToRgb } from "../../util/switchTheme";
import useLastCallback from "../../hooks/useLastCallback";

type OwnProps = {
  wallPaper: ApiWallpaper;
  isBackground?: boolean;
};

type Point = { x: number, y: number };
type RGB = { r: number, g: number, b: number };

const WIDTH = 50;
const HEIGHT = WIDTH;

const POSITIONS: Point[] = [
  { x: 0.80, y: 0.10 },
  { x: 0.60, y: 0.20 },
  { x: 0.35, y: 0.25 },
  { x: 0.25, y: 0.60 },
  { x: 0.20, y: 0.90 },
  { x: 0.40, y: 0.80 },
  { x: 0.65, y: 0.75 },
  { x: 0.75, y: 0.40 },
];
const PHASES = POSITIONS.length;

const CURVES = [
  0, 0.25, 0.50, 0.75, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12,
  13, 14, 15, 16, 17, 18, 18.3, 18.6, 18.9, 19.2, 19.5, 19.8, 20.1, 20.4, 20.7,
  21.0, 21.3, 21.6, 21.9, 22.2, 22.5, 22.8, 23.1, 23.4, 23.7, 24.0, 24.3, 24.6,
  24.9, 25.2, 25.5, 25.8, 26.1, 26.3, 26.4, 26.5, 26.6, 26.7, 26.8, 26.9, 27
]
const INCREMENTAL_CURVE = CURVES.map((v, i, arr) => v - (arr[i - 1] ?? 0));

const WallpaperPatternRenderer: FC<OwnProps> = ({ wallPaper, isBackground }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    phase: 0,
    tail: 0,
    tails: 90,
    colors: [] as RGB[],
    frames: [] as ImageData[],
    nextPositionTail: 0,
    nextPositionTails: 0,
    nextPositionLeft: 0,
    isAnimating: false,
    helperCanvas: null as OffscreenCanvas | null,
    helperCtx: null as OffscreenCanvasRenderingContext2D | null,
    ctx: null as CanvasRenderingContext2D | null,
    sharedBuffer: new ArrayBuffer(WIDTH * HEIGHT * 4),
    sharedPixels: new Uint8ClampedArray(WIDTH * HEIGHT * 4),
  });

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const colors = getColorsFromWallPaper(wallPaper);
    canvas.dataset.colors = colors;

    const helperCanvas = new OffscreenCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext("2d", { alpha: false });
    const helperCtx = helperCanvas.getContext("2d", { alpha: false });

    if (!ctx || !helperCtx) return;

    const colorArray = canvas.dataset.colors?.split(",") || [];
    const rgbColors = colorArray.map(hexToRgb);

    stateRef.current = {
      ...stateRef.current,
      colors: rgbColors,
      ctx,
      helperCanvas,
      helperCtx,
    };

    if (rgbColors.length < 2) {
      const color = rgbColors[0];
      ctx.fillStyle = `rgb(${color.r},${color.g},${color.b})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      return;
    }

    drawGradient();
  }, [wallPaper]);

  const drawGradient = useLastCallback(() => {
    const { colors, phase, tail, tails, ctx, helperCtx, helperCanvas } = stateRef.current;
    if (!ctx || !helperCtx || !helperCanvas) return;

    if (colors.length < 2) {
      const color = colors[0];
      ctx.fillStyle = `rgb(${color.r},${color.g},${color.b})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      return;
    }

    const imageData = getGradientImageData(phase, 1 - tail / tails);
    helperCtx.putImageData(imageData, 0, 0);
    ctx.drawImage(helperCanvas, 0, 0, WIDTH, HEIGHT);
  });

  const getGradientImageData = useMemo(() => {
    return (phase: number, progress: number): ImageData => {
      if (!stateRef.current.helperCtx)
        throw new Error("No helper context");
      const pixels = stateRef.current.sharedPixels;
      const id = new ImageData(pixels, WIDTH, HEIGHT);
      const colors = stateRef.current.colors;
      const colorsLength = colors.length;
      const positionsForPhase = (phase: number): Point[] => {
        const result: Point[] = [];
        for (let i = 0; i < 4; i++) {
          const idx = (phase + i * 2) % POSITIONS.length;
          result.push({ x: POSITIONS[idx].x, y: 1.0 - POSITIONS[idx].y });
        }
        return result;
      };
      const previous = positionsForPhase((phase + 1) % PHASES);
      const current = positionsForPhase(phase);
      let offset = 0;
      for (let y = 0; y < HEIGHT; y++) {
        const directPixelY = y / HEIGHT;
        for (let x = 0; x < WIDTH; x++) {
          const directPixelX = x / WIDTH;
          const centerDistanceX = directPixelX - 0.5;
          const centerDistanceY = directPixelY - 0.5;
          const centerDistance = Math.sqrt(centerDistanceX ** 2 + centerDistanceY ** 2);
          const swirlFactor = 0.35 * centerDistance;
          const theta = swirlFactor * swirlFactor * 0.8 * 8.0;
          const sinTheta = Math.sin(theta);
          const cosTheta = Math.cos(theta);
          const pixelX = Math.max(0, Math.min(1, 0.5 + centerDistanceX * cosTheta - centerDistanceY * sinTheta));
          const pixelY = Math.max(0, Math.min(1, 0.5 + centerDistanceX * sinTheta + centerDistanceY * cosTheta));
          let distanceSum = 0;
          let r = 0, g = 0, b = 0;
          for (let i = 0; i < colorsLength; i++) {
            const colorX = previous[i].x + (current[i].x - previous[i].x) * progress;
            const colorY = previous[i].y + (current[i].y - previous[i].y) * progress;
            const dx = pixelX - colorX;
            const dy = pixelY - colorY;
            let distance = Math.max(0.0, 0.9 - Math.sqrt(dx * dx + dy * dy));
            distance = Math.pow(distance, 4);
            distanceSum += distance;
            r += distance * colors[i].r;
            g += distance * colors[i].g;
            b += distance * colors[i].b;
          }
          pixels[offset++] = Math.min(255, Math.round(r / distanceSum));
          pixels[offset++] = Math.min(255, Math.round(g / distanceSum));
          pixels[offset++] = Math.min(255, Math.round(b / distanceSum));
          pixels[offset++] = 255;
        }
      }
      return id;
    };
  }, []);

  const getPositions = useLastCallback((shift: number): Point[] => {
    const positions = [...POSITIONS];
    positions.push(...positions.splice(0, shift));
    const result: Point[] = [];
    for (let i = 0; i < positions.length; i += 2) {
      result.push(positions[i]);
    }
    return result;
  });

  const getNextPositions = useLastCallback((phase: number, tails: number, curve: number[]): Point[][] => {
    const base = getPositions(phase);
    const next = getPositions((phase + 1) % PHASES);
    const distances = next.map((np, idx) => ({
      x: (np.x - base[idx].x) / tails,
      y: (np.y - base[idx].y) / tails,
    }));
    return curve.map(value =>
      distances.map((d, idx) => ({
        x: base[idx].x + d.x * value,
        y: base[idx].y + d.y * value,
      }))
    );
  });

  const changeTailAndDraw = useLastCallback((diff: number) => {
    const state = stateRef.current;
    state.tail += diff;
    while (state.tail >= state.tails) {
      state.tail -= state.tails;
      state.phase = (state.phase + 1) % PHASES;
    }
    while (state.tail < 0) {
      state.tail += state.tails;
      state.phase = (state.phase - 1 + PHASES) % PHASES;
    }
    const imageData = getGradientImageData(state.phase, 1 - state.tail / state.tails);
    if (state.helperCtx && state.ctx && state.helperCanvas) {
      state.helperCtx.putImageData(imageData, 0, 0);
      state.ctx.drawImage(state.helperCanvas, 0, 0, WIDTH, HEIGHT);
    }
  });

  const toNextPosition = useLastCallback(() => {
    const state = stateRef.current;
    if (state.colors.length < 2 || state.isAnimating) return;

    const tail = state.tail;
    const tails = state.tails;
    let nextPhaseOnIdx: number | undefined;
    const curve: number[] = [];
    for (let i = 0; i < INCREMENTAL_CURVE.length; i++) {
      const inc = INCREMENTAL_CURVE[i];
      let value = (curve[i - 1] ?? tail) + inc;
      if (+value.toFixed(2) > tails && nextPhaseOnIdx === undefined) {
        nextPhaseOnIdx = i;
        value %= tails;
      }
      curve.push(value);
    }
    const currentPhaseCurve = nextPhaseOnIdx !== undefined ? curve.slice(0, nextPhaseOnIdx) : curve;
    const nextPhaseCurve = nextPhaseOnIdx !== undefined ? curve.slice(nextPhaseOnIdx) : [];
    [currentPhaseCurve, nextPhaseCurve].forEach((curveSegment, idx, curves) => {
      const last = curveSegment[curveSegment.length - 1];
      if (last !== undefined && last > tails) {
        curveSegment[curveSegment.length - 1] = +last.toFixed(2);
      }
      state.tail = last ?? 0;
      if (!curveSegment.length) return;
      const frames = Array(curveSegment.length).fill(null).map(() =>
        getGradientImageData(state.phase, 1 - state.tail / tails)
      )
      if (idx !== curves.length - 1) {
        state.phase = (state.phase + 1) % PHASES;
      }
      state.frames.push(...frames);
    });
    state.isAnimating = true;

    const duration = 300;
    const startTime = performance.now();
    const animate = () => {
      const now = performance.now();
      let progress = (now - startTime) / duration;
      if (progress > 1) { progress = 1; }
      const transitionValue = easeOutQuadApply(progress, 1);
      const newTail = tails * transitionValue;
      const diff = newTail - (state.nextPositionTail || 0);
      if (diff) {
        state.nextPositionTail = newTail;
        state.nextPositionLeft -= diff;
        changeTailAndDraw(diff);
      }
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        state.nextPositionLeft = 0;
        state.nextPositionTails = 0;
        state.nextPositionTail = 0;
        state.isAnimating = false;
      }
    };
    requestAnimationFrame(animate);
  });

  useEffect(() => {
    return () => {
      const state = stateRef.current;
      if (state.nextPositionTail) {
        cancelAnimationFrame(state.nextPositionTail);
      }
      state.isAnimating = false;
      state.frames = [];
    };
  }, []);

  useEffect(() => {
    const handleTransition = (e: Event) => {
      const customEvent = e as CustomEvent<PatternTransition>;
      if (isBackground !== customEvent.detail.isWallPaper) return;
      if (!isBackground && customEvent.detail.wallpaperSlug !== wallPaper.slug) return;
      toNextPosition();
    };

    document.addEventListener(PATTERN_TRANSITION_EVENT, handleTransition);
    return () => {
      document.removeEventListener(PATTERN_TRANSITION_EVENT, handleTransition);
    };
  }, [toNextPosition]);

  return (
    <canvas
      ref={canvasRef}
      width={WIDTH}
      height={HEIGHT}
      style={{ width: "100%", height: "100%" } as React.CSSProperties}
    />
  );
};

export default memo(WallpaperPatternRenderer);

export const getColorsFromWallPaper = (wallPaper: ApiWallpaper): string => {
  return wallPaper.settings
    ? [wallPaper.settings.backgroundColor, wallPaper.settings.secondBackgroundColor, wallPaper.settings.thirdBackgroundColor, wallPaper.settings.fourthBackgroundColor]
      .filter(Boolean)
      .map(getHexColorFromTelegramColor)
      .join(",")
    : "";
};

const getHexColorFromTelegramColor = (color: number): string => {
  const hex = (color < 0 ? 0xffffff + color : color).toString(16);
  return "#" + (hex.length >= 6 ? hex : "0".repeat(6 - hex.length) + hex);
};

function easeOutQuadApply(v: number, c: number) {
  return -c * v * (v - 2);
}

export const PATTERN_TRANSITION_EVENT = 'pattern_transition';
type PatternTransition = {
  wallpaperSlug: string;
  isWallPaper?: boolean;
}
export type PatternTransitionEvent = CustomEvent<PatternTransition>;

export function emitPatternTransition(e: PatternTransition) {
  const event = new CustomEvent(PATTERN_TRANSITION_EVENT, { detail: e });
  document.dispatchEvent(event);
}