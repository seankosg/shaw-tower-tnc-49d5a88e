import { useNavigate } from 'react-router-dom';
import { Construction, Clock, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { ModuleStatus } from '@/contexts/ModuleStatusContext';
import { useModuleStatus } from '@/contexts/ModuleStatusContext';

interface Props {
  module: 'tnc' | 'defect' | 'docs';
  status: ModuleStatus;
}

const MODULE_LABEL: Record<'tnc' | 'defect' | 'docs', string> = {
  tnc: 'T&C',
  defect: 'Defect',
  docs: 'Docs',
};

function formatDateTime(iso?: string) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
      hour12: false,
    });
  } catch {
    return null;
  }
}

export function ModulePausedScreen({ module, status }: Props) {
  const navigate = useNavigate();
  const { tnc, defect } = useModuleStatus();
  const label = MODULE_LABEL[module];
  const display = status.message?.trim() || status.reason?.trim() || '관리자에 의해 일시 중단되었습니다.';
  const pausedAt = formatDateTime(status.pausedAt);
  const resumeAt = formatDateTime(status.expectedResumeAt);

  // Pick another active module to suggest
  const otherActive = module === 'tnc' && defect.enabled
    ? { path: '/defects/dashboard', label: 'Defect Dashboard' }
    : module === 'defect' && tnc.enabled
      ? { path: '/tc/dashboard', label: 'T&C Dashboard' }
      : null;

  return (
    <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center p-6">
      <Card className="w-full max-w-xl border-amber-300/60 bg-gradient-to-br from-amber-50 to-orange-50 dark:border-amber-800/60 dark:from-amber-950/40 dark:to-orange-950/40">
        <CardContent className="space-y-6 p-8">
          <div className="flex flex-col items-center text-center">
            <div className="mb-4 rounded-full bg-amber-100 p-4 dark:bg-amber-900/50">
              <Construction className="h-10 w-10 text-amber-700 dark:text-amber-300" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {label} 모듈 일시 중단 중
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              관리자에 의해 점검 또는 검증을 위해 잠시 중단되었습니다.<br />
              데이터는 안전하게 보존되어 있습니다.
            </p>
          </div>

          <div className="rounded-lg border border-amber-200/70 bg-background/60 p-4 dark:border-amber-800/40">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">사유 / 안내</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{display}</p>
          </div>

          {(pausedAt || resumeAt || status.pausedByName) && (
            <dl className="grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-2">
              {pausedAt && (
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  <span>중단 시작: <span className="font-medium text-foreground">{pausedAt}</span></span>
                </div>
              )}
              {resumeAt && (
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  <span>예상 재개: <span className="font-medium text-foreground">{resumeAt}</span></span>
                </div>
              )}
              {status.pausedByName && (
                <div className="sm:col-span-2">
                  중단 처리자: <span className="font-medium text-foreground">{status.pausedByName}</span>
                </div>
              )}
            </dl>
          )}

          {otherActive && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" onClick={() => navigate(otherActive.path)}>
                {otherActive.label}로 이동
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
