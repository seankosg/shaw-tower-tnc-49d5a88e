import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import SubtestList from "./pages/SubtestList";
import SubtestDetail from "./pages/SubtestDetail";
import PlaceholderPage from "./pages/PlaceholderPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<SubtestList />} />
            <Route path="/subtests/:id" element={<SubtestDetail />} />
            <Route path="/dashboard" element={<PlaceholderPage title="Executive Dashboard" />} />
            <Route path="/import" element={<PlaceholderPage title="Import" />} />
            <Route path="/export" element={<PlaceholderPage title="Export" />} />
            <Route path="/admin" element={<PlaceholderPage title="Admin Workspace" />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
