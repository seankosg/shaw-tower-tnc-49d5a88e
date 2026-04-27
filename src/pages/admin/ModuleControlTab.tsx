import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Construction, Loader2, PauseCircle, PlayCircle, Shield } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useModuleStatus, type ModuleStatus } from '@/contexts/ModuleStatusContext';
import { useToast } from '@/hooks/use-toast';
import { PasswordReverifyDialog } from '@/components/admin/PasswordReverifyDialog';
import { FinalConfirmDialog } from '@/components/admin/FinalConfirmDialog';

const LABEL = { tnc: 'T&C', defect: 'Defect' } as const;

function formatDateTime(iso?: string) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  } catch {
    return '—';
  }
}

type PauseFormData = { reason: string; message: string; expectedResumeAt: string };

function PauseDialog({
  module, open, onOpenChange, onConfirm,
}: {
  module: 'tnc' | 'defect';
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (data: PauseFormData) => void;
}) {
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [expectedResumeAt, setExpectedResumeAt] = useState('');

  const reset = () => { setReason(''); setMessage(''); setExpectedResumeAt(''); };

  const handleConfirm = () => {
    if (!reason.trim()) return;
    onConfirm({ reason: reason.trim(), message: message.trim(), expectedResumeAt });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PauseCircle className="h-5 w-5 text-amber-600" />
            {LABEL[module]} 모듈 일시 중단
          </DialogTitle>
          <DialogDescription>
            중단 중에는 <span className="font-semibold">관리자(admin)를 제외한 모든 사용자(Superuser 포함)</span>가
            이 모듈에 접근할 수 없게 됩니다. 데이터는 그대로 보존되며 언제든 재개할 수 있습니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="reason">
              사유 메모 <span className="text-destructive">*</span>
              <span className="ml-2 text-xs font-normal text-muted-foreground">(내부용 — 관리자만 봄)</span>
            </Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="예: 월말 데이터 검증, 11월 정기 점검, 데이터 정정 중"
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="message">
              사용자 공지 메시지
              <span className="ml-2 text-xs font-normal text-muted-foreground">(선택 — 비우면 사유가 표시됨)</span>
            </Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="사용자에게 안내할 메시지를 입력하세요."
              rows={3}
              maxLength={500}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="resume">예상 재개 일시 (선택)</Label>
            <Input
              id="resume"
              type="datetime-local"
              value={expectedResumeAt}
              onChange={(e) => setExpectedResumeAt(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button
            onClick={handleConfirm}
            disabled={!reason.trim()}
            className="bg-amber-600 text-white hover:bg-amber-700"
          >
            다음 (보안 확인)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type PendingAction =
  | { type: 'pause'; data: PauseFormData }
  | { type: 'resume' }
  | null;

function ModuleRow({ module }: { module: 'tnc' | 'defect' }) {
  const { tnc, defect, setStatus } = useModuleStatus();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const status: ModuleStatus = module === 'tnc' ? tnc : defect;

  const [pauseFormOpen, setPauseFormOpen] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [finalOpen, setFinalOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const moduleLabel = LABEL[module];

  const resetFlow = () => {
    setPending(null);
    setPasswordOpen(false);
    setFinalOpen(false);
  };

  const requestPause = () => setPauseFormOpen(true);
  const requestResume = () => {
    setPending({ type: 'resume' });
    setPasswordOpen(true);
  };

  const onPauseFormConfirm = (data: PauseFormData) => {
    setPending({ type: 'pause', data });
    setPasswordOpen(true);
  };

  const onPasswordVerified = () => {
    setPasswordOpen(false);
    setFinalOpen(true);
  };

  const onFinalConfirm = async () => {
    if (!pending) return;
    setBusy(true);
    let result: { error: Error | null };
    if (pending.type === 'pause') {
      const newStatus: ModuleStatus = {
        enabled: false,
        reason: pending.data.reason,
        message: pending.data.message || undefined,
        expectedResumeAt: pending.data.expectedResumeAt
          ? new Date(pending.data.expectedResumeAt).toISOString()
          : undefined,
        pausedAt: new Date().toISOString(),
        pausedByUserId: user?.id,
        pausedByName: profile?.name || profile?.login_id || undefined,
      };
      result = await setStatus(module, newStatus);
      setBusy(false);
      if (result.error) {
        toast({ title: '중단 실패', description: result.error.message, variant: 'destructive' });
      } else {
        toast({ title: `${moduleLabel} 모듈 일시 중단됨`, description: pending.data.reason });
      }
    } else {
      result = await setStatus(module, { enabled: true });
      setBusy(false);
      if (result.error) {
        toast({ title: '재개 실패', description: result.error.message, variant: 'destructive' });
      } else {
        toast({ title: `${moduleLabel} 모듈 재개됨` });
      }
    }
    resetFlow();
  };

  const actionLabel = pending?.type === 'pause' ? '일시 중단' : '재개';

  return (
    <div className={`rounded-lg border p-4 transition-colors ${
      !status.enabled
        ? 'border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/20'
        : 'border-border bg-card'
    }`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">{moduleLabel} Module</h3>
            {status.enabled ? (
              <Badge variant="outline" className="border-green-400 bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300">
                Active
              </Badge>
            ) : (
              <Badge variant="outline" className="border-amber-400 bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                Paused
              </Badge>
            )}
          </div>
          {!status.enabled && (
            <dl className="mt-3 grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-2">
              {status.reason && (
                <div className="sm:col-span-2">
                  <dt className="inline text-muted-foreground">사유: </dt>
                  <dd className="inline font-medium text-foreground">{status.reason}</dd>
                </div>
              )}
              {status.message && (
                <div className="sm:col-span-2">
                  <dt className="inline text-muted-foreground">공지: </dt>
                  <dd className="inline whitespace-pre-wrap text-foreground">{status.message}</dd>
                </div>
              )}
              <div>
                <dt className="inline text-muted-foreground">중단 시각: </dt>
                <dd className="inline text-foreground">{formatDateTime(status.pausedAt)}</dd>
              </div>
              <div>
                <dt className="inline text-muted-foreground">중단 처리자: </dt>
                <dd className="inline text-foreground">{status.pausedByName || '—'}</dd>
              </div>
              {status.expectedResumeAt && (
                <div className="sm:col-span-2">
                  <dt className="inline text-muted-foreground">예상 재개: </dt>
                  <dd className="inline font-medium text-foreground">{formatDateTime(status.expectedResumeAt)}</dd>
                </div>
              )}
            </dl>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Switch
            checked={status.enabled}
            onCheckedChange={(checked) => {
              if (checked) requestResume();
              else requestPause();
            }}
            disabled={busy}
          />
          {!status.enabled && (
            <Button
              size="sm"
              variant="outline"
              onClick={requestResume}
              disabled={busy}
            >
              <PlayCircle className="mr-1 h-3.5 w-3.5" />
              재개
            </Button>
          )}
        </div>
      </div>

      <PauseDialog
        module={module}
        open={pauseFormOpen}
        onOpenChange={setPauseFormOpen}
        onConfirm={onPauseFormConfirm}
      />

      <PasswordReverifyDialog
        open={passwordOpen}
        onOpenChange={(v) => {
          setPasswordOpen(v);
          if (!v && !finalOpen) setPending(null);
        }}
        actionLabel={actionLabel}
        moduleLabel={moduleLabel}
        onVerified={onPasswordVerified}
      />

      <FinalConfirmDialog
        open={finalOpen}
        onOpenChange={(v) => {
          setFinalOpen(v);
          if (!v) setPending(null);
        }}
        title={`${moduleLabel} 모듈 ${actionLabel}`}
        description={
          pending?.type === 'pause'
            ? `${moduleLabel} 모듈을 일시 중단합니다. 정말 진행하시겠습니까?`
            : `${moduleLabel} 모듈을 재개합니다. 정말 진행하시겠습니까?`
        }
        confirmLabel={actionLabel}
        confirmVariant={pending?.type === 'pause' ? 'warning' : 'default'}
        busy={busy}
        onConfirm={onFinalConfirm}
      />
    </div>
  );
}

export function ModuleControlTab() {
  const { isAdmin } = useAuth();

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
          <Shield className="mb-2 h-10 w-10" />
          <p className="text-sm">모듈 일시 중단 기능은 시스템관리자(admin) 전용입니다.</p>
          <p className="mt-1 text-xs">Superuser는 다른 사용자와 동일하게 중단된 모듈에 접근할 수 없습니다.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Construction className="h-5 w-5 text-amber-600" />
          Module Control — 시스템 일시 중단
        </CardTitle>
        <CardDescription>
          시스템 점검, 데이터 검증, 정무적 사유 등으로 T&amp;C 또는 Defect 모듈을 일시 중단할 수 있습니다.
          중단 중에도 데이터는 그대로 보존되며, 관리자만 페이지에 접근할 수 있어 검증·복구가 가능합니다.
          상태 변경 시에는 보안을 위해 비밀번호 재확인과 최종 확인이 필요합니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ModuleRow module="tnc" />
        <ModuleRow module="defect" />
      </CardContent>
    </Card>
  );
}
