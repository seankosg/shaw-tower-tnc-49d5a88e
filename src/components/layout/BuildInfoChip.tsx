import { useState } from 'react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAppVersionCheck } from '@/hooks/useAppVersionCheck';

/**
 * BuildInfoChip — 헤더에 표시되는 빌드 버전 확인 칩.
 *
 * - 트리거: 현재 빌드 ID 끝 6자리 표시
 * - "새 버전 확인": /app-version.json 비교 → 최신이면 toast, 새 빌드면 hard reload
 * - "강제 새로고침": cache-bust URL 로 즉시 hard reload
 *
 * 빌드 ID 가 비어있거나 placeholder/dev 값인 경우 렌더링하지 않음.
 */
export function BuildInfoChip() {
  const { checkVersion } = useAppVersionCheck();
  const [checking, setChecking] = useState(false);

  const buildId = typeof __APP_BUILD_ID__ === 'string' ? __APP_BUILD_ID__ : '';

  // dev / placeholder / empty 값 가드
  if (!buildId || buildId.startsWith('__') || buildId === 'development') {
    return null;
  }

  const shortId = buildId.slice(-6);

  function reloadWithBust(param: string) {
    window.location.replace(
      window.location.pathname + '?' + param + '=' + Date.now()
    );
  }

  async function handleCheck() {
    if (checking) return;
    setChecking(true);
    try {
      const result = await checkVersion();
      if (result === 'latest') {
        toast.success('최신 빌드입니다', { description: `v: ${shortId}` });
      } else if (result === 'update') {
        toast.message('새 빌드 발견 — 업데이트 적용 중…');
        // 토스트가 보이도록 짧게 지연 후 reload
        setTimeout(() => reloadWithBust('__v'), 600);
      } else {
        toast.error('확인 실패 — 네트워크를 확인해주세요');
      }
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="print:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="새 버전 확인"
            className="rounded-full border border-border/50 bg-background/70 px-2.5 py-1 text-xs font-medium text-muted-foreground/80 shadow-sm backdrop-blur-sm transition hover:bg-background hover:text-foreground"
          >
            v {shortId}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="font-mono text-xs break-all">
            build {buildId}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={(e) => {
              e.preventDefault();
              void handleCheck();
            }}
            disabled={checking}
          >
            {checking ? '확인 중…' : '새 버전 확인'}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.preventDefault();
              reloadWithBust('__reset');
            }}
          >
            강제 새로고침
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default BuildInfoChip;
