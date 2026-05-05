import type { ReactNode } from 'react';
import { AbdImportProvider } from './AbdImportContext';
import { OmmImportProvider } from './OmmImportContext';

/** Mounts every Docs Import sub-module provider in a single tree. */
export function DocsImportProviders({ children }: { children: ReactNode }) {
  return (
    <AbdImportProvider>
      <OmmImportProvider>
        {children}
      </OmmImportProvider>
    </AbdImportProvider>
  );
}
