'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Download,
  Film,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  CodeXml,
  Clapperboard,
  Pencil,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import Preview from './preview';
import { usePreviewSegment } from './use-preview-segment';
import DemoPreview from './demo-preview';
import VideoLoader from './video-loader';
import ResultPlayer from './result-player';
import SharePanel from './share-panel';
import ErrorBanner from './error-banner';
import StepIcon from './step-icon';
import { brandName, repositoryUrl } from '@/lib/brand';
import { useLanguage } from './language-provider';
import { languageNames, locales, templateSource, type ErrorCode, type MessageKey } from '@/lib/i18n';
import { MediaError, errorFromResponse } from '@/lib/errors';
import {
  defaultOptions,
  MAX_UPLOAD_BYTES,
  validateFile,
  type EditOptions,
  type MediaInfo,
  type Template,
} from '@/lib/composition';
import { postMultipart, type ProgressEvent } from '@/lib/client-upload';

type Imported = {
  id: string;
  name: string;
  size: number;
  info: MediaInfo;
  preview: string;
  previewStartTime?: number;
};
type Result = { id: string; url: string; playUrl: string };
const stageKeys: Record<string, MessageKey> = {
  queued: 'stage.queued',
  uploading: 'stage.uploading',
  processing: 'stage.processing',
  compositing: 'stage.compositing',
  complete: 'stage.complete',
  error: 'stage.error',
};
function erase(id?: string) {
  if (id) void fetch(`/api/media/${id}`, { method: 'DELETE', keepalive: true }).catch(() => {});
}

