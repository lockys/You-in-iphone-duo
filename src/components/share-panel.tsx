'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle, Share2, X } from 'lucide-react';
import { useLanguage } from './language-provider';
import ErrorBanner from './error-banner';
import { MediaError } from '@/lib/errors';
import type { ErrorCode } from '@/lib/i18n';
import {
  canShareVideo,
  prepareShareFile,
  socialIntent,
  socialPlatforms,
  videoShareData,
  type SocialPlatform,
} from '@/lib/sharing';

type ShareState = 'preparing' | 'ready' | 'unsupported' | 'failed';
export default function SharePanel({ url }: { url: string }) {
  const { t } = useLanguage();
  const file = useRef<File | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const mounted = useRef(false);
  const [state, setState] = useState<ShareState>('preparing');
  const [busy, setBusy] = useState(false);
  const [handedOff, setHandedOff] = useState(false);
  const [platform, setPlatform] = useState<SocialPlatform>();
  const [error, setError] = useState<ErrorCode>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 30000);
    const prepare = async () => {
      if (!canShareVideo(new File([''], 'iphone-duo.mp4', { type: 'video/mp4' }))) {
        clearTimeout(timeout);
        if (mounted.current) setState('unsupported');
        return;
      }
      try {
        const prepared = await prepareShareFile(url, controller.signal);
        if (!controller.signal.aborted) {
          file.current = prepared;
          setState(canShareVideo(prepared) ? 'ready' : 'unsupported');
        }
      } catch (cause) {
        if (controller.signal.aborted && !timedOut) return;
        setState('failed');
        setError(cause instanceof MediaError ? cause.code : 'error.sharePrepare');
      } finally {
        clearTimeout(timeout);
      }
    };
    void prepare();
    return () => {
      mounted.current = false;
      clearTimeout(timeout);
      controller.abort();
      file.current = null;
    };
  }, [url, attempt]);
  const share = async () => {
    if (!file.current || busy) return;
    setBusy(true);
    setError(undefined);
    setHandedOff(false);
    try {
      // Called directly from the click, with a prepared file, preserving user activation on iOS.
      await navigator.share(videoShareData(file.current));
      if (mounted.current) setHandedOff(true);
    } catch (cause) {
      if (mounted.current && !(cause instanceof DOMException && cause.name === 'AbortError'))
        setError('error.shareFailed');
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const openSocial = (target: SocialPlatform) => {
    if (busy) return;
    window.open(socialIntent(target, t('shareCaption')), '_blank', 'noopener,noreferrer');
    const link = document.createElement('a');
    link.href = `${url}&download=1`;
    link.download = 'iphone-duo.mp4';
    document.body.append(link);
    link.click();
    link.remove();
    setPlatform(target);
    setError(undefined);
  };
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="rail-button"
        aria-label={t('shareTitle')}
        title={t('shareTitle')}
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
      >
        <Share2 size={22} aria-hidden="true" />
        <span>{t('actionShare')}</span>
      </button>
      <dialog
        ref={dialog}
        onClose={() => trigger.current?.focus({ preventScroll: true })}
        className="share-dialog"
        aria-labelledby="share-dialog-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <section className="share-panel">
          <div className="share-heading">
            <h3 id="share-dialog-title">{t('shareTitle')}</h3>
            <button
              type="button"
              className="icon-button"
              aria-label={t('closeShare')}
              onClick={() => dialog.current?.close()}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          {state !== 'unsupported' && (
            <button
              type="button"
              className="share-native"
              disabled={busy || state === 'preparing'}
              onClick={() => {
                if (state === 'failed') {
                  setState('preparing');
                  setError(undefined);
                  setAttempt((value) => value + 1);
                } else void share();
              }}
            >
              {busy || state === 'preparing' ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Share2 size={17} />
              )}
              {state === 'preparing'
                ? t('sharePreparing')
                : state === 'failed'
                  ? t('shareRetry')
                  : t('shareVideo')}
            </button>
          )}
          <div className="social-buttons">
            {socialPlatforms.map((target) => (
              <button
                key={target}
                type="button"
                disabled={busy}
                onClick={() => openSocial(target)}
                aria-label={t('shareTo', { platform: target })}
              >
                {target}
              </button>
            ))}
          </div>
          <p className="share-help" role="status" aria-live="polite">
            {platform ? t('shareAttach', { platform }) : t('shareHelp')}
          </p>
          {handedOff && (
            <p className="share-success" role="status">
              <Check size={14} />
              {t('shareHandedOff')}
            </p>
          )}
          {error && <ErrorBanner message={t(error)} onDismiss={() => setError(undefined)} />}
        </section>
      </dialog>
    </>
  );
}
