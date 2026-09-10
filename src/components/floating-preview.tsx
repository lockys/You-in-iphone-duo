'use client';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { GripHorizontal, Maximize2, X } from 'lucide-react';
import { useLanguage } from './language-provider';

type Point = { x: number; y: number };
export default function FloatingPreview({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const { t } = useLanguage();
  const anchor = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null);
  const [outside, setOutside] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [position, setPosition] = useState<Point | null>(null);
  const floating = enabled && outside && !dismissed;

  useEffect(() => {
    if (!anchor.current) return;
    // Observe a placeholder with stable dimensions, never the element that becomes fixed.
    const observer = new IntersectionObserver(
      ([entry]) => {
        // The bottom of the frame can remain visible while the phone itself is already offscreen.
        const visible = entry.isIntersecting && entry.intersectionRatio >= 0.6;
        setOutside(!visible);
        if (visible) setDismissed(false);
      },
      { threshold: [0, 0.6], rootMargin: '-12px 0px -12px 0px' },
    );
    observer.observe(anchor.current);
    return () => observer.disconnect();
  }, []);

  const constrain = (point: Point): Point => {
    const box = surface.current!.getBoundingClientRect();
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft || 0;
    const top = viewport?.offsetTop || 0;
    const right = left + (viewport?.width || innerWidth);
    const bottom = top + (viewport?.height || innerHeight);
    const css = getComputedStyle(surface.current!);
    const inset = (side: string) => Math.max(12, parseFloat(css.getPropertyValue(`--pip-safe-${side}`)) || 0);
    const minX = left + inset('left');
    const minY = top + inset('top');
    const maxX = Math.max(minX, right - inset('right') - box.width);
    const maxY = Math.max(minY, bottom - inset('bottom') - box.height);
    return { x: Math.max(minX, Math.min(maxX, point.x)), y: Math.max(minY, Math.min(maxY, point.y)) };
  };

  useLayoutEffect(() => {
    if (!floating) {
      drag.current = null;
      return;
    }
    const fit = () =>
      setPosition((previous) => {
        const next = constrain(previous || { x: 12, y: 12 });
        return previous?.x === next.x && previous?.y === next.y ? previous : next;
      });
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(surface.current!);
    window.addEventListener('resize', fit);
    window.visualViewport?.addEventListener('resize', fit);
    window.visualViewport?.addEventListener('scroll', fit);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fit);
      window.visualViewport?.removeEventListener('resize', fit);
      window.visualViewport?.removeEventListener('scroll', fit);
    };
  }, [floating]);

  const down = (event: PointerEvent<HTMLDivElement>) => {
    if (!floating || !event.isPrimary || event.button !== 0) return;
    if ((event.target as HTMLElement).closest('button:not(.pip-drag)')) return;
    const box = event.currentTarget.getBoundingClientRect();
    drag.current = { id: event.pointerId, dx: event.clientX - box.left, dy: event.clientY - box.top };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation(); // Moving the window must never change the video's crop.
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.id !== event.pointerId) return;
    setPosition(constrain({ x: event.clientX - drag.current.dx, y: event.clientY - drag.current.dy }));
    event.preventDefault();
    event.stopPropagation();
  };
  const up = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    event.stopPropagation();
  };
  const keyMove = (event: KeyboardEvent<HTMLButtonElement>) => {
    const vector: Record<string, Point> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    };
    const delta = vector[event.key];
    if (!delta) return;
    event.preventDefault();
    const box = surface.current!.getBoundingClientRect();
    const step = event.shiftKey ? 48 : 16;
    setPosition(constrain({ x: box.left + delta.x * step, y: box.top + delta.y * step }));
  };
  const returnToPreview = () => {
    anchor.current?.scrollIntoView({ block: 'center', behavior: 'instant' });
    anchor.current?.parentElement
      ?.querySelector<HTMLButtonElement>('.playback button')
      ?.focus({ preventScroll: true });
  };
  return (
    <div ref={anchor} className="preview-anchor" data-testid="preview-anchor">
      <div
        ref={surface}
        className={`preview-surface${floating ? ' is-floating' : ''}`}
        style={floating ? { left: position?.x ?? 12, top: position?.y ?? 12 } : undefined}
        role={floating ? 'region' : undefined}
        aria-label={floating ? t('pipTitle') : undefined}
        data-testid={floating ? 'floating-preview' : undefined}
        onPointerDownCapture={down}
        onPointerMoveCapture={move}
        onPointerUpCapture={up}
        onPointerCancelCapture={up}
        onLostPointerCapture={up}
      >
        {floating && (
          <div className="pip-header">
            <button
              type="button"
              className="pip-drag"
              onKeyDown={keyMove}
              aria-label={t('pipMove')}
              title={t('pipMove')}
            >
              <GripHorizontal size={15} aria-hidden="true" />
              <span>{t('pipLabel')}</span>
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={returnToPreview}
              aria-label={t('pipReturn')}
              title={t('pipReturn')}
            >
              <Maximize2 size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => setDismissed(true)}
              aria-label={t('pipClose')}
              title={t('pipClose')}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
