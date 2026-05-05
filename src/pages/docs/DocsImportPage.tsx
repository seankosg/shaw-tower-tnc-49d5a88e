import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { DocsImportShell } from '@/components/docs/import/DocsImportShell';
import { useAbdImport } from '@/contexts/docs-import/AbdImportContext';
import { useOmmImport } from '@/contexts/docs-import/OmmImportContext';

type SubKey = 'abd' | 'omm' | 'warranty' | 'spare_part';

const VALID: SubKey[] = ['abd', 'omm', 'warranty', 'spare_part'];

function fileBadge(count: number, running: boolean) {
  if (running) return <Loader2 className="ml-2 h-3 w-3 animate-spin" />;
  if (count === 0) return null;
  return <Badge variant="secondary" className="ml-2 h-4 px-1.5 text-[10px]">{count}</Badge>;
}

export default function DocsImportPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = (searchParams.get('sub') ?? 'abd').toLowerCase() as SubKey;
  const sub: SubKey = VALID.includes(raw) ? raw : 'abd';

  // Normalize URL when missing/invalid sub.
  useEffect(() => {
    if (searchParams.get('sub') !== sub) {
      const next = new URLSearchParams(searchParams);
      next.set('sub', sub);
      setSearchParams(next, { replace: true });
    }
  }, [sub, searchParams, setSearchParams]);

  const abd = useAbdImport();
  const omm = useOmmImport();

  // Cross-tab busy lock — disable Start on the other tab while one is running.
  const anyRunning = abd.isRunning || omm.isRunning;

  const handleTabChange = (val: string) => {
    if (!VALID.includes(val as SubKey)) return;
    const next = new URLSearchParams(searchParams);
    next.set('sub', val);
    setSearchParams(next, { replace: false });
  };

  const summary = useMemo(() => ({
    abdFiles: abd.files.length,
    ommFiles: omm.files.length,
  }), [abd.files.length, omm.files.length]);

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Docs Import</h1>
        <p className="text-sm text-muted-foreground">
          Upload registers for each Docs sub-module. Each tab keeps its own files, parser, and logs.
        </p>
      </div>

      <Tabs value={sub} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="abd">
            ABD (As-Built Drawings){fileBadge(summary.abdFiles, abd.isRunning)}
          </TabsTrigger>
          <TabsTrigger value="omm">
            OMM Manuals{fileBadge(summary.ommFiles, omm.isRunning)}
          </TabsTrigger>
          <TabsTrigger value="warranty" disabled>
            Warranty <Badge variant="outline" className="ml-2 h-4 px-1.5 text-[10px]">Coming soon</Badge>
          </TabsTrigger>
          <TabsTrigger value="spare_part" disabled>
            Spare Part <Badge variant="outline" className="ml-2 h-4 px-1.5 text-[10px]">Coming soon</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="abd" className="mt-4">
          <DocsImportShell
            title="ABD — As-Built Drawings"
            description="Upload Aconex / register Excel files. Only sheets whose name contains “register” are imported; every column header (including 2-row banded Submission 1/2/3 headers) is mapped automatically."
            importer={abd}
            externallyBusy={omm.isRunning}
          />
        </TabsContent>

        <TabsContent value="omm" className="mt-4">
          <DocsImportShell
            title="OMM — Operation & Maintenance Manuals"
            description="Upload OMM register Excel files. Headers map per Admin → Header Mappings → Docs / OMM."
            importer={omm}
            externallyBusy={abd.isRunning}
            infoBanner="Resubmission rows are auto-created when Draft / Final response status becomes B or C during import."
          />
        </TabsContent>

        <TabsContent value="warranty" className="mt-4">
          <div className="rounded border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            Warranty import is being prepared in the next phase.
          </div>
        </TabsContent>

        <TabsContent value="spare_part" className="mt-4">
          <div className="rounded border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            Spare Part import is being prepared in the next phase.
          </div>
        </TabsContent>
      </Tabs>

      {anyRunning && (
        <p className="text-xs text-muted-foreground">
          Tip: switching tabs while an import is running is safe — progress continues in the background.
        </p>
      )}
    </div>
  );
}
