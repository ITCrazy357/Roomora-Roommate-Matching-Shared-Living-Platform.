"use client";
import { useState } from "react";
import type { Page } from "@/lib/communications";
import { sharingChoiceLabels, type SharingRound } from "@/lib/cost-sharing";
import { Button, ErrorState, LoadingState } from "../ui";
import { Pagination } from "../communications/pagination";
import { useHouseholdData } from "./use-household-data";
import { HouseholdPerson } from "./household-ui";

export function SharingHistory({
  houseId,
  periodId,
}: {
  houseId: string;
  periodId: string;
}) {
  const [page, setPage] = useState(1);
  const { data, error, reload } = useHouseholdData<Page<SharingRound>>(
    `/houses/${houseId}/cost-sharing/periods/${periodId}?page=${page}&limit=5`,
  );
  return (
    <div className="sharing-history">
      {error && (
        <ErrorState
          message={error}
          action={<Button onClick={reload}>Tải lại</Button>}
        />
      )}{" "}
      {!data && !error && <LoadingState />}
      {data?.items.map((round) => (
        <article className="sharing-history-round" key={round.id}>
          <h4>
            Vòng {round.number} ·{" "}
            {round.phase === "PREFERENCE"
              ? "Chọn cách chia"
              : round.mode === "WEIGHTED"
                ? "Đề xuất tỷ lệ"
                : "Đề xuất chia đều"}{" "}
            ·{" "}
            {round.status === "AGREED"
              ? "Đã thông qua"
              : round.status === "REJECTED"
                ? "Đã từ chối"
                : round.status === "SUPERSEDED"
                  ? "Đã có vòng mới"
                  : round.status === "OPEN"
                    ? "Đang bình chọn"
                    : round.status === "FALLBACK"
                      ? "Đã dùng dự phòng"
                      : "Đã hết hạn"}
          </h4>
          {round.reason && <p className="house-preline">{round.reason}</p>}
          {round.members.map((member) => (
            <div className="sharing-history-member" key={member.userId}>
              <HouseholdPerson
                name={member.displayName}
                avatarUrl={member.avatarUrl}
              />
              <span>
                {round.shares && round.mode === "WEIGHTED"
                  ? `${(round.shares.find((row) => row.participantId === member.participantId)?.basisPoints ?? 0) / 100}% · `
                  : ""}
                {round.votes.find((vote) => vote.userId === member.userId)
                  ? sharingChoiceLabels[
                      round.votes.find((vote) => vote.userId === member.userId)!
                        .choice
                    ]
                  : "Chưa có phiếu"}
              </span>
            </div>
          ))}
          <details>
            <summary>
              Lịch sử thay đổi phiếu ({round.events?.length ?? 0})
            </summary>
            {round.events?.map((event) => (
              <p key={event.id}>
                {round.members.find((member) => member.userId === event.userId)
                  ?.displayName ?? "Thành viên"}{" "}
                · {sharingChoiceLabels[event.choice]} ·{" "}
                {new Intl.DateTimeFormat("vi-VN", {
                  dateStyle: "short",
                  timeStyle: "short",
                  timeZone: "Asia/Ho_Chi_Minh",
                }).format(new Date(event.createdAt))}
              </p>
            ))}
          </details>
        </article>
      ))}
      {data && <Pagination page={page} pages={data.pages} onChange={setPage} />}
    </div>
  );
}
