import type { Metadata } from "next";
import { Appointments } from "@/components/communications/appointments";
export const metadata: Metadata = { title: "Lịch hẹn" };
export default function AppointmentsPage() {
  return <Appointments />;
}
