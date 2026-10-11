"use client";
import type { ReactNode } from "react";
import { usePanelFocus } from "./use-panel-focus";

export function FocusPanel({
  children,
  label,
  focusKey = label,
  className = "",
}: {
  children: ReactNode;
  label: string;
  focusKey?: unknown;
  className?: string;
}) {
  const panel = usePanelFocus(focusKey);
  return (
    <div
      ref={panel}
      tabIndex={-1}
      role="region"
      aria-label={label}
      className={`focus-panel ${className}`}
    >
      {children}
    </div>
  );
}
