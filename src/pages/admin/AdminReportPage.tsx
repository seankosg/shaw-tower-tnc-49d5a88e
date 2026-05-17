import { Shield } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ReportTab from './ReportTab';
import DesignTokensEditor from '@/components/admin/DesignTokensEditor';
import SlideComposer from '@/components/admin/SlideComposer';
import DesignGuideManager from '@/components/admin/DesignGuideManager';
import CodeEditor from '@/components/admin/CodeEditor';
import { canAccessRoute } from '@/lib/role-permissions';

export default function AdminReportPage() {
  const { isAdmin, roles } = useAuth();
  const isDev = import.meta.env.DEV;
  // Senior User and above (or dev) can access the Report page
  const hasAccess = isDev || canAccessRoute(roles, '/admin/report');
  const canSeeCodeEditor = isDev || isAdmin;

  if (!hasAccess) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
        <Shield className="h-10 w-10" />
        <p>Access denied. Senior User role or higher required.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <h1 className="text-2xl font-semibold text-foreground">Report</h1>
      <Tabs defaultValue="report">
        <TabsList className="flex-wrap">
          <TabsTrigger value="report">Report Generator</TabsTrigger>
          <TabsTrigger value="tokens">Design Tokens</TabsTrigger>
          <TabsTrigger value="composer">Slide Composer</TabsTrigger>
          <TabsTrigger value="guide">Design Guide</TabsTrigger>
          {canSeeCodeEditor && <TabsTrigger value="code">Code Editor</TabsTrigger>}
        </TabsList>
        <TabsContent value="report"><ReportTab /></TabsContent>
        <TabsContent value="tokens"><DesignTokensEditor embedded /></TabsContent>
        <TabsContent value="composer"><SlideComposer embedded /></TabsContent>
        <TabsContent value="guide"><DesignGuideManager embedded /></TabsContent>
        {canSeeCodeEditor && (
          <TabsContent value="code"><CodeEditor /></TabsContent>
        )}
      </Tabs>
    </div>
  );
}
