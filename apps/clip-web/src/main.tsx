import { analytics, resolveAnalyticsServerZone } from "@storyteller/analytics";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App.js";
import { LocalizationProvider } from "./localization.js";
import "./styles/global.css";

analytics.initialize({
  apiKey: import.meta.env.VITE_AMPLITUDE_API_KEY ?? "",
  serverZone: resolveAnalyticsServerZone(import.meta.env.VITE_AMPLITUDE_SERVER_ZONE),
  surface: "clip-web",
});

const root = document.getElementById("root");
if (!root) throw new Error("root element not found");

createRoot(root).render(
  <StrictMode>
    <LocalizationProvider>
      <BrowserRouter basename="/app/clips">
        <App />
      </BrowserRouter>
    </LocalizationProvider>
  </StrictMode>,
);
