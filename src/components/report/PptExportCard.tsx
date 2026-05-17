import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Download, Loader2, Presentation } from 'lucide-react';
import type { ReportData } from '@/lib/report-builder';
import { buildPpt } from '@/lib/ppt-builder';
import { bundlePptWithFonts, downloadBlob } from '@/lib/ppt-bundler';
import { ensureFontFaces, type FontFile } from '@/lib/font-loader';

interface FontRow {
  id: string;
  family_name: string;
  style: string;
  storage_path: string;
  public_url: string;
  language: 'korean' | 'english' | 'mixed';
  file_size_bytes: number;
  is_default: boolean;
}

const BUILTIN_FAMILY = 'Malgun Gothic';
const ORIGINAL_TEMPLATE_FONT = 'Malgun Gothic';

interface FamilyOption {
  family: string;
  builtin: boolean;
  language?: 'korean' | 'english' | 'mixed';
  styles: FontRow[];
  totalBytes: number;
}

function fmtBytes(n: number) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB']; let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}

interface PptExportCardProps {
  reportData: ReportData | null;
}

export default function PptExportCard({ reportData }: PptExportCardProps) {
  const { toast } = useToast();
  const [rows, setRows] = useState<FontRow[]>([]);
  const [selectedFamily, setSelectedFamily] = useState<string>(BUILTIN_FAMILY);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewReady, setPreviewReady] = useState(true); // builtin always ready
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('font_registry')
        .select('*')
        .order('family_name')
        .order('style');
      if (error) {
        toast({ title: 'Failed to load fonts', description: error.message, variant: 'destructive' });
        return;
      }
      setRows((data ?? []) as FontRow[]);
    })();
  }, [toast]);

  const families = useMemo<FamilyOption[]>(() => {
    const builtin: FamilyOption = { family: BUILTIN_FAMILY, builtin: true, styles: [], totalBytes: 0 };
    const map = new Map<string, FamilyOption>();
    for (const r of rows) {
      const f = map.get(r.family_name) ?? { family: r.family_name, builtin: false, language: r.language, styles: [], totalBytes: 0 };
      f.styles.push(r); f.totalBytes += r.file_size_bytes ?? 0; f.language = r.language;
      map.set(r.family_name, f);
    }
    return [builtin, ...Array.from(map.values())];
  }, [rows]);

  const selected = families.find((f) => f.family === selectedFamily);
  const isBuiltin = !!selected?.builtin;

  // Live preview: inject @font-face for non-builtin
  useEffect(() => {
    if (!selected) return;
    if (selected.builtin) { setPreviewReady(true); return; }
    let cancelled = false;
    setPreviewLoading(true); setPreviewReady(false);
    const files: FontFile[] = selected.styles.map((s) => ({
      family_name: s.family_name, style: s.style, public_url: s.public_url, storage_path: s.storage_path,
    }));
    ensureFontFaces(selected.family, files)
      .then(() => { if (!cancelled) { setPreviewReady(true); } })
      .catch((e) => { if (!cancelled) toast({ title: 'Font preview load failed', description: e.message, variant: 'destructive' }); })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [selected, toast]);

  const handleDownloadClick = () => {
    if (!reportData) {
      toast({ title: 'Generate the report first', variant: 'destructive' });
      return;
    }
    setConfirmOpen(true);
  };

  const handleConfirmDownload = async () => {
    if (!reportData || !selected) return;
    setDownloading(true);
    try {
      const dateStr = new Date().toISOString().slice(0, 10);
      const pptxBlob = await buildPpt({ data: reportData, fontFamily: selected.family });
      const pptxName = `SHAW_Report_${dateStr}.pptx`;
      if (selected.builtin) {
        downloadBlob(pptxBlob, pptxName);
        toast({ title: 'PPTX downloaded', description: `Font: ${selected.family} (built-in)` });
      } else {
        const files: FontFile[] = selected.styles.map((s) => ({
          family_name: s.family_name, style: s.style, public_url: s.public_url, storage_path: s.storage_path,
        }));
        const zipBlob = await bundlePptWithFonts({
          pptxBlob,
          pptxFileName: pptxName,
          fontFamily: selected.family,
          fontFiles: files,
          originalFontName: ORIGINAL_TEMPLATE_FONT,
        });
        downloadBlob(zipBlob, `SHAW_Report_${dateStr}.zip`);
        toast({ title: 'ZIP downloaded', description: `Includes PPTX + ${selected.styles.length} font file(s)` });
      }
      setConfirmOpen(false);
    } catch (e) {
      toast({ title: 'Download failed', description: e instanceof Error ? e.message : 'Unknown', variant: 'destructive' });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Presentation className="h-4 w-4" /> PPT Export
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm font-semibold">Font</Label>
            <RadioGroup value={selectedFamily} onValueChange={setSelectedFamily} className="mt-2">
              {families.map((f) => (
                <div key={f.family} className="flex items-start gap-3 rounded-md border p-3">
                  <RadioGroupItem value={f.family} id={`font-${f.family}`} className="mt-1" />
                  <Label htmlFor={`font-${f.family}`} className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{f.family}</span>
                      {f.builtin && <Badge variant="secondary">default · Windows built-in</Badge>}
                      {!f.builtin && f.language && <Badge variant="outline">{f.language}</Badge>}
                      {!f.builtin && (
                        <span className="text-xs text-muted-foreground">
                          {f.styles.length} styles · {fmtBytes(f.totalBytes)}
                        </span>
                      )}
                    </div>
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Live preview */}
          <div className="rounded-md border bg-muted/30 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              Live preview
              {previewLoading && <Loader2 className="h-3 w-3 animate-spin" />}
            </div>
            <div
              style={{ fontFamily: `"${selectedFamily}", sans-serif`, opacity: previewReady ? 1 : 0.5 }}
            >
              <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.3 }}>
                SHAW TOWER · Completion Management
              </div>
              <div style={{ fontSize: 16, marginTop: 6 }}>
                87.6% · Pre-Test · 2026-06-15
              </div>
              <div style={{ fontSize: 14, marginTop: 4, color: '#555' }}>
                협조 요청 — 작성 필요
              </div>
            </div>
          </div>

          <div>
            <Button onClick={handleDownloadClick} disabled={!reportData || downloading}>
              <Download className="h-4 w-4 mr-2" />
              Download PPT
            </Button>
            {!reportData && (
              <span className="ml-3 text-xs text-muted-foreground">Generate the report first.</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Font notice / 폰트 안내</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm text-foreground">
                <div className="space-y-1">
                  <div><span className="text-muted-foreground">Original template font / 원본 폰트:</span> <b>{ORIGINAL_TEMPLATE_FONT}</b></div>
                  <div><span className="text-muted-foreground">Selected font / 선택한 폰트:</span> <b>{selectedFamily}</b>{!isBuiltin && selected && <> ({selected.styles.length} styles, {fmtBytes(selected.totalBytes)})</>}</div>
                </div>
                {isBuiltin ? (
                  <div className="rounded-md bg-muted/40 p-3">
                    <p>Malgun Gothic is pre-installed on Windows. The download will be a <b>.pptx</b> file only.</p>
                    <p className="mt-1 text-muted-foreground">Malgun Gothic은 Windows에 기본 설치되어 있으므로 .pptx 파일만 다운로드됩니다.</p>
                  </div>
                ) : (
                  <div className="rounded-md bg-muted/40 p-3">
                    <p>The download is a <b>.zip</b> containing the PPTX and font files. Please install the fonts <b>before</b> opening the PPT — otherwise PowerPoint will substitute a fallback font.</p>
                    <p className="mt-1 text-muted-foreground">ZIP 안의 폰트를 <b>먼저 설치</b>한 뒤 PPT를 여세요. 설치하지 않으면 PowerPoint가 다른 폰트로 대체합니다.</p>
                    <p className="mt-2 text-xs text-muted-foreground">Windows: Right-click → "Install for all users" · macOS: Double-click → "Install Font"</p>
                  </div>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={downloading}>Cancel</Button>
            <Button onClick={handleConfirmDownload} disabled={downloading || (!isBuiltin && !previewReady)}>
              {downloading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
