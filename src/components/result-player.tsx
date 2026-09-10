'use client';
import { useEffect, useRef } from 'react';
import { Play } from 'lucide-react';
import { useLanguage } from './language-provider';
import type { ErrorCode } from '@/lib/i18n';
export default function ResultPlayer({ url, onError }: { url: string; onError: (code: ErrorCode) => void }) {
  const { t } = useLanguage();
  const container = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    container.current?.scrollIntoView({ block: 'center', behavior: 'instant' });
  }, [url]);
  return (
    <div ref={container} className="result-preview">
      <video
        ref={video}
        src={url}
        controls
        playsInline
        autoPlay
        muted
        loop
        preload="auto"
        aria-label={t('result')}
        onError={() => onError('error.resultExpired')}
      />
      <div className="result-caption">
        <button
          type="button"
          className="icon-button"
          aria-label={t('playResult')}
          onClick={() => void video.current?.play().catch(() => onError('error.resultPlay'))}
        >
          <Play size={17} />
          {t('playResult')}
        </button>
      </div>
    </div>
  );
}
