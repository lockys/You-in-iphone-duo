import type { Rect, Template } from './composition';

// Adapted from chuspeeism/iphone-duo main.js screenShader, MIT, (c) 2026 jadon7.
// See public/licenses/iphone-duo-MIT.txt. The filmed phone supplies the 3D geometry;
// these shared projection and gradient calculations shade only its keyed screen.
export const FOLD_BLUR = 18; // Gaussian sigma in 1920px output coordinates.
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => {
  const t = clamp(x);
  return t * t * (3 - 2 * t);
};
export type FoldState = { hinge: number; halfWidth: number; edge: number; direction: number; motion: number };

export function foldProjection(template: Template, rect: Rect): Rect {
  const open = template.frames.at(-1)!;
  const width = Math.max(rect.width, (rect.height * open.width) / open.height);
  // A fixed front-view projection: the closed outer display sees the right half.
  // Expanding the screen reveals the left half without stretching the video.
  return { ...rect, x: rect.x + rect.width - width, width };
}

export function foldState(template: Template, rect: Rect, time: number): FoldState {
  const projection = foldProjection(template, rect);
  const halfWidth = projection.width / 2;
  const hinge = projection.x + halfWidth;
  // Calibrated to 8150.mp4: outer face crosses the hinge at 2.52s, flat at 3.32s.
  const outer = time < 2.52;
  const progress = outer ? clamp((time - 2.15) / 0.37) : clamp((3.32 - time) / 0.8);
  const direction = outer ? 1 : -1;
  return {
    hinge,
    halfWidth,
    direction,
    edge: hinge + direction * halfWidth * Math.cos((progress * Math.PI) / 2),
    motion: smooth(progress),
  };
}

export function foldWeights(state: FoldState, x: number) {
  const inside = state.direction > 0 ? x >= state.hinge && x <= state.edge : x <= state.hinge;
  const edge = clamp(((x - state.hinge) * state.direction) / state.halfWidth);
  const motion = inside ? state.motion : 0;
  const blur = motion * edge ** 1.35;
  return {
    blur,
    shade: clamp(2 * motion * clamp((edge - 0.2) / 0.8) ** 1.35),
  };
}
