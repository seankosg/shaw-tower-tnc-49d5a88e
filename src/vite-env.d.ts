/// <reference types="vite/client" />

declare const __APP_BUILD_ID__: string;

// File System Access API — supported in Chromium-based browsers (Chrome/Edge).
// Not yet in TypeScript's lib.dom.d.ts; declare just what we use.
interface ShowDirectoryPickerOptions {
  id?: string;
  mode?: 'read' | 'readwrite';
  startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos' | FileSystemHandle;
}

interface Window {
  showDirectoryPicker?: (options?: ShowDirectoryPickerOptions) => Promise<FileSystemDirectoryHandle>;
}
