import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ImportProvider } from "@/contexts/ImportContext";
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
import AdminPage from "./pages/AdminPage";

const queryClient = new QueryClient();

const App = () => (
  <AuthProvider>
    <QueryClientProvider client={queryClient}>
      <ImportProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/change-password" element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />
              <Route element={<ProtectedRoute><RoleGuard><AppLayout /></RoleGuard></ProtectedRoute>}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/raw-data" element={<SubtestList />} />
                <Route path="/subtests/:id" element={<SubtestDetail />} />
                <Route path="/import" element={<ImportPage />} />
                <Route path="/import/logs" element={<ImportLogsPage />} />
                <Route path="/export" element={<ExportPage />} />
                <Route path="/mobile" element={<MobileUpdatePage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/schedule" element={<SchedulePage />} />
                <Route path="/admin" element={<AdminPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </ImportProvider>
    </QueryClientProvider>
  </AuthProvider>
);

export default App;
