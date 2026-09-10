import { LoaderCircle } from 'lucide-react';

export default function VideoLoader({ label }: { label: string }) {
  return (
    <div className="video-loader" role="status" aria-live="polite">
      <LoaderCircle size={26} className="spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
