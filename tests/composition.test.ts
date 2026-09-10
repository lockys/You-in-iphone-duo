import { describe, expect, it } from 'vitest';
import {
  cover,
  parseOptions,
  parseProbe,
  validateFile,
  buildRenderSpec,
  frameAt,
} from '../src/lib/composition';

const rect = { x: 770, y: 215, width: 445, height: 630 };
const meta = {
  width: 1080,
  height: 1920,
  duration: 2,
  fps: 30,
  hasAudio: false,
  codec: 'h264',
  rotation: 0,
  hdr: false,
};
const template = {
  width: 1920,
  height: 1080,
  duration: 5.824,
  fps: 30000 / 1001,
  hasAudio: true,
  frames: [rect, { x: 530, y: 215, width: 850, height: 630 }],
  similarity: 0.3,
  blend: 0.1,
  keyColor: '0x00ff00',
};
const options = { startTime: 0, scale: 1, offsetX: 0, offsetY: 0, audioMode: 'template' as const };

describe('真實 cover 與編輯參數', () => {
  it('直式輸入等比例 cover，置中裁去多餘高度', () => {
    const value = cover(meta, rect, options);
    expect(value.width).toBe(446);
    expect(value.height / value.width).toBeCloseTo(1920 / 1080, 2);
    expect(value.y).toBeLessThan(rect.y);
    expect(value.x + value.width).toBeGreaterThanOrEqual(rect.x + rect.width);
  });
  it('最邊緣位移仍不露出空白', () => {
    const value = cover(meta, rect, { ...options, scale: 2, offsetX: 1, offsetY: -1 });
    expect(value.x).toBeCloseTo(rect.x);
    expect(value.y + value.height).toBeCloseTo(rect.y + rect.height);
  });
  it.each([
    { scale: 'NaN' },
    { scale: '0.2' },
    { offsetX: '100' },
    { startTime: '-1' },
    { audioMode: 'evil' },
  ])('拒絕不安全或超出範圍的參數 %j', (fields) => {
    expect(() => parseOptions(fields)).toThrow();
  });
  it('綠幕展開後採用對應影格邊界', () => expect(frameAt(template, 1).width).toBe(850));
});

describe('輸入檔案與 ffprobe', () => {
  it.each([
    ['clip.MOV', 'video/quicktime'],
    ['x.mp4', 'video/mp4'],
    ['x.webm', 'video/webm'],
    ['x.mov', 'application/octet-stream'],
  ])('接受 %s', (name, mime) => expect(() => validateFile(name, mime, 50)).not.toThrow());
  it.each([
    ['a.exe', 'video/mp4', 50],
    ['a.mp4', 'text/html', 50],
    ['a.mp4', 'video/mp4', 201 * 1024 ** 2],
    ['a.mp4', 'video/mp4', 0],
  ])('拒絕偽裝、超大與空白檔 %s', (name, mime, size) =>
    expect(() => validateFile(String(name), String(mime), Number(size))).toThrow(),
  );
  it('處理 iPhone rotation metadata', () => {
    const info = parseProbe({
      format: { duration: '2' },
      streams: [
        {
          codec_type: 'video',
          codec_name: 'h264',
          width: 1920,
          height: 1080,
          avg_frame_rate: '30/1',
          side_data_list: [{ rotation: 90 }],
        },
      ],
    });
    expect(info).toMatchObject({ width: 1080, height: 1920, rotation: 90, hasAudio: false });
  });
  it('拒絕超長與非影片來源', () => {
    expect(() => parseProbe({ streams: [], format: { duration: '2' } })).toThrow();
    expect(() =>
      parseProbe({ streams: [{ codec_type: 'video', width: 10, height: 10 }], format: { duration: '301' } }),
    ).toThrow();
  });
});

describe('FFmpeg 原生輸出', () => {
  it('短影片循環，從指定秒數開始', () => {
    const spec = buildRenderSpec(
      meta,
      template,
      { ...options, startTime: 1.5 },
      'input.mp4',
      'template.mp4',
      'output.mp4',
      'graph.txt',
    );
    expect(spec.args.join(' ')).toContain('-stream_loop -1 -ss 1.5');
    expect(spec.args).toContain('libx264');
    expect(spec.args).toContain('yuv420p');
    expect(spec.args).toContain('+faststart');
    expect(spec.filter).toContain('colorkey=0x00ff00');
    expect(spec.filter).toContain('despill');
    expect(spec.filter).toContain('eval=frame');
  });
  it.each(['template', 'user', 'mute'] as const)('音訊模式 %s', (audioMode) => {
    const spec = buildRenderSpec(
      { ...meta, hasAudio: true },
      template,
      { ...options, audioMode },
      'in',
      'tpl',
      'out',
      'graph',
    );
    if (audioMode === 'mute') expect(spec.args).toContain('-an');
    else {
      expect(spec.filter).toContain(audioMode === 'template' ? '[1:a:0]' : '[0:a:0]');
      expect(spec.args).toContain('aac');
    }
  });
  it('無音訊影片選原音仍成功輸出靜音影片', () => {
    expect(
      buildRenderSpec(meta, template, { ...options, audioMode: 'user' }, 'in', 'tpl', 'out', 'graph').args,
    ).toContain('-an');
  });
  it('拒絕開始時間超過影片長度', () =>
    expect(() =>
      buildRenderSpec(meta, template, { ...options, startTime: 3 }, 'in', 'tpl', 'out', 'graph'),
    ).toThrow());
});
