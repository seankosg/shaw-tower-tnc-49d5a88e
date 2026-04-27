import { useEffect, useState } from 'react';
import { Lock, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** "일시 중단" / "재개" 등 사용자에게 보일 액션 라벨 */
  actionLabel: string;
  /** "T&C" / "Defect" 등 모듈 라벨 */
  moduleLabel: string;
  onVerified: () => void;
}

export function PasswordReverifyDialog({
  open, onOpenChange, actionLabel, moduleLabel, onVerified,
}: Props) {
  const { user } = useAuth();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPassword('');
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  const verify = async () => {
    if (!password || !user?.email) return;
    setSubmitting(true);
    setError(null);
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password,
    });
    setSubmitting(false);
    if (signInErr) {
      setError('비밀번호가 일치하지 않습니다.');
      setPassword('');
      return;
    }
    setPassword('');
    onVerified();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void verify();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-amber-600" />
            보안 확인 필요
          </DialogTitle>
          <DialogDescription>
            <span className="font-semibold">{moduleLabel}</span> 모듈을{' '}
            <span className="font-semibold">{actionLabel}</span>하기 위해
            관리자 비밀번호를 다시 입력해 주세요.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="reverify-password">비밀번호</Label>
            <Input
              id="reverify-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
              disabled={submitting}
            />
            {error && (
              <p className="text-xs font-medium text-destructive">{error}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              취소
            </Button>
            <Button type="submit" disabled={submitting || !password}>
              {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              확인
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
