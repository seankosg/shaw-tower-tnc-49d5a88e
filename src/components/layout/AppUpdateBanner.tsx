import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppVersionCheck } from '@/hooks/useAppVersionCheck';

export function AppUpdateBanner() {
  const { updateAvailable } = useAppVersionCheck();

  if (!updateAvailable) return null;

  return (
    <div className="flex flex-col gap-2 border-b bg-accent px-4 py-3 text-sm text-accent-foreground sm:flex-row sm:items-center sm:justify-between">
      <div className="font-medium">
        새 버전이 배포되었습니다. 작업 중인 내용을 저장한 뒤 새로고침해 주세요.
      </div>
      <Button size="sm" onClick={() => window.location.reload()} className="w-full sm:w-auto">
        <RefreshCw className="h-4 w-4" />
        새로고침
      </Button>
    </div>
  );
}