import type { ReactNode } from 'react';
import { AbdImportProvider } from './AbdImportContext';
import { OmmImportProvider } from './OmmImportContext';
import { WarrantyImportProvider } from './WarrantyImportContext';
import { SparePartImportProvider } from './SparePartImportContext';

/** Mounts every Docs Import sub-module provider in a single tree. */
export function DocsImportProviders({ children }: { children: ReactNode }) {
  return (
    <AbdImportProvider>
      <OmmImportProvider>
        <WarrantyImportProvider>
          <SparePartImportProvider>
            {children}
          </SparePartImportProvider>
        </WarrantyImportProvider>
      </OmmImportProvider>
    </AbdImportProvider>
  );
}
