import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import App from "./App";
import { UpdateOverlay } from "./components/UpdateOverlay";
import { resumeUpdateSequence, startPwaUpdateWatcher } from "./lib/pwaUpdater";
import "./index.css";

// Resume an interrupted update sequence first (the reload that landed us here
// left its state in sessionStorage), then watch for the next deploy.
resumeUpdateSequence();
startPwaUpdateWatcher();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <HashRouter>
        <App />
        <UpdateOverlay />
      </HashRouter>
    </ThemeProvider>
  </React.StrictMode>
);
