"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { apiFetch, apiUrl } from "@/lib/api";
import {
  expenseError,
  expenseLabels,
  paymentLabels,
  money,
  type ExpensePage,
  type Expense,
  type Participant,
  type Balance,
  type Transfer,
  type Payment,
  type ExpenseChange,
} from "@/lib/expenses";
import { formatTime, type Page } from "@/lib/communications";
import { useUpdates } from "../communications/updates-provider";
import { Pagination } from "../communications/pagination";
import { Button, Card, ErrorState, Input, LoadingState, Textarea } from "../ui";
import { ExpenseForm } from "./expense-form";
import { PaymentForm } from "./payment-form";

interface FinanceData {
  expenses: ExpensePage;
  balances: Balance[];
  transfers: Transfer[];
  participants: Participant[];
  payments: Page<Payment>;
}
export function HouseFinances({
  houseId,
  userId,
  mode = "expenses",
}: {
  houseId: string;
  userId: string;
  mode?: "expenses" | "balances";
}) {
  const { revision } = useUpdates();
  const [data, setData] = useState<FinanceData | null>(null);
  const [page, setPage] = useState(1);
  const [paymentPage, setPaymentPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState<Expense | "new" | null>(null);
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [cancelExpense, setCancelExpense] = useState<Expense | null>(null);
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState<{
    expense: Expense;
    items: ExpenseChange[];
  } | null>(null);
  const [receipt, setReceipt] = useState<{ title: string; url: string } | null>(
    null,
  );
  const imageTitle = useRef<HTMLHeadingElement>(null);
  const [guestName, setGuestName] = useState("");
  const path = `/houses/${houseId}/expenses`;
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const [expenses, balances, transfers, payments] = await Promise.all([
          apiFetch<ExpensePage>(`${path}?page=${page}`, {
            signal: controller.signal,
          }),
          apiFetch<{ balances: Balance[] }>(`${path}/balances`, {
            signal: controller.signal,
          }),
          apiFetch<Transfer[]>(`${path}/settlements`, {
            signal: controller.signal,
          }),
          apiFetch<Page<Payment>>(`${path}/payments?page=${paymentPage}`, {
            signal: controller.signal,
          }),
        ]);
        const participants = expenses.active
          ? (
              await apiFetch<{ items: Participant[] }>(`${path}/participants`, {
                signal: controller.signal,
              })
            ).items
          : balances.balances;
        if (!controller.signal.aborted) {
          setData({
            expenses,
            balances: balances.balances,
            transfers,
            payments,
            participants,
          });
          setError("");
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setData(null);
          setError(expenseError(error));
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [path, page, paymentPage, refresh, revision]);
  useEffect(() => {
    if (receipt) {
      imageTitle.current?.focus({ preventScroll: true });
      imageTitle.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
    return () => {
      if (receipt) URL.revokeObjectURL(receipt.url);
    };
  }, [receipt]);

  function changed() {
    setForm(null);
    setTransfer(null);
    setCancelExpense(null);
    setHistory(null);
    setReason("");
    setNotice("Đã cập nhật sổ chi phí.");
    setRefresh((value) => value + 1);
  }
  async function action(endpoint: string, method: string, body?: unknown) {
    if (pending) return false;
    setPending(true);
    setError("");
    setNotice("");
    try {
      await apiFetch(`${path}${endpoint}`, {
        method,
        ...(body
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          : {}),
      });
      changed();
      return true;
    } catch (error) {
      setError(expenseError(error));
      return false;
    } finally {
      setPending(false);
    }
  }
  async function showHistory(expense: Expense) {
    setError("");
    try {
      const items = await apiFetch<ExpenseChange[]>(
        `${path}/${expense.id}/history`,
      );
      setHistory({ expense, items });
    } catch (error) {
      setError(expenseError(error));
    }
  }
  async function showReceipt(expense: Expense) {
    await showImage(
      `${path}/${expense.id}/receipt`,
      `Biên nhận · ${expense.title}`,
    );
  }
  async function showImage(endpoint: string, title: string) {
    setError("");
    try {
      const response = await fetch(apiUrl(endpoint), {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Receipt failed");
      setReceipt({
        title,
        url: URL.createObjectURL(await response.blob()),
      });
    } catch {
      setError("Không thể tải ảnh. Hãy tải lại sổ chi phí và thử lại.");
    }
  }
  if (!data)
    return (
      <Card className="house-panel">
        {error ? (
          <ErrorState
            message={error}
            action={
              <Button onClick={() => setRefresh((value) => value + 1)}>
                Thử lại
              </Button>
            }
          />
        ) : (
          <LoadingState message="Đang tải sổ chi phí…" />
        )}
      </Card>
    );
  const ledgerOwner = data.expenses.ownerId === userId;
  const owner = data.expenses.active && ledgerOwner;
  const active = data.expenses.active;
  const canSettle =
    owner &&
    data.balances.every(
      (row) =>
        row.balance === 0 && row.pendingSent === 0 && row.pendingReceived === 0,
    );
  return (
    <div className="house-stack finance-section">
      {!active && (
        <Card className="house-panel">
          <h2>Công nợ cũ · {data.expenses.houseName}</h2>
          <p className="text-muted">
            Bạn đã rời nhà. Chỉ các khoản liên quan tới bạn được hiển thị; bạn
            vẫn có thể ghi trả nợ và xác nhận tiền đã nhận.
          </p>
        </Card>
      )}
      {error && <ErrorState message={error} />}
      {notice && (
        <p className="success-state" role="status">
          {notice}
        </p>
      )}
      <Card className="house-panel finance-intro">
        <div>
          <h2>
            {mode === "expenses" ? "Sổ chi phí chung" : "Công nợ & Quyết toán"}
          </h2>
          <p className="text-muted">
            Tiền VNĐ nguyên. Roomora ghi nhận các khoản đã chi và trả cho nhau.
          </p>
        </div>
        <div className="finance-actions">
          {active && (
            <Button
              onClick={() => {
                setForm("new");
                setTransfer(null);
              }}
            >
              ＋ Ghi khoản chi
            </Button>
          )}
          {owner && (
            <Button
              variant="secondary"
              disabled={!canSettle || pending}
              onClick={() => {
                if (
                  window.confirm(
                    "Chốt các khoản chi hiện tại khi công nợ đã bằng 0?",
                  )
                )
                  void action("/settle", "POST");
              }}
            >
              Chốt quyết toán
            </Button>
          )}
        </div>
      </Card>
      {form && active && (
        <Card className="house-panel">
          <ExpenseForm
            key={form === "new" ? "new" : `${form.id}:${form.version}`}
            houseId={houseId}
            userId={userId}
            participants={data.participants}
            expense={form === "new" ? undefined : form}
            onSaved={changed}
            onCancel={() => {
              setForm(null);
              setRefresh((value) => value + 1);
            }}
          />
        </Card>
      )}
      {transfer && (
        <Card className="house-panel">
          <PaymentForm
            key={`${transfer.payerId}:${transfer.recipientId}`}
            houseId={houseId}
            transfer={transfer}
            onSaved={changed}
            onCancel={() => setTransfer(null)}
          />
        </Card>
      )}
      {cancelExpense && (
        <Card className="house-panel">
          <form
            className="house-form"
            onSubmit={(event) => {
              event.preventDefault();
              void action(`/${cancelExpense.id}/cancel`, "POST", {
                version: cancelExpense.version,
                reason,
              });
            }}
          >
            <h2>Hủy khoản “{cancelExpense.title}”</h2>
            <p className="text-muted">
              Lịch sử và thanh toán đã xác nhận được giữ lại. Số dư sẽ tính lại
              sau khi hủy.
            </p>
            <Textarea
              id="cancel-reason"
              label="Lý do hủy"
              minLength={3}
              maxLength={1000}
              required
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <div className="finance-actions">
              <Button type="submit" disabled={pending}>
                Xác nhận hủy
              </Button>
              <Button
                variant="secondary"
                onClick={() => setCancelExpense(null)}
              >
                Đóng
              </Button>
            </div>
          </form>
        </Card>
      )}
      {history && (
        <Card className="house-panel">
          <div className="house-row">
            <h2>Lịch sử · {history.expense.title}</h2>
            <Button variant="secondary" onClick={() => setHistory(null)}>
              Đóng
            </Button>
          </div>
          {history.items.map((item) => (
            <article className="expense-history" key={item.id}>
              <strong>
                Phiên bản {item.version} ·{" "}
                {item.createdBy.profile?.displayName ?? "Thành viên Roomora"}
              </strong>
              <p>{item.reason}</p>
              <small>{formatTime(item.createdAt)}</small>
              <div className="expense-history-values">
                <div>
                  <span>Trước thay đổi</span>
                  <p>
                    {item.oldSnapshot
                      ? `${item.oldSnapshot.title} · ${money(item.oldSnapshot.amount)} · ${expenseLabels[item.oldSnapshot.status]}`
                      : "Chưa có khoản chi"}
                  </p>
                </div>
                <div>
                  <span>Sau thay đổi</span>
                  <p>
                    {item.newSnapshot
                      ? `${item.newSnapshot.title} · ${money(item.newSnapshot.amount)} · ${expenseLabels[item.newSnapshot.status]}`
                      : money(item.newAmount)}
                  </p>
                </div>
              </div>
              {item.newSnapshot && (
                <p className="text-muted">
                  Phần chia sau thay đổi:{" "}
                  {item.newSnapshot.splits
                    .map(
                      (split) =>
                        `${data.participants.find((person) => person.id === split.participantId)?.displayName ?? history.expense.splits.find((person) => person.participantId === split.participantId)?.displayName ?? "Người tham gia"} ${money(split.amount)}`,
                    )
                    .join(" · ")}
                </p>
              )}
            </article>
          ))}
        </Card>
      )}
      {receipt && (
        <Card className="house-panel receipt-preview">
          <div className="house-row">
            <h2 ref={imageTitle} tabIndex={-1}>
              {receipt.title}
            </h2>
            <Button variant="secondary" onClick={() => setReceipt(null)}>
              Đóng
            </Button>
          </div>
          <Image
            src={receipt.url}
            alt={receipt.title}
            width={1000}
            height={1000}
            unoptimized
          />
        </Card>
      )}
      {mode === "expenses" && (
        <>
          <div className="expense-list">
            {data.expenses.items.length === 0 && (
              <Card className="house-panel">
                <p className="text-muted">
                  Chưa có khoản chi. Ghi khoản đầu tiên để bắt đầu chia tiền.
                </p>
              </Card>
            )}
            {data.expenses.items.map((expense) => (
              <Card
                className={`house-panel expense-card status-${expense.status.toLowerCase()}`}
                key={expense.id}
              >
                <div className="house-row">
                  <div>
                    <span
                      className={`badge finance-status status-${expense.status.toLowerCase()}`}
                    >
                      {expenseLabels[expense.status]}
                    </span>
                    <h3>{expense.title}</h3>
                    <p className="text-muted">
                      {expense.payer.displayName} đã trả ·{" "}
                      {formatTime(expense.createdAt)}
                    </p>
                  </div>
                  <strong className="expense-amount">
                    {money(expense.amount)}
                  </strong>
                </div>
                {expense.description && (
                  <p className="house-preline">{expense.description}</p>
                )}
                <p className="text-muted">
                  {expense.splitMode === "EQUAL"
                    ? "Chia đều"
                    : "Chia số tiền cụ thể"}{" "}
                  · Ghi bởi {expense.createdByName}
                </p>
                <div className="expense-split-list">
                  {expense.splits.map((split) => (
                    <span key={split.participantId}>
                      {split.displayName}:{" "}
                      <strong>{money(split.amount)}</strong>
                    </span>
                  ))}
                </div>
                <div className="finance-actions">
                  <Button
                    variant="secondary"
                    onClick={() => void showHistory(expense)}
                  >
                    Lịch sử
                  </Button>
                  {expense.hasReceipt && (
                    <Button
                      variant="secondary"
                      onClick={() => void showReceipt(expense)}
                    >
                      Xem biên nhận
                    </Button>
                  )}
                  {expense.receiptUrl && !expense.hasReceipt && (
                    <a
                      className="text-link"
                      target="_blank"
                      rel="noopener noreferrer"
                      href={expense.receiptUrl}
                    >
                      Biên nhận đã lưu
                    </a>
                  )}
                  {active &&
                    expense.status !== "CANCELLED" &&
                    (owner || expense.createdById === userId) && (
                      <>
                        <Button
                          variant="secondary"
                          onClick={() => setForm(expense)}
                        >
                          {expense.status === "SETTLED" ? "Điều chỉnh" : "Sửa"}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setCancelExpense(expense);
                            setReason("");
                          }}
                        >
                          Hủy khoản chi
                        </Button>
                      </>
                    )}
                </div>
              </Card>
            ))}
          </div>
          <Pagination
            page={data.expenses.page}
            pages={data.expenses.pages}
            onChange={setPage}
          />
          {owner && (
            <Card className="house-panel">
              <h2>Người tham gia ngoài ứng dụng</h2>
              <p className="text-muted">
                Thêm tên người ở cùng vào sổ chi phí. Người này không có tài
                khoản, quyền chat hay quyền quản lý nhà.
              </p>
              <form
                className="finance-guest-form"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (
                    await action("/participants", "POST", {
                      displayName: guestName.trim(),
                    })
                  )
                    setGuestName("");
                }}
              >
                <Input
                  id="guest-name"
                  label="Tên người ở cùng"
                  required
                  maxLength={120}
                  value={guestName}
                  onChange={(event) => setGuestName(event.target.value)}
                />
                <Button type="submit" disabled={pending}>
                  Thêm vào sổ
                </Button>
              </form>
              {data.participants
                .filter((person) => person.isGuest)
                .map((person) => (
                  <div className="house-row" key={person.id}>
                    <span>
                      {person.displayName} ·{" "}
                      {person.leftAt ? "Đã rời" : "Không dùng app"}
                    </span>
                    {!person.leftAt && (
                      <Button
                        variant="secondary"
                        disabled={pending}
                        onClick={() => {
                          if (
                            window.confirm(
                              "Đánh dấu người này đã rời? Công nợ và lịch sử vẫn được giữ.",
                            )
                          )
                            void action(`/participants/${person.id}`, "DELETE");
                        }}
                      >
                        Đánh dấu đã rời
                      </Button>
                    )}
                  </div>
                ))}
            </Card>
          )}
        </>
      )}
      {mode === "balances" && (
        <>
          <div className="balance-grid">
            {data.balances.map((row) => (
              <Card
                className={`house-panel balance-card balance-${row.balance > 0 ? "receivable" : row.balance < 0 ? "debt" : "clear"}`}
                key={row.id}
              >
                <div className="house-row">
                  <strong>
                    {row.displayName}
                    {row.userId === userId && " (Bạn)"}
                  </strong>
                  <span className="badge">
                    {row.isGuest
                      ? "Không dùng app"
                      : row.leftAt
                        ? "Đã rời nhà"
                        : row.userId === data.expenses.ownerId
                          ? "Trưởng nhà"
                          : "Thành viên"}
                  </span>
                </div>
                <strong className="balance-amount">
                  {row.balance > 0 ? "+" : row.balance < 0 ? "−" : ""}
                  {money(Math.abs(row.balance))}
                </strong>
                <p>
                  {row.balance > 0
                    ? "Cần nhận lại"
                    : row.balance < 0
                      ? "Cần trả"
                      : "Đã cân bằng"}
                </p>
                <dl>
                  <div>
                    <dt>Đã chi</dt>
                    <dd>{money(row.paid)}</dd>
                  </div>
                  <div>
                    <dt>Phần phải chịu</dt>
                    <dd>{money(row.owed)}</dd>
                  </div>
                  <div>
                    <dt>Đã trả / đã nhận</dt>
                    <dd>
                      {money(row.sent)} / {money(row.received)}
                    </dd>
                  </div>
                </dl>
                {(row.pendingSent > 0 || row.pendingReceived > 0) && (
                  <p className="text-muted">
                    Chờ xác nhận: trả {money(row.pendingSent)} · nhận{" "}
                    {money(row.pendingReceived)}
                  </p>
                )}
              </Card>
            ))}
          </div>
          <Card className="house-panel">
            <h2>Đề xuất trả tiền bù trừ</h2>
            <p className="text-muted">
              Đã trừ phần đang chờ xác nhận. Đề xuất có thể đổi khi sổ chi phí
              thay đổi.
            </p>
            {!data.transfers.length && (
              <p>
                Không còn khoản cần ghi trả. Kiểm tra các thanh toán đang chờ
                nếu có.
              </p>
            )}
            {data.transfers.map((row) => (
              <div
                className="house-row finance-transfer"
                key={`${row.payerId}:${row.recipientId}`}
              >
                <div>
                  <strong>
                    {row.payerName} → {row.recipientName}
                  </strong>
                  <p>{money(row.amount)}</p>
                </div>
                {(row.payerUserId === userId ||
                  (ledgerOwner && !row.payerUserId)) && (
                  <Button variant="secondary" onClick={() => setTransfer(row)}>
                    Ghi đã trả
                  </Button>
                )}
              </div>
            ))}
          </Card>
          <Card className="house-panel">
            <h2>Lịch sử thanh toán</h2>
            {!data.payments.items.length && (
              <p className="text-muted">Chưa có thanh toán nào.</p>
            )}
            {data.payments.items.map((payment) => (
              <article className="payment-row" key={payment.id}>
                <div className="house-row">
                  <div>
                    <strong>
                      {payment.payer.displayName} →{" "}
                      {payment.recipient.displayName}
                    </strong>
                    <p>
                      {money(payment.amount)} ·{" "}
                      {payment.method === "CASH" ? "Tiền mặt" : "Chuyển khoản"}
                    </p>
                    <small>{formatTime(payment.createdAt)}</small>
                  </div>
                  <span
                    className={`badge finance-status status-${payment.status.toLowerCase()}`}
                  >
                    {paymentLabels[payment.status]}
                  </span>
                </div>
                {payment.note && <p>{payment.note}</p>}
                {payment.hasProof && (
                  <div className="finance-actions">
                    <Button
                      variant="secondary"
                      onClick={() =>
                        void showImage(
                          `${path}/payments/${payment.id}/proof`,
                          `Minh chứng chuyển khoản · ${payment.payer.displayName} → ${payment.recipient.displayName}`,
                        )
                      }
                    >
                      Xem minh chứng chuyển khoản
                    </Button>
                  </div>
                )}
                {payment.confirmationType === "OWNER_RECORDED" && (
                  <p className="text-muted">
                    Trưởng nhà đã ghi nhận thủ công sau khi kiểm tra với người
                    nhận ngoài ứng dụng.
                  </p>
                )}
                {payment.status === "PENDING" && (
                  <div className="finance-actions">
                    {(payment.recipient.userId === userId ||
                      (ledgerOwner && payment.recipient.isGuest)) && (
                      <>
                        <Button
                          disabled={pending}
                          onClick={() => {
                            if (
                              window.confirm(
                                "Xác nhận đã thực sự nhận số tiền này?",
                              )
                            )
                              void action(`/payments/${payment.id}`, "POST", {
                                version: payment.version,
                                action: "confirm",
                              });
                          }}
                        >
                          {payment.recipient.isGuest
                            ? "Ghi nhận đã kiểm tra"
                            : "Xác nhận đã nhận"}
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={pending}
                          onClick={() =>
                            void action(`/payments/${payment.id}`, "POST", {
                              version: payment.version,
                              action: "reject",
                            })
                          }
                        >
                          Chưa nhận / từ chối
                        </Button>
                      </>
                    )}
                    {(payment.payer.userId === userId ||
                      (ledgerOwner && payment.payer.isGuest)) && (
                      <Button
                        variant="secondary"
                        disabled={pending}
                        onClick={() =>
                          void action(`/payments/${payment.id}`, "POST", {
                            version: payment.version,
                            action: "cancel",
                          })
                        }
                      >
                        Hủy ghi nhận
                      </Button>
                    )}
                  </div>
                )}
              </article>
            ))}
            <Pagination
              page={data.payments.page}
              pages={data.payments.pages}
              onChange={setPaymentPage}
            />
          </Card>
        </>
      )}
    </div>
  );
}
