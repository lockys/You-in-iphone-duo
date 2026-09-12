'use client';
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { Pause, Play, VolumeX, Move, RotateCcw } from 'lucide-react';
import { useLanguage } from './language-provider';
import FloatingPreview from './floating-preview';
import VideoLoader from './video-loader';
import type { ErrorCode } from '@/lib/i18n';
import {
  cover,
  frameAt,
  contentFrame,
  unfoldTime,
  type EditOptions,
  type MediaInfo,
  type Template,
} from '@/lib/composition';
import { paintFold } from '@/lib/fold-preview';

type Props = {
  template: Template;
  source?: string;
  localTimeline?: boolean;
  pendingLabel?: string;
  previewFailed?: boolean;
  onPreviewRetry?: () => void;
  media?: MediaInfo;
  options: EditOptions;
  onChange: (options: EditOptions) => void;
  second?: { source: string; media: MediaInfo; options: EditOptions; localTimeline?: boolean };
  onSecondChange?: (options: EditOptions) => void;
  editSide?: 'closed' | 'open';
  disabled: boolean;
  onError: (code: ErrorCode) => void;
};
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export default function Preview({
  template,
  source,
  localTimeline = false,
  pendingLabel,
  previewFailed,
  onPreviewRetry,
  media,
  options,
  onChange,
  second,
  onSecondChange,
  editSide = 'closed',
  disabled,
  onError,
}: Props) {
  const { t } = useLanguage();
  const canvas = useRef<HTMLCanvasElement>(null);
  const phone = useRef<HTMLVideoElement>(null);
  const content = useRef<HTMLVideoElement>(null);
  const openContent = useRef<HTMLVideoElement>(null);
  const latest = useRef({
    options,
    media,
    disabled,
    onChange,
    second,
    onSecondChange,
    localTimeline,
    pendingLabel,
  });
  useEffect(() => {
    latest.current = {
      options,
      media,
      disabled,
      onChange,
      second,
      onSecondChange,
      localTimeline,
      pendingLabel,
    };
  }, [options, media, disabled, onChange, second, onSecondChange, localTimeline, pendingLabel]);
  const [playing, setPlaying] = useState(false);
  // A previous clip's ready state must not hide the loader on a new clip.
  const [paintedSources, setPaintedSources] = useState<{ source?: string; second?: string }>();
  const frameReady =
    !!paintedSources && paintedSources.source === source && paintedSources.second === second?.source;
  const [needsGesture, setNeedsGesture] = useState(false);
  const userPaused = useRef(false);
  const playBoth = useCallback(() => {
    setNeedsGesture(false);
    for (const player of [phone.current, content.current, openContent.current]) {
      if (!player) continue;
      player.muted = true;
      player.defaultMuted = true;
      void player.play().catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'NotAllowedError') setNeedsGesture(true);
      });
    }
  }, []);
  const [time, setTime] = useState(0);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; scale: number } | null>(null);

  useEffect(() => {
    const player = phone.current;
    const video = content.current;
    const other = openContent.current;
    const target = canvas.current;
    if (!player || !target) return;
    setPaintedSources(undefined);
    setNeedsGesture(false);
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
    let lastRenderKey = '';
    const invalidate = () => {
      lastRenderKey = '';
    };
    for (const item of [player, video, other]) {
      item?.addEventListener('seeked', invalidate);
      item?.addEventListener('loadeddata', invalidate);
    }
    let painted = false;
    const draw = () => {
      if (stopped) return;
      frame = requestAnimationFrame(draw);
      if (player.readyState < 2 || player.seeking || latest.current.pendingLabel) return;
      const now = player.currentTime;
      const open = latest.current.second && now >= unfoldTime(template);
      const activeVideo = open ? other : video;
      const opts = open ? latest.current.second!.options : latest.current.options;
      const activeMedia = open ? latest.current.second!.media : latest.current.media;
      if (activeVideo && activeVideo.readyState < 2) {
        if (painted) {
          painted = false;
          setPaintedSources(undefined);
        }
        return;
      }
      for (const [item, start, elapsed] of [
        [video, latest.current.localTimeline ? 0 : latest.current.options.startTime, now],
        [
          other,
          latest.current.second?.localTimeline ? 0 : latest.current.second?.options.startTime || 0,
          Math.max(0, now - unfoldTime(template)),
        ],
      ] as const) {
        if (!item || item.readyState < 2 || !Number.isFinite(item.duration)) continue;
        const desired = (start + elapsed) % item.duration;
        const distance = Math.abs(item.currentTime - desired);
        if (!item.seeking && Math.min(distance, item.duration - distance) > 0.085) item.currentTime = desired;
      }
      // currentTime changes before the decoded frame does, especially on paused WebKit videos.
      if (activeVideo?.seeking) return;
      // Paused frames redraw when media or settings change, without repeating blur work.
      const renderKey = `${now}:${activeVideo?.currentTime}:${activeVideo?.readyState}:${opts.scale}:${opts.offsetX}:${opts.offsetY}:${opts.foldEffect}`;
      if (renderKey === lastRenderKey) return;
      if (!player.paused && Math.abs(now - lastDraw) < 1 / 32) return;
      lastRenderKey = renderKey;
      lastDraw = now;
      context.fillStyle = '#f5f5f7';
      context.fillRect(0, 0, target.width, target.height);
      if (activeVideo && activeVideo.readyState >= 2 && activeMedia) {
        const rect = cover(activeMedia, contentFrame(template, now, opts), opts);
        const ratio = target.width / template.width;
        context.drawImage(
          activeVideo,
          rect.x * ratio,
          rect.y * ratio,
          rect.width * ratio,
          rect.height * ratio,
        );
      }
      try {
        if (activeVideo && activeVideo.readyState >= 2 && activeMedia && opts.foldEffect === 'on')
          paintFold(context, template, frameAt(template, now), now);
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
        if (!painted && (!source || (activeVideo && activeVideo.readyState >= 2))) {
          painted = true;
          setPaintedSources({ source, second: second?.source });
        }
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
      if (!userPaused.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) playBoth();
    };
    // Safari may need play() before decoding either video's first frame.
    start();
    player.addEventListener('loadedmetadata', start);
    video?.addEventListener('loadedmetadata', start);
    other?.addEventListener('loadedmetadata', start);
    // WebKit can abort play() when a newly loaded clip is immediately seeked.
    // Retry once decoded data becomes playable; an explicit pause still wins.
    player.addEventListener('canplay', start);
    video?.addEventListener('canplay', start);
    other?.addEventListener('canplay', start);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      for (const item of [player, video, other]) {
        item?.removeEventListener('seeked', invalidate);
        item?.removeEventListener('loadeddata', invalidate);
      }
      player.removeEventListener('loadedmetadata', start);
      video?.removeEventListener('loadedmetadata', start);
      other?.removeEventListener('loadedmetadata', start);
      player.removeEventListener('canplay', start);
      video?.removeEventListener('canplay', start);
      other?.removeEventListener('canplay', start);
      player.pause();
      video?.pause();
      other?.pause();
    };
  }, [template, source, second?.source, onError, playBoth]);

  useEffect(() => {
    if (phone.current) phone.current.currentTime = 0;
    if (content.current?.readyState) content.current.currentTime = localTimeline ? 0 : options.startTime;
  }, [options.startTime, source, localTimeline]);
  useEffect(() => {
    if (phone.current) phone.current.currentTime = editSide === 'open' ? unfoldTime(template) + 0.15 : 0;
  }, [editSide, second?.source, second?.options.startTime, template]);
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
      const current = latest.current;
      const opts =
        current.second && (phone.current?.currentTime || 0) >= unfoldTime(template)
          ? current.second.options
          : current.options;
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale: opts.scale };
    }
  };
  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous || !media || disabled) return;
    const point = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, point);
    const isOpen = latest.current.second && (phone.current?.currentTime || 0) >= unfoldTime(template);
    const opts = isOpen ? latest.current.second!.options : latest.current.options;
    const currentMedia = isOpen ? latest.current.second!.media : media;
    const change = isOpen ? latest.current.onSecondChange! : onChange;
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      change({
        ...opts,
        scale: clamp((pinch.current.scale * distance) / Math.max(1, pinch.current.distance), 1, 3),
      });
    } else if (pointers.current.size === 1) {
      const rect = contentFrame(template, phone.current?.currentTime || 0, opts);
      const transform = cover(currentMedia, rect, opts);
      const ratio = template.width / event.currentTarget.getBoundingClientRect().width;
      const maxX = (transform.width - rect.width) / 2,
        maxY = (transform.height - rect.height) / 2;
      change({
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
      <FloatingPreview enabled={!!media && !disabled}>
        <div className="canvas-wrap">
          {!frameReady && !needsGesture && <VideoLoader label={t('loadingVideo')} />}
          {needsGesture && (
            <button
              className="demo-play"
              style={{ zIndex: 4 }}
              type="button"
              aria-label={t('play')}
              onClick={() => {
                userPaused.current = false;
                playBoth();
              }}
            >
              <Play size={28} aria-hidden="true" />
            </button>
          )}
          {pendingLabel && !previewFailed && <VideoLoader label={pendingLabel} />}
          {previewFailed && (
            <div className="preview-retry" role="status">
              <button type="button" onClick={onPreviewRetry}>
                {t('retryPreview')}
              </button>
            </div>
          )}
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
              crossOrigin="anonymous"
              src={source}
              loop
              muted
              playsInline
              preload="auto"
              className="source-video"
              onError={() => onError('error.previewExpired')}
            />
          )}
          {second && (
            <video
              key={second.source}
              ref={openContent}
              crossOrigin="anonymous"
              src={second.source}
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
            if (playing) {
              userPaused.current = true;
              phone.current?.pause();
              content.current?.pause();
              openContent.current?.pause();
            } else {
              userPaused.current = false;
              playBoth();
            }
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
