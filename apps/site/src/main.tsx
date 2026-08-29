import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { analytics, resolveAnalyticsRelayUrl, resolveAnalyticsServerZone } from "@storyteller/analytics";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App.js";
import { LocalizationProvider } from "@storyteller/web-ui";
import "@storyteller/web-ui/global.css";

analytics.initialize({
  apiKey: import.meta.env.VITE_AMPLITUDE_API_KEY ?? "",
  relayUrl: resolveAnalyticsRelayUrl(import.meta.env.VITE_API_URL),
  serverZone: resolveAnalyticsServerZone(import.meta.env.VITE_AMPLITUDE_SERVER_ZONE),
  surface: "site",
});

const root = document.getElementById("root");
if (!root) throw new Error("root element not found");
root.replaceChildren();

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={new QueryClient()}>
      <LocalizationProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </LocalizationProvider>
    </QueryClientProvider>
  </StrictMode>,
);
