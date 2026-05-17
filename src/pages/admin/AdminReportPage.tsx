import { Shield } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ReportTab from './ReportTab';
import FontLibrary from '@/components/admin/FontLibrary';

export default function AdminReportPage() {
  const { isAdmin } = useAuth();
  const isDev = import.meta.env.DEV;
  const hasAccess = isDev || isAdmin;

  if (!hasAccess) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
        <Shield className="h-10 w-10" />
        <p>Access denied. Admin role required.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <h1 className="text-2xl font-semibold text-foreground">Report</h1>
      <Tabs defaultValue="report" className="w-full">
        <TabsList>
          <TabsTrigger value="report">Report</TabsTrigger>
          <TabsTrigger value="fonts">Fonts</TabsTrigger>
        </TabsList>
        <TabsContent value="report" className="mt-4">
          <ReportTab />
        </TabsContent>
        <TabsContent value="fonts" className="mt-4">
          <FontLibrary />
        </TabsContent>
      </Tabs>
    </div>
  );
}
