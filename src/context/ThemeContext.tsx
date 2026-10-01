"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";

interface ThemeContextType {
  themeMode: ThemeMode;
  resolvedTheme: "light" | "dark";
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  themeMode: "system",
  resolvedTheme: "light",
  setThemeMode: () => {},
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const saved = localStorage.getItem("aide-theme") as ThemeMode | null;
    const mode = saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
    setThemeModeState(mode);
    applyTheme(mode);
  }, []);

  const applyTheme = (mode: ThemeMode) => {
    let active: "light" | "dark" = "light";
    if (mode === "system") {
      const isSystemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      active = isSystemDark ? "dark" : "light";
    } else {
      active = mode;
    }

    setResolvedTheme(active);

    if (active === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    localStorage.setItem("aide-theme", mode);
    applyTheme(mode);
  };

  const toggleTheme = () => {
    const next = resolvedTheme === "light" ? "dark" : "light";
    setThemeMode(next);
  };

  return (
    <ThemeContext.Provider value={{ themeMode, resolvedTheme, setThemeMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
