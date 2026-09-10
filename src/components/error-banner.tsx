'use client';
import { useEffect, useRef } from 'react';
import { CircleAlert, X } from 'lucide-react';
import { useLanguage } from './language-provider';

export default function ErrorBanner({
  message,
  onDismiss,
  onRetry,
}: {
  message: string;
  onDismiss: () => void;
  onRetry?: () => void;
}) {
  const { t } = useLanguage();
  const notice = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // The top layer also keeps errors visible above the share dialog and PiP.
    notice.current?.showPopover?.();
  }, []);
  return (
    <div ref={notice} className="error-banner" popover="manual" role="alert" aria-atomic="true">
      <CircleAlert size={21} aria-hidden="true" />
      <p>{message}</p>
      {onRetry && (
        <button className="error-retry" type="button" onClick={onRetry}>
          {t('reload')}
        </button>
      )}
      <button type="button" className="icon-button" aria-label={t('closeError')} onClick={onDismiss}>
        <X size={19} aria-hidden="true" />
      </button>
    </div>
  );
}
