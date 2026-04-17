import { Outlet, useNavigate } from 'react-router-dom';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { Separator } from '@/components/ui/separator';
import { useImport } from '@/contexts/ImportContext';
import { Progress } from '@/components/ui/progress';
import { Loader2 } from 'lucide-react';

function GlobalImportIndicator() {
  const { isRunning, files, currentIndex } = useImport();
  const navigate = useNavigate();
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
      <span className="font-medium truncate max-w-[180px]">
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
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="ml-auto">
            <GlobalImportIndicator />
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
