import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { getTimeGreeting } from '@/lib/greeting';

const AUTO_DISMISS_MS = 6000;

interface Props {
  open: boolean;
  name: string;
  onClose: () => void;
}

export function LoginGreetingDialog({ open, name, onClose }: Props) {
  const [progress, setProgress] = useState(100);
  const startedAt = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    startedAt.current = performance.now();
    setProgress(100);

    const tick = () => {
      const elapsed = performance.now() - startedAt.current;
      const pct = Math.max(0, 100 - (elapsed / AUTO_DISMISS_MS) * 100);
      setProgress(pct);
      if (elapsed < AUTO_DISMISS_MS) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    timeoutRef.current = window.setTimeout(() => onClose(), AUTO_DISMISS_MS);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [open, onClose]);

  const greeting = getTimeGreeting();
  const headline = name ? `${greeting}, ${name}.` : `${greeting}.`;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <div className="px-8 pt-10 pb-8 text-center space-y-3">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            {headline}
          </h2>
          <p className="text-base text-muted-foreground leading-relaxed">
            Welcome to SHAW Tower Project Completion Management System.
          </p>
          <p className="text-sm text-muted-foreground/80 pt-1">
            Have a productive day.
          </p>
        </div>
        <div className="h-1 w-full bg-muted">
          <div
            className="h-full bg-primary transition-[width] duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
