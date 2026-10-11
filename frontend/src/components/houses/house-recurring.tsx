"use client";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { money, type Participant } from "@/lib/expenses";
import {
  categories,
  householdError,
  type RecurringDraft,
  type RecurringRule,
} from "@/lib/household";
import { houseDate, type House } from "@/lib/houses";
import type { Page } from "@/lib/communications";
import { Button, Card, ErrorState, LoadingState } from "../ui";
import { Pagination } from "../communications/pagination";
import { ExpenseForm } from "./expense-form";
import { RecurringRuleForm } from "./recurring-rule-form";
import { FocusPanel } from "../focus-panel";
import { useHouseholdData } from "./use-household-data";
import {
  HouseholdHero,
  HouseholdMetric,
  HouseholdIcon,
  HouseholdPerson,
  HouseholdEmpty,
  type HouseholdIconName,
} from "./household-ui";

const categoryIcons: Partial<
  Record<RecurringRule["category"], HouseholdIconName>
> = {
  INTERNET: "internet",
  ELECTRICITY: "electricity",
  WATER: "water",
  RENT: "home",
  GROCERIES: "shopping",
  HOUSEHOLD: "shopping",
};

export function HouseRecurring({
  house,
  userId,
  people,
}: {
  house: House;
  userId: string;
  people: Participant[];
}) {
  const path = `/houses/${house.id}/household`;
  const rules = useHouseholdData<RecurringRule[]>(`${path}/recurring`);
  const [page, setPage] = useState(1);
  const drafts = useHouseholdData<Page<RecurringDraft>>(
    `${path}/drafts?page=${page}`,
  );
  const [form, setForm] = useState<RecurringRule | "new" | null>(null),
    [draft, setDraft] = useState<RecurringDraft | null>(null);
  const [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const reload = () => {
    rules.reload();
    drafts.reload();
  };
  async function action(suffix: string, body: object, message: string) {
    if (pending) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      await apiFetch(`${path}/${suffix}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setNotice(message);
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
        title="Chi phí định kỳ"
        icon="calendar"
        description="Nhớ những khoản đều đặn, chủ động mỗi kỳ. Roomora chuẩn bị bản nháp để bạn kiểm tra và xác nhận trước khi ghi vào sổ."
      >
        <Button
          onClick={() => {
            setDraft(null);
            setForm("new");
          }}
        >
          + Thêm quy tắc
        </Button>
      </HouseholdHero>
      <div className="household-metrics household-metrics-three">
        <HouseholdMetric
          label="Quy tắc đang chạy"
          value={
            rules.data ? rules.data.filter((row) => row.enabled).length : "—"
          }
          icon="calendar"
          detail="Tự chuẩn bị nháp khi đến hạn"
        />
        <HouseholdMetric
          label="Nháp chờ xác nhận"
          value={drafts.data?.total ?? "—"}
          icon="clock"
          tone="warning"
          detail="Kiểm tra trước khi ghi chi phí"
        />
        <HouseholdMetric
          label="Quy tắc tạm dừng"
          value={
            rules.data ? rules.data.filter((row) => !row.enabled).length : "—"
          }
          icon="check"
          tone="info"
          detail="Kích hoạt lại bất cứ lúc nào"
        />
      </div>
      {error && <ErrorState message={error} />}
      {notice && (
        <p className="success-state" role="status">
          {notice}
        </p>
      )}
      {form && (
        <FocusPanel
          className="card house-panel"
          label="Ghi / sửa quy tắc chi phí định kỳ"
          focusKey={form}
        >
          <RecurringRuleForm
            key={form === "new" ? "new" : form.id}
            houseId={house.id}
            userId={userId}
            people={people}
            rule={form === "new" ? undefined : form}
            onCancel={() => setForm(null)}
            onSaved={() => {
              setForm(null);
              setNotice(
                "Đã lưu quy tắc. Nháp đến hạn sẽ xuất hiện khi hệ thống kiểm tra lịch.",
              );
              reload();
            }}
          />
        </FocusPanel>
      )}
      {draft && (
        <FocusPanel
          className="card house-panel"
          label="Xác nhận khoản chi định kỳ"
          focusKey={draft}
        >
          <ExpenseForm
            key={draft.id}
            houseId={house.id}
            userId={userId}
            participants={people}
            recurringDraft={draft}
            onCancel={() => setDraft(null)}
            onSaved={() => {
              setDraft(null);
              setNotice("Đã xác nhận khoản định kỳ vào sổ chi phí.");
              reload();
            }}
          />
        </FocusPanel>
      )}
      <Card className="house-panel household-drafts">
        <div className="household-section-heading">
          <div>
            <span className="eyebrow">KIỂM TRA TRƯỚC KHI GHI SỔ</span>
            <h2>
              Nháp cần xác nhận {drafts.data ? `(${drafts.data.total})` : ""}
            </h2>
          </div>
          <Button variant="secondary" onClick={reload}>
            Tải lại
          </Button>
        </div>
        {drafts.error && <ErrorState message={drafts.error} />}
        {!drafts.data && !drafts.error && <LoadingState />}
        {drafts.data?.items.length === 0 && (
          <HouseholdEmpty
            icon="check"
            title="Chưa có nháp đang chờ."
            description="Đến hạn, bản nháp sẽ xuất hiện ở đây. Bạn có thể kiểm tra số tiền và những người cùng chia."
          />
        )}
        {drafts.data?.items.map((row) => {
          const allowed =
            house.ownerId === userId ||
            row.rule.createdById === userId ||
            people.some((p) => p.id === row.payerId && p.userId === userId);
          const changed = [row.payerId, ...row.participantIds].some(
            (id) => !people.some((p) => p.id === id && !p.leftAt),
          );
          return (
            <article className="household-draft-row" key={row.id}>
              <span className="household-icon-tile household-tone-warning">
                <HouseholdIcon name="wallet" />
              </span>
              <div className="household-draft-content">
                <h3>{row.title}</h3>
                <p className="text-muted">
                  {houseDate(row.dueOn)} · {categories[row.category]} ·{" "}
                  <strong>
                    {row.amount === null
                      ? "Cần nhập số tiền"
                      : money(row.amount)}
                  </strong>
                </p>
                {changed && (
                  <p className="text-danger">
                    Có người đã rời nhà. Chọn lại người trả và danh sách chia
                    khi xác nhận.
                  </p>
                )}
                {allowed && (
                  <div className="finance-actions">
                    <Button
                      disabled={pending}
                      onClick={() => {
                        setForm(null);
                        setDraft(row);
                      }}
                    >
                      Kiểm tra & Xác nhận
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={pending}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Bỏ qua nháp của kỳ này? Kỳ tiếp theo vẫn được tạo.",
                          )
                        )
                          void action(
                            `drafts/${row.id}/skip`,
                            { version: row.version },
                            "Đã bỏ qua nháp kỳ này.",
                          );
                      }}
                    >
                      Bỏ qua kỳ này
                    </Button>
                  </div>
                )}
              </div>
            </article>
          );
        })}
        {drafts.data && (
          <Pagination
            page={page}
            pages={drafts.data.pages}
            onChange={setPage}
          />
        )}
      </Card>
      {rules.error && (
        <ErrorState
          message={rules.error}
          action={<Button onClick={rules.reload}>Thử lại</Button>}
        />
      )}
      {!rules.data && !rules.error && <LoadingState />}
      {rules.data?.length === 0 && (
        <Card className="house-panel">
          <HouseholdEmpty
            icon="calendar"
            title="Chưa có quy tắc định kỳ"
            description="Thêm tiền thuê, internet hoặc các khoản sinh hoạt hằng tháng để nhận nháp đúng hạn."
          />
        </Card>
      )}
      <div className="household-section-heading">
        <h3>Quy tắc của nhà</h3>
        <span className="text-muted">{rules.data?.length ?? 0} quy tắc</span>
      </div>
      <div className="household-card-grid">
        {rules.data?.map((row) => (
          <Card
            className={`house-panel household-item household-recurring ${!row.enabled ? "household-cancelled" : ""}`}
            key={row.id}
          >
            <div className="household-item-heading">
              <span
                className={`household-icon-tile category-${row.category.toLowerCase()}`}
              >
                <HouseholdIcon name={categoryIcons[row.category] ?? "wallet"} />
              </span>
              <span
                className={`household-status household-tone-${row.enabled ? "success" : "neutral"}`}
              >
                {row.enabled ? "Đang hoạt động" : "Tạm dừng"}
              </span>
            </div>
            <h3>{row.title}</h3>
            <span className="household-category-label">
              {categories[row.category]}
            </span>
            <p className="household-recurring-amount">
              {row.amount === null ? (
                <>
                  <strong>Theo thực tế</strong>
                  <small>Nhập số tiền khi xác nhận</small>
                </>
              ) : (
                <>
                  <strong>{money(row.amount)}</strong>
                  <small>/ tháng</small>
                </>
              )}
            </p>
            <div className="household-schedule">
              <span>
                <small>Lịch hằng tháng</small>
                <strong>Ngày {row.dayOfMonth}</strong>
              </span>
              <span>
                <small>
                  {row.enabled ? "Kỳ tiếp theo" : "Mốc lịch khi dừng"}
                </small>
                <strong>{houseDate(row.nextOn)}</strong>
              </span>
            </div>
            <div className="household-assignment">
              <HouseholdPerson
                name={row.payer.displayName}
                avatarUrl={row.payer.avatarUrl}
                detail={
                  row.payer.leftAt
                    ? "Đã rời · Cần phân công lại"
                    : row.payer.isGuest
                      ? "Ngoài app · Nhắc qua trưởng nhà"
                      : "Người trả trước"
                }
              />
              <span className="household-share-count">
                <HouseholdIcon name="people" />
                Dự kiến {row.participantIds.length} người
              </span>
            </div>
            {(userId === house.ownerId || userId === row.createdById) && (
              <div className="finance-actions household-item-actions">
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() => {
                    setDraft(null);
                    setForm(row);
                  }}
                >
                  Sửa quy tắc
                </Button>
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() =>
                    void action(
                      `recurring/${row.id}/enabled`,
                      { version: row.version, enabled: !row.enabled },
                      row.enabled ? "Đã tạm dừng." : "Đã kích hoạt lại.",
                    )
                  }
                >
                  {row.enabled ? "Tạm dừng" : "Kích hoạt lại"}
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
      <p className="household-help">
        <HouseholdIcon name="calendar" />
        Điện, nước biến động cần nhập số tiền thực tế. Tạm dừng giữ nháp đã tạo;
        kích hoạt lại bỏ qua các kỳ đã qua trong thời gian dừng.
      </p>
    </div>
  );
}
