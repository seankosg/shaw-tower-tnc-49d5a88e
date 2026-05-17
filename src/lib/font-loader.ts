// Dynamic @font-face loader + ArrayBuffer cache for PPT font bundling.
// - Loads custom fonts from Supabase public URLs at runtime for live preview.
// - Caches fetched font binaries (ArrayBuffer) so ZIP packaging avoids re-fetch.

export interface FontFile {
  family_name: string;
  style: string;
  public_url: string;
  storage_path: string;
}

interface CachedFamily {
  buffers: { style: string; storage_path: string; buffer: ArrayBuffer }[];
}

const familyCache = new Map<string, CachedFamily>();
const injectedFaces = new Set<string>();

function styleToWeight(style: string): { weight: number; italic: boolean } {
  const s = style.toLowerCase();
  const italic = s.includes('italic') || s.includes('oblique');
  if (s.includes('thin') || s.includes('hairline')) return { weight: 100, italic };
  if (s.includes('extralight') || s.includes('ultralight')) return { weight: 200, italic };
  if (s.includes('light')) return { weight: 300, italic };
  if (s.includes('medium')) return { weight: 500, italic };
  if (s.includes('semibold') || s.includes('demibold')) return { weight: 600, italic };
  if (s.includes('extrabold') || s.includes('ultrabold')) return { weight: 800, italic };
  if (s.includes('black') || s.includes('heavy')) return { weight: 900, italic };
  if (s.includes('bold')) return { weight: 700, italic };
  return { weight: 400, italic };
}

/** Load font family files into the cache (parallel fetch). Returns cached entry. */
export async function loadFamilyBuffers(
  family_name: string,
  files: FontFile[],
): Promise<CachedFamily> {
  const cached = familyCache.get(family_name);
  if (cached) return cached;
  const buffers = await Promise.all(
    files.map(async (f) => {
      const res = await fetch(f.public_url);
      if (!res.ok) throw new Error(`Failed to fetch font ${f.style}: ${res.status}`);
      const buffer = await res.arrayBuffer();
      return { style: f.style, storage_path: f.storage_path, buffer };
    }),
  );
  const entry: CachedFamily = { buffers };
  familyCache.set(family_name, entry);
  return entry;
}

/** Inject @font-face rules into document so the family becomes renderable. */
export async function ensureFontFaces(family_name: string, files: FontFile[]): Promise<void> {
  const entry = await loadFamilyBuffers(family_name, files);
  for (const b of entry.buffers) {
    const key = `${family_name}::${b.style}`;
    if (injectedFaces.has(key)) continue;
    const blob = new Blob([b.buffer], { type: 'font/otf' });
    const url = URL.createObjectURL(blob);
    const { weight, italic } = styleToWeight(b.style);
    const face = new FontFace(family_name, `url(${url})`, {
      weight: String(weight),
      style: italic ? 'italic' : 'normal',
      display: 'swap',
    });
    await face.load();
    (document as any).fonts.add(face);
    injectedFaces.add(key);
  }
  await (document as any).fonts.load(`16px "${family_name}"`);
}

export function getCachedFamily(family_name: string): CachedFamily | undefined {
  return familyCache.get(family_name);
}
