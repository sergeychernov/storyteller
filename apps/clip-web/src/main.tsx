import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App.js";
import { LocalizationProvider } from "./localization.js";
import "./styles/global.css";

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
