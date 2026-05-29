import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import { clearGame } from "./persistence";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary onReset={clearGame}>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
