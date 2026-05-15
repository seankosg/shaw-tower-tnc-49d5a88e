import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ImportProvider } from "@/contexts/ImportContext";
import { DefectImportProvider } from "@/contexts/DefectImportContext";
import { PhotoOcrProvider } from "@/contexts/PhotoOcrContext";
import { DocsImportProviders } from "@/contexts/docs-import/DocsImportProviders";
import { ModuleStatusProvider } from "@/contexts/ModuleStatusContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { RoleGuard } from "@/components/layout/RoleGuard";
import Login from "./pages/Login";
import ChangePassword from "./pages/ChangePassword";
import SubtestList from "./pages/SubtestList";
import SubtestDetail from "./pages/SubtestDetail";
import ImportPage from "./pages/ImportPage";
import ImportLogsPage from "./pages/ImportLogsPage";
import ExportPage from "./pages/ExportPage";
import MobileUpdatePage from "./pages/MobileUpdatePage";
import DashboardPage from "./pages/DashboardPage";
import SchedulePage from "./pages/SchedulePage";
import ScheduleRevisionPage from "./pages/ScheduleRevisionPage";
import AdminPage from "./pages/AdminPage";
import AdminClassificationPage from "./pages/AdminClassificationPage";
import DefectDashboardPage from "./pages/DefectDashboardPage";
import DefectProgressPage from "./pages/DefectProgressPage";
import DefectSimulationPage from "./pages/DefectSimulationPage";
import TncSimulationPage from "./pages/TncSimulationPage";
import DefectRawDataPage from "./pages/DefectRawDataPage";
import DefectDetailPage from "./pages/DefectDetailPage";
import DefectImportPage from "./pages/DefectImportPage";
import DefectImportLogsPage from "./pages/DefectImportLogsPage";
import DefectExportPage from "./pages/DefectExportPage";
import DefectQuickUpdatePage from "./pages/DefectQuickUpdatePage";
import DefectScheduleRevisionPage from "./pages/DefectScheduleRevisionPage";
import AllSubtestCommentsPage from "./pages/AllSubtestCommentsPage";
import AllDefectCommentsPage from "./pages/AllDefectCommentsPage";
import DocsExecutiveDashboardPage from "./pages/docs/DocsExecutiveDashboardPage";
import DocsRawDataPage from "./pages/docs/DocsRawDataPage";
import DocsImportPage from "./pages/docs/DocsImportPage";
import DocsExportPage from "./pages/docs/DocsExportPage";
import DocsDrawingDetailPage from "./pages/docs/DocsDrawingDetailPage";
import DocsImportLogsPage from "./pages/docs/DocsImportLogsPage";
import DocsOMMRawDataPage from "./pages/docs/DocsOMMRawDataPage";
import DocsOMMDetailPage from "./pages/docs/DocsOMMDetailPage";

import DocsSparePartRawDataPage from "./pages/docs/DocsSparePartRawDataPage";
import DocsSparePartDetailPage from "./pages/docs/DocsSparePartDetailPage";
import DocsWarrantyRawDataPage from "./pages/docs/DocsWarrantyRawDataPage";
import DocsWarrantyDetailPage from "./pages/docs/DocsWarrantyDetailPage";
import PunchRawDataPage from "./pages/PunchRawDataPage";
import PunchDetailPage from "./pages/PunchDetailPage";
import PunchImportPage from "./pages/PunchImportPage";
import PunchImportLogsPage from "./pages/PunchImportLogsPage";
import PunchExportPage from "./pages/PunchExportPage";
import PunchDashboardPage from "./pages/PunchDashboardPage";
import PlaceholderPage from "./pages/PlaceholderPage";
import { useHeaderMappingsSync } from "@/hooks/useHeaderMappings";
import { loadHeaderMappingsCache } from "@/lib/header-mappings-cache";
import { useCustomFieldsSync } from "@/hooks/useCustomFields";
import { loadCustomFieldsCache } from "@/lib/custom-fields-cache";

const queryClient = new QueryClient();

// Kick off cache loads as early as possible (non-blocking).
loadHeaderMappingsCache().catch(() => {});
loadCustomFieldsCache().catch(() => {});

function HeaderMappingsBootstrap() {
  useHeaderMappingsSync();
  useCustomFieldsSync();
  return null;
}

function RedirectPreserveSearch({ to }: { to: string }) {
  const location = useLocation();
  return <Navigate to={`${to}${location.search}`} replace />;
}

