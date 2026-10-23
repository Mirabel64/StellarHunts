"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * localStorage key holding the user's explicit theme choice.
 */
export const THEME_STORAGE_KEY = "stellarhunts.theme";

/**
 * useTheme
 * --------
 * Light/dark theme state for the app (#694).
 *
 *  - Resolves the initial theme from the persisted choice, falling back to
 *    the system `prefers-color-scheme` preference on first visit.
 *  - Applies `dark` / `light` classes to `document.documentElement`, matching
 *    the Tailwind `darkMode: ["class"]` configuration.
 *  - Persists an explicit toggle choice in `localStorage`.
 *
 * @returns {{ theme: "light"|"dark", setTheme: Function, toggleTheme: Function }}
 */
export function useTheme() {
  const [theme, setThemeState] = useState("light");

  // On mount, read the persisted choice or the system preference. The inline
  // script in the root layout has already applied the class before hydration,
  // so this only syncs React state with what is on the document.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      setThemeState(stored);
      return;
    }

    const prefersDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    setThemeState(prefersDark ? "dark" : "light");
  }, []);

  const applyTheme = useCallback((next) => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.classList.toggle("dark", next === "dark");
    root.classList.toggle("light", next === "light");
  }, []);

  const setTheme = useCallback(
    (next) => {
      setThemeState(next);
      applyTheme(next);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      }
    },
    [applyTheme]
  );

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme };
}

export default useTheme;
