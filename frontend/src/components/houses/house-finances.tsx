"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { apiFetch, apiUrl } from "@/lib/api";
import { categories } from "@/lib/household";
import { houseDate } from "@/lib/houses";
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
  type BalancePage,
  type RepaymentPromise,
  type ExpenseCorrection,
} from "@/lib/expenses";
import { formatTime, type Page } from "@/lib/communications";
import { useUpdates } from "../communications/updates-provider";
import { Pagination } from "../communications/pagination";
import { Button, Card, ErrorState, Input, LoadingState, Textarea } from "../ui";
import { ExpenseForm } from "./expense-form";
import { FocusPanel } from "../focus-panel";
import { ExpenseCorrectionForm } from "./expense-correction-form";
import { PaymentForm } from "./payment-form";
import { RepaymentPromiseForm, vietnamDate } from "./repayment-promise-form";
import { BalanceCard } from "./balance-card";
import { SupplierPaymentForm } from "./supplier-payment-form";

interface FinanceData {
  expenses: ExpensePage;
  balances: Balance[];
  transfers: Transfer[];
  participants: Participant[];
  payments: Page<Payment>;
  isSettled: boolean;
  unsettledCount: number;
  repaymentPromises: RepaymentPromise[];
  corrections: Page<ExpenseCorrection>;
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
  const [correctionPage, setCorrectionPage] = useState(1);
  const [showCorrectionForm, setShowCorrectionForm] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState<Expense | "new" | null>(null);
  const [supplierExpense, setSupplierExpense] = useState<Expense | null>(null);
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [promiseTransfer, setPromiseTransfer] = useState<Transfer | null>(null);
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
        const [expenses, balances, transfers, payments, corrections] =
          await Promise.all([
            apiFetch<ExpensePage>(`${path}?page=${page}`, {
              signal: controller.signal,
            }),
            apiFetch<BalancePage>(`${path}/balances`, {
              signal: controller.signal,
            }),
            apiFetch<Transfer[]>(`${path}/settlements`, {
              signal: controller.signal,
            }),
            apiFetch<Page<Payment>>(`${path}/payments?page=${paymentPage}`, {
              signal: controller.signal,
            }),
            apiFetch<Page<ExpenseCorrection>>(
              `${path}/corrections?page=${correctionPage}`,
              {
                signal: controller.signal,
              },
            ),
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
            isSettled: balances.isSettled,
            unsettledCount: balances.unsettledCount,
            repaymentPromises: balances.repaymentPromises,
            participants,
            corrections,
          });
          setLoadError("");
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setData(null);
          setLoadError(expenseError(error));
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [path, page, paymentPage, correctionPage, refresh, revision]);
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
    setSupplierExpense(null);
    setForm(null);
    setShowCorrectionForm(false);
    setTransfer(null);
    setPromiseTransfer(null);
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
      if (endpoint === "/settle")
        setNotice("Đã chốt quyết toán. Các khoản chi hiện tại đã được đóng.");
      if (endpoint.startsWith("/repayment-promises"))
        setNotice("Đã hủy ngày hẹn trả tiền.");
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
        {loadError ? (
          <ErrorState
            message={loadError}
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
  const lockedForm =
    form &&
    form !== "new" &&
    data.expenses.items.some(
      (expense) => expense.id === form.id && expense.status === "SETTLED",
    );
  const lockedCancellation =
    cancelExpense &&
    data.expenses.items.some(
      (expense) =>
        expense.id === cancelExpense.id && expense.status === "SETTLED",
    );
  const canSettle =
    owner &&
    data.unsettledCount > 0 &&
    data.balances.every(
      (row) =>
        row.balance === 0 &&
        row.pendingSent === 0 &&
        row.pendingReceived === 0 &&
        row.current.supplierTotal === row.current.supplierPaid,
    );
  const supplierPaymentUnavailable =
    supplierExpense &&
    data.expenses.items.some(
      (expense) =>
        expense.id === supplierExpense.id &&
        (expense.status === "SETTLED" ||
          expense.status === "CANCELLED" ||
          expense.remainingAmount === 0),
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
                setShowCorrectionForm(false);
                setTransfer(null);
                setPromiseTransfer(null);
              }}
            >
              ＋ Ghi khoản chi
            </Button>
          )}
          {active && (
            <Button
              variant="secondary"
              onClick={() => {
                setShowCorrectionForm(true);
                setForm(null);
                setCancelExpense(null);
              }}
            >
              Điều chỉnh sau chốt
            </Button>
          )}
          {owner && (
            <Button
              variant="secondary"
              disabled={data.isSettled || !canSettle || pending}
              onClick={() => {
                if (
                  window.confirm(
                    "Chốt các khoản chi hiện tại khi công nợ đã bằng 0?",
                  )
                )
                  void action("/settle", "POST");
              }}
            >
              {data.isSettled ? "Đã chốt" : "Chốt quyết toán"}
            </Button>
          )}
        </div>
      </Card>
      {data.isSettled && (
        <p className="success-state" role="status">
          Đã chốt quyết toán. Khoản đã chốt chỉ được xem, không thể sửa, hủy
          hoặc thay biên nhận. Khoản chi mới và điều chỉnh riêng sẽ bắt đầu đợt
          mới.
        </p>
      )}
      {data.balances.some(
        (row) => row.current.supplierTotal > row.current.supplierPaid,
      ) && (
        <p className="finance-note">
          Còn khoản chưa thanh toán đủ cho chủ phòng/người bán. Mở sổ khoản chi,
          chọn Ghi trả thêm trước khi chốt quyết toán.
        </p>
      )}
      {supplierPaymentUnavailable && (
        <p className="finance-note" role="status">
          Khoản chi đã thanh toán đủ, đã chốt hoặc đã hủy. Không còn lần trả
          thêm cần ghi.
        </p>
      )}
      {supplierExpense && active && !supplierPaymentUnavailable && (
        <FocusPanel
          className="card house-panel"
          label="Ghi trả thêm"
          focusKey={supplierExpense}
        >
          <SupplierPaymentForm
            key={`${supplierExpense.id}:${supplierExpense.version}`}
            houseId={houseId}
            expense={supplierExpense}
            onSaved={() => {
              changed();
              setNotice("Đã ghi thanh toán cho chủ phòng/người bán.");
            }}
            onCancel={() => setSupplierExpense(null)}
          />
        </FocusPanel>
      )}
      {showCorrectionForm && active && (
        <FocusPanel className="card house-panel" label="Điều chỉnh sau chốt">
          <ExpenseCorrectionForm
            houseId={houseId}
            userId={userId}
            ownerId={data.expenses.ownerId}
            participants={data.participants}
            onCancel={() => setShowCorrectionForm(false)}
            onSaved={() => {
              changed();
              setNotice(
                "Đã ghi điều chỉnh riêng vào đợt mới. Khoản đã chốt được giữ nguyên.",
              );
            }}
          />
        </FocusPanel>
      )}
      {promiseTransfer && (
        <FocusPanel
          className="card house-panel"
          label="Hẹn ngày trả tiền"
          focusKey={promiseTransfer}
        >
          <RepaymentPromiseForm
            key={`${promiseTransfer.payerId}:${promiseTransfer.recipientId}`}
            houseId={houseId}
            transfer={promiseTransfer}
            promise={data.repaymentPromises.find(
              (promise) =>
                promise.payerId === promiseTransfer.payerId &&
                promise.recipientId === promiseTransfer.recipientId,
            )}
            onSaved={() => {
              changed();
              setNotice("Đã lưu ngày hẹn và thông báo cho người nhận.");
            }}
            onCancel={() => setPromiseTransfer(null)}
          />
        </FocusPanel>
      )}
      {lockedForm && (
        <p className="finance-note" role="status">
          Khoản chi vừa được chốt. Dùng Điều chỉnh sau chốt nếu cần ghi chênh
          lệch.
        </p>
      )}
      {form && active && !lockedForm && (
        <FocusPanel
          className="card house-panel"
          label={form === "new" ? "Ghi khoản chi" : "Chỉnh sửa khoản chi"}
          focusKey={form}
        >
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
        </FocusPanel>
      )}
      {transfer && (
        <FocusPanel
          className="card house-panel"
          label="Ghi nhận đã trả tiền"
          focusKey={transfer}
        >
          <PaymentForm
            key={`${transfer.payerId}:${transfer.recipientId}`}
            houseId={houseId}
            transfer={transfer}
            onSaved={changed}
            onCancel={() => setTransfer(null)}
          />
        </FocusPanel>
      )}
      {cancelExpense && !lockedCancellation && (
        <FocusPanel
          className="card house-panel"
          label="Hủy khoản chi"
          focusKey={cancelExpense}
        >
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
        </FocusPanel>
      )}
      {history && (
        <FocusPanel
          className="card house-panel"
          label={`Lịch sử · ${history.expense.title}`}
          focusKey={history}
        >
          <div className="house-row">
            <h2>Lịch sử · {history.expense.title}</h2>
            <Button variant="secondary" onClick={() => setHistory(null)}>
              Đóng
            </Button>
          </div>
          {history.items.map((item) => (
            <article className="expense-history" key={item.id}>
              <strong>
                {item.action === "POST_SETTLEMENT_CORRECTION"
                  ? `Điều chỉnh riêng #${item.version}`
                  : `Phiên bản ${item.version}`}{" "}
                · {item.createdBy.profile?.displayName ?? "Thành viên Roomora"}
              </strong>
              <p>{item.reason}</p>
              {item.newSnapshot?.paidAmount !== undefined && (
                <p className="text-muted">
                  Đã thanh toán cho chủ phòng/người bán:{" "}
                  {money(item.oldSnapshot?.paidAmount ?? 0)} →{" "}
                  {money(item.newSnapshot.paidAmount)}
                </p>
              )}
              {item.action === "POST_SETTLEMENT_CORRECTION" && (
                <p className="text-muted">
                  Nội dung điều chỉnh được ghi riêng; khoản gốc đã chốt được giữ
                  nguyên.
                </p>
              )}
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
        </FocusPanel>
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
                      {expense.payer.displayName} phụ trách thanh toán ·{" "}
                      {formatTime(expense.createdAt)}
                    </p>
                    <p className="text-muted">
                      {categories[expense.category]} · Phát sinh{" "}
                      {houseDate(expense.spentOn)}
                    </p>
                  </div>
                  <strong className="expense-amount">
                    {money(expense.amount)}
                  </strong>
                </div>
                {expense.description && (
                  <p className="house-preline">{expense.description}</p>
                )}
                <div className="expense-payment-progress">
                  <span>
                    Đã thanh toán: <strong>{money(expense.paidAmount)}</strong>
                  </span>
                  <span
                    className={
                      expense.remainingAmount > 0
                        ? "text-danger"
                        : "text-success-foreground"
                    }
                  >
                    Còn phải trả:{" "}
                    <strong>{money(expense.remainingAmount)}</strong>
                  </span>
                </div>
                <p className="text-muted">
                  {expense.splitMode === "EQUAL"
                    ? "Chia đều"
                    : expense.sharingSnapshot?.mode === "WEIGHTED"
                      ? "Chia theo tỷ lệ đã thống nhất"
                      : "Chia số tiền cụ thể"}{" "}
                  · Ghi bởi {expense.createdByName}
                </p>
                {expense.sharingSnapshot && (
                  <p className="text-muted">
                    Quy tắc tháng {expense.sharingSnapshot.month}
                    {expense.sharingSnapshot.source === "FALLBACK"
                      ? " · Phương án dự phòng"
                      : ""}
                  </p>
                )}
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
                    expense.status !== "SETTLED" &&
                    (owner || expense.createdById === userId) && (
                      <>
                        {expense.remainingAmount > 0 && (
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setSupplierExpense(expense);
                              setForm(null);
                              setCancelExpense(null);
                              setShowCorrectionForm(false);
                            }}
                          >
                            Ghi trả thêm
                          </Button>
                        )}
                        <Button
                          variant="secondary"
                          onClick={() => setForm(expense)}
                        >
                          Sửa
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
                {expense.status === "SETTLED" && (
                  <p className="text-muted">
                    Khoản đã chốt · Chỉ xem và đối chiếu.
                    {expense.corrections.length > 0 && (
                      <>
                        {" "}
                        Có {expense.corrections[0].version} điều chỉnh riêng;
                        khoản gốc được giữ nguyên.
                      </>
                    )}
                  </p>
                )}
              </Card>
            ))}
          </div>
          <Pagination
            page={data.expenses.page}
            pages={data.expenses.pages}
            onChange={setPage}
          />
          {data.corrections.total > 0 && (
            <section className="house-stack" aria-label="Điều chỉnh sau chốt">
              <h2>Điều chỉnh sau chốt</h2>
              {data.corrections.items.map((correction) => (
                <Card
                  className={`house-panel expense-card status-${correction.settledAt ? "settled" : "active"}`}
                  key={correction.id}
                >
                  <span
                    className={`finance-status status-${correction.settledAt ? "settled" : "active"}`}
                  >
                    {correction.settledAt ? "Đã quyết toán" : "Chưa quyết toán"}
                  </span>
                  <div className="house-row">
                    <h3>
                      Điều chỉnh #{correction.version} ·{" "}
                      {correction.expense.title}
                    </h3>
                    <strong className="finance-money">
                      {correction.amountDelta > 0 ? "+" : ""}
                      {money(correction.amountDelta)}
                    </strong>
                  </div>
                  <p>
                    {money(correction.oldSnapshot.amount)} →{" "}
                    {money(correction.newSnapshot.amount)}
                  </p>
                  <p className="house-preline">{correction.reason}</p>
                  <p className="text-muted">
                    Ghi bởi {correction.createdByName} ·{" "}
                    {formatTime(correction.createdAt)}
                  </p>
                  <div className="expense-split-list">
                    {correction.shares.map((share) => (
                      <span key={share.participantId}>
                        {share.participant.displayName}: đã chi{" "}
                        {share.paidDelta > 0 ? "+" : ""}
                        {money(share.paidDelta)}, phần chịu{" "}
                        {share.owedDelta > 0 ? "+" : ""}
                        {money(share.owedDelta)}
                      </span>
                    ))}
                  </div>
                  <p className="text-muted">
                    Chỉ xem. Sửa sai bằng một điều chỉnh mới.
                  </p>
                </Card>
              ))}
              <Pagination
                page={data.corrections.page}
                pages={data.corrections.pages}
                onChange={setCorrectionPage}
              />
            </section>
          )}
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
          <p className="text-muted">
            Chỉ hiển thị đợt chưa chốt. Tiền thanh toán cho chủ phòng/người bán
            và tiền trả nhau giữa thành viên được ghi riêng. Các đợt đã chốt
            được giữ trong lịch sử.
          </p>
          <div className="balance-grid">
            {data.balances.map((row) => (
              <BalanceCard
                key={row.id}
                balance={row}
                userId={userId}
                ownerId={data.expenses.ownerId}
              />
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
                {row.payerUserId === userId && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setPromiseTransfer(row);
                      setTransfer(null);
                    }}
                  >
                    {data.repaymentPromises.some(
                      (promise) =>
                        promise.payerId === row.payerId &&
                        promise.recipientId === row.recipientId,
                    )
                      ? "Sửa ngày hẹn"
                      : "Hẹn ngày trả"}
                  </Button>
                )}
              </div>
            ))}
          </Card>
          {data.repaymentPromises.length > 0 && (
            <Card className="house-panel">
              <h2>Ngày hẹn trả tiền</h2>
              {data.repaymentPromises.map((promise) => (
                <div
                  className="house-row finance-transfer"
                  key={`${promise.payerId}:${promise.recipientId}`}
                >
                  <div>
                    <strong>
                      {promise.payerName} → {promise.recipientName}
                    </strong>
                    <p>
                      {money(promise.amount)} · Hẹn{" "}
                      {promise.payOn.split("-").reverse().join("/")}
                    </p>
                    {promise.payOn < vietnamDate() && (
                      <p className="text-error">
                        Đã quá ngày hẹn, email nhắc nợ được tiếp tục.
                      </p>
                    )}
                  </div>
                  {promise.payerUserId === userId && (
                    <Button
                      variant="secondary"
                      disabled={pending}
                      onClick={() =>
                        void action(
                          `/repayment-promises/${promise.recipientId}`,
                          "DELETE",
                          { version: promise.version },
                        )
                      }
                    >
                      Hủy ngày hẹn
                    </Button>
                  )}
                </div>
              ))}
            </Card>
          )}
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
