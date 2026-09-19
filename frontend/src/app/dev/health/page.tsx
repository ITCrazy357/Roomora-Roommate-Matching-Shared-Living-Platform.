import { notFound } from "next/navigation";
import { HealthPanel } from "./health-panel";

export default function DevHealthPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <HealthPanel />;
}
