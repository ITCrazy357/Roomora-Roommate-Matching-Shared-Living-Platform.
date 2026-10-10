"use client";
import type { House } from "@/lib/houses";
import type { Participant } from "@/lib/expenses";
import { Button, ErrorState, LoadingState } from "../ui";
import { useHouseholdData } from "./use-household-data";
import { HouseActivities } from "./house-activities";
import { HouseRecurring } from "./house-recurring";
import { HouseReports } from "./house-reports";

export type HouseholdMode = "chores" | "shopping" | "recurring" | "reports";
export function HouseholdPanel({
  house,
  userId,
  mode,
}: {
  house: House;
  userId: string;
  mode: HouseholdMode;
}) {
  const {
    data: people,
    error,
    reload,
  } = useHouseholdData<{ items: Participant[] }>(
    `/houses/${house.id}/expenses/participants`,
  );
  if (mode === "reports") return <HouseReports houseId={house.id} />;
  if (error)
    return (
      <ErrorState
        message={error}
        action={<Button onClick={reload}>Thử lại</Button>}
      />
    );
  if (!people) return <LoadingState />;
  return mode === "recurring" ? (
    <HouseRecurring house={house} userId={userId} people={people.items} />
  ) : (
    <HouseActivities
      key={mode}
      house={house}
      userId={userId}
      people={people.items}
      shopping={mode === "shopping"}
    />
  );
}
