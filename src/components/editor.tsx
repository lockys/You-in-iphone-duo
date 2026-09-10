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
import ResultPlayer from './result-player';
import Link from 'next/link';
import Image from 'next/image';
import SharePanel from './share-panel';
import { brandName, repositoryUrl } from '@/lib/brand';
import { useLanguage } from './language-provider';
import { languageNames, locales, templateSource, type ErrorCode, type MessageKey } from '@/lib/i18n';
import { MediaError, errorFromResponse } from '@/lib/errors';
import {
  defaultOptions,
  validateFile,
  type EditOptions,
  type MediaInfo,
  type Template,
} from '@/lib/composition';
import { postMultipart, type ProgressEvent } from '@/lib/client-upload';

type Imported = { id: string; name: string; size: number; info: MediaInfo; preview: string };
type Result = { id: string; url: string; playUrl: string };
const stageKeys: Record<string, MessageKey> = {
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
  const stage = (status: string) => t(stageKeys[status] || 'working');
  const [template, setTemplate] = useState<Template>();
  const [limit, setLimit] = useState(200 * 1024 ** 2);
  const [media, setMedia] = useState<Imported>();
  const [result, setResult] = useState<Result>();
  const [options, setOptions] = useState<EditOptions>(defaultOptions);
  const [busy, setBusy] = useState<'upload' | 'render' | null>(null);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<MediaError | null>(null);
  const [dragging, setDragging] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [filename, setFilename] = useState('');
  const [downloaded, setDownloaded] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const active = useRef<XMLHttpRequest | null>(null);
  const assets = useRef<{ source?: string; result?: string }>({});
  const reportError = useCallback((code: ErrorCode) => setError(new MediaError(code)), []);
  const loadTemplate = useCallback(() => {
    void fetch('/api/template')
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw errorFromResponse(data);
        setError(null);
        setTemplate(data.template);
        setLimit(data.maxBytes);
      })
      .catch((e) => setError(e instanceof MediaError ? e : new MediaError('error.network')));
  }, []);
  useEffect(() => {
    loadTemplate();
    return () => {
      active.current?.abort();
      erase(assets.current.source);
      erase(assets.current.result);
    };
  }, [loadTemplate]);
  useEffect(() => {
    const close = (event: PageTransitionEvent) => {
      if (event.persisted) return;
      active.current?.abort();
      erase(assets.current.source);
      erase(assets.current.result);
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
    }
  };
  const importFile = async (file?: File) => {
    if (!file || busy) return;
    try {
      validateFile(file.name, file.type || 'application/octet-stream', file.size, limit);
    } catch (e) {
      setError(e instanceof MediaError ? e : new MediaError('error.generic'));
      return;
    }
    erase(assets.current.source);
    erase(assets.current.result);
    assets.current = {};
    setMedia(undefined);
    setResult(undefined);
    setError(null);
    setBusy('upload');
    setStatus('uploading');
    setProgress(0);
    setElapsed(0);
    setFilename(file.name);
    setOptions(defaultOptions);
    const xhr = new XMLHttpRequest();
    active.current = xhr;
    const data = new FormData();
    data.append('file', file);
    try {
      const done = await postMultipart('/api/upload', data, xhr, onProgress, locale);
      const id = String(done.uploadId);
      assets.current.source = id;
      const preview = String(done.previewUrl);
      setMedia({ id, name: file.name, size: Number(done.size), info: done.info as MediaInfo, preview });
      setStatus('');
    } catch (e) {
      erase(assets.current.source);
      assets.current = {};
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
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
    if (!media || busy) return;
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
    data.append('uploadId', media.id);
    for (const [key, value] of Object.entries(options)) data.append(key, String(value));
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
  const disabled = !media || !!busy || !!result;
  const setOption = (key: keyof EditOptions, value: number) =>
    setOptions((previous) => ({ ...previous, [key]: value }));
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link href={`/?lang=${locale}`} className="brand" aria-label={brandName}>
          <Image src="/brand/mark.svg" alt="" width={48} height={48} priority />
          <h1>
            <span>You, in</span> <strong>iPhoneDuo</strong>
          </h1>
        </Link>
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
            <div className="import-card">
              <div className="section-title">
                <h2>{t('importTitle')}</h2>
                <span className="subtle">MP4 / MOV / WebM</span>
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
              <button
                type="button"
                className={`dropzone ${dragging ? 'dragging' : ''} ${media ? 'has-file' : ''}`}
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
                  <strong>{busy === 'upload' ? filename : media ? media.name : t('drop')}</strong>
                  <span>
                    {media
                      ? `${media.info.duration.toFixed(2)} ${t('seconds')} · ${media.info.width} × ${media.info.height} · ${(media.size / 1024 ** 2).toFixed(1)} MB`
                      : t('fileLimits', { size: Math.round(limit / 1024 ** 2) })}
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
            </div>
            <div className={`preview-card${result ? ' result-card' : ''}`}>
              {!result && (
                <div className="section-title">
                  <h2>{t('previewTitle')}</h2>
                </div>
              )}
              {result ? (
                <ResultPlayer url={result.playUrl} onError={reportError} />
              ) : template ? (
                <Preview
                  template={template}
                  source={media?.preview}
                  media={media?.info}
                  options={options}
                  onChange={setOptions}
                  disabled={!!busy}
                  onError={reportError}
                />
              ) : (
                <div className="template-loading">
                  <LoaderCircle className="spin" />
                  {t('loadingTemplate')}
                </div>
              )}
            </div>
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
          </section>
          <aside className="controls-card" aria-label={t('controls')}>
            <div className="section-title">
              <h2>{t('controlsTitle')}</h2>
            </div>
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
                {options.audioMode === 'user' && media && !media.info.hasAudio && <p>{t('noAudio')}</p>}
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
          <div className="error-banner" role="alert">
            <div>
              <strong>{status === 'error' ? t('stage.error') : t('attention')}</strong>
              <p>{t(error.code, error.params)}</p>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label={t('closeError')}
              onClick={() => setError(null)}
            >
              <X size={18} />
            </button>
            {!template && (
              <button type="button" onClick={loadTemplate}>
                {t('reload')}
              </button>
            )}
          </div>
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
        {busy && (
          <button
            type="button"
            className="rail-button"
            onClick={() => active.current?.abort()}
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
            disabled={!media || !!busy || !template}
            onClick={() => void render()}
            aria-label={busy ? stage(status) : t('render')}
            title={busy ? stage(status) : t('render')}
          >
            {busy ? (
              <LoaderCircle size={22} className="spin" aria-hidden="true" />
            ) : (
              <Clapperboard size={22} aria-hidden="true" />
            )}
            <span>{busy ? `${progress}%` : t('actionRender')}</span>
          </button>
        )}
        {busy && (
          <div className="progress-region" role="status" aria-live="polite">
            <div>
              <span>{stage(status)}…</span>
              <span>{progress}%</span>
            </div>
            <progress max="100" value={progress} aria-label={t('progress')} />
            <p className="progress-bottom">{t('elapsed', { seconds: elapsed })}</p>
          </div>
        )}
      </div>
      <footer>
        <a href={repositoryUrl} target="_blank" rel="noopener noreferrer" className="repository-link">
          <CodeXml size={16} aria-hidden="true" /> GitHub <span>{t('sourceCode')}</span>
          <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      </footer>
    </div>
  );
}