const App = () => (
  <AuthProvider>
    <QueryClientProvider client={queryClient}>
      <HeaderMappingsBootstrap />
      <ModuleStatusProvider>
      <ImportProvider>
        <DefectImportProvider>
        <PhotoOcrProvider>
        <DocsImportProviders>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/change-password" element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />
              <Route element={<ProtectedRoute><RoleGuard><AppLayout /></RoleGuard></ProtectedRoute>}>
                <Route path="/" element={<Navigate to="/tc/dashboard" replace />} />
                <Route path="/dashboard" element={<RedirectPreserveSearch to="/tc/dashboard" />} />
                <Route path="/schedule" element={<RedirectPreserveSearch to="/tc/progress" />} />
                <Route path="/schedule/revision" element={<RedirectPreserveSearch to="/tc/schedule-revision" />} />
                <Route path="/raw-data" element={<RedirectPreserveSearch to="/tc/raw-data" />} />
                <Route path="/import" element={<RedirectPreserveSearch to="/tc/import" />} />
                <Route path="/import/logs" element={<RedirectPreserveSearch to="/tc/import/logs" />} />
                <Route path="/export" element={<RedirectPreserveSearch to="/tc/export" />} />
                <Route path="/mobile" element={<RedirectPreserveSearch to="/tc/quick-update" />} />
                <Route path="/tc/dashboard" element={<DashboardPage />} />
                <Route path="/tc/progress" element={<SchedulePage />} />
                <Route path="/tc/schedule-revision" element={<ScheduleRevisionPage />} />
                <Route path="/tc/raw-data" element={<SubtestList />} />
                <Route path="/tc/import" element={<ImportPage />} />
                <Route path="/tc/import/logs" element={<ImportLogsPage />} />
                <Route path="/tc/export" element={<ExportPage />} />
                <Route path="/tc/quick-update" element={<MobileUpdatePage />} />
                <Route path="/tc/simulation" element={<TncSimulationPage />} />
                <Route path="/subtests/:id" element={<SubtestDetail />} />
                <Route path="/defects/dashboard" element={<DefectDashboardPage />} />
                <Route path="/defects/progress" element={<DefectProgressPage />} />
                <Route path="/defects/simulation" element={<DefectSimulationPage />} />
                <Route path="/defects/schedule-revision" element={<DefectScheduleRevisionPage />} />
                <Route path="/defects/raw-data" element={<DefectRawDataPage />} />
                <Route path="/defects/import" element={<DefectImportPage />} />
                <Route path="/defects/import/logs" element={<DefectImportLogsPage />} />
                <Route path="/defects/export" element={<DefectExportPage />} />
                <Route path="/defects/quick-update" element={<DefectQuickUpdatePage />} />
                <Route path="/defect/dashboard" element={<RedirectPreserveSearch to="/defects/dashboard" />} />
                <Route path="/defect/progress" element={<RedirectPreserveSearch to="/defects/progress" />} />
                <Route path="/defect/schedule-revision" element={<RedirectPreserveSearch to="/defects/schedule-revision" />} />
                <Route path="/defect/raw-data" element={<RedirectPreserveSearch to="/defects/raw-data" />} />
                <Route path="/defect/import" element={<RedirectPreserveSearch to="/defects/import" />} />
                <Route path="/defect/import/logs" element={<RedirectPreserveSearch to="/defects/import/logs" />} />
                <Route path="/defect/export" element={<RedirectPreserveSearch to="/defects/export" />} />
                <Route path="/defect/quick-update" element={<RedirectPreserveSearch to="/defects/quick-update" />} />
                <Route path="/defects/:id" element={<DefectDetailPage />} />
                <Route path="/docs/dashboard" element={<DocsExecutiveDashboardPage />} />
                <Route path="/docs/abd" element={<DocsRawDataPage />} />
                <Route path="/docs/abd/:id" element={<DocsDrawingDetailPage />} />
                <Route path="/docs/omm" element={<DocsOMMRawDataPage />} />
                <Route path="/docs/omm/import" element={<Navigate to="/docs/import?sub=omm" replace />} />
                <Route path="/docs/omm/:id" element={<DocsOMMDetailPage />} />
                <Route path="/docs/warranty" element={<DocsWarrantyRawDataPage />} />
                <Route path="/docs/warranty/:id" element={<DocsWarrantyDetailPage />} />
                <Route path="/docs/spare-part" element={<DocsSparePartRawDataPage />} />
                <Route path="/docs/spare-part/:id" element={<DocsSparePartDetailPage />} />
                <Route path="/docs/import" element={<DocsImportPage />} />
                <Route path="/docs/import/logs" element={<DocsImportLogsPage />} />
                <Route path="/docs/export" element={<DocsExportPage />} />
                <Route path="/docs/org-mapping" element={<Navigate to="/admin" replace />} />
                {/* Legacy redirects (ABD was previously at /docs/raw-data and /docs/:id) */}
                <Route path="/docs/raw-data" element={<RedirectPreserveSearch to="/docs/abd" />} />
                <Route path="/docs/:id" element={<DocsDrawingDetailPage />} />
                <Route path="/punch/dashboard" element={<PunchDashboardPage />} />
                <Route path="/punch/raw-data" element={<PunchRawDataPage />} />
                <Route path="/punch/import" element={<PunchImportPage />} />
                <Route path="/punch/import/logs" element={<PunchImportLogsPage />} />
                <Route path="/punch/export" element={<PunchExportPage />} />
                <Route path="/punch/:id" element={<PunchDetailPage />} />
                <Route path="/comments/subtest" element={<AllSubtestCommentsPage />} />
                <Route path="/comments/defect" element={<AllDefectCommentsPage />} />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="/admin/classification" element={<AdminClassificationPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
        </DocsImportProviders>
        </PhotoOcrProvider>
        </DefectImportProvider>
      </ImportProvider>
      </ModuleStatusProvider>
    </QueryClientProvider>
  </AuthProvider>
);

export default App;
