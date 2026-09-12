import { useEffect, useRef, useState } from 'react';
import { postMultipart } from '../lib/client-upload';
import { MediaError } from '../lib/errors';
import { useLanguage } from './language-provider';

export type PreviewSource = { id: string; preview: string; previewStartTime?: number };
export function usePreviewSegment(
  media: PreviewSource | undefined,
  start: number,
  enabled: boolean,
  onError: (error: MediaError) => void,
) {
  const { locale, t } = useLanguage();
  const [ready, setReady] = useState<{ id: string; url: string; start: number }>();
  const [state, setState] = useState<{ stage?: string; position?: number; failed?: boolean }>({});
  const [attempt, retry] = useState(0);
  const active = useRef<{ abort: () => void } | null>(null);
  const current = ready?.id === media?.id ? ready : undefined;
  const local = media?.previewStartTime !== undefined;
  const url = current?.url || media?.preview;
  const actualStart = current?.start ?? media?.previewStartTime ?? 0;
  const pending = !!media && local && actualStart !== start;
  useEffect(() => {
    if (!media || !pending || !enabled) return;
    let stale = false;
    const xhr = new XMLHttpRequest();
    const timer = setTimeout(() => {
      setState({ stage: 'processing' });
      const form = new FormData();
      form.append('uploadId', media.id);
      form.append('startTime', String(start));
      void postMultipart(
        '/api/preview',
        form,
        xhr,
        (event) => {
          if (!stale && event.type === 'progress')
            setState({ stage: event.stage, position: Number(event.position) });
        },
        locale,
      )
        .then((done) => {
          if (!stale) {
            setReady({ id: media.id, url: String(done.previewUrl), start: Number(done.previewStartTime) });
            setState({});
          }
        })
        .catch((error) => {
          if (!stale && !(error instanceof DOMException && error.name === 'AbortError')) {
            setState({ failed: true });
            onError(error instanceof MediaError ? error : new MediaError('error.network'));
          }
        });
    }, 300);
    const control = {
      abort: () => {
        stale = true;
        clearTimeout(timer);
        xhr.abort();
        setState({ failed: true });
      },
    };
    active.current = control;
    return () => {
      stale = true;
      clearTimeout(timer);
      xhr.abort();
      if (active.current === control) active.current = null;
    };
  }, [media, start, pending, enabled, locale, onError, attempt]);
  const label =
    state.stage === 'queued' ? t('stage.queued', { position: state.position || 1 }) : t('loadingPreview');
  return {
    url,
    local,
    pending,
    label,
    failed: pending && !!state.failed,
    retry: () => {
      setState({});
      retry((value) => value + 1);
    },
    cancel: () => active.current?.abort(),
  };
}
