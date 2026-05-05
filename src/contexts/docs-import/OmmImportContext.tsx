import { createDocsImportProvider } from './createDocsImportProvider';
import { ommAdapter } from '@/lib/docs-import-workers';
import type { ParsedOmmRow } from '@/lib/docs-omm-import-parser';

const factory = createDocsImportProvider<ParsedOmmRow>({ adapter: ommAdapter });

export const OmmImportProvider = factory.Provider;
export const useOmmImport = factory.useImporter;
