import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { applyAppTheme, readAppTheme } from "./lib/theme";
import "./index.css";
import "./theme-light.css";
import "./theme-halloween.css";

applyAppTheme(readAppTheme());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

document.body.classList.add("app-ready");
