import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { Separator } from '@/components/ui/separator';
import { useImport } from '@/contexts/ImportContext';
import { Progress } from '@/components/ui/progress';
import { Loader2 } from 'lucide-react';
import { APP_NAME } from '@/lib/constants';

const ROUTE_TITLES: Array<{ match: (p: string) => boolean; label: string }> = [
  { match: (p) => p === '/dashboard', label: 'Dashboard' },
  { match: (p) => p === '/schedule', label: 'Progress' },
  { match: (p) => p === '/', label: 'Raw Data' },
  { match: (p) => p.startsWith('/subtests/'), label: 'Subtest Detail' },
  { match: (p) => p === '/import', label: 'Import' },
  { match: (p) => p === '/import/logs', label: 'Import Logs' },
  { match: (p) => p === '/export', label: 'Export' },
  { match: (p) => p === '/mobile', label: 'Quick Update' },
  { match: (p) => p.startsWith('/admin'), label: 'Admin' },
  { match: (p) => p === '/change-password', label: 'Change Password' },
];

function useCurrentPageLabel() {
  const { pathname } = useLocation();
  const found = ROUTE_TITLES.find((r) => r.match(pathname));
  return found?.label ?? '';
}

function useDocumentTitle(label: string) {
  useEffect(() => {
    document.title = label ? `${label} · ${APP_NAME}` : APP_NAME;
  }, [label]);
}

function GlobalImportIndicator() {
  const navigate = useNavigate();
  let ctx;
  try {
    ctx = useImport();
  } catch {
    return null;
  }
  const { isRunning, files, currentIndex } = ctx;
  if (!isRunning) return null;
  const current = currentIndex >= 0 ? files[currentIndex] : null;
  const total = files.filter(f => f.status === 'ready' || f.status === 'processing' || f.status === 'done').length;
  const done = files.filter(f => f.status === 'done').length;

  return (
    <button
      onClick={() => navigate('/import')}
      className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-xs hover:bg-accent transition-colors"
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
      <span className="font-medium truncate max-w-[100px] sm:max-w-[180px]">
        {current ? `Importing ${current.name}` : 'Importing...'}
      </span>
      <span className="text-muted-foreground">{done}/{total}</span>
      {current && (
        <Progress value={current.progress} className="h-1 w-16" />
      )}
    </button>
  );
}

export function AppLayout() {
  const pageLabel = useCurrentPageLabel();
  useDocumentTitle(pageLabel);
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">{APP_NAME}</span>
            {pageLabel && (
              <>
                <span className="text-muted-foreground/50">/</span>
                <span className="font-medium text-foreground">{pageLabel}</span>
              </>
            )}
          </nav>
          <div className="ml-auto">
            <GlobalImportIndicator />
          </div>
        </header>
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-4">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
