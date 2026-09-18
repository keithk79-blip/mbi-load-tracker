import { useEffect, useState } from "react";
import { applyAppTheme, readAppTheme, writeAppTheme, type AppTheme } from "../lib/theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<AppTheme>(() => readAppTheme());

  useEffect(() => {
    applyAppTheme(theme);
  }, [theme]);

  const halloween = theme === "halloween";

  return (
    <button
      type="button"
      className={halloween ? "theme-toggle is-on" : "theme-toggle"}
      aria-pressed={halloween}
      onClick={() => {
        const next: AppTheme = halloween ? "light" : "halloween";
        writeAppTheme(next);
        setTheme(next);
      }}
    >
      {halloween ? "Halloween on" : "Halloween"}
    </button>
  );
}
