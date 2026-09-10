'use client';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Pause, Play, VolumeX, Move, RotateCcw } from 'lucide-react';
import { useLanguage } from './language-provider';
import FloatingPreview from './floating-preview';
import type { ErrorCode } from '@/lib/i18n';
import { cover, frameAt, type EditOptions, type MediaInfo, type Template } from '@/lib/composition';

type Props = {
  template: Template;
  source?: string;
  media?: MediaInfo;
  options: EditOptions;
  onChange: (options: EditOptions) => void;
  disabled: boolean;
  onError: (code: ErrorCode) => void;
};
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export default function Preview({ template, source, media, options, onChange, disabled, onError }: Props) {
  const { t } = useLanguage();
  const canvas = useRef<HTMLCanvasElement>(null);
  const phone = useRef<HTMLVideoElement>(null);
  const content = useRef<HTMLVideoElement>(null);
  const latest = useRef({ options, media, disabled, onChange });
  useEffect(() => {
    latest.current = { options, media, disabled, onChange };
  }, [options, media, disabled, onChange]);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; scale: number } | null>(null);

  useEffect(() => {
    const player = phone.current;
    const video = content.current;
    const target = canvas.current;
    if (!player || !target) return;
    const context = target.getContext('2d');
    const foreground = document.createElement('canvas');
    foreground.width = target.width;
    foreground.height = target.height;
    const fg = foreground.getContext('2d', { willReadFrequently: true });
    if (!context || !fg) {
      onError('error.canvas');
      return;
    }
    let frame = 0,
      lastDraw = -1,
      lastUI = -1,
      stopped = false;
    const draw = () => {
      if (stopped) return;
      frame = requestAnimationFrame(draw);
      if (player.readyState < 2) return;
      const now = player.currentTime;
      if (video && video.readyState >= 2 && Number.isFinite(video.duration)) {
        const desired = (latest.current.options.startTime + now) % video.duration;
        const distance = Math.abs(video.currentTime - desired);
        if (!video.seeking && Math.min(distance, video.duration - distance) > 0.085)
          video.currentTime = desired;
        if (!player.paused && video.paused) void video.play().catch(() => {});
        if (player.paused && !video.paused) video.pause();
      }
      // Paused frames still redraw, so every slider and drag is immediately visible.
      if (!player.paused && Math.abs(now - lastDraw) < 1 / 32) return;
      lastDraw = now;
      context.fillStyle = '#f1edff';
      context.fillRect(0, 0, target.width, target.height);
      if (video && video.readyState >= 2 && latest.current.media) {
        const rect = cover(latest.current.media, frameAt(template, now), latest.current.options);
        const ratio = target.width / template.width;
        context.drawImage(video, rect.x * ratio, rect.y * ratio, rect.width * ratio, rect.height * ratio);
      }
      try {
        fg.drawImage(player, 0, 0, target.width, target.height);
        const image = fg.getImageData(0, 0, target.width, target.height);
        const pixels = image.data;
        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i],
            g = pixels[i + 1],
            b = pixels[i + 2];
          const distance = Math.sqrt(r * r + (255 - g) ** 2 + b * b) / 441.672956;
          pixels[i + 3] = clamp((distance - template.similarity) / template.blend, 0, 1) * 255;
          pixels[i + 1] = Math.min(g, (r + b) / 2); // Matches FFmpeg despill's default mix.
        }
        fg.putImageData(image, 0, 0);
        context.drawImage(foreground, 0, 0);
      } catch {
        stopped = true;
        onError('error.previewRead');
      }
      if (Math.abs(now - lastUI) > 0.1 || now < lastUI) {
        lastUI = now;
        setTime(now);
      }
    };
    frame = requestAnimationFrame(draw);
    const start = () => {
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) void player.play().catch(() => {});
    };
    player.addEventListener('canplay', start, { once: true });
    if (player.readyState >= 3) start();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      player.removeEventListener('canplay', start);
      player.pause();
      video?.pause();
    };
  }, [template, source, onError]);

  useEffect(() => {
    if (phone.current) phone.current.currentTime = 0;
    if (content.current?.readyState) content.current.currentTime = options.startTime;
  }, [options.startTime, source]);
  const seek = (value: number) => {
    if (phone.current) phone.current.currentTime = value;
    setTime(value);
  };
  const down = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!media || disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale: latest.current.options.scale };
    }
  };
  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous || !media || disabled) return;
    const point = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, point);
    const opts = latest.current.options;
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      onChange({
        ...opts,
        scale: clamp((pinch.current.scale * distance) / Math.max(1, pinch.current.distance), 1, 3),
      });
    } else if (pointers.current.size === 1) {
      const rect = frameAt(template, phone.current?.currentTime || 0);
      const transform = cover(media, rect, opts);
      const ratio = template.width / event.currentTarget.getBoundingClientRect().width;
      const maxX = (transform.width - rect.width) / 2,
        maxY = (transform.height - rect.height) / 2;
      onChange({
        ...opts,
        offsetX: maxX > 1 ? clamp(opts.offsetX + ((point.x - previous.x) * ratio) / maxX, -1, 1) : 0,
        offsetY: maxY > 1 ? clamp(opts.offsetY + ((point.y - previous.y) * ratio) / maxY, -1, 1) : 0,
      });
    }
  };
  const up = (event: PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(event.pointerId);
    pinch.current = null;
  };
  return (
    <div className="preview-box">
      <FloatingPreview key={source || 'empty'} enabled={!!media && !disabled}>
        <div className="canvas-wrap">
          <canvas
            ref={canvas}
            width={768}
            height={432}
            aria-label={t('canvas')}
            data-testid="preview-canvas"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onLostPointerCapture={up}
            className={media && !disabled ? 'draggable' : ''}
          />
          <video
            ref={phone}
            src="/templates/preview.mp4"
            loop
            muted
            playsInline
            preload="auto"
            className="source-video"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onError={() => onError('error.templateRead')}
          />
          {source && (
            <video
              key={source}
              ref={content}
              src={source}
              loop
              muted
              playsInline
              preload="auto"
              className="source-video"
              onError={() => onError('error.previewExpired')}
            />
          )}
        </div>
      </FloatingPreview>
      <div className="playback">
        <button
          type="button"
          className="icon-button"
          aria-label={playing ? t('pause') : t('play')}
          onClick={() => {
            if (playing) phone.current?.pause();
            else void phone.current?.play().catch(() => onError('error.previewPlay'));
          }}
        >
          {playing ? <Pause size={17} /> : <Play size={17} />}
        </button>
        <input
          aria-label={t('timeline')}
          type="range"
          min="0"
          max={template.duration - 0.05}
          step="0.01"
          value={time}
          onChange={(e) => seek(Number(e.target.value))}
        />
        <span className="timecode">
          {time.toFixed(1)} / {template.duration.toFixed(2)} {t('seconds')}
        </span>
        <VolumeX size={16} aria-label={t('previewMuted')} />
        <button type="button" className="icon-button" aria-label={t('restart')} onClick={() => seek(0)}>
          <RotateCcw size={16} />
        </button>
      </div>
      <p className="preview-hint">
        <Move size={14} />
        {t('gestureHelp')}
      </p>
    </div>
  );
}