export default function Editor() {
  const { locale, changeLanguage, t } = useLanguage();
  const stage = (status: string) => t(stageKeys[status] || 'working', { position: queuePosition });
  const [template, setTemplate] = useState<Template>();
  const [limit, setLimit] = useState(MAX_UPLOAD_BYTES);
  const [storage, setStorage] = useState<'disk' | 'blob'>('disk');
  const [closedMedia, setClosedMedia] = useState<Imported>();
  const [openMedia, setOpenMedia] = useState<Imported>();
  const [mode, setMode] = useState<'single' | 'dual'>('single');
  const [clip, setClip] = useState<'closed' | 'open'>('closed');
  const media = clip === 'closed' ? closedMedia : openMedia;
  const setMedia = clip === 'closed' ? setClosedMedia : setOpenMedia;
  const [result, setResult] = useState<Result>();
  const [clipOptions, setClipOptions] = useState({ closed: defaultOptions, open: defaultOptions });
  const options = clipOptions[clip];
  const updateClipOptions = useCallback(
    (side: 'closed' | 'open', value: React.SetStateAction<EditOptions>) => {
      setClipOptions((previous) => {
        const next = typeof value === 'function' ? value(previous[side]) : value;
        const other = side === 'closed' ? 'open' : 'closed';
        return {
          ...previous,
          [side]: next,
          [other]: { ...previous[other], audioMode: next.audioMode, foldEffect: next.foldEffect },
        };
      });
    },
    [],
  );
  const setOptions = (value: React.SetStateAction<EditOptions>) => updateClipOptions(clip, value);
  const primaryMedia = mode === 'single' ? media : closedMedia || openMedia;
  const primaryOptions = mode === 'single' ? options : closedMedia ? clipOptions.closed : clipOptions.open;
  const [busy, setBusy] = useState<'upload' | 'render' | null>(null);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [queuePosition, setQueuePosition] = useState(1);
  const [error, setError] = useState<MediaError | null>(null);
  const [dragging, setDragging] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [filename, setFilename] = useState('');
  const [downloaded, setDownloaded] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const active = useRef<{ abort: () => void } | null>(null);
  const assets = useRef<{ source?: string; openSource?: string; result?: string; pendingSource?: string }>(
    {},
  );
  const reportError = useCallback((code: ErrorCode) => setError(new MediaError(code)), []);
  const loadTemplate = useCallback(() => {
    void fetch('/api/template')
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw errorFromResponse(data);
        setError(null);
        setTemplate(data.template);
        setLimit(data.maxBytes);
        setStorage(data.storage === 'blob' ? 'blob' : 'disk');
      })
      .catch((e) => setError(e instanceof MediaError ? e : new MediaError('error.network')));
  }, []);
  useEffect(() => {
    loadTemplate();
    return () => {
      active.current?.abort();
      erase(assets.current.source);
      erase(assets.current.openSource);
      erase(assets.current.result);
      erase(assets.current.pendingSource);
    };
  }, [loadTemplate]);
  useEffect(() => {
    const close = (event: PageTransitionEvent) => {
      if (event.persisted) return;
      active.current?.abort();
      erase(assets.current.source);
      erase(assets.current.openSource);
      erase(assets.current.result);
      erase(assets.current.pendingSource);
    };
    window.addEventListener('pagehide', close);
    return () => window.removeEventListener('pagehide', close);
  }, []);
  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [busy]);
  const onProgress = (event: ProgressEvent) => {
    if (event.type === 'progress') {
      setStatus(event.stage || 'processing');
      setProgress(Math.round(event.progress || 0));
      if (event.stage === 'queued') setQueuePosition(Number(event.position) || 1);
    }
  };
  const importFile = async (file?: File) => {
    if (!file || busy || active.current) return;
    try {
      validateFile(file.name, file.type || 'application/octet-stream', file.size, limit);
    } catch (e) {
      setError(e instanceof MediaError ? e : new MediaError('error.generic'));
      if (picker.current) picker.current.value = '';
      return;
    }
    setError(null);
    setBusy('upload');
    setStatus('uploading');
    setProgress(0);
    setElapsed(0);
    setFilename(file.name);
    const xhr = new XMLHttpRequest();
    const data = new FormData();
    const controller = new AbortController();
    active.current = {
      abort: () => {
        controller.abort();
        xhr.abort();
      },
    };
    try {
      if (storage === 'blob') {
        const response = await fetch('/api/blob-ticket', {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json', 'X-Frame-Language': locale },
          body: JSON.stringify({
            name: file.name,
            mime: file.type || 'application/octet-stream',
            size: file.size,
          }),
        });
        const ticket = await response.json();
        if (!response.ok) throw errorFromResponse(ticket);
        assets.current.pendingSource = ticket.id;
        const { uploadPresigned } = await import('@vercel/blob/client');
        await uploadPresigned(ticket.pathname, file, {
          access: 'private',
          handleUploadUrl: '/api/blob-upload',
          clientPayload: ticket.id,
          multipart: true,
          contentType: file.type || 'application/octet-stream',
          abortSignal: controller.signal,
          onUploadProgress: ({ percentage }) =>
            onProgress({ type: 'progress', stage: 'uploading', progress: percentage }),
        });
        if (controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        data.append('cloudId', ticket.id);
      } else data.append('file', file);
      const done = await postMultipart('/api/upload', data, xhr, onProgress, locale);
      const id = String(done.uploadId);
      const assetKey = clip === 'closed' ? 'source' : 'openSource';
      erase(assets.current[assetKey]);
      erase(assets.current.result);
      assets.current[assetKey] = id;
      assets.current.pendingSource = undefined;
      assets.current.result = undefined;
      const preview = String(done.previewUrl);
      setResult(undefined);
      setOptions({ ...defaultOptions, audioMode: options.audioMode, foldEffect: options.foldEffect });
      setMedia({
        id,
        name: file.name,
        size: Number(done.size),
        info: done.info as MediaInfo,
        preview,
        previewStartTime: typeof done.previewStartTime === 'number' ? done.previewStartTime : undefined,
      });
      setStatus('');
    } catch (e) {
      erase(assets.current.pendingSource);
      assets.current.pendingSource = undefined;
      if (!controller.signal.aborted && !(e instanceof DOMException && e.name === 'AbortError')) {
        setError(e instanceof MediaError ? e : new MediaError('error.generic'));
        setStatus('error');
      } else setStatus('');
    } finally {
      setBusy(null);
      active.current = null;
      if (picker.current) picker.current.value = '';
    }
  };
  const render = async () => {
    if (!primaryMedia || busy) return;
    erase(assets.current.result);
    assets.current.result = undefined;
    setResult(undefined);
    setDownloaded(false);
    setError(null);
    setBusy('render');
    setStatus('uploading');
    setProgress(0);
    setElapsed(0);
    const data = new FormData();
    data.append('uploadId', primaryMedia.id);
    for (const [key, value] of Object.entries(primaryOptions)) data.append(key, String(value));
    if (mode === 'dual' && closedMedia && openMedia) {
      data.append('openUploadId', openMedia.id);
      for (const key of ['startTime', 'scale', 'offsetX', 'offsetY'] as const)
        data.append(`open${key[0].toUpperCase()}${key.slice(1)}`, String(clipOptions.open[key]));
    }
    const xhr = new XMLHttpRequest();
    active.current = xhr;
    try {
      const done = await postMultipart('/api/render', data, xhr, onProgress, locale);
      const id = String(done.resultId);
      assets.current.result = id;
      const playUrl = String(done.url);
      setResult({ id, url: String(done.url), playUrl });
      setStatus('complete');
      setProgress(100);
    } catch (e) {
      erase(assets.current.result);
      assets.current.result = undefined;
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        setError(e instanceof MediaError ? e : new MediaError('error.generic'));
        setStatus('error');
      } else setStatus('');
    } finally {
      setBusy(null);
      active.current = null;
    }
  };
  const edit = () => {
    erase(assets.current.result);
    assets.current.result = undefined;
    setResult(undefined);
    setStatus('');
  };
  const firstPreview = usePreviewSegment(primaryMedia, primaryOptions.startTime, !busy && !result, setError);
  const secondMedia = mode === 'dual' && closedMedia && openMedia ? openMedia : undefined;
  const secondPreview = usePreviewSegment(
    secondMedia,
    clipOptions.open.startTime,
    !busy && !result,
    setError,
  );
  const waitingPreview = firstPreview.pending
    ? firstPreview
    : secondPreview.pending
      ? secondPreview
      : undefined;
  const disabled = !media || !!busy || !!result;
  const setOption = (key: keyof EditOptions, value: number) =>
    setOptions((previous) => ({ ...previous, [key]: value }));
  return (
    <div className="app-shell">
      <header className="site-header">
        <a href={`/?lang=${locale}`} className="brand" aria-label={brandName}>
          <img src="/brand/mark.svg" alt="" width={48} height={48} />
          <h1>
            <span>You, in</span> <strong>iPhoneDuo</strong>
          </h1>
        </a>
        <div className="header-actions">
          <label className="language-picker">
            <span className="sr-only">{t('language')}</span>
            <select value={locale} onChange={(e) => changeLanguage(e.target.value as typeof locale)}>
              {locales.map((code) => (
                <option key={code} value={code} lang={code}>
                  {languageNames[code]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>
      <main>
        <div className="editor-layout">
          <section className="workspace" aria-label={t('workspace')}>
            <div className={`preview-card${result ? ' result-card' : ''}`}>
              {!result && (
                <div className="section-title">
                  <h2>
                    <StepIcon number={1} />
                    {t('previewTitle')}
                  </h2>
                </div>
              )}
              <div className="video-stage" aria-busy={!!busy}>
                {result ? (
                  <ResultPlayer url={result.playUrl} onError={reportError} />
                ) : !primaryMedia ? (
                  <DemoPreview />
                ) : template ? (
                  <Preview
                    template={template}
                    source={firstPreview.url}
                    localTimeline={firstPreview.local}
                    pendingLabel={waitingPreview?.label}
                    previewFailed={waitingPreview?.failed}
                    onPreviewRetry={waitingPreview?.retry}
                    media={primaryMedia.info}
                    options={primaryOptions}
                    onChange={(value) =>
                      updateClipOptions(mode === 'single' ? clip : closedMedia ? 'closed' : 'open', value)
                    }
                    second={
                      secondMedia && secondPreview.url
                        ? {
                            source: secondPreview.url,
                            media: secondMedia.info,
                            options: clipOptions.open,
                            localTimeline: secondPreview.local,
                          }
                        : undefined
                    }
                    onSecondChange={(value) => updateClipOptions('open', value)}
                    editSide={secondMedia ? clip : 'closed'}
                    disabled={!!busy}
                    onError={reportError}
                  />
                ) : (
                  <div className="template-loading">
                    <LoaderCircle className="spin" />
                    {t('loadingTemplate')}
                  </div>
                )}
                {busy && <VideoLoader label={stage(status)} />}
              </div>
            </div>
            <div className="import-card">
              <div className="section-title">
                <h2>
                  <StepIcon number={2} />
                  {t('importTitle')}
                </h2>
                <span className="subtle">MP4 / MOV / WebM</span>
              </div>
              <div className="mode-picker" role="group" aria-label={t('modeSelect')}>
                {(['single', 'dual'] as const).map((value) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={mode === value}
                    disabled={!!busy}
                    onClick={() => {
                      setMode(value);
                      edit();
                    }}
                  >
                    {t(value === 'single' ? 'modeSingle' : 'modeDual')}
                  </button>
                ))}
              </div>
              <input
                ref={picker}
                type="file"
                accept=".mp4,.mov,.webm,.m4v,video/mp4,video/quicktime,video/webm"
                aria-label={t('chooseFile')}
                className="file-input"
                onChange={(e) => void importFile(e.target.files?.[0])}
                disabled={!!busy || !template}
              />
              {mode === 'dual' && (
                <div className="clip-picker" role="group" aria-label={t('clipSelect')}>
                  {(['closed', 'open'] as const).map((side) => (
                    <button
                      type="button"
                      key={side}
                      aria-pressed={clip === side}
                      disabled={!!busy}
                      onClick={() => {
                        setClip(side);
                        if (!(side === 'closed' ? closedMedia : openMedia)) picker.current?.click();
                      }}
                    >
                      <svg className="phone-outline" viewBox="0 0 48 44" fill="none" aria-hidden="true">
                        <rect
                          x={side === 'closed' ? 14 : 4}
                          y="3"
                          width={side === 'closed' ? 20 : 40}
                          height="38"
                          rx="5"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        />
                        {side === 'open' && (
                          <path d="M24 5v34" stroke="currentColor" strokeWidth="1" opacity=".4" />
                        )}
                      </svg>
                      <strong>{t(side === 'closed' ? 'clipClosed' : 'clipOpen')}</strong>
                      <span>{(side === 'closed' ? closedMedia : openMedia)?.name || t('clipEmpty')}</span>
                    </button>
                  ))}
                </div>
              )}
              <p className="subtle mode-help">
                {mode === 'dual'
                  ? t('clipHint', { size: Math.round(limit / 1024 ** 2) })
                  : t('fileLimits', { size: Math.round(limit / 1024 ** 2) })}
              </p>
              <button
                type="button"
                className={`dropzone ${mode === 'dual' ? 'source-details' : ''} ${dragging ? 'dragging' : ''} ${media ? 'has-file' : ''}`}
                disabled={!!busy || !template}
                onClick={() => picker.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!busy) setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  void importFile(e.dataTransfer.files[0]);
                }}
              >
                <span className="upload-icon">
                  {busy === 'upload' ? (
                    <LoaderCircle className="spin" size={23} />
                  ) : media ? (
                    <Film size={23} />
                  ) : (
                    <Upload size={23} />
                  )}
                </span>
                <span className="drop-copy">
                  <strong>
                    {busy === 'upload'
                      ? filename
                      : mode === 'dual'
                        ? media
                          ? t('replace')
                          : t('chooseFile')
                        : media
                          ? media.name
                          : t('drop')}
                  </strong>
                  <span>
                    {media
                      ? `${media.info.duration.toFixed(2)} ${t('seconds')} · ${media.info.width} × ${media.info.height} · ${(media.size / 1024 ** 2).toFixed(1)} MB`
                      : ''}
                  </span>
                </span>
                {media ? (
                  <span className="replace-label">
                    {t('replace')}
                    <ArrowUpRight size={15} />
                  </span>
                ) : (
                  <span className="upload-plus">+</span>
                )}
              </button>
              {media && (
                <button
                  type="button"
                  className="text-button"
                  disabled={!!busy}
                  onClick={() => {
                    erase(assets.current[clip === 'closed' ? 'source' : 'openSource']);
                    assets.current[clip === 'closed' ? 'source' : 'openSource'] = undefined;
                    setMedia(undefined);
                    edit();
                  }}
                >
                  {t('clipRemove')}
                </button>
              )}
            </div>
          </section>
          <aside className="controls-card" aria-label={t('controls')}>
            <div className="section-title">
              <h2>
                <StepIcon number={3} />
                {t('controlsTitle')}
              </h2>
            </div>
            <p className="subtle">
              {t(mode === 'single' ? 'modeSingle' : clip === 'closed' ? 'clipClosed' : 'clipOpen')}
            </p>
            <fieldset disabled={disabled}>
              <div className="control-group">
                <div className="control-label">
                  <label htmlFor="start-time">{t('startTime')}</label>
                  <div className="number-with-unit">
                    <input
                      id="start-time"
                      type="number"
                      min="0"
                      max={Math.max(0, (media?.info.duration || 0) - 0.05)}
                      step="0.05"
                      value={Number(options.startTime.toFixed(2))}
                      onChange={(e) =>
                        setOption(
                          'startTime',
                          Math.max(
                            0,
                            Math.min(Number(e.target.value), (media?.info.duration || 0.05) - 0.05),
                          ),
                        )
                      }
                    />
                    <span>{t('seconds')}</span>
                  </div>
                </div>
                <input
                  aria-label={t('startSlider')}
                  type="range"
                  min="0"
                  max={Math.max(0, (media?.info.duration || 0) - 0.05)}
                  step="0.05"
                  value={options.startTime}
                  onChange={(e) => setOption('startTime', Number(e.target.value))}
                />
                <p>{t('startHelp')}</p>
              </div>
              <div className="control-group">
                <div className="control-label">
                  <label htmlFor="scale">{t('scale')}</label>
                  <output>
                    {Math.round(options.scale * 100)}
                    <span>%</span>
                  </output>
                </div>
                <input
                  id="scale"
                  type="range"
                  min="1"
                  max="3"
                  step="0.01"
                  value={options.scale}
                  onChange={(e) => setOption('scale', Number(e.target.value))}
                />
                <div className="range-labels">
                  <span>{t('cover')}</span>
                  <span>{t('triple')}</span>
                </div>
              </div>
              <div className="position-controls">
                <div className="control-group">
                  <div className="control-label">
                    <label htmlFor="offset-x">{t('horizontal')}</label>
                    <output>{Math.round(options.offsetX * 100)}</output>
                  </div>
                  <input
                    id="offset-x"
                    type="range"
                    min="-1"
                    max="1"
                    step="0.01"
                    value={options.offsetX}
                    onChange={(e) => setOption('offsetX', Number(e.target.value))}
                  />
                </div>
                <div className="control-group">
                  <div className="control-label">
                    <label htmlFor="offset-y">{t('vertical')}</label>
                    <output>{Math.round(options.offsetY * 100)}</output>
                  </div>
                  <input
                    id="offset-y"
                    type="range"
                    min="-1"
                    max="1"
                    step="0.01"
                    value={options.offsetY}
                    onChange={(e) => setOption('offsetY', Number(e.target.value))}
                  />
                </div>
              </div>
              <button
                type="button"
                className="reset-button"
                onClick={() => setOptions((o) => ({ ...o, scale: 1, offsetX: 0, offsetY: 0 }))}
              >
                <RotateCcw size={14} />
                {t('reset')}
              </button>
              <label className="fold-toggle">
                <span>{t('foldEffect')}</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={options.foldEffect === 'on'}
                  onChange={(e) => setOptions((o) => ({ ...o, foldEffect: e.target.checked ? 'on' : 'off' }))}
                />
              </label>
              <div className="audio-group">
                <div className="control-label">
                  <span>{t('sound')}</span>
                  <Volume2 size={15} />
                </div>
                <div className="audio-options" role="radiogroup" aria-label={t('audioOptions')}>
                  {(
                    [
                      { value: 'template', label: t('templateAudio') },
                      { value: 'user', label: t('userAudio') },
                      { value: 'mute', label: t('mute') },
                    ] as const
                  ).map((item) => (
                    <label key={item.value} className={options.audioMode === item.value ? 'selected' : ''}>
                      <input
                        type="radio"
                        name="audioMode"
                        value={item.value}
                        checked={options.audioMode === item.value}
                        onChange={() => setOptions((o) => ({ ...o, audioMode: item.value }))}
                      />
                      {item.value === 'mute' && <VolumeX size={13} />}
                      {item.label}
                    </label>
                  ))}
                </div>
                {options.audioMode === 'user' &&
                  primaryMedia &&
                  !primaryMedia.info.hasAudio &&
                  !secondMedia?.info.hasAudio && <p>{t('noAudio')}</p>}
              </div>
            </fieldset>
            <div className="export-area">
              <div className="export-info">
                <span>{t('export')}</span>
                <strong>
                  1080p<span> / </span>
                  {template?.duration.toFixed(2) || '5.82'} {t('seconds')}
                </strong>
              </div>
            </div>
          </aside>
        </div>
        {error && (
          <ErrorBanner
            message={t(error.code, error.params)}
            onDismiss={() => setError(null)}
            onRetry={!template ? loadTemplate : undefined}
          />
        )}
      </main>
      <div className="action-rail" role="group" aria-label={t('actions')} data-testid="action-rail">
        {result && (
          <button
            type="button"
            className="rail-button"
            onClick={edit}
            aria-label={t('editAgain')}
            title={t('editAgain')}
          >
            <Pencil size={22} aria-hidden="true" />
            <span>{t('actionEdit')}</span>
          </button>
        )}
        {(busy || (waitingPreview && !waitingPreview.failed)) && (
          <button
            type="button"
            className={`rail-button${busy ? '' : ' preview-cancel'}`}
            onClick={() => (busy ? active.current?.abort() : waitingPreview?.cancel())}
            aria-label={t('cancel')}
            title={t('cancel')}
          >
            <X size={22} aria-hidden="true" />
            <span>{t('actionCancel')}</span>
          </button>
        )}
        {result ? (
          <>
            <a
              className="rail-button rail-primary"
              href={`${result.url}&download=1`}
              download="phone-meme.mp4"
              onClick={() => setDownloaded(true)}
              aria-label={downloaded ? t('downloadAgain') : t('download')}
              title={t('download')}
            >
              <Download size={22} aria-hidden="true" />
              <span>{t('actionDownload')}</span>
            </a>
            <SharePanel key={result.id} url={result.url} />
          </>
        ) : (
          <button
            type="button"
            className="rail-button rail-primary"
            disabled={!primaryMedia || !!busy || !template}
            onClick={() => void render()}
            aria-label={busy ? stage(status) : t('render')}
            title={busy ? stage(status) : t('render')}
          >
            {busy ? (
              <LoaderCircle size={22} className="spin" aria-hidden="true" />
            ) : (
              <Clapperboard size={22} aria-hidden="true" />
            )}
            <span>{busy ? (status === 'queued' ? stage(status) : `${progress}%`) : t('actionRender')}</span>
          </button>
        )}
        {busy && (
          <div className="progress-region" role="status" aria-live="polite">
            <div>
              <span>{stage(status)}…</span>
              {status !== 'queued' && <span>{progress}%</span>}
            </div>
            <progress
              max="100"
              value={status === 'queued' ? undefined : progress}
              aria-label={t('progress')}
            />
            <p className="progress-bottom">{t('elapsed', { seconds: elapsed })}</p>
          </div>
        )}
      </div>
      <footer>
        <p className="source-credit">
          <span>{t('source')}:</span>
          <a
            href={templateSource.url}
            target="_blank"
            rel="noopener noreferrer"
            title={t('sourceLink')}
            data-testid="template-source"
          >
            {templateSource.name}
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </p>
        <p className="privacy-note">
          <ShieldCheck size={15} />
          {t('privacy')}
        </p>

        <a href={repositoryUrl} target="_blank" rel="noopener noreferrer" className="repository-link">
          <CodeXml size={16} aria-hidden="true" /> GitHub <span>{t('sourceCode')}</span>
          <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      </footer>
    </div>
  );
}
