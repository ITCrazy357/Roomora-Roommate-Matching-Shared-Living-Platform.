"use client";

import { useSyncExternalStore } from "react";

function subscribe(listener: () => void) {
  function sync(event: StorageEvent) {
    if (event.key !== "roomora-theme" && event.key !== null) return;
    document.documentElement.dataset.theme = event.newValue === "dark" ? "dark" : "light";
    listener();
  }
  window.addEventListener("roomora-theme-change", listener);
  window.addEventListener("storage", sync);
  return () => {
    window.removeEventListener("roomora-theme-change", listener);
    window.removeEventListener("storage", sync);
  };
}

function isDark() {
  return document.documentElement.dataset.theme === "dark";
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);
  return (
    <button
      type="button"
      className="theme-toggle"
      role="switch"
      aria-checked={dark}
      aria-label="Chế độ tối"
      title={dark ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}
      onClick={() => {
        const theme = dark ? "light" : "dark";
        document.documentElement.dataset.theme = theme;
        try { localStorage.setItem("roomora-theme", theme); } catch { /* The toggle still works when storage is unavailable. */ }
        window.dispatchEvent(new Event("roomora-theme-change"));
      }}
    >
      <span className="theme-toggle-track" aria-hidden="true">
        <svg className="theme-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></svg>
        <svg className="theme-moon" viewBox="0 0 24 24"><path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z" /></svg>
        <span className="theme-toggle-thumb" />
      </span>
    </button>
  );
}
