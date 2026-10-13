import { money, type Balance, type BalanceExpenseDetail } from "@/lib/expenses";
import { Card } from "../ui";

function AmountRow({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="balance-detail-row">
      <span>{label}</span>
      <strong>{money(amount)}</strong>
    </div>
  );
}

function ExpenseList({ items }: { items: BalanceExpenseDetail[] }) {
  const rows = items.map((item) => (
    <li key={`${item.kind}:${item.id}`}>
      <AmountRow
        label={
          item.kind === "CORRECTION" ? `Điều chỉnh: ${item.title}` : item.title
        }
        amount={item.amount}
      />
    </li>
  ));
  return (
    <>
      <ul className="balance-detail-list">{rows.slice(0, 4)}</ul>
      {rows.length > 4 && (
        <details className="balance-more">
          <summary>Xem thêm {rows.length - 4} khoản</summary>
          <ul className="balance-detail-list">{rows.slice(4)}</ul>
        </details>
      )}
    </>
  );
}

export function BalanceCard({
  balance: row,
  userId,
  ownerId,
}: {
  balance: Balance;
  userId: string;
  ownerId: string;
}) {
  const { current, details } = row;
  const bills = details.paid.filter((item) => item.kind === "EXPENSE");
  const corrections = details.paid.filter((item) => item.kind === "CORRECTION");
  const remaining = current.supplierTotal - current.supplierPaid;
  const netBeforeTransfers = current.paid - current.owed;
  return (
    <Card
      className={`house-panel balance-card balance-${row.balance > 0 ? "receivable" : row.balance < 0 ? "debt" : "clear"}`}
      aria-label={`Công nợ của ${row.displayName}`}
    >
      <div className="house-row">
        <h3 className="balance-name">
          {row.displayName}
          {row.userId === userId && " (Bạn)"}
        </h3>
        <span className="badge">
          {row.isGuest
            ? "Không dùng app"
            : row.leftAt
              ? "Đã rời nhà"
              : row.userId === ownerId
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
          ? "Cần nhận từ thành viên"
          : row.balance < 0
            ? "Cần trả cho thành viên"
            : "Bù trừ trong nhà đã cân bằng"}
      </p>

      {bills.length > 0 && (
        <section className="balance-section" aria-label="Thanh toán khoản chi">
          <h4>Các khoản phụ trách thanh toán</h4>
          <ExpenseList items={bills} />
          <div className="balance-section-total">
            <span>Tổng cần thanh toán</span>
            <strong>{money(current.supplierTotal)}</strong>
          </div>
          <AmountRow
            label="Đã trả cho chủ phòng/người bán"
            amount={current.supplierPaid}
          />
          <div
            className={
              remaining > 0 ? "text-danger" : "text-success-foreground"
            }
          >
            <AmountRow label="Còn phải thanh toán" amount={remaining} />
          </div>
        </section>
      )}

      <section className="balance-section" aria-label="Bù trừ trong nhà">
        <h4>Bù trừ các khoản chi trong nhà</h4>
        <AmountRow
          label="Phần chi phí bản thân phải chịu"
          amount={current.owed}
        />
        {corrections.length > 0 && (
          <details className="balance-more">
            <summary>Điều chỉnh chưa chốt</summary>
            <ExpenseList items={corrections} />
          </details>
        )}
        <div className="balance-section-total">
          <span>
            {netBeforeTransfers >= 0
              ? "Cần nhận trước khi trả nhau"
              : "Cần góp trước khi trả nhau"}
          </span>
          <strong>{money(Math.abs(netBeforeTransfers))}</strong>
        </div>
        <AmountRow label="Đã trả cho thành viên" amount={current.sent} />
        <AmountRow label="Đã nhận từ thành viên" amount={current.received} />
        <details className="balance-more">
          <summary>Xem phần chia và tiền đã trả nhau</summary>
          <ExpenseList items={details.owed} />
          <ul className="balance-detail-list">
            {details.sent.map((item) => (
              <li key={item.id}>
                <AmountRow
                  label={`Đã trả cho ${item.personName}`}
                  amount={item.amount}
                />
              </li>
            ))}
            {details.received.map((item) => (
              <li key={item.id}>
                <AmountRow
                  label={`Đã nhận từ ${item.personName}`}
                  amount={item.amount}
                />
              </li>
            ))}
          </ul>
          {!details.owed.length &&
            !details.sent.length &&
            !details.received.length && (
              <p className="balance-empty">
                Chưa có phần chia hoặc thanh toán giữa thành viên.
              </p>
            )}
        </details>
        {remaining > 0 && (
          <p className="balance-section-hint">
            Bù trừ tính theo tổng khoản chi được phân công; người phụ trách vẫn
            cần thanh toán nốt số còn thiếu ở trên.
          </p>
        )}
      </section>

      {(row.pendingSent > 0 || row.pendingReceived > 0) && (
        <section
          className="balance-pending"
          aria-label="Tiền đang chờ xác nhận"
        >
          <h4>Đang chờ xác nhận</h4>
          {row.pendingSent > 0 && (
            <AmountRow
              label="Tiền trả cho thành viên"
              amount={row.pendingSent}
            />
          )}
          {row.pendingReceived > 0 && (
            <AmountRow
              label="Tiền nhận từ thành viên"
              amount={row.pendingReceived}
            />
          )}
          <p>Chưa tính vào công nợ ở trên.</p>
        </section>
      )}
      {row.reminderPausedUntil && (
        <p className="text-muted">
          Tạm dừng email nhắc nợ đến hết{" "}
          {new Intl.DateTimeFormat("vi-VN", {
            timeZone: "Asia/Ho_Chi_Minh",
          }).format(new Date(row.reminderPausedUntil))}
          .
        </p>
      )}
    </Card>
  );
}
