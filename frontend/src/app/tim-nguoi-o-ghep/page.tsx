import type { Metadata } from "next";
import { RoommateBrowser } from "@/components/people/roommate-browser";

export const metadata: Metadata = { title: "Tìm người ở ghép" };

export default function RoommatesPage() {
  return <RoommateBrowser />;
}
