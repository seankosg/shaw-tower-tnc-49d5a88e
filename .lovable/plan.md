## 목표

가져오기 시 사용자가 선택하지 않은(제외한) 컬럼은 **DB의 기존 값을 그대로 보존**합니다. 이미 T&C(`ImportContext`)와 Defect(`DefectImportContext`)에 검증된 패턴이 있으므로, 동일한 패턴을 ABD/OMM(`docs-import`) 흐름에 그대로 이식합니다.

## 참고한 기존 패턴 (T&C / Defect)

**Defect (`src/lib/defect-parser.ts`)**
- `parseDefectExcel(file, sheet, excludedHeaders)`가 `excludedFields: Set<string>`(canonical 필드명)을 결과에 포함하여 반환.
- 헤더→canonical 매핑은 `toFieldName()`을 통해 변환, **시스템 필수 필드(`issue_no`)는 제외 대상에서 강제로 빼냄**.

**Defect (`src/contexts/DefectImportContext.tsx`)**
- 파일 상태에 `excludedHeaders: string[]`과 `excludedFields: Set<string>`을 함께 보관.
- 시트 변경 시 `excludedHeaders`와 `excludedFields` 리셋.
- UPDATE 페이로드 빌드 시 `if (excludedFields.has(field)) continue;`로 스킵.
- 별도 `preserveExistingForBlank(row, existing)` 헬퍼: `PRESERVE_BLANK_FIELDS`에 한해 Excel 값이 비어 있고 DB에 값이 있으면 DB 값을 유지.

**T&C (`src/contexts/ImportContext.tsx`)**
- 동일한 `excludedFields: Set<string>` 보관.
- UPDATE 빌드 루프(540~570줄)에서 `[field, val]` 페어를 순회하며 `if (excludedFields?.has(field)) continue;` 후 `resolveValue`로 `undefined` vs 실제값 구분, 실제값일 때만 `updates[field] = ...` 적용.
- 파생 필드 `team`도 별도로 `if (!excludedFields?.has('team') && resolved !== undefined) updates.team = ...` 처리.

## ABD/OMM에 그대로 적용

### 1. 파서: `excludedFields` 반환 (Defect의 `parseDefectExcel`과 동일 형태)

**`src/lib/docs-import-parser.ts` (ABD)**
- `parseDocsExcel`의 결과 타입(`ParseDocsResult`)에 `excludedFields: Set<string>` 추가.
- 헤더 컬럼 순회 중 `col.composite`가 `excludedSet`에 있고 `col.field`가 있으면 `excludedFields.add(col.field)`.
- **시스템 필수 필드(`document_no`)는 강제로 제외에서 빼냄** (Defect의 `issue_no` 처리와 동일).

**`src/lib/docs-omm-import-parser.ts` (OMM)**
- 동일하게 `ParseOmmResult`에 `excludedFields: Set<string>` 추가, 시스템 필수 `sn`은 강제 포함.

(중요: 파생 필드의 폴백/디폴트 로직은 손대지 않음. 워커가 UPDATE 시 `excludedFields`를 보고 해당 키를 페이로드에서 빼면, 파생 결과가 잘못 계산되어도 DB로 흘러가지 않음. T&C/Defect도 동일한 방식 — 파서는 그대로 두고 워커에서 거름.)

### 2. 컨텍스트: 파일 상태에 `excludedFields` 저장 (T&C/Defect와 동일)

**`src/contexts/docs-import/types.ts`**
- `DocsImportFile`에 `excludedFields?: Set<string>` 추가 (이미 `excludedHeaders?: string[]` 존재).
- `WorkerContext` 또는 `upsertWorker`의 호출 시그니처에 `excludedFields: Set<string>` 전달.

**`src/contexts/docs-import/createDocsImportProvider.tsx`**
- `parseAndApply`에서 `parsed.excludedFields`를 파일 상태에 저장 (Defect 라인 336과 동일).
- 시트 변경 시 `excludedHeaders`/`excludedFields` 리셋.
- 워커 호출 시 `excludedFields`를 컨텍스트로 전달.

### 3. 워커: UPDATE 페이로드에서 제외 필드 제거 (T&C 라인 564~570과 동일)

**`src/lib/docs-import-workers.ts`**
- `abdAdapter.upsertWorker`, `ommAdapter.upsertWorker` 모두:
  - 페이로드를 평소처럼 빌드한 뒤, **UPDATE 분기에서만** `excludedFields`의 각 키를 `delete payload[field]`로 제거.
  - INSERT 분기는 그대로 둠 (신규 행에는 보존할 이전 값이 없음).
  - per-row 변경 로그(`buildOutcomeForUpdate`, `OMM_TRACKED_FIELDS` 루프)에서도 `if (excludedFields.has(fname)) continue;` — "applied"/"unchanged" 노이즈 방지 + Defect/T&C와 동일한 감사 동작.
  - `raw_payload`도 UPDATE 시 `{ ...prevRawPayload, ...row.raw_payload }`로 머지 (제외 컬럼의 이전 raw 값 보존). T&C의 `custom_payload` 머지(라인 572~581) 패턴을 그대로 적용.

### 4. UI: 변경 없음

기존 "Select Columns (N/M)" 표시와 검증(`validateDocsHeaders`)은 그대로 사용. 추가 안내가 필요하면 후속 작업.

## 의도적으로 변경하지 않는 것

- 파서의 `?? null`, 디폴트(`'TBA'`), `clearCyclesAfterClosure` 등 파생 로직은 기존 그대로. 워커가 UPDATE 시 제외 키를 제거하므로 DB에는 영향 없음 (T&C/Defect도 동일 전략).
- 매핑된 컬럼의 빈 셀 처리는 현 동작 유지. (Defect만 `PRESERVE_BLANK_FIELDS`라는 별도 화이트리스트가 있고, ABD/OMM은 사용자 요청 범위 밖.)
- 시스템 필수 필드(`document_no`, `sn`) 제외 차단은 `validateDocsHeaders`로 이미 처리됨 + 파서가 한 번 더 보호.

## 검증

1. ABD에서 `revision`, `title`, `remarks` 제외 → 기존 행의 해당 값 유지, 매핑된 컬럼만 갱신.
2. ABD에서 `subcontractor_name` 제외 → 기존 값이 `'TBA'`로 덮어써지지 않음 (워커 단계에서 페이로드에서 제거되므로 파서가 `'TBA'`를 만들어도 무영향).
3. OMM에서 `category` 제외 → DB의 `category`/파생 `team` 모두 유지.
4. INSERT 경로(신규 행) 정상 동작, 제외 컬럼은 `null`로 입력.
5. `raw_payload` 머지로 제외 컬럼의 이전 raw 값 보존.
6. `document_no`/`sn` 제외 시도 시 기존 검증으로 차단됨.
