// Bundles a generated PPTX with selected font files into a single ZIP.
// - Includes 1_INSTALL_FONTS_FIRST.txt with Korean + English instructions.
// - Skips bundling for built-in fonts (e.g. Malgun Gothic) — caller should
//   download the .pptx directly in that case.

import JSZip from 'jszip';
import type { FontFile } from '@/lib/font-loader';
import { loadFamilyBuffers } from '@/lib/font-loader';

export interface BundleOptions {
  pptxBlob: Blob;
  pptxFileName: string;        // e.g. "SHAW_Report_2026-05-17.pptx"
  fontFamily: string;
  fontFiles: FontFile[];
  /** Original template font name (for README). */
  originalFontName?: string;
}

function fontFileName(family: string, style: string, sourcePath: string): string {
  const ext = sourcePath.toLowerCase().endsWith('.ttf') ? 'ttf' : 'otf';
  const cleanStyle = style.replace(/\s+/g, '');
  return `${family.replace(/\s+/g, '')}-${cleanStyle}.${ext}`;
}

function buildReadme(opts: BundleOptions): string {
  const original = opts.originalFontName ?? 'Malgun Gothic';
  return [
    '================================================================',
    '  SHAW Tower Report — Font Installation Required',
    '  폰트 설치 안내 (필독)',
    '================================================================',
    '',
    `Original template font / 원본 폰트 :  ${original}`,
    `Selected font       / 선택한 폰트   :  ${opts.fontFamily}`,
    `Font files included / 포함된 파일   :  ${opts.fontFiles.length} file(s)`,
    '',
    '----------------------------------------------------------------',
    ' [EN] INSTALL FONTS BEFORE OPENING THE PPT',
    '----------------------------------------------------------------',
    ' 1. Open the "fonts/" folder.',
    ' 2. Select all font files.',
    ' 3. Windows : Right-click → "Install for all users".',
    '    macOS   : Double-click each file → click "Install Font".',
    ' 4. Close PowerPoint completely, then open the .pptx file.',
    '',
    '----------------------------------------------------------------',
    ' [KR] PPT를 열기 전에 반드시 폰트를 설치하세요',
    '----------------------------------------------------------------',
    ' 1. "fonts/" 폴더를 엽니다.',
    ' 2. 폰트 파일을 모두 선택합니다.',
    ' 3. Windows : 우클릭 → "모든 사용자용으로 설치".',
    '    macOS   : 파일을 더블클릭 → "글꼴 설치" 클릭.',
    ' 4. PowerPoint를 완전히 종료한 뒤 .pptx 파일을 엽니다.',
    '',
    'If the PPT still shows fallback fonts after installing,',
    '재시작(또는 PowerPoint 재실행) 후 다시 열어보세요.',
    '',
    '================================================================',
    '',
  ].join('\n');
}

export async function bundlePptWithFonts(opts: BundleOptions): Promise<Blob> {
  const zip = new JSZip();
  zip.file('1_INSTALL_FONTS_FIRST.txt', buildReadme(opts));
  zip.file(opts.pptxFileName, opts.pptxBlob);

  // Ensure font buffers are loaded (uses cache if already fetched for preview)
  const family = await loadFamilyBuffers(opts.fontFamily, opts.fontFiles);
  const fontsFolder = zip.folder('fonts');
  if (!fontsFolder) throw new Error('Failed to create fonts/ folder in ZIP');
  for (const b of family.buffers) {
    fontsFolder.file(fontFileName(opts.fontFamily, b.style, b.storage_path), b.buffer);
  }

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}
