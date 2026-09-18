export type AppTheme = "light" | "halloween";

export const THEME_STORE_KEY = "chitrader.load-tracker.theme.v1";

export function readAppTheme(): AppTheme {
  try {
    const raw = localStorage.getItem(THEME_STORE_KEY);
    if (raw === "halloween") return "halloween";
  } catch {
    /* private mode / blocked storage */
  }
  return "light";
}

export function applyAppTheme(theme: AppTheme) {
  const root = document.documentElement;
  if (theme === "halloween") {
    root.dataset.theme = "halloween";
  } else {
    delete root.dataset.theme;
  }
}

export function writeAppTheme(theme: AppTheme) {
  try {
    if (theme === "light") localStorage.removeItem(THEME_STORE_KEY);
    else localStorage.setItem(THEME_STORE_KEY, theme);
  } catch {
    /* ignore */
  }
  applyAppTheme(theme);
}
