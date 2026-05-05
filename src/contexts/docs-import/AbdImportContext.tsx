import { createDocsImportProvider } from './createDocsImportProvider';
import { abdAdapter } from '@/lib/docs-import-workers';
import type { ParsedDocsRow } from '@/lib/docs-import-parser';

const factory = createDocsImportProvider<ParsedDocsRow>({ adapter: abdAdapter });

export const AbdImportProvider = factory.Provider;
export const useAbdImport = factory.useImporter;
