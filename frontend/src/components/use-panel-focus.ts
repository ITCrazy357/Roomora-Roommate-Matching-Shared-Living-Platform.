"use client";
import { useLayoutEffect, useRef } from "react";

// Change focus only when the user opens/selects a panel, not when its data refreshes.
export function usePanelFocus<T extends HTMLElement = HTMLDivElement>(
  opened: unknown,
) {
  const panel = useRef<T>(null);
  useLayoutEffect(() => {
    const element = panel.current;
    if (!opened || !element) return;
    const trigger = document.activeElement;
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches
      ? "instant"
      : "smooth";
    element.focus({ preventScroll: true });
    const bounds = element.getBoundingClientRect();
    if (bounds.top < 16 || bounds.bottom > window.innerHeight - 16)
      element.scrollIntoView({ behavior, block: "start" });
    return () => {
      // Closing returns to the opener. Moving to another control keeps that focus.
      if (
        trigger instanceof HTMLElement &&
        trigger.isConnected &&
        element.contains(document.activeElement)
      ) {
        trigger.focus({ preventScroll: true });
        trigger.scrollIntoView({ behavior: "instant", block: "nearest" });
      }
    };
  }, [opened]);
  return panel;
}
