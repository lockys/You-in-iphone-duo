'use client';
import { useEffect, useRef, useState } from 'react';
import { Pause, Play, VolumeX } from 'lucide-react';
import { useLanguage } from './language-provider';
import VideoLoader from './video-loader';

export default function DemoPreview() {
  const { t } = useLanguage();
  const video = useRef<HTMLVideoElement>(null);
  const userPaused = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const player = video.current!;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    player.muted = true;
    player.defaultMuted = true;
    const start = () => {
      if (reduced.matches || userPaused.current || document.hidden) return;
      void player.play().catch(() => {
        setPlaying(false);
        setLoading(false);
      });
    };
    const motionChanged = () => {
      player.autoplay = !reduced.matches;
      if (reduced.matches) player.pause();
      else start();
    };
    motionChanged();
    player.addEventListener('loadeddata', start);
    document.addEventListener('visibilitychange', start);
    window.addEventListener('pageshow', start);
    reduced.addEventListener('change', motionChanged);
    return () => {
      player.pause();
      player.removeEventListener('loadeddata', start);
      document.removeEventListener('visibilitychange', start);
      window.removeEventListener('pageshow', start);
      reduced.removeEventListener('change', motionChanged);
    };
  }, []);
  const toggle = () => {
    const player = video.current!;
    userPaused.current = !player.paused;
    if (userPaused.current) player.pause();
    else {
      player.muted = true;
      setLoading(true);
      void player.play().catch(() => {
        setPlaying(false);
        setLoading(false);
      });
    }
  };
  return (
    <div className="demo-preview">
      <div className="canvas-wrap">
        <video
          ref={video}
          src="/templates/demo.mp4"
          poster="/templates/demo-poster.jpg"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-label={t('previewTitle')}
          data-testid="demo-video"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onLoadStart={() => setLoading(true)}
          onWaiting={() => setLoading(true)}
          onLoadedData={() => setLoading(false)}
          onCanPlay={() => setLoading(false)}
          onPlaying={() => {
            setPlaying(true);
            setLoading(false);
          }}
          onError={() => {
            setPlaying(false);
            setLoading(false);
          }}
        />
        {loading && <VideoLoader label={t('loadingVideo')} />}
        {!playing && !loading && (
          <button type="button" className="demo-play" onClick={toggle} aria-label={t('play')}>
            <Play size={28} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="playback">
        <button
          type="button"
          className="icon-button"
          onClick={toggle}
          aria-label={playing ? t('pause') : t('play')}
        >
          {playing ? <Pause size={17} /> : <Play size={17} />}
        </button>
        <VolumeX size={16} aria-label={t('previewMuted')} />
      </div>
    </div>
  );
}
