/**
 * BuildInfoChip — 헤더에 표시되는 "New Version" 강제 새로고침 버튼.
 *
 * - 라벨: "New Version"
 * - 클릭 시: 버전 비교 없이 즉시 cache-bust URL 로 hard reload
 *
 * 빌드 ID 가 비어있거나 placeholder/dev 값인 경우 렌더링하지 않음.
 */
export function BuildInfoChip() {
  const buildId = typeof __APP_BUILD_ID__ === 'string' ? __APP_BUILD_ID__ : '';

  // dev / placeholder / empty 값 가드
  if (!buildId || buildId.startsWith('__') || buildId === 'development') {
    return null;
  }

  function handleForceReload() {
    window.location.replace(
      window.location.pathname + '?__reset=' + Date.now()
    );
  }

  return (
    <div className="print:hidden">
      <button
        type="button"
        onClick={handleForceReload}
        aria-label="New Version - 강제 새로고침"
        className="rounded-full border border-border/50 bg-background/70 px-2.5 py-1 text-xs font-medium text-muted-foreground/80 shadow-sm backdrop-blur-sm transition hover:bg-background hover:text-foreground"
      >
        New Version
      </button>
    </div>
  );
}

export default BuildInfoChip;
