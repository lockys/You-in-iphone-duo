import { FOLD_BLUR, foldProjection, foldState, foldWeights } from './fold-effect';
import type { Rect, Template } from './composition';

// Three separable box passes approximate the native Gaussian blur. This fallback
// also works in Safari versions without CanvasRenderingContext2D.filter.
function blur(source: Uint8ClampedArray, width: number, height: number, sigma: number) {
  const radius = Math.max(1, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2));
  const count = 2 * radius + 1;
  let data = new Uint8ClampedArray(source);
  let buffer = new Uint8ClampedArray(source.length);
  for (let pass = 0; pass < 3; pass++) {
    for (let axis = 0; axis < 2; axis++) {
      const length = axis === 0 ? width : height;
      const lines = axis === 0 ? height : width;
      const stride = axis === 0 ? 4 : width * 4;
      for (let line = 0; line < lines; line++) {
        const start = axis === 0 ? line * width * 4 : line * 4;
        for (let channel = 0; channel < 3; channel++) {
          const at = (position: number) =>
            start + Math.min(length - 1, Math.max(0, position)) * stride + channel;
          let sum = 0;
          for (let k = -radius; k <= radius; k++) sum += data[at(k)];
          for (let p = 0; p < length; p++) {
            buffer[at(p)] = sum / count;
            sum += data[at(p + radius + 1)] - data[at(p - radius)];
          }
        }
      }
      [data, buffer] = [buffer, data];
    }
  }
  return data;
}

export function paintFold(context: CanvasRenderingContext2D, template: Template, rect: Rect, time: number) {
  const state = foldState(template, rect, time);
  if (state.motion === 0) return;
  const ratio = context.canvas.width / template.width;
  const projection = foldProjection(template, rect);
  const pad = FOLD_BLUR * 3;
  const x = Math.max(0, Math.floor((projection.x - pad) * ratio));
  const y = Math.max(0, Math.floor((projection.y - pad) * ratio));
  const width = Math.min(context.canvas.width - x, Math.ceil((projection.width + 2 * pad) * ratio));
  const height = Math.min(context.canvas.height - y, Math.ceil((projection.height + 2 * pad) * ratio));
  const image = context.getImageData(x, y, width, height);
  const softened = blur(image.data, width, height, FOLD_BLUR * ratio);
  for (let column = 0; column < width; column++) {
    const weights = foldWeights(state, (x + column) / ratio);
    if (weights.blur === 0 && weights.shade === 0) continue;
    for (let row = 0; row < height; row++) {
      const pixel = (row * width + column) * 4;
      for (let c = 0; c < 3; c++) {
        const i = pixel + c;
        image.data[i] =
          (image.data[i] * (1 - weights.blur) + softened[i] * weights.blur) * (1 - weights.shade);
      }
    }
  }
  context.putImageData(image, x, y);
}
