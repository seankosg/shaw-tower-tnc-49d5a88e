import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import SubtestList from "./pages/SubtestList";
import SubtestDetail from "./pages/SubtestDetail";
import ImportPage from "./pages/ImportPage";
import ImportLogsPage from "./pages/ImportLogsPage";
import ExportPage from "./pages/ExportPage";
import MobileUpdatePage from "./pages/MobileUpdatePage";
import PlaceholderPage from "./pages/PlaceholderPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<SubtestList />} />
            <Route path="/subtests/:id" element={<SubtestDetail />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/import/logs" element={<ImportLogsPage />} />
            <Route path="/export" element={<ExportPage />} />
            <Route path="/mobile" element={<MobileUpdatePage />} />
            <Route path="/dashboard" element={<PlaceholderPage title="Executive Dashboard" />} />
            <Route path="/admin" element={<PlaceholderPage title="Admin Workspace" />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </AuthProvider>
  </QueryClientProvider>
);

export default App;
