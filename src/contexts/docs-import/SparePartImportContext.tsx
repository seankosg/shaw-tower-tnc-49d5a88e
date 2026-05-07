import { createDocsImportProvider } from './createDocsImportProvider';
import { sparePartAdapter } from '@/lib/docs-import-workers';
import type { ParsedSparePartRow } from '@/lib/docs-spare-part-import-parser';

const factory = createDocsImportProvider<ParsedSparePartRow>({ adapter: sparePartAdapter });

export const SparePartImportProvider = factory.Provider;
export const useSparePartImport = factory.useImporter;
