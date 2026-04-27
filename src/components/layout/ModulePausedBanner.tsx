import { AlertTriangle, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useModuleStatus, type ModuleStatus } from '@/contexts/ModuleStatusContext';
import { useToast } from '@/hooks/use-toast';

const MODULE_LABEL = { tnc: 'T&C', defect: 'Defect' } as const;

function formatDateTime(iso?: string) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleString('ko-KR', {
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
      hour12: false,
    });
  } catch {
    return null;
  }
}

function BannerRow({ module, status }: { module: 'tnc' | 'defect'; status: ModuleStatus }) {
  const { setStatus } = useModuleStatus();
  const { toast } = useToast();
  const [resuming, setResuming] = useState(false);
  const pausedAt = formatDateTime(status.pausedAt);
  const resumeAt = formatDateTime(status.expectedResumeAt);

  const onResume = async () => {
    setResuming(true);
    const { error } = await setStatus(module, { enabled: true });
    setResuming(false);
    if (error) {
      toast({ title: '재개 실패', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `${MODULE_LABEL[module]} 모듈 재개됨` });
    }
  };

  return (
    <div className="flex flex-col gap-1 border-b border-amber-300/60 bg-amber-100/80 px-4 py-2 text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100 sm:flex-row sm:items-center sm:gap-3">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <div className="flex-1 min-w-0 text-xs sm:text-sm">
        <span className="font-semibold">{MODULE_LABEL[module]} 모듈 일시 중단 중</span>
        {status.reason && <span className="ml-2 truncate">사유: <span className="font-medium">{status.reason}</span></span>}
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] opacity-80">
          {pausedAt && <span>시작 {pausedAt}{status.pausedByName ? ` · ${status.pausedByName}` : ''}</span>}
          {resumeAt && <span>예상 재개 {resumeAt}</span>}
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0 border-amber-400 bg-background/80 hover:bg-background"
        onClick={onResume}
        disabled={resuming}
      >
        {resuming ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
        재개
      </Button>
    </div>
  );
}

export function ModulePausedBanner() {
  const { isAdmin } = useAuth();
  const { tnc, defect } = useModuleStatus();
  if (!isAdmin) return null;
  if (tnc.enabled && defect.enabled) return null;
  return (
    <div className="flex flex-col">
      {!tnc.enabled && <BannerRow module="tnc" status={tnc} />}
      {!defect.enabled && <BannerRow module="defect" status={defect} />}
    </div>
  );
}
