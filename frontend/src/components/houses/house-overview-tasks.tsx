"use client";

import type { Activity } from "@/lib/household";
import type { Page } from "@/lib/communications";
import { Button, Card, LoadingState } from "../ui";
import { HouseholdIcon } from "./household-ui";
import { useHouseholdData } from "./use-household-data";
import { vietnamDate } from "./repayment-promise-form";

type TaskPage = Page<Activity> & { summary: { open: number; overdue: number } };
export function HouseOverviewTasks({
  houseId,
  onOpen,
}: {
  houseId: string;
  onOpen: () => void;
}) {
  const { data, error, reload } = useHouseholdData<TaskPage>(
    `/houses/${houseId}/household/chores?status=OPEN&limit=3`,
  );
  const today = vietnamDate();
  return (
    <Card className="dashboard-panel house-overview-tasks">
      <div className="dashboard-panel-heading">
        <div>
          <h3>Việc nhà cần làm</h3>
          <p>Chia sẻ việc nhỏ, giữ nhà gọn gàng.</p>
        </div>
        <button
          className="dashboard-view-link"
          type="button"
          aria-label="Mở việc nhà"
          onClick={onOpen}
        >
          ↗
        </button>
      </div>
      {error ? (
        <div className="house-widget-error" role="alert">
          <p>{error}</p>
          <Button variant="secondary" onClick={reload}>
            Tải lại việc nhà
          </Button>
        </div>
      ) : !data ? (
        <LoadingState message="Đang tải việc nhà…" />
      ) : (
        <>
          <div className="house-task-summary">
            <span>{data.summary.open} việc đang chờ</span>
            {data.summary.overdue > 0 && (
              <span className="house-task-overdue">
                {data.summary.overdue} quá hạn
              </span>
            )}
          </div>
          {data.items.length === 0 ? (
            <div className="house-dashboard-empty">
              <HouseholdIcon name="check" />
              <strong>Không có việc nhà đang chờ</strong>
              <p>Xem danh sách để thêm hoặc phân công việc mới.</p>
            </div>
          ) : (
            <div className="house-dashboard-task-list">
              {data.items.map((task) => {
                const due = task.dueOn?.slice(0, 10);
                const overdue = !!due && due < today;
                const dueLabel = due
                  ? `${due.slice(8, 10)}/${due.slice(5, 7)}${due.slice(0, 4) === today.slice(0, 4) ? "" : `/${due.slice(0, 4)}`}`
                  : "Chưa có hạn";
                return (
                  <button type="button" key={task.id} onClick={onOpen}>
                    <span className="house-task-marker" aria-hidden="true">
                      <HouseholdIcon name="chores" />
                    </span>
                    <span>
                      <strong>{task.title}</strong>
                      <small>
                        {task.assignee?.displayName ?? "Chưa phân công"}
                      </small>
                    </span>
                    <span
                      className={
                        overdue ? "house-task-overdue" : "house-task-date"
                      }
                    >
                      {due === today
                        ? "Hôm nay"
                        : overdue
                          ? `Quá hạn · ${dueLabel}`
                          : dueLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
