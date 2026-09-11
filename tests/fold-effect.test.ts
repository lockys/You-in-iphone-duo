import { describe, it, expect } from 'vitest';
import template from '../public/templates/template.json';
import { foldProjection, foldState, foldWeights } from '../src/lib/fold-effect';
import { frameAt, parseOptions, buildRenderSpec, defaultOptions } from '../src/lib/composition';

describe('folded screen projection and transition', () => {
  it('keeps a landscape projection while the outer screen reveals its right half', () => {
    const rect = frameAt(template, 0);
    const projection = foldProjection(template, rect);
    expect(projection.width).toBeGreaterThan(rect.width * 1.9);
    expect(projection.x + projection.width).toBeCloseTo(rect.x + rect.width);
    expect(projection.height).toBe(rect.height);
  });
  it('leaves the closed and fully open screens clear', () => {
    for (const time of [0, 1.5, 3.4, 5.7]) {
      const state = foldState(template, frameAt(template, time), time);
      expect(foldWeights(state, state.edge)).toEqual({ blur: 0, shade: 0 });
    }
  });
  it('blurs and darkens the moving face without shading the fixed face', () => {
    const state = foldState(template, frameAt(template, 2.8), 2.8);
    expect(foldWeights(state, state.hinge - state.halfWidth * 0.8).shade).toBeGreaterThan(0.5);
    expect(foldWeights(state, state.hinge - state.halfWidth * 0.8).blur).toBeGreaterThan(0);
    expect(foldWeights(state, state.hinge + state.halfWidth * 0.8).shade).toBe(0);
    expect(foldWeights(state, state.hinge).shade).toBe(0);
  });
  it('does not darken the exposed fixed screen behind the rotating outer face', () => {
    const state = foldState(template, frameAt(template, 2.4), 2.4);
    expect(foldWeights(state, state.edge + 10).shade).toBe(0);
  });
  it('validates the multipart effect option and supports explicitly switching it off', () => {
    expect(parseOptions({}).foldEffect).toBe('on');
    expect(parseOptions({ foldEffect: 'off' }).foldEffect).toBe('off');
    expect(() => parseOptions({ foldEffect: 'false;evil' })).toThrow();
    const media = {
      width: 360,
      height: 640,
      duration: 2,
      fps: 30,
      hasAudio: false,
      codec: 'h264',
      rotation: 0,
      hdr: false,
    };
    const render = (foldEffect: 'on' | 'off') =>
      buildRenderSpec(media, template, { ...defaultOptions, foldEffect }, 'in', 'tpl', 'out', 'graph');
    expect(render('on').filter).toContain('maskedmerge');
    expect(render('off').filter).not.toContain('maskedmerge');
  });
});
