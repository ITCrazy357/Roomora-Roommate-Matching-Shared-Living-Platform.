import type { Message } from "./communications";

export interface HousePoll {
  question: string;
  closedAt: string | null;
  totalVotes: number;
  myOptionId: string | null;
  options: { id: string; text: string; votes: number }[];
}
export interface HouseMessage extends Message {
  sender: {
    displayName: string;
    avatarUrl: string | null;
    role: "OWNER" | "MEMBER";
  };
  poll: HousePoll | null;
}
