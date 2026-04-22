import { createRoot } from "react-dom/client";
import { AuthProvider } from "@/contexts/AuthContext";
import App from "./App.tsx";
import "./index.css";

const notifyAppVersionMismatch = () => {
  window.dispatchEvent(new Event("app-version-mismatch"));
};

const isChunkLoadError = (message: string) =>
  /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk .*failed/i.test(message);

window.addEventListener("error", (event) => {
  const message = `${event.message || ""} ${(event.error as Error | undefined)?.message || ""}`;
  if (isChunkLoadError(message)) notifyAppVersionMismatch();
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  const message = typeof reason === "string" ? reason : `${reason?.message || ""}`;
  if (isChunkLoadError(message)) notifyAppVersionMismatch();
});

createRoot(document.getElementById("root")!).render(<App />);
