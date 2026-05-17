## 목표

`src/lib/ppt-builder.ts`(1,449줄 완전판)를 Supabase Storage의 `code-files` 버킷에 **즉시 동기화**하고, 앞으로도 한 번의 클릭으로 Storage를 codebase 기준으로 맞출 수 있도록 **"Sync from codebase" 버튼**을 추가합니다.

## 구현 방식

### 1) Vite raw import로 현재 파일 번들

`src/components/admin/CodeEditor.tsx` 상단에:

```ts
// Vite ?raw — 빌드 시점의 src/lib/ppt-builder.ts 원문이 문자열로 번들됨
import pptBuilderSource from '@/lib/ppt-builder.ts?raw';
```

→ Lovable가 새 코드를 배포할 때마다 `pptBuilderSource`가 자동으로 최신 1,449줄(또는 그 이상) 원문을 담게 되므로 항상 codebase = 버튼이 푸시할 내용.

### 2) "Sync from codebase" 버튼 추가

위치: "Current Version" 섹션 안 (Download current 버튼 옆).

```tsx
const [syncing, setSyncing] = useState(false);

const handleSyncFromCodebase = async () => {
  if (!confirm(`Codebase의 ${FILE_NAME} (${pptBuilderSource.split('\n').length}줄)을 Storage에 새 활성 버전으로 저장합니다. 진행할까요?`)) return;
  setSyncing(true);
  try {
    await saveCodeVersion({
      fileName: FILE_NAME,
      content: pptBuilderSource,
      changeSummaryKo: 'Codebase에서 동기화 (Sync from codebase)',
      instruction: 'Sync from src/lib/ppt-builder.ts via UI button',
    });
    toast({ title: 'Synced from codebase', description: `${pptBuilderSource.split('\n').length} lines uploaded as new active version` });
    await refresh();
  } catch (e) {
    toast({ title: 'Sync failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
  } finally {
    setSyncing(false);
  }
};
```

버튼 (Refresh icon은 기존 import에 있는 `RotateCcw` 재사용):

```tsx
<Button size="sm" variant="default" onClick={handleSyncFromCodebase} disabled={syncing}>
  {syncing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1 h-3.5 w-3.5" />}
  Sync from codebase
</Button>
```

helper 텍스트 한 줄 추가:
> "현재 빌드의 `src/lib/ppt-builder.ts`(N줄)을 Storage에 새 active 버전으로 푸시합니다. 잘린 파일이 들어갔을 때 복구용."

### 3) 즉시 1회 동기화 (이번 턴에서 실행)

도구 호출 순서:

1. **`supabase--storage_upload`**
   - bucket: `code-files`
   - path: `history/ppt-builder_2026-05-17_07-XX_sync.ts` (현재 시각 기준)
   - file_path: `src/lib/ppt-builder.ts`

2. **마이그레이션** (`supabase--migration`)
   ```sql
   update public.code_file_versions
      set is_active = false
    where file_name = 'ppt-builder.ts' and is_active = true;

   insert into public.code_file_versions
     (file_name, storage_path, change_summary_ko, instruction, is_active, uploaded_by)
   values
     ('ppt-builder.ts',
      'history/ppt-builder_2026-05-17_07-XX_sync.ts',
      'Codebase에서 동기화 (1차 강제 sync — 잘린 버전 복구)',
      'Forced sync from src/lib/ppt-builder.ts (1448+ lines)',
      true,
      null);
   ```

3. **확인**: `psql -c "select id, storage_path, is_active, uploaded_at from code_file_versions where file_name='ppt-builder.ts' order by uploaded_at desc limit 3;"` 으로 새 active 행이 들어왔는지 검증.

### 4) 변경하지 않는 것

- `code-editor` edge function (Identify→Modify→Splice 로직)
- `saveCodeVersion`, `downloadActiveCodeFile` 등 `src/lib/code-editor.ts` helper (그대로 재사용)
- Storage 버킷 정책, code_file_versions 테이블 스키마

## 변경 파일

- `src/components/admin/CodeEditor.tsx` — raw import + handleSyncFromCodebase + 버튼 추가
- 신규 마이그레이션 1개 (강제 sync 행 삽입)

## 검증

1. 빌드 통과
2. Admin → Report → Code Editor 에서:
   - "Current Version" 카드에 새 sync 행 표시 ("Codebase에서 동기화…")
   - "Download current" → 다운로드된 파일이 1,448+ 줄, 마지막 줄이 `}` 로 끝나는 완전판인지
   - "Sync from codebase" 다시 눌러도 정상 작동 (새 history 행 추가, 이전 active 자동 비활성)
3. 동일 화면에서 instruction 입력 후 "Modify with Claude" → targetRange가 실제 줄 번호와 일치(예: 1000줄대)하는지로 splice 베이스가 1,449줄임을 간접 확인
