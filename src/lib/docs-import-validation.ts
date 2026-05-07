// Shared system-required field constants and validation for the Docs Import hub.
import type { DocsSubModule } from '@/contexts/docs-import/types';

/** Fields whose absence (or user-exclusion) breaks row identity for an import. */
export const DOCS_SYSTEM_REQUIRED_FIELDS: Record<DocsSubModule, { field: string; label: string }> = {
  as_built: { field: 'document_no', label: 'Document No' },
  omm: { field: 'sn', label: 'SN' },
  spare_part: { field: 'sn', label: 'S/N' },
};

export interface DocsHeaderValidation {
  /** Human-readable error message — null when validation passes. */
  error: string | null;
  /** The system-required field that triggered the failure, if any. */
  missingField?: string;
  /** The user-facing label of the missing field. */
  missingLabel?: string;
}

/**
 * Verify that the system-required field for a sub-module is BOTH detected in the
 * workbook AND not excluded by the user. Returns a friendly error message when
 * the import cannot proceed.
 */
export function validateDocsHeaders(
  subModule: DocsSubModule,
  fieldByHeader: Record<string, string | null> | undefined,
  excludedHeaders: string[] | undefined,
): DocsHeaderValidation {
  const required = DOCS_SYSTEM_REQUIRED_FIELDS[subModule];
  if (!required) return { error: null };
  if (!fieldByHeader || Object.keys(fieldByHeader).length === 0) {
    // Headers haven't been extracted yet (still parsing) — defer validation.
    return { error: null };
  }
  const excludedSet = new Set(excludedHeaders ?? []);
  const matchedHeaders = Object.entries(fieldByHeader)
    .filter(([, field]) => field === required.field)
    .map(([header]) => header);
  if (matchedHeaders.length === 0) {
    return {
      error: `No column maps to "${required.label}". This sub-module needs a "${required.label}" column to identify rows. Check the file's header row or update Header Mappings.`,
      missingField: required.field,
      missingLabel: required.label,
    };
  }
  const allExcluded = matchedHeaders.every((h) => excludedSet.has(h));
  if (allExcluded) {
    return {
      error: `"${required.label}" column is currently excluded via Select Columns. Re-include it before starting the import.`,
      missingField: required.field,
      missingLabel: required.label,
    };
  }
  return { error: null };
}
