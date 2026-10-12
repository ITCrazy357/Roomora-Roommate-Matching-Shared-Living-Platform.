"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { ProfileIcon } from "./profile-icon";
import { useReducedMotion } from "./use-reduced-motion";

function Placeholder() {
  return (
    <div className="roomora-figure-placeholder">
      <ProfileIcon name="home" />
    </div>
  );
}

const figures = {
  home: dynamic(
    () => import("@lucasmarkes/hairline/react").then((module) => module.Elevator),
    { loading: Placeholder, ssr: false },
  ),
  people: dynamic(
    () => import("@lucasmarkes/hairline/react").then((module) => module.Hub),
    { loading: Placeholder, ssr: false },
  ),
  search: dynamic(
    () => import("@lucasmarkes/hairline/react").then((module) => module.Loupe),
    { loading: Placeholder, ssr: false },
  ),
  empty: dynamic(
    () => import("@lucasmarkes/hairline/react").then((module) => module.Drawer),
    { loading: Placeholder, ssr: false },
  ),
};

// Decorative only: headings and actions always carry the actual information.
export function RoomoraFigure({
  kind = "home",
  play = false,
  className = "",
}: {
  kind?: keyof typeof figures;
  play?: boolean;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const reducedMotion = useReducedMotion();
  const Figure = figures[kind];

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "120px" },
    );
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={container} aria-hidden="true" className={`roomora-figure ${className}`}>
      {visible ? (
        <Figure theme="light" intensity={0.3} play={play && !reducedMotion} />
      ) : (
        <Placeholder />
      )}
    </div>
  );
}
