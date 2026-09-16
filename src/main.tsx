import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { applyAppTheme, readAppTheme } from "./lib/theme";
import "./index.css";
import "./theme-light.css";
import "./theme-halloween.css";

function keepSplashWithError(err: unknown) {
  const text = err instanceof Error ? err.message : String(err ?? "Unknown startup error");
  const splash = document.getElementById("splash");
  const msg = document.getElementById("splash-error");
  document.body.classList.remove("app-ready");
  if (splash) splash.style.display = "flex";
  if (msg) {
    msg.hidden = false;
    msg.textContent = text;
  }
}

window.addEventListener("error", (event) => {
  keepSplashWithError(event.error ?? event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  keepSplashWithError(event.reason);
});

applyAppTheme(readAppTheme());

const root = document.getElementById("root");
if (!root) {
  keepSplashWithError("Missing root element");
} else {
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}
