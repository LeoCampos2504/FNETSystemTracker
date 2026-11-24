"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { usePathname } from "next/navigation";

type Theme = "light" | "dark";
const STORAGE_KEY = "fnet-theme";
const THEME_EVENT = "fnet-theme-change";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  window.dispatchEvent(new Event(THEME_EVENT));
}

function subscribe(callback: () => void) {
  window.addEventListener(THEME_EVENT, callback);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    const theme: Theme = event.newValue === "dark" || (event.newValue === null && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
    applyTheme(theme);
  };
  const preference = window.matchMedia("(prefers-color-scheme: dark)");
  const onPreferenceChange = (event: MediaQueryListEvent) => {
    if (window.localStorage.getItem(STORAGE_KEY) !== null) return;
    applyTheme(event.matches ? "dark" : "light");
  };
  window.addEventListener("storage", onStorage);
  preference.addEventListener("change", onPreferenceChange);
  return () => {
    window.removeEventListener(THEME_EVENT, callback);
    window.removeEventListener("storage", onStorage);
    preference.removeEventListener("change", onPreferenceChange);
  };
}

function getSnapshot(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function getServerSnapshot(): Theme {
  return "light";
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const initial: Theme = saved === "dark" || saved === "light"
      ? saved
      : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    applyTheme(initial);
  }, []);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  const label = theme === "dark" ? "Activar modo claro" : "Activar modo oscuro";
  if (pathname === "/compras") return null;
  return <button className={`theme-toggle icon-button ${className}`.trim()} type="button" onClick={toggleTheme} aria-label={label} title={label} aria-pressed={theme === "dark"}>
    {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
  </button>;
}
