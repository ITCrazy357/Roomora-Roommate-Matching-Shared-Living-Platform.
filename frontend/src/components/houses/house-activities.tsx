"use client";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { type Activity, householdError } from "@/lib/household";
import { type Participant } from "@/lib/expenses";
import { type Page } from "@/lib/communications";
import { houseDate, type House } from "@/lib/houses";
import { Button, Card, ErrorState, LoadingState, Select } from "../ui";
import { Pagination } from "../communications/pagination";
import { ActivityForm } from "./activity-form";
import { ExpenseForm } from "./expense-form";
import { useHouseholdData } from "./use-household-data";
import { vietnamDate } from "./repayment-promise-form";
import {
  HouseholdHero,
  HouseholdMetric,
  HouseholdIcon,
  HouseholdPerson,
  HouseholdEmpty,
} from "./household-ui";

type ActivityPage = Page<Activity> & {
  summary: { open: number; done: number; cancelled: number; overdue: number };
};

export function HouseActivities({
  house,
  userId,
  people,
  shopping,
}: {
  house: House;
  userId: string;
  people: Participant[];
  shopping: boolean;
}) {
  const path = `/houses/${house.id}/household/${shopping ? "shopping" : "chores"}`;
  const [page, setPage] = useState(1),
    [status, setStatus] = useState("OPEN");
  const {
    data,
    error: loadError,
    reload,
  } = useHouseholdData<ActivityPage>(
    `${path}?page=${page}${status ? `&status=${status}` : ""}`,
  );
  const [form, setForm] = useState<Activity | "new" | null>(null),
    [expense, setExpense] = useState<Activity | null>(null);
  const [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function change(row: Activity, status: Activity["status"]) {
    if (pending) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      await apiFetch(`${path}/${row.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: row.version, status }),
      });
      setNotice(
        status === "DONE"
          ? shopping
            ? "Đã đánh dấu đã mua. Chưa ghi khoản chi."
            : "Đã xác nhận hoàn thành."
          : "Đã cập nhật trạng thái.",
      );
      reload();
    } catch (error) {
      setError(householdError(error));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="house-stack household-screen">
      <HouseholdHero
        title={shopping ? "Mua sắm chung" : "Việc nhà"}
        icon={shopping ? "shopping" : "chores"}
        description={
          shopping
            ? "Một danh sách chung, cả nhà cùng chuẩn bị. Ghi lại món cần mua và đánh dấu khi đã có đủ."
            : "Chia việc nhỏ, giữ nhà luôn dễ chịu. Cùng theo dõi người phụ trách và hoàn thành đúng hẹn."
        }
      >
        <Button
          onClick={() => {
            setExpense(null);
            setForm("new");
          }}
        >
          {shopping ? "+ Món cần mua" : "+ Thêm việc"}
        </Button>
      </HouseholdHero>
      {data && (
        <div className="household-metrics household-metrics-three">
          <HouseholdMetric
            label={shopping ? "Đang cần mua" : "Việc cần làm"}
            value={data.summary.open}
            icon={shopping ? "shopping" : "chores"}
            detail="Trong toàn bộ danh sách"
          />
          <HouseholdMetric
            label={shopping ? "Đã mua xong" : "Đã hoàn thành"}
            value={data.summary.done}
            icon="check"
            tone="success"
            detail="Cả nhà cùng góp sức"
          />
          <HouseholdMetric
            label="Đã quá hạn"
            value={data.summary.overdue}
            icon="clock"
            tone="warning"
            detail="Mục chưa hoàn thành đúng hạn"
          />
        </div>
      )}
      <div className="household-toolbar">
        <div>
          <h3>{shopping ? "Danh sách mua chung" : "Bảng việc của nhà"}</h3>
          <p className="text-muted">
            {data
              ? `${data.total} ${shopping ? "món" : "việc"} trong bộ lọc này`
              : "Đang tải danh sách…"}
          </p>
        </div>
        <Select
          id="activity-filter"
          label="Trạng thái"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="OPEN">{shopping ? "Cần mua" : "Cần làm"}</option>
          <option value="DONE">{shopping ? "Đã mua" : "Đã hoàn thành"}</option>
          <option value="CANCELLED">Đã hủy</option>
          <option value="">Tất cả</option>
        </Select>
      </div>
      {error && <ErrorState message={error} />}
      {notice && (
        <p className="success-state" role="status">
          {notice}
        </p>
      )}
      {form && (
        <Card className="house-panel">
          <ActivityForm
            key={form === "new" ? "new" : form.id}
            path={path}
            shopping={shopping}
            people={people}
            userId={userId}
            activity={form === "new" ? undefined : form}
            onCancel={() => setForm(null)}
            onSaved={() => {
              setForm(null);
              setNotice("Đã lưu.");
              reload();
            }}
          />
        </Card>
      )}
      {expense && (
        <Card className="house-panel">
          <p className="finance-note">
            Kiểm tra sổ chi phí để tránh ghi lại món đã được người khác ghi
            nhận.
          </p>
          <ExpenseForm
            key={expense.id}
            houseId={house.id}
            userId={userId}
            participants={people}
            initial={{
              title: expense.title,
              payerId:
                expense.assignee && !expense.assignee.leftAt
                  ? expense.assigneeId!
                  : userId,
              category: "HOUSEHOLD",
            }}
            onCancel={() => setExpense(null)}
            onSaved={() => {
              setExpense(null);
              setNotice("Đã ghi khoản chi. Xem trong tab Chi phí.");
            }}
          />
        </Card>
      )}
      {loadError && (
        <ErrorState
          message={loadError}
          action={<Button onClick={reload}>Thử lại</Button>}
        />
      )}
      {!data && !loadError && <LoadingState />}
      {data?.items.length === 0 && (
        <Card className="house-panel">
          <HouseholdEmpty
            icon={shopping ? "shopping" : "chores"}
            title={
              shopping ? "Danh sách đang trống" : "Chưa có việc trong danh sách"
            }
            description={
              shopping
                ? "Thêm món cần mua để cả nhà cùng theo dõi, hoặc chọn trạng thái khác."
                : "Thêm việc, chọn người phụ trách và hạn hoàn thành để bắt đầu."
            }
          />
        </Card>
      )}
      <div className="household-card-grid">
        {data?.items.map((row) => {
          const editor = userId === house.ownerId || userId === row.createdById;
          const performer =
            row.assignee?.userId === userId || (shopping && !row.assigneeId);
          const overdue =
            row.status === "OPEN" &&
            row.dueOn &&
            row.dueOn.slice(0, 10) < vietnamDate();
          return (
            <Card
              key={row.id}
              className={`house-panel household-item household-activity ${row.status === "DONE" ? "household-done" : row.status === "CANCELLED" ? "household-cancelled" : overdue ? "household-overdue" : ""}`}
            >
              <div className="household-item-heading">
                <span className="household-icon-tile">
                  <HouseholdIcon
                    name={
                      row.status === "DONE"
                        ? "check"
                        : shopping
                          ? "shopping"
                          : "chores"
                    }
                  />
                </span>
                <span
                  className={`household-status ${overdue ? "household-tone-danger" : row.status === "DONE" ? "household-tone-success" : row.status === "CANCELLED" ? "household-tone-neutral" : "household-tone-warning"}`}
                >
                  {row.status === "OPEN"
                    ? overdue
                      ? "Quá hạn"
                      : shopping
                        ? "Cần mua"
                        : "Cần làm"
                    : row.status === "DONE"
                      ? shopping
                        ? "Đã mua"
                        : "Đã hoàn thành"
                      : "Đã hủy"}
                </span>
              </div>
              <h3>{row.title}</h3>
              {row.quantity && (
                <span className="household-quantity">
                  Số lượng · <strong>{row.quantity}</strong>
                </span>
              )}
              {row.note && (
                <p className="house-preline text-muted">{row.note}</p>
              )}
              <div className="household-assignment">
                <HouseholdPerson
                  name={row.assignee?.displayName ?? "Chưa phân công"}
                  avatarUrl={row.assignee?.avatarUrl}
                  detail={
                    row.assignee?.leftAt
                      ? "Đã rời nhà"
                      : row.assignee?.isGuest
                        ? "Ngoài app · Ghi nhận thủ công"
                        : "Người phụ trách"
                  }
                />
                <span
                  className={`household-due ${overdue ? "text-danger" : ""}`}
                >
                  <HouseholdIcon name="calendar" />
                  <span>
                    <small>Hạn hoàn thành</small>
                    <strong>
                      {row.dueOn ? houseDate(row.dueOn) : "Chưa đặt hạn"}
                    </strong>
                  </span>
                </span>
              </div>
              {row.completedAt && (
                <p className="text-muted">
                  Ghi nhận bởi {row.completedByName} ·{" "}
                  {houseDate(row.completedAt)}
                  {row.assignee?.isGuest ? " · Xác nhận thủ công" : ""}
                </p>
              )}
              <div className="finance-actions household-item-actions">
                {row.status === "OPEN" && (editor || performer) && (
                  <Button
                    disabled={pending}
                    onClick={() => void change(row, "DONE")}
                  >
                    {shopping ? "Đánh dấu đã mua" : "Xác nhận hoàn thành"}
                  </Button>
                )}
                {row.status === "OPEN" && editor && (
                  <>
                    <Button
                      variant="secondary"
                      disabled={pending}
                      onClick={() => {
                        setExpense(null);
                        setForm(row);
                      }}
                    >
                      Sửa
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={pending}
                      onClick={() => {
                        if (window.confirm("Hủy mục này?"))
                          void change(row, "CANCELLED");
                      }}
                    >
                      Hủy
                    </Button>
                  </>
                )}
                {row.status !== "OPEN" &&
                  (editor || (performer && row.status === "DONE")) && (
                    <Button
                      variant="secondary"
                      disabled={pending}
                      onClick={() => void change(row, "OPEN")}
                    >
                      Mở lại
                    </Button>
                  )}
                {shopping && row.status === "DONE" && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setForm(null);
                      setExpense(row);
                    }}
                  >
                    Ghi khoản chi
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      {data && <Pagination page={page} pages={data.pages} onChange={setPage} />}
      <p className="household-help">
        <HouseholdIcon name={shopping ? "wallet" : "people"} />
        {shopping
          ? "Đánh dấu đã mua chưa ghi chi phí. Chọn “Ghi khoản chi” và nhập số tiền thực tế để đưa vào sổ."
          : "Người phụ trách, người tạo hoặc trưởng nhà có thể xác nhận hoàn thành. Với người ngoài app, cả nhà ghi nhận thủ công."}
      </p>
    </div>
  );
}
