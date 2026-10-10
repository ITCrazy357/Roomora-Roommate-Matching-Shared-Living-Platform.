import type { ReactNode } from "react";
import { Card } from "../ui";
import { PersonAvatar } from "../person-avatar";

const paths = {
  home: "M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z",
  chores: "M8 3h8v4H8z M8 5H5v16h14V5h-3 M8 12l2 2 5-5 M8 18h7",
  shopping: "M3 3h2l3 12h11l2-8H6 M9 20h.01 M18 20h.01",
  calendar: "M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16 M8 14h3 M8 17h6",
  report: "M4 21V3h16v18Z M8 16v-3 M12 16V9 M16 16v-5",
  check: "m5 12 4 4L19 6",
  clock: "M12 8v4l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  people:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M17 4a4 4 0 0 1 0 7 M22 21v-2a4 4 0 0 0-3-4",
  wallet: "M3 6h16V3H5a2 2 0 0 0-2 2v14h18V6Z M21 10h-6v5h6 M17 12.5h.01",
  download: "M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5",
  internet:
    "M2 8a16 16 0 0 1 20 0 M5 12a11 11 0 0 1 14 0 M8 16a6 6 0 0 1 8 0 M12 20h.01",
  electricity: "m13 2-9 12h7l-1 8 10-13h-7Z",
  water: "M12 3S5 11 5 15a7 7 0 0 0 14 0c0-4-7-12-7-12Z M9 16a3 3 0 0 0 3 3",
} as const;
export type HouseholdIconName = keyof typeof paths;

export function HouseholdIcon({ name }: { name: HouseholdIconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}

export function HouseholdHero({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon: HouseholdIconName;
  children: ReactNode;
}) {
  return (
    <Card className="house-panel household-hero">
      <div className="household-hero-content">
        <span className="eyebrow">NHÀ CHUNG · CÙNG NHAU MỖI NGÀY</span>
        <h2>{title}</h2>
        <p>{description}</p>
        <div className="household-hero-actions">{children}</div>
      </div>
      <div className="household-hero-art" aria-hidden="true">
        <span className="household-art-orbit">
          <HouseholdIcon name="home" />
        </span>
        <span className="household-art-main">
          <HouseholdIcon name={icon} />
        </span>
        <span className="household-art-check">
          <HouseholdIcon name="check" />
        </span>
      </div>
    </Card>
  );
}

export function HouseholdMetric({
  label,
  value,
  detail,
  icon,
  tone = "brand",
}: {
  label: string;
  value: ReactNode;
  detail?: string;
  icon: HouseholdIconName;
  tone?: "brand" | "success" | "warning" | "info";
}) {
  return (
    <Card className={`household-metric household-tone-${tone}`}>
      <span className="household-icon-tile">
        <HouseholdIcon name={icon} />
      </span>
      <span className="household-metric-label">{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </Card>
  );
}

export function HouseholdPerson({
  name,
  detail,
  avatarUrl,
}: {
  name: string;
  detail?: string;
  avatarUrl?: string | null;
}) {
  return (
    <span className="household-person">
      <PersonAvatar person={{ displayName: name, avatarUrl: avatarUrl ?? null }} />
      <span>
        <strong>{name}</strong>
        {detail && <small>{detail}</small>}
      </span>
    </span>
  );
}

export function HouseholdEmpty({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: HouseholdIconName;
}) {
  return (
    <div className="household-empty">
      <span className="household-icon-tile">
        <HouseholdIcon name={icon} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
