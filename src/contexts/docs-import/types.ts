// Shared types for the unified Docs Import hub (ABD + OMM, extensible to Warranty / Spare Part).
import type { PendingFieldLog } from '@/lib/import-field-log';

export type DocsSubModule = 'as_built' | 'omm';

export type DocsFileStatus = 'pending' | 'parsing' | 'ready' | 'processing' | 'done' | 'failed';

export interface DocsRejectSample {
  rawRowNo?: number;
  /** Sub-module key value (Document No for ABD, SN for OMM). */
  key?: string | null;
  reasonCode?: string;
  reasonDetail?: string;
}

export interface DocsImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  rejected: number;
  unmatchedOrgs: number;
  /** OMM only — number of resubmission rows auto-created by the DB trigger. */
  resubmissionsCreated?: number;
  resubmissionsByStage?: { Draft: number; Final: number };
}

export interface DocsImportFile<TRow = unknown> {
  id: string;
  file: File;
  name: string;
  size: number;
  status: DocsFileStatus;
  progress: number;
  /** Reference "today" used for cycle delay calculations. ABD only by default. */
  dataDate?: string;
  error?: string;
  errorCode?: string;
  errorDetails?: string;
  errorHint?: string;
  parsed?: TRow[];
  parsedCount: number;
  sheetNames?: string[];
  selectedSheets?: string[];
  /** Distinct composite header labels detected across selected sheets. */
  availableHeaders?: string[];
  /** First non-empty sample value per detected header — fed to the column-select preview. */
  headerSamples?: Record<string, unknown>;
  /** Map of detected header → structured field name (or null when unmapped). */
  fieldByHeader?: Record<string, string | null>;
  /** Headers the user opted to exclude — passed back to the parser so they're ignored. */
  excludedHeaders?: string[];
  unknownHeaders?: string[];
  unmatchedOrgs?: string[];
  rejectSamples?: DocsRejectSample[];
  emptyKeyCount?: number;
  duplicateKeyCount?: number;
  result?: DocsImportResult;
}

export interface DocsImportContextValue<TRow = unknown> {
  subModule: DocsSubModule;
  /** Human-readable label for the sub-module key (e.g. "Document No" / "SN"). */
  keyFieldLabel: string;
  /** Whether this sub-module requires a per-file Data Date input. */
  dataDateRequired: boolean;
  /** Path to the sub-module raw data page (for the "View Raw Data" CTA). */
  rawDataPath: string;
  files: DocsImportFile<TRow>[];
  isRunning: boolean;
  addFiles: (selected: File[]) => Promise<void>;
  removeFile: (id: string) => void;
  clearAll: () => void;
  setFileSheets: (id: string, sheets: string[]) => Promise<void>;
  setFileDataDate: (id: string, dataDate: string) => void;
  /** Update the user-excluded header list and re-parse the file with the new selection. */
  setFileExcludedHeaders: (id: string, excluded: string[]) => Promise<void>;
  startImport: () => Promise<void>;
}

export interface ParsedFileResult<TRow> {
  rows: TRow[];
  unknownHeaders: string[];
}

/** Per-row outcome captured by the worker, used by writeImportLogs. */
export interface ImportRowOutcome {
  rawRowNo: number | null;
  /** Sub-module key value, persisted into docs_upload_row_logs.document_no. */
  key: string | null;
  action: 'inserted' | 'updated' | 'skipped' | 'rejected';
  reasonCode?: string | null;
  reasonDetail?: string | null;
  recordId?: string | null;
  /** Optional drawing id (ABD only — preserves drawing_id in docs_change_log). */
  drawingId?: string | null;
  fieldLogs: PendingFieldLog[];
  /** Field diffs to write into docs_change_log (excel_import). */
  changeLog?: Array<{
    field: string;
    oldValue: string | null;
    newValue: string | null;
  }>;
}

export interface WorkerContext {
  projectId: string;
  batchId: string;
  userId: string | null;
  subModule: DocsSubModule;
}

export interface ImporterAdapter<TRow> {
  subModule: DocsSubModule;
  keyFieldLabel: string;
  dataDateRequired: boolean;
  rawDataPath: string;
  parseFile: (
    file: File,
    sheets?: string[],
    options?: { excludedHeaders?: string[] },
  ) => Promise<ParsedFileResult<TRow>>;
  getSheetNames: (file: File) => Promise<string[]>;
  /** Returns the composite headers + sample values used by the column-select dialog. */
  getHeaderInfo: (
    file: File,
    sheets?: string[],
  ) => Promise<{ headers: string[]; samples: Record<string, unknown> }>;
  /** Returns the sub-module key (Document No / SN) from a parsed row. */
  getRowKey: (row: TRow) => string | null;
  /** Performs upserts and returns per-row outcomes + global counters. */
  upsertWorker: (
    ctx: WorkerContext,
    rows: TRow[],
    onProgress: (processed: number, total: number) => void,
  ) => Promise<{
    outcomes: ImportRowOutcome[];
    counters: {
      inserted: number;
      updated: number;
      skipped: number;
      rejected: number;
      unmatchedOrgs: Set<string>;
    };
    rejectSamples: DocsRejectSample[];
    /** OMM only — populated after re-querying child rows post-import. */
    resubmissionsCreated?: number;
    resubmissionsByStage?: { Draft: number; Final: number };
  }>;
}
